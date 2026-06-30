import process from "node:process";

import { DEMO_PROFILES } from "./demo-seed-profiles.mjs";

export const DEFAULT_PUBLIC_LAUNCH_API_ORIGIN = "https://wf-api.spyderbyte.cloud";
export const DEFAULT_PUBLIC_LAUNCH_PORTAL_ORIGIN = "https://www.spyderbyte.cloud";
export const DEFAULT_PUBLIC_LAUNCH_CUTOVER_HOST = "https://api.spyderbyte.cloud";
export const DEFAULT_PUBLIC_LAUNCH_HOST_IP = "187.77.19.83";
export const DEFAULT_PUBLIC_LAUNCH_PRIVATE_PORTS = "6379,9000,3000,5173,8080,8081,2375";

export function parsePublicLaunchHostArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--execute" || value === "--mint-session") {
      args[value.slice(2)] = true;
      continue;
    }
    if (!value.startsWith("--")) {
      continue;
    }
    args[value.slice(2)] = argv[index + 1] ?? "";
    index += 1;
  }
  return args;
}

export function buildPublicLaunchHostPlan({ args, env }) {
  const apiOrigin = requireOrigin(
    args["api-origin"] ?? env.WF_PUBLIC_LAUNCH_API_ORIGIN ?? DEFAULT_PUBLIC_LAUNCH_API_ORIGIN,
    "WF_PUBLIC_LAUNCH_API_ORIGIN"
  );
  const portalOrigin = requireOrigin(
    args["portal-origin"] ?? env.WF_PUBLIC_LAUNCH_PORTAL_ORIGIN ?? DEFAULT_PUBLIC_LAUNCH_PORTAL_ORIGIN,
    "WF_PUBLIC_LAUNCH_PORTAL_ORIGIN"
  );
  const cutoverHost = requireOrigin(args["cutover-host"] ?? env.WF_PUBLIC_LAUNCH_CUTOVER_HOST ?? DEFAULT_PUBLIC_LAUNCH_CUTOVER_HOST, "WF_PUBLIC_LAUNCH_CUTOVER_HOST");
  const hostIp = normalizeValue(args["host"] ?? env.WF_PUBLIC_LAUNCH_HOST_IP ?? DEFAULT_PUBLIC_LAUNCH_HOST_IP);
  const privatePorts = normalizeValue(args["private-ports"] ?? env.WF_PUBLIC_LAUNCH_PRIVATE_PORTS ?? env.WF_STAGE_SMOKE_PRIVATE_PORTS) ?? DEFAULT_PUBLIC_LAUNCH_PRIVATE_PORTS;
  const sessionCookieName = normalizeValue(env.WF_PORTAL_SESSION_COOKIE_NAME) ?? "wf_portal_session";
  const sessionCookieValue = normalizeValue(env.WF_PUBLIC_LAUNCH_SESSION_COOKIE_VALUE ?? env.WF_SMOKE_SESSION_COOKIE_VALUE ?? env.WF_LIVE_SESSION_COOKIE_VALUE) ?? "";
  const authenticatedMode = sessionCookieValue ? "provided_session" : args["mint-session"] ? "mint_session" : "none";
  const authEnvFilePath = normalizeValue(args["env-file"] ?? env.WF_PUBLIC_LAUNCH_ENV_FILE);
  const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? env.WF_PUBLIC_LAUNCH_TOKEN_TTL_MINUTES);
  const role = parseRole(args.role ?? env.WF_PUBLIC_LAUNCH_ROLE);
  const tenantId = normalizeValue(args.tenant ?? env.WF_PUBLIC_LAUNCH_TENANT_ID ?? env.WF_DEMO_TENANT_ID) ?? DEMO_PROFILES.primary.tenantId;
  const userId = normalizeValue(args.user ?? env.WF_PUBLIC_LAUNCH_USER_ID ?? env.WF_DEMO_USER_ID) ?? DEMO_PROFILES.primary.userId;
  const harnessBoardPath = normalizeValue(args["board-path"] ?? env.WF_PUBLIC_LAUNCH_HARNESS_BOARD_PATH ?? env.WF_LIVE_HARNESS_BOARD_PATH ?? env.WF_SMOKE_HARNESS_BOARD_PATH) ?? "/board?workflowId=wf_connect_first_workflow";
  const workflowId = normalizeValue(args.workflow ?? env.WF_PUBLIC_LAUNCH_WORKFLOW_ID ?? env.WF_LIVE_HARNESS_WORKFLOW_ID ?? env.WF_SMOKE_HARNESS_WORKFLOW_ID) ?? "wf_connect_first_workflow";
  const expectedAssetBaseUrl = `${apiOrigin}/app-assets/`;

  return {
    execute: Boolean(args.execute),
    launchPosture: "isolated_host_launch_lane",
    apiOrigin,
    portalOrigin,
    cutoverHost,
    hostIp,
    privatePorts,
    expectedAssetBaseUrl,
    authenticatedMode,
    authenticatedSessionCookieSupplied: Boolean(sessionCookieValue),
    authEnvFilePath,
    expiresInMinutes,
    role,
    tenantId,
    userId,
    commands: [
      {
        label: "npm run smoke:external",
        command: resolveNodeCommand("npm"),
        args: ["run", "smoke:external"],
        env: {
          WF_SMOKE_API_URL: apiOrigin,
          WF_SMOKE_PORTAL_URL: portalOrigin,
          WF_SMOKE_PORT_HOST: hostIp,
          WF_SMOKE_PRIVATE_PORTS: privatePorts,
          WF_SMOKE_EXPECT_ASSET_BASE_URL: expectedAssetBaseUrl,
          WF_SMOKE_SESSION_COOKIE_NAME: sessionCookieName,
          WF_SMOKE_SESSION_COOKIE_VALUE: sessionCookieValue,
          WF_SMOKE_HARNESS_BOARD_PATH: harnessBoardPath,
          WF_SMOKE_HARNESS_WORKFLOW_ID: workflowId
        }
      },
      {
        label: "npm run e2e:live",
        command: resolveNodeCommand("npm"),
        args: ["run", "e2e:live"],
        env: {
          WF_LIVE_BASE_URL: apiOrigin,
          WF_LIVE_ALLOWED_ORIGIN: portalOrigin,
          WF_LIVE_EXPECT_ASSET_BASE_URL: expectedAssetBaseUrl,
          WF_LIVE_SESSION_COOKIE_NAME: sessionCookieName,
          WF_LIVE_SESSION_COOKIE_VALUE: sessionCookieValue,
          WF_LIVE_HARNESS_BOARD_PATH: harnessBoardPath,
          WF_LIVE_HARNESS_WORKFLOW_ID: workflowId
        }
      }
    ]
  };
}

export function resolveNodeCommand(baseName) {
  return process.platform === "win32" ? `${baseName}.cmd` : baseName;
}

function requireOrigin(value, name) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized.replace(/\/$/, "");
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseExpiresInMinutes(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return 15;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60) {
    throw new Error("--expires-in-minutes must be an integer between 1 and 60");
  }
  return parsed;
}

function parseRole(value) {
  const normalized = normalizeValue(value) ?? "member";
  if (normalized !== "member" && normalized !== "operator") {
    throw new Error("--role must be member or operator");
  }
  return normalized;
}
