import process from "node:process";

import { DEMO_PROFILES } from "./demo-seed-profiles.mjs";

export const DEFAULT_STAGE_PROOF_ENV_FILE = "E:/the_secrets/projects/wealth-factory-stage/wf-stage.vps2.env";
export const DEFAULT_STAGE_SSH_ENV_FILE = "E:/the_secrets/vps/ssh.env";
export const DEFAULT_STAGE_DB_TUNNEL_LOCAL_PORT = 6543;
export const DEFAULT_STAGE_PROOF_LANES = ["primary", "tertiary", "quinary"];
export const DEFAULT_STAGE_SMOKE_PRIVATE_PORTS = "6379,9000,3000,5173,8080,8081,2375";

export function parseStageProofArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      continue;
    }
    args[value.slice(2)] = argv[index + 1] ?? "";
    index += 1;
  }
  return args;
}

export function buildStageProofPlan({ args, env }) {
  const envFilePath = normalizeValue(args["env-file"] ?? env.WF_STAGE_ENV_FILE) ?? DEFAULT_STAGE_PROOF_ENV_FILE;
  const apiOrigin = requireOrigin(args["api-origin"] ?? env.WF_STAGE_API_ORIGIN, "WF_STAGE_API_ORIGIN");
  const portalOrigin = requireOrigin(args["portal-origin"] ?? env.WF_STAGE_PORTAL_ORIGIN, "WF_STAGE_PORTAL_ORIGIN");
  const sessionCookieName = normalizeValue(env.WF_PORTAL_SESSION_COOKIE_NAME) ?? "wf_portal_session";
  const expiresInMinutes = parseExpiresInMinutes(args["expires-in-minutes"] ?? env.WF_STAGE_PROOF_TOKEN_TTL_MINUTES);
  const role = parseRole(args.role ?? env.WF_STAGE_PROOF_ROLE);
  const laneNames = parseLaneNames(args.lanes ?? env.WF_STAGE_PROOF_LANES);
  const expectedAssetBaseUrl = `${apiOrigin}/app-assets/`;
  const preflightDb = buildPreflightDbConfig({ args, env });
  const smokePrivatePorts = normalizeValue(env.WF_STAGE_SMOKE_PRIVATE_PORTS) ?? DEFAULT_STAGE_SMOKE_PRIVATE_PORTS;

  return {
    envFilePath,
    apiOrigin,
    portalOrigin,
    sessionCookieName,
    expectedAssetBaseUrl,
    expiresInMinutes,
    role,
    smokePrivatePorts,
    preflightDb,
    lanes: laneNames.map((laneName) => {
      const profile = DEMO_PROFILES[laneName];
      if (!profile) {
        throw new Error(
          `Unknown stage proof lane '${laneName}'. Use one of: ${Object.keys(DEMO_PROFILES).sort().join(", ")}`
        );
      }

      return {
        laneName,
        tenantId: profile.tenantId,
        userId: profile.userId,
        workflowId: profile.workflowId,
        harnessBoardPath: `/board?workflowId=${encodeURIComponent(profile.workflowId)}`,
        expectedAssetBaseUrl
      };
    })
  };
}

export function buildLaneProofEnv({ plan, lane, sessionToken }) {
  return {
    WF_SMOKE_PRIVATE_PORTS: plan.smokePrivatePorts,
    WF_SMOKE_API_URL: plan.apiOrigin,
    WF_SMOKE_PORTAL_URL: plan.portalOrigin,
    WF_SMOKE_SESSION_COOKIE_NAME: plan.sessionCookieName,
    WF_SMOKE_SESSION_COOKIE_VALUE: sessionToken,
    WF_SMOKE_EXPECT_ASSET_BASE_URL: lane.expectedAssetBaseUrl,
    WF_SMOKE_HARNESS_BOARD_PATH: lane.harnessBoardPath,
    WF_SMOKE_HARNESS_WORKFLOW_ID: lane.workflowId,
    WF_LIVE_BASE_URL: plan.apiOrigin,
    WF_LIVE_SESSION_COOKIE_NAME: plan.sessionCookieName,
    WF_LIVE_SESSION_COOKIE_VALUE: sessionToken,
    WF_LIVE_EXPECT_ASSET_BASE_URL: lane.expectedAssetBaseUrl,
    WF_LIVE_HARNESS_BOARD_PATH: lane.harnessBoardPath,
    WF_LIVE_HARNESS_WORKFLOW_ID: lane.workflowId
  };
}

