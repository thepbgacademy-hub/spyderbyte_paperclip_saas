import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const compose = normalizeLineEndings(readFileSync("deploy/docker-compose.yml", "utf8"));
const nginx = normalizeLineEndings(readFileSync("deploy/nginx/spyderbyte.conf", "utf8"));
const runbook = normalizeLineEndings(readFileSync("deploy/runbooks/deploy-poc.md", "utf8"));
const apiDockerfile = normalizeLineEndings(readFileSync("Dockerfile.api", "utf8"));
const workerDockerfile = normalizeLineEndings(readFileSync("Dockerfile.worker", "utf8"));

describe("deployment POC config", () => {
  it("keeps Redis and the internal workflow engine off public host ports", () => {
    const internalServiceBlocks = extractServiceBlocks(compose, ["redis", "paperclip", "worker"]);

    for (const block of internalServiceBlocks) {
      expect(block).not.toMatch(/^\s+ports:/m);
      expect(block).not.toMatch(/network_mode:\s*host/i);
    }

    expect(compose).toContain("private:");
    expect(compose).toContain("internal: true");
    expect(compose).toContain("redis://redis:6379");
  });

  it("publishes only the branded reverse proxy on public ports", () => {
    const allServiceBlocks = extractAllServiceBlocks(compose);
    const publicPortBlocks = allServiceBlocks.filter(({ serviceName }) => serviceName === "nginx").map(({ block }) => block);
    const nonProxyPortBlocks = allServiceBlocks.filter(({ block, serviceName }) => serviceName !== "nginx" && /^\s+ports:/m.test(block));

    expect(nonProxyPortBlocks).toEqual([]);
    expect(publicPortBlocks.join("\n")).toContain("\"80:80\"");
    expect(publicPortBlocks.join("\n")).toContain("\"443:443\"");
    expect(nginx).toContain("server_name www.spyderbyte.cloud");
    expect(nginx).toContain("server_name api.spyderbyte.cloud");
    expect(nginx).toContain("location /app-assets/");
    expect(nginx).toContain("proxy_pass http://web:3000/assets/");
    expect(nginx).not.toMatch(/paperclip|redis|worker/i);
  });

  it("documents secret handling and external smoke checks", () => {
    expect(runbook).toContain("Do not place real values in Git");
    expect(runbook).toContain("BYOK runtime secrets stored by reference");
    expect(runbook).toContain("WF_ALLOWED_ORIGINS");
    expect(runbook).toContain("WF_API_SESSION_SIGNING_KEY");
    expect(runbook).toContain("WF_API_SESSION_ISSUER");
    expect(runbook).toContain("WF_API_SESSION_AUDIENCE");
    expect(runbook).toContain("WF_VAULT_MASTER_KEY");
    expect(runbook).toContain("WF_PROVIDER_EXECUTION_MODE");
    expect(runbook).toContain("WF_PAPERCLIP_LAUNCH_MODE");
    expect(runbook).toContain("WF_PAPERCLIP_BOARD_SESSION_TOKEN");
    expect(runbook).toContain("WF_PAPERCLIP_BOARD_ORIGIN");
    expect(runbook).toContain("WF_PAPERCLIP_ADMIN_TOKEN");
    expect(runbook).toContain("WF_PAPERCLIP_SERVICE_TOKEN_MAP");
    expect(runbook).toContain("WF_PAPERCLIP_ISSUE_AGENT_ID");
    expect(runbook).toContain("WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS");
    expect(runbook).toContain("WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS");
    expect(runbook).toContain("WF_WORKER_CONCURRENCY");
    expect(runbook).toContain("WF_WORKER_MAX_ACTIVE_PER_TENANT");
    expect(runbook).toContain("WF_PAPERCLIP_AUTH_PROBE_COMPANY_ID");
    expect(runbook).toContain("WF_WEB_APP_ENTRY_URL");
    expect(runbook).toContain("WF_WEB_APP_STYLESHEET_URL");
    expect(runbook).toContain("WF_PORTAL_SESSION_COOKIE_NAME");
    expect(runbook).toContain("npm run resolve:web-assets");
    expect(runbook).toContain("same-site cookie auth only");
    expect(runbook).toContain("/app-assets/");
    expect(runbook).toContain("npm run smoke:external");
    expect(runbook).toContain("npm run e2e:live");
    expect(runbook).toContain("Reversible Operator Sequence");
    expect(runbook).toContain("Temporary Reopen Sequence");
    expect(runbook).toContain("Roll Out API Shell Env Vars");
    expect(runbook).toContain("WF_WEB_APP_ENTRY_URL");
    expect(runbook).toContain("wf-dashboard-bootstrap");
    expect(runbook).toContain("sudo ufw deny 5432/tcp");
    expect(runbook).toContain("sudo ufw delete deny 5432/tcp");
    expect(runbook).toContain("api.spyderbyte.cloud");
    expect(runbook).toContain("no longer show a TLS handshake failure");
    expect(runbook).toContain("http://<vps-public-ip>:3100/api/health");
    expect(runbook).toContain("docker compose -f deploy/docker-compose.yml port paperclip 3100");
    expect(runbook).toContain("Test-NetConnection www.spyderbyte.cloud -Port 6379");
    expect(runbook).toContain("Public port 3100 is closed");
  });

  it("requires explicit immutable image tags for deployment inputs", () => {
    expect(compose).toContain("spyderbyte/web:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(compose).toContain("spyderbyte/api:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(compose).toContain("spyderbyte/worker:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(compose).toContain("paperclipai/paperclip:${PAPERCLIP_IMAGE_TAG:?set PAPERCLIP_IMAGE_TAG}");
    expect(runbook).toContain("immutable commit tag");
  });

  it("ships explicit server and worker container entrypoints for deployment", () => {
    expect(apiDockerfile).toContain('CMD ["node", "dist/api/server-main.js"]');
    expect(apiDockerfile).toContain("COPY scripts ./scripts");
    expect(workerDockerfile).toContain('CMD ["node", "dist/worker/worker-main.js"]');
    expect(workerDockerfile).toContain('HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD ["node", "dist/worker/healthcheck.js"]');
    expect(workerDockerfile).toContain("npm run build:server");
    expect(runbook).toContain("confirm `api` is running, and `worker`, `paperclip`, and `redis` are healthy");
    expect(runbook).toContain("verifies both Redis reachability and Paperclip health");
    expect(runbook).toContain("configured Paperclip service token is not rejected by an authenticated company-scoped route");
    expect(runbook).toContain("both receive `WF_PAPERCLIP_LAUNCH_MODE`, `WF_PAPERCLIP_BOARD_SESSION_TOKEN`, `WF_PAPERCLIP_BOARD_ORIGIN`, and `WF_PAPERCLIP_ISSUE_AGENT_ID`");
    expect(runbook).toContain("company-scoped bearer token");
  });

  it("fails fast when required server-side secrets are missing", () => {
    for (const key of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_DB_URL",
      "WF_ALLOWED_ORIGINS",
      "WF_API_SESSION_SIGNING_KEY",
      "WF_WEB_APP_ENTRY_URL",
      "PAPERCLIP_SERVICE_TOKEN",
      "WF_VAULT_MASTER_KEY"
    ]) {
      expect(compose).toContain(`${key}: \${${key}:?set ${key}}`);
    }
    expect(compose).toContain("WF_API_SESSION_ISSUER: ${WF_API_SESSION_ISSUER:-wealth-factory-runtime}");
    expect(compose).toContain("WF_API_SESSION_AUDIENCE: ${WF_API_SESSION_AUDIENCE:-wealth-factory-portal}");
    expect(compose).toContain("WF_WEB_APP_STYLESHEET_URL: ${WF_WEB_APP_STYLESHEET_URL:-}");
    expect(compose).toContain("WF_PORTAL_SESSION_COOKIE_NAME: ${WF_PORTAL_SESSION_COOKIE_NAME:-wf_portal_session}");
    expect(compose).toContain("WF_PROVIDER_EXECUTION_MODE: ${WF_PROVIDER_EXECUTION_MODE:-tenant_credentials_required}");
    expect(compose).toContain("WF_PAPERCLIP_LAUNCH_MODE: ${WF_PAPERCLIP_LAUNCH_MODE:-runs}");
    expect(compose).toContain("WF_PAPERCLIP_BOARD_SESSION_TOKEN: ${WF_PAPERCLIP_BOARD_SESSION_TOKEN:-}");
    expect(compose).toContain("WF_PAPERCLIP_BOARD_ORIGIN: ${WF_PAPERCLIP_BOARD_ORIGIN:-}");
    expect(compose).toContain("WF_PAPERCLIP_ADMIN_TOKEN: ${WF_PAPERCLIP_ADMIN_TOKEN:-}");
    expect(compose).toContain("WF_PAPERCLIP_ISSUE_AGENT_ID: ${WF_PAPERCLIP_ISSUE_AGENT_ID:-}");
    expect(compose).toContain("WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS: ${WF_PAPERCLIP_ISSUE_POLL_INTERVAL_MS:-1000}");
    expect(compose).toContain("WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS: ${WF_PAPERCLIP_ISSUE_MAX_POLL_ATTEMPTS:-10}");
    expect(compose).toContain("WF_WORKER_CONCURRENCY: ${WF_WORKER_CONCURRENCY:-2}");
    expect(compose).toContain("WF_WORKER_MAX_ACTIVE_PER_TENANT: ${WF_WORKER_MAX_ACTIVE_PER_TENANT:-1}");
    expect(compose).toContain("WF_PAPERCLIP_AUTH_PROBE_COMPANY_ID: ${WF_PAPERCLIP_AUTH_PROBE_COMPANY_ID:-}");
    expect(compose).toContain("PAPERCLIP_BASE_URL: http://paperclip:3100");
    expect(compose).toContain("PAPERCLIP_DEPLOYMENT_MODE: authenticated");
    expect(compose).toContain("PAPERCLIP_PUBLIC_URL: ${PAPERCLIP_PUBLIC_URL:-http://127.0.0.1:3100}");
    expect(runbook).toContain("npm run e2e");
    expect(runbook).not.toContain("--project chromium");
  });

  it("documents rollback of shell asset env along with image tags", () => {
    expect(runbook).toContain("Restore the previous `WF_WEB_APP_ENTRY_URL` and `WF_WEB_APP_STYLESHEET_URL`");
  });

  it("documents the next staged/live VPS proof sequence for secret lifecycle validation", () => {
    expect(runbook).toContain("## Next VPS Proof Sequence");
    expect(runbook).toContain("Register or refresh a tenant provider credential");
    expect(runbook).toContain("npm run prove:provider-lifecycle");
    expect(runbook).toContain("seed:demo -- --lane secondary");
    expect(runbook).toContain("seed:demo -- --lane quaternary");
    expect(runbook).toContain("seed:demo -- --lane senary");
    expect(runbook).toContain("wfpc.paperclip_company_mappings");
    expect(runbook).toContain("Rotate the tenant credential");
    expect(runbook).toContain("Revoke the tenant credential");
    expect(runbook).toContain("GET/POST /api/companies/:companyId/secrets");
    expect(runbook).toContain("POST /api/secrets/:secretId/rotate");
    expect(runbook).toContain("PATCH /api/secrets/:secretId");
    expect(runbook).toContain("PATCH /api/agents/:agentId");
    expect(runbook).toContain("POST /api/agents/:agentId/keys");
    expect(runbook).toContain("WF_LIFECYCLE_SECRET_VALUE");
    expect(runbook).toContain("WF_LIFECYCLE_SECRET_VALUE_NEXT");
    expect(runbook).toContain("patches the configured Paperclip issue agent with version-pinned `secret_ref` bindings");
    expect(runbook).toContain("prefer repeated `--lane lane:tenant:user:workflow:runs` inputs");
    expect(runbook).toContain("restart or recreate those workers before trusting telemetry");
    expect(runbook).toContain("phase = global_multi_worker_soak_observed");
  });
});

function extractServiceBlocks(source: string, serviceNames: string[]): string[] {
  return serviceNames.map((serviceName) => {
    const pattern = new RegExp(`^\\x20{2}${serviceName}:\\n([\\s\\S]*?)(?=^\\x20{2}[a-zA-Z0-9_-]+:|^networks:|^volumes:|$)`, "m");
    const match = pattern.exec(source);
    return match?.[0] ?? "";
  });
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function extractAllServiceBlocks(source: string): Array<{ serviceName: string; block: string }> {
  const blocks: Array<{ serviceName: string; block: string }> = [];
  const lines = source.split("\n");
  let currentName = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^(networks|volumes):/.test(line)) break;

    const serviceMatch = /^ {2}([a-zA-Z0-9_-]+):$/.exec(line);
    if (serviceMatch) {
      if (currentName) {
        blocks.push({ serviceName: currentName, block: currentLines.join("\n") });
      }
      currentName = serviceMatch[1] ?? "";
      currentLines = [line];
      continue;
    }

    if (currentName) {
      currentLines.push(line);
    }
  }

  if (currentName) {
    blocks.push({ serviceName: currentName, block: currentLines.join("\n") });
  }

  return blocks;
}
