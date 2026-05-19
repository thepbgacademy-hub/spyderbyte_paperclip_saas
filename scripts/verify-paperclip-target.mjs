import { URL } from "node:url";

/* global AbortSignal, console, fetch, process */

const baseUrl = process.env.WF_PAPERCLIP_VERIFY_URL?.trim();
const expectedMode = process.env.WF_PAPERCLIP_EXPECT_MODE?.trim() || "authenticated";
const expectedExposure = process.env.WF_PAPERCLIP_EXPECT_EXPOSURE?.trim() || "";
const publicPort = process.env.WF_PAPERCLIP_PUBLIC_PORT?.trim() || "";
const timeoutMs = Number(process.env.WF_PAPERCLIP_VERIFY_TIMEOUT_MS ?? 5000);

if (!baseUrl) {
  throw new Error("WF_PAPERCLIP_VERIFY_URL is required");
}

const healthUrl = new URL("/api/health", baseUrl).toString();
const startedAt = new Date().toISOString();

const results = [];
let body = null;

try {
  const response = await fetch(healthUrl, {
    method: "GET",
    headers: {
      accept: "application/json"
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  body = await safeJson(response);
  const ok = readHealthOk(body);
  const deploymentMode = readString(body, "deploymentMode");

  results.push(
    {
      check: "paperclip_health_status",
      url: healthUrl,
      expected: 200,
      observed: response.status,
      status: response.status === 200 ? "pass" : "fail"
    },
    {
      check: "paperclip_health_shape",
      url: healthUrl,
      expected: "ok",
      observed: ok ? "ok" : "not_ok",
      status: ok ? "pass" : "fail"
    },
    {
      check: "paperclip_deployment_mode",
      expected: expectedMode,
      observed: deploymentMode,
      status: deploymentMode === expectedMode ? "pass" : "fail"
    }
  );
} catch (error) {
  results.push({
    check: "paperclip_health_request",
    url: healthUrl,
    status: "fail",
    error: readError(error)
  });
}

if (expectedExposure || publicPort) {
  results.push({
    check: "paperclip_public_test_notice",
    expectedExposure: expectedExposure || null,
    publicPort: publicPort || null,
    status: "warn",
    note:
      "Current Paperclip verification target may still be public for controlled testing. Do not treat this as release-safe until exposure is removed."
  });
}

console.log(
  JSON.stringify(
    {
      checkedAt: startedAt,
      baseUrl,
      results,
      health: body
    },
    null,
    2
  )
);

if (results.some((result) => result.status === "fail")) {
  process.exitCode = 1;
}

function readHealthOk(body) {
  if (body && typeof body === "object") {
    if (typeof body.ok === "boolean") {
      return body.ok;
    }

    if (body.status === "ok") {
      return true;
    }
  }

  return false;
}

function readString(body, key) {
  if (!body || typeof body !== "object" || typeof body[key] !== "string") {
    return null;
  }

  return body[key];
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readError(error) {
  return error instanceof Error ? error.message : String(error);
}