export function selectNamedStageProofLanes(candidates, value) {
  const selectedLaneNames = parseLaneNames(value);
  const selected = candidates.filter((candidate) => selectedLaneNames.includes(candidate.laneName));
  const selectedNameSet = new Set(selected.map((candidate) => candidate.laneName));
  const unknownLaneName = selectedLaneNames.find((laneName) => !selectedNameSet.has(laneName));
  if (unknownLaneName) {
    throw new Error(`Unknown stage proof lane '${unknownLaneName}'`);
  }
  return selected;
}

export function resolveNodeCommand(baseName) {
  return process.platform === "win32" ? `${baseName}.cmd` : baseName;
}

export function selectSingleWorkflowTemplateId(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`Expected exactly one workflow template row, found ${Array.isArray(rows) ? rows.length : 0}`);
  }
  const id = rows[0]?.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("Resolved workflow template row is missing a usable id");
  }
  return id.trim();
}

function parseLaneNames(value) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    return [...DEFAULT_STAGE_PROOF_LANES];
  }
  return normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function buildPreflightDbConfig({ args, env }) {
  const rawDbUrl = normalizeValue(env.SUPABASE_DB_URL);
  if (!rawDbUrl) {
    throw new Error("SUPABASE_DB_URL is required");
  }

  const parsedDbUrl = new URL(rawDbUrl);
  const tunnelRequired = !isLoopbackHost(parsedDbUrl.hostname);
  const localPort = parseTunnelPort(args["db-tunnel-local-port"] ?? env.WF_STAGE_DB_TUNNEL_LOCAL_PORT);
  const tunnelRemoteHost = normalizeValue(args["db-tunnel-remote-host"] ?? env.WF_STAGE_DB_TUNNEL_REMOTE_HOST) ?? "127.0.0.1";
  const tunnelRemotePort = parseTunnelPort(args["db-tunnel-remote-port"] ?? env.WF_STAGE_DB_TUNNEL_REMOTE_PORT ?? parsedDbUrl.port ?? "5432");
  const sshTarget = normalizeValue(args["ssh-target"] ?? env.WF_STAGE_SSH_TARGET) ?? buildDefaultSshTarget(env);
  const remoteContainerName = normalizeValue(args["preflight-container"] ?? env.WF_STAGE_PREFLIGHT_CONTAINER) ?? "wf-stage-api";
  const resolvedDbUrl = tunnelRequired ? rewriteDbUrlForTunnel(parsedDbUrl, localPort) : rawDbUrl;

  return {
    rawDbUrl,
    resolvedDbUrl,
    tunnelRequired,
    localPort,
    tunnelRemoteHost,
    tunnelRemotePort,
    sshTarget,
    remoteContainerName
  };
}

function requireOrigin(value, name) {
  const normalized = normalizeValue(value);
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized.replace(/\/$/, "");
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

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseTunnelPort(value) {
  const normalized = normalizeValue(value);
  const fallback = DEFAULT_STAGE_DB_TUNNEL_LOCAL_PORT;
  if (!normalized) {
    return fallback;
  }
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("DB tunnel ports must be integers between 1 and 65535");
  }
  return parsed;
}

function buildDefaultSshTarget(env) {
  const user = normalizeValue(env.VPS2_USER);
  const host = normalizeValue(env.VPS2_HOST);
  if (!user || !host) {
    return null;
  }
  return `${user}@${host}`;
}

function rewriteDbUrlForTunnel(parsedDbUrl, localPort) {
  const tunnelUrl = new URL(parsedDbUrl.toString());
  tunnelUrl.hostname = "127.0.0.1";
  tunnelUrl.port = String(localPort);
  return tunnelUrl.toString();
}

function isLoopbackHost(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}
