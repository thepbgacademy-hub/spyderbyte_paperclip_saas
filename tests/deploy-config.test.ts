import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const compose = normalizeLineEndings(readFileSync("deploy/docker-compose.yml", "utf8"));
const nginx = normalizeLineEndings(readFileSync("deploy/nginx/spyderbyte.conf", "utf8"));
const runbook = normalizeLineEndings(readFileSync("deploy/runbooks/deploy-poc.md", "utf8"));

describe("deployment POC config", () => {
  it("keeps Redis and the internal workflow engine off public host ports", () => {
    const internalServiceBlocks = extractServiceBlocks(compose, ["redis", "paperclip", "worker"]);

    for (const block of internalServiceBlocks) {
      expect(block).not.toMatch(/^\s+ports:/m);
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
    expect(nginx).not.toMatch(/paperclip|redis/i);
  });

  it("documents secret handling and external smoke checks", () => {
    expect(runbook).toContain("Do not place real values in Git");
    expect(runbook).toContain("BYOK runtime secrets stored by reference");
    expect(runbook).toContain("WF_ALLOWED_ORIGINS");
    expect(runbook).toContain("WF_VAULT_MASTER_KEY");
    expect(runbook).toContain("http://<vps-public-ip>:9000/health");
    expect(runbook).toContain("docker compose -f deploy/docker-compose.yml port paperclip 9000");
    expect(runbook).toContain("Test-NetConnection www.spyderbyte.cloud -Port 6379");
    expect(runbook).toContain("Public port 9000 is closed");
  });

  it("requires explicit immutable image tags for deployment inputs", () => {
    expect(compose).toContain("spyderbyte/web:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(compose).toContain("spyderbyte/api:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(compose).toContain("spyderbyte/worker:${SPYDERBYTE_IMAGE_TAG:?set SPYDERBYTE_IMAGE_TAG}");
    expect(compose).toContain("paperclipai/paperclip:${PAPERCLIP_IMAGE_TAG:?set PAPERCLIP_IMAGE_TAG}");
    expect(runbook).toContain("immutable commit tag");
  });

  it("fails fast when required server-side secrets are missing", () => {
    for (const key of [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_DB_URL",
      "WF_ALLOWED_ORIGINS",
      "PAPERCLIP_SERVICE_TOKEN",
      "WF_VAULT_MASTER_KEY"
    ]) {
      expect(compose).toContain(`${key}: \${${key}:?set ${key}}`);
    }
    expect(runbook).toContain("npm run e2e");
    expect(runbook).not.toContain("--project chromium");
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
