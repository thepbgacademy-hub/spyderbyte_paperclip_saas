import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const caddyExample = normalizeLineEndings(
  readFileSync("deploy/caddy/wf-api.spyderbyte.cloud.Caddyfile.example", "utf8")
);
const isolatedCompose = normalizeLineEndings(
  readFileSync("deploy/docker-compose.vps2-isolated-stage.yml", "utf8")
);
const isolatedEnvExample = normalizeLineEndings(
  readFileSync("deploy/env/wf-stage.vps2.example.env", "utf8")
);
const isolatedRunbook = normalizeLineEndings(
  readFileSync("deploy/runbooks/vps2-isolated-wealth-factory-stage-rollout.md", "utf8")
);
const workerDockerfile = normalizeLineEndings(readFileSync("Dockerfile.worker", "utf8"));

describe("VPS2 isolated Wealth Factory stage rollout", () => {
  it("keeps the dedicated stage hostname and route split explicit", () => {
    expect(caddyExample).toContain("wf-api.spyderbyte.cloud");
    expect(caddyExample).toContain("handle /app-assets/*");
    expect(caddyExample).toContain("uri replace /app-assets/ /assets/");
    expect(caddyExample).toContain("reverse_proxy wf-stage-web:3000");
    expect(caddyExample).toContain("reverse_proxy wf-stage-api:8080");
    expect(caddyExample).toContain("header_up Host {host}");
    expect(caddyExample).toContain("header_up X-Forwarded-Proto {scheme}");
    expect(caddyExample).toContain("header_up X-Forwarded-For {remote_host}");
    expect(caddyExample).toContain('Cache-Control "public, max-age=31536000, immutable"');
  });

  it("defines an isolated compose lane with no public host port bindings", () => {
    expect(isolatedCompose).toContain("wf-stage-web:");
    expect(isolatedCompose).toContain('command: ["nginx", "-g", "daemon off;"]');
    expect(isolatedCompose).toContain("wf-stage-api:");
    expect(isolatedCompose).toContain("wf-stage-worker:");
    expect(isolatedCompose).toContain("WF_STAGE_WEB_IMAGE:-spyderbyte/web:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(isolatedCompose).toContain("WF_STAGE_API_IMAGE:-spyderbyte/api:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(isolatedCompose).toContain("WF_STAGE_WORKER_IMAGE:-spyderbyte/worker:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(isolatedCompose).not.toMatch(/^\s+ports:/m);
    expect(isolatedCompose).toContain("name: supabase_default");
    expect(isolatedCompose).toContain("name: paperclip-gwry_default");
    expect(isolatedCompose).toContain("name: redis-tzbr_default");
    expect(isolatedCompose).toContain("WF_WEB_APP_ENTRY_URL: ${WF_WEB_APP_ENTRY_URL:?set WF_WEB_APP_ENTRY_URL}");
    expect(isolatedCompose).toContain("WF_WEB_APP_STYLESHEET_URL: ${WF_WEB_APP_STYLESHEET_URL:-}");
    expect(isolatedCompose).toContain("WF_HARNESS_ENABLED_WORKFLOW_IDS: ${WF_HARNESS_ENABLED_WORKFLOW_IDS:-}");
    expect(isolatedCompose).toContain("WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS: ${WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS:-}");
    expect(isolatedCompose).toContain("WF_STORAGE_OAUTH_REDIRECT_ORIGIN: ${WF_STORAGE_OAUTH_REDIRECT_ORIGIN:-}");
    expect(isolatedCompose).toContain("CODEX_HOME: ${WF_OPENAI_CODEX_HOME:?set WF_OPENAI_CODEX_HOME}");
    expect(isolatedCompose).toContain(
      "${WF_OPENAI_CODEX_HOME:?set WF_OPENAI_CODEX_HOME}:${WF_OPENAI_CODEX_HOME:?set WF_OPENAI_CODEX_HOME}"
    );
    expect(isolatedCompose).toContain("REDIS_URL: ${REDIS_URL:?set REDIS_URL}");
    expect(isolatedCompose).toContain("WF_WORKFLOW_QUEUE_NAME: ${WF_WORKFLOW_QUEUE_NAME:?set WF_WORKFLOW_QUEUE_NAME}");
    expect(isolatedCompose).toContain("PAPERCLIP_BASE_URL: ${PAPERCLIP_BASE_URL:?set PAPERCLIP_BASE_URL}");
    expect(isolatedCompose).toContain("WF_PAPERCLIP_SERVICE_TOKEN_MAP: ${WF_PAPERCLIP_SERVICE_TOKEN_MAP:-}");
    expect(isolatedCompose).toMatch(
      /wf-stage-worker:[\s\S]*?networks:\s*\n\s+- ingress\s*\n\s+- paperclip\s*\n\s+- redis/
    );
  });

  it("mounts Codex device-auth home into the worker execution lane", () => {
    const workerBlock = serviceBlock(isolatedCompose, "wf-stage-worker");

    expect(workerBlock).toContain("CODEX_HOME: ${WF_OPENAI_CODEX_HOME:?set WF_OPENAI_CODEX_HOME}");
    expect(workerBlock).toContain("volumes:");
    expect(workerBlock).toContain(
      "${WF_OPENAI_CODEX_HOME:?set WF_OPENAI_CODEX_HOME}:${WF_OPENAI_CODEX_HOME:?set WF_OPENAI_CODEX_HOME}"
    );
  });

  it("keeps the worker runtime PATH able to find the packaged Codex CLI", () => {
    expect(workerDockerfile).toContain('ENV PATH="/app/node_modules/.bin:${PATH}"');
  });

  it("ships a single env template for the isolated stage lane", () => {
    expect(isolatedEnvExample).toContain("WF_STAGE_API_ORIGIN=https://wf-api.spyderbyte.cloud");
    expect(isolatedEnvExample).toContain("WF_STAGE_WEB_IMAGE=spyderbyte/web:replace-with-reviewed-image-tag");
    expect(isolatedEnvExample).toContain("WF_STAGE_API_IMAGE=wealth-factory-api-stage2:boardsession");
    expect(isolatedEnvExample).toContain("WF_STAGE_WORKER_IMAGE=wealth-factory-worker-stage2:boardsession");
    expect(isolatedEnvExample).toContain("SUPABASE_DB_URL=postgresql://postgres.tenant:replace-with-password@supabase-db:5432/postgres");
    expect(isolatedEnvExample).toContain("WF_STORAGE_OAUTH_REDIRECT_ORIGIN=https://www.spyderbyte.cloud");
    expect(isolatedEnvExample).toContain("WF_WEB_APP_ENTRY_URL=https://wf-api.spyderbyte.cloud/app-assets/");
    expect(isolatedEnvExample).toContain("REDIS_URL=redis://redis:6379");
    expect(isolatedEnvExample).toContain(
      "WF_OPENAI_CODEX_HOME=/home/deploy/wealth-factory-stage/codex-homes/first-subscriber"
    );
    expect(isolatedEnvExample).toContain("WF_WORKFLOW_QUEUE_NAME=wfpc-workflow-runs-stage");
    expect(isolatedEnvExample).toContain("PAPERCLIP_BASE_URL=http://paperclip:3100");
    expect(isolatedEnvExample).toContain("WF_ALLOWED_ORIGINS=https://www.spyderbyte.cloud");
    expect(isolatedEnvExample).toContain(
      "WF_HARNESS_ENABLED_WORKFLOW_IDS=wf_connect_first_workflow,wf_tax_strategy,wf_package_followup"
    );
    expect(isolatedEnvExample).toContain(
      "WF_NATIVE_EXECUTOR_ENABLED_WORKFLOW_IDS=wf_connect_first_workflow,wf_tax_strategy,wf_package_followup"
    );
    expect(isolatedEnvExample).toContain("WF_STAGE_SMOKE_PRIVATE_PORTS=6379,9000,3000,5173,8080,8081,2375");
    expect(isolatedEnvExample).toContain("WF_PAPERCLIP_SERVICE_TOKEN_MAP=");
  });

  it("documents how to wire the isolated host without touching the shared route", () => {
    expect(isolatedRunbook).toContain("wf-api.spyderbyte.cloud");
    expect(isolatedRunbook).toContain("deploy/caddy/wf-api.spyderbyte.cloud.Caddyfile.example");
    expect(isolatedRunbook).toContain("deploy/docker-compose.vps2-isolated-stage.yml");
    expect(isolatedRunbook).toContain("deploy/env/wf-stage.vps2.example.env");
    expect(isolatedRunbook).toContain("docker compose --env-file deploy/env/wf-stage.vps2.env -f deploy/docker-compose.vps2-isolated-stage.yml up -d");
    expect(isolatedRunbook).toContain("WF_WORKFLOW_QUEUE_NAME=wfpc-workflow-runs-stage");
    expect(isolatedRunbook).toContain("This queue name must stay unique to the isolated stage lane.");
    expect(isolatedRunbook).toContain("Do not repoint this existing block during the isolated proof phase");
    expect(isolatedRunbook).toContain("This runbook does **not** require:");
  });

  it("documents the exact non-destructive operator sequence", () => {
    expect(isolatedRunbook).toContain("## Exact Operator Sequence");
    expect(isolatedRunbook).toContain("docker compose --env-file deploy/env/wf-stage.vps2.env -f deploy/docker-compose.vps2-isolated-stage.yml config");
    expect(isolatedRunbook).toContain("WF_STAGE_API_IMAGE=wealth-factory-api-stage2:boardsession");
    expect(isolatedRunbook).toContain("WF_STAGE_WORKER_IMAGE=wealth-factory-worker-stage2:boardsession");
    expect(isolatedRunbook).toContain("Historical first-wire note: there was initially no verified Wealth Factory web image on VPS 2.");
    expect(isolatedRunbook).toContain("docker network inspect supabase_default");
    expect(isolatedRunbook).toContain("docker network inspect paperclip-gwry_default");
    expect(isolatedRunbook).toContain("docker network inspect redis-tzbr_default");
    expect(isolatedRunbook).toContain("sudo caddy validate --config /etc/caddy/Caddyfile");
    expect(isolatedRunbook).toContain("sudo caddy reload --config /etc/caddy/Caddyfile");
    expect(isolatedRunbook).toContain("Resolve-DnsName wf-api.spyderbyte.cloud");
    expect(isolatedRunbook).toContain("curl.exe -I https://wf-api.spyderbyte.cloud/health");
    expect(isolatedRunbook).toContain("npm run prove:stage-live");
    expect(isolatedRunbook).toContain("npm run prove:stage-stability -- --dry-run");
    expect(isolatedRunbook).toContain("npm run prove:stage-stability");
    expect(isolatedRunbook).toContain("npm run prove:stage-live-native-execution");
    expect(isolatedRunbook).toContain("`WF_STAGE_SMOKE_PRIVATE_PORTS`");
    expect(isolatedRunbook).toContain("`npm run prove:stage-stability` inherits that same stage-owned private-port exception list automatically.");
    expect(isolatedRunbook).toContain("- `wf-stage-api`");
    expect(isolatedRunbook).toContain("- `wf-stage-worker`");
    expect(isolatedRunbook).toContain("- `wf-stage-web`");
    expect(isolatedRunbook).not.toContain("- `paperclip`");
    expect(isolatedRunbook).not.toContain("WF_SMOKE_PRIVATE_PORTS=\"6379,9000,3000,5173,8080,8081,2375\"");
    expect(isolatedRunbook).toContain("If the isolated proof fails:");
    expect(isolatedRunbook).toContain("leave `api.spyderbyte.cloud` unchanged");
  });

  it("states that wf-api remains the active launch lane while cutover stays optional", () => {
    expect(isolatedRunbook).toContain(
      "The current operator posture"
    );
    expect(isolatedRunbook).toContain(
      "`wf-api.spyderbyte.cloud` as the active Wealth Factory public API lane."
    );
    expect(isolatedRunbook).toContain(
      "The cutover paths below remain available only if operators later choose to change host posture."
    );
    expect(isolatedRunbook).not.toContain("At that point choose one of three paths explicitly:");
    expect(isolatedRunbook).not.toContain(
      "decide separately whether to keep `wf-api.spyderbyte.cloud` as the permanent Wealth Factory API host or to perform a later deliberate cutover"
    );
  });
});

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function serviceBlock(compose: string, serviceName: string): string {
  const match = compose.match(new RegExp(`\\n  ${serviceName}:\\n[\\s\\S]*?(?=\\n  [a-z0-9-]+:\\n|\\nnetworks:\\n)`));
  if (!match) {
    throw new Error(`Missing compose service ${serviceName}`);
  }

  return match[0];
}
