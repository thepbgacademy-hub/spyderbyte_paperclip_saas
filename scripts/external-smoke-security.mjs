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
const shellPath = process.env.WF_SMOKE_SHELL_PATH ?? "/";
const harnessBoardPath = process.env.WF_SMOKE_HARNESS_BOARD_PATH ?? "/board";
const harnessWorkflowId = process.env.WF_SMOKE_HARNESS_WORKFLOW_ID ?? "";
const sessionCookieName = process.env.WF_SMOKE_SESSION_COOKIE_NAME ?? "wf_portal_session";
const sessionCookieValue = process.env.WF_SMOKE_SESSION_COOKIE_VALUE ?? "";
const expectedAssetBaseUrl = process.env.WF_SMOKE_EXPECT_ASSET_BASE_URL ?? `${apiUrl.origin}/app-assets/`;
const publicPorts = parsePorts(process.env.WF_SMOKE_PUBLIC_PORTS ?? "80,443");
const privatePorts = parsePorts(process.env.WF_SMOKE_PRIVATE_PORTS ?? "5432,6379,8000,8443,9000,3000,5173,8080,8081,2375");
const timeoutMs = Number(process.env.WF_SMOKE_TIMEOUT_MS ?? 3000);
const forbiddenText = /paperclip|prompt|skill|command|tool call|raw activity|internal log|service token|vault:\/\/|wf_secret_|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+|pc-(company|run|agent|goal|task)-/i;
const forbiddenSecretText = /service token|vault:\/\/|wf_secret_|access_token=|api[_-]?key[:=]|authorization[:=]|Bearer\s+|sk-[A-Za-z0-9_-]+|pc-(company|run|agent|goal|task)-/i;
const forbiddenAssetSecretText = /service token|vault:\/\/|wf_secret_|access_token=|Bearer\s+|sk-[A-Za-z0-9_-]+|pc-(company|run|agent|goal|task)-/i;
const forbiddenHarnessPrivateFields = /orchestratorHandoff|boardContext|postOutcomeDirectives/i;
const boardShellUrl = sessionCookieValue ? resolveHarnessBoardUrl() : new URL(harnessBoardPath, apiUrl);

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
results.push(await checkHttp({ url: new URL("/api/storage/oauth/google_drive/begin", apiUrl), origin: allowedOrigin, expectedStatuses: [401, 503] }));
results.push(await checkHttp({ url: new URL(shellPath, apiUrl), origin: allowedOrigin, expectedStatuses: [401, 403] }));

if (sessionCookieValue) {
  results.push(
    await checkShell({
      url: new URL(shellPath, apiUrl),
      origin: allowedOrigin,
      cookie: `${sessionCookieName}=${sessionCookieValue}`,
      expectedAssetBaseUrl
    })
  );
  results.push(
    await checkShell({
      url: boardShellUrl,
      origin: allowedOrigin,
      cookie: `${sessionCookieName}=${sessionCookieValue}`,
      expectedAssetBaseUrl
    })
  );
  results.push(
    await checkHarnessBoardApi({
      url: buildHarnessBoardApiUrl(),
      origin: allowedOrigin,
      cookie: `${sessionCookieName}=${sessionCookieValue}`
    })
  );
}

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
    const statusOk = input.expectedStatuses.includes(response.statusCode);
    const bodyOk = !forbiddenText.test(response.body);
    const corsOk = input.origin === deniedOrigin ? corsHeader === undefined : true;
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
  return requestWithHeaders(url, { origin });
}

