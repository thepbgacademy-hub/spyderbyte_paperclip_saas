import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { Buffer } from "node:buffer";
import { URL } from "node:url";

/* global console, process */

const apiUrl = new URL(process.env.WF_SMOKE_API_URL ?? "https://api.spyderbyte.cloud");
const portalUrl = new URL(process.env.WF_SMOKE_PORTAL_URL ?? "https://www.spyderbyte.cloud");
const host = process.env.WF_SMOKE_PORT_HOST ?? "187.77.19.83";
const allowedOrigin = process.env.WF_SMOKE_ALLOWED_ORIGIN ?? portalUrl.origin;
const deniedOrigin = process.env.WF_SMOKE_DENIED_ORIGIN ?? "https://evil.example";
const publicPorts = parsePorts(process.env.WF_SMOKE_PUBLIC_PORTS ?? "80,443");
const privatePorts = parsePorts(process.env.WF_SMOKE_PRIVATE_PORTS ?? "5432,6379,8000,8443,9000,3000,5173,8080,8081,2375");
const timeoutMs = Number(process.env.WF_SMOKE_TIMEOUT_MS ?? 3000);

const results = [];

for (const hostname of unique([portalUrl.hostname, apiUrl.hostname, host])) {
  results.push(await checkDns(hostname));
}

for (const port of publicPorts) {
  results.push(await checkPort({ host, port, expectedOpen: true }));
}

for (const port of privatePorts) {
  results.push(await checkPort({ host, port, expectedOpen: false }));
}

results.push(await checkHttp({ url: new URL("/api/dashboard", apiUrl), origin: allowedOrigin, expectedStatuses: [401, 403] }));
results.push(await checkHttp({ url: new URL("/api/dashboard", apiUrl), origin: deniedOrigin, expectedStatuses: [403] }));
results.push(await checkHttp({ url: new URL("/api/storage/oauth/google_drive/begin", apiUrl), origin: allowedOrigin, expectedStatuses: [401] }));

const failures = results.filter((result) => result.status === "fail");
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), apiUrl: apiUrl.origin, portalUrl: portalUrl.origin, host, results }, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}

function parsePorts(value) {
  return value
    .split(",")
    .map((port) => Number(port.trim()))
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65_535);
}

function unique(values) {
  return [...new Set(values)];
}

async function checkDns(hostname) {
  try {
    const records = await dns.lookup(hostname, { all: true });
    return {
      check: "dns",
      hostname,
      status: records.length > 0 ? "pass" : "fail",
      records: records.map((record) => record.address)
    };
  } catch (error) {
    return { check: "dns", hostname, status: "fail", error: readError(error) };
  }
}

async function checkPort(input) {
  const open = await canConnect(input.host, input.port);
  const expected = input.expectedOpen ? "open" : "closed";
  return {
    check: "tcp_port",
    host: input.host,
    port: input.port,
    expected,
    observed: open ? "open" : "closed",
    status: open === input.expectedOpen ? "pass" : "fail"
  };
}

function canConnect(hostname, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: hostname, port, timeout: timeoutMs });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function checkHttp(input) {
  try {
    const response = await request(input.url, input.origin);
    const corsHeader = response.headers["access-control-allow-origin"];
    const forbiddenText = /paperclip|prompt|skill|command|tool call|raw activity|internal log|service token|vault:\/\/|wf_secret_|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+|pc-(company|run|agent|goal|task)-/i;
    const statusOk = input.expectedStatuses.includes(response.statusCode);
    const bodyOk = !forbiddenText.test(response.body);
    const corsOk = input.origin === deniedOrigin ? corsHeader !== deniedOrigin : true;
    return {
      check: "http",
      url: input.url.toString(),
      origin: input.origin,
      expectedStatuses: input.expectedStatuses,
      observedStatus: response.statusCode,
      status: statusOk && bodyOk && corsOk ? "pass" : "fail",
      corsAllowOrigin: corsHeader ?? null,
      securityHeaders: {
        xContentTypeOptions: response.headers["x-content-type-options"] ?? null,
        contentSecurityPolicy: response.headers["content-security-policy"] ?? null,
        referrerPolicy: response.headers["referrer-policy"] ?? null
      },
      bodyPreview: response.body.slice(0, 160)
    };
  } catch (error) {
    return {
      check: "http",
      url: input.url.toString(),
      origin: input.origin,
      expectedStatuses: input.expectedStatuses,
      status: "fail",
      error: readError(error)
    };
  }
}

function request(url, origin) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        timeout: timeoutMs,
        headers: { origin },
        rejectUnauthorized: false
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.once("timeout", () => req.destroy(new Error("request_timeout")));
    req.once("error", reject);
    req.end();
  });
}

function readError(error) {
  return error instanceof Error ? error.message : String(error);
}