function requestWithHeaders(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        timeout: timeoutMs,
        headers,
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

async function checkShell(input) {
  try {
    const response = await requestWithHeaders(input.url, {
      origin: input.origin,
      cookie: input.cookie
    });
    const contentType = response.headers["content-type"] ?? "";
    const htmlOk = typeof contentType === "string" && contentType.includes("text/html");
    const bootstrapOk = response.body.includes('id="wf-dashboard-bootstrap"');
    const assetUrls = extractAssetUrls(response.body, input.expectedAssetBaseUrl);
    const assetsOk = assetUrls.length > 0;
    const bodyOk = !forbiddenText.test(response.body);
    const privateFieldsOk = !forbiddenHarnessPrivateFields.test(response.body);
    const assetChecks = assetsOk ? await Promise.all(assetUrls.map((assetUrl) => checkShellAsset(assetUrl, input.origin, input.cookie))) : [];
    const assetChecksOk = assetChecks.every((assetCheck) => assetCheck.status === "pass");
    return {
      check: "html_shell",
      url: input.url.toString(),
      origin: input.origin,
      status: response.statusCode === 200 && htmlOk && bootstrapOk && assetsOk && bodyOk && privateFieldsOk && assetChecksOk ? "pass" : "fail",
      observedStatus: response.statusCode,
      contentType,
      assetUrls,
      assetChecks,
      bodyPreview: response.body.slice(0, 220)
    };
  } catch (error) {
    return {
      check: "html_shell",
      url: input.url.toString(),
      origin: input.origin,
      status: "fail",
      error: readError(error)
    };
  }
}

async function checkHarnessBoardApi(input) {
  try {
    const response = await requestWithHeaders(input.url, {
      origin: input.origin,
      cookie: input.cookie
    });
    const contentType = response.headers["content-type"] ?? "";
    const contentTypeOk = typeof contentType === "string" && contentType.includes("application/json");
    const bodyOk =
      !forbiddenText.test(response.body)
      && !/orchestratorHandoff|boardContext|postOutcomeDirectives/i.test(response.body);
    const shapeOk = /"cards"\s*:|"columns"\s*:|"runId"\s*:/i.test(response.body);
    return {
      check: "harness_board_api",
      url: input.url.toString(),
      origin: input.origin,
      observedStatus: response.statusCode,
      contentType,
      status: response.statusCode === 200 && contentTypeOk && bodyOk && shapeOk ? "pass" : "fail",
      bodyPreview: response.body.slice(0, 220)
    };
  } catch (error) {
    return {
      check: "harness_board_api",
      url: input.url.toString(),
      origin: input.origin,
      status: "fail",
      error: readError(error)
    };
  }
}

function extractAssetUrls(html, expectedAssetBaseUrl) {
  const assetUrlPattern = /(src|href)="([^"]+)"/g;
  const assetUrls = [];
  for (const match of html.matchAll(assetUrlPattern)) {
    const assetUrl = match[2];
    if (assetUrl?.startsWith(expectedAssetBaseUrl)) {
      assetUrls.push(assetUrl);
    }
  }

  return unique(assetUrls);
}

async function checkShellAsset(assetUrl, origin, cookie) {
  try {
    const response = await requestWithHeaders(assetUrl, {
      origin,
      cookie
    });
    const contentType = response.headers["content-type"] ?? "";
    const contentTypeOk =
      typeof contentType === "string" &&
      (contentType.includes("javascript") || contentType.includes("css"));
    return {
      check: "shell_asset",
      url: assetUrl,
      observedStatus: response.statusCode,
      contentType,
      status: response.statusCode === 200 && contentTypeOk && !forbiddenAssetSecretText.test(response.body) ? "pass" : "fail"
    };
  } catch (error) {
    return {
      check: "shell_asset",
      url: assetUrl,
      status: "fail",
      error: readError(error)
    };
  }
}

function readError(error) {
  return error instanceof Error ? error.message : String(error);
}

function buildHarnessBoardApiUrl() {
  const url = new URL("/api/harness/board", apiUrl);
  const workflowId = boardShellUrl.searchParams.get("workflowId");
  if (workflowId) {
    url.searchParams.set("workflowId", workflowId);
  }
  return url;
}

function resolveHarnessBoardUrl() {
  const url = new URL(harnessBoardPath, apiUrl);
  const workflowId = boardShellUrlWorkflowId(url);
  if (!workflowId) {
    throw new Error(
      "WF_SMOKE_HARNESS_WORKFLOW_ID or WF_SMOKE_HARNESS_BOARD_PATH must provide an explicit workflow selector; authenticated harness-board smoke verification requires an explicit workflow selector"
    );
  }
  url.searchParams.set("workflowId", workflowId);
  return url;
}

function boardShellUrlWorkflowId(url) {
  return url.searchParams.get("workflowId") ?? harnessWorkflowId.trim();
}
