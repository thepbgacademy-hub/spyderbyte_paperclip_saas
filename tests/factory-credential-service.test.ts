import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createFactoryCredentialService } from "../src/factory/power-sources/factory-credential-service.js";
import { createMemoryFactoryCredentialRepository } from "../src/factory/power-sources/factory-credential-repository.js";
import { createFactoryCredentialVault } from "../src/factory/power-sources/factory-credential-vault.js";

function service() {
  const repository = createMemoryFactoryCredentialRepository();
  const vault = createFactoryCredentialVault({
    keyring: { current: { version: "v1", masterKey: randomBytes(32).toString("base64") } }
  });
  return {
    repository,
    credentialService: createFactoryCredentialService({ repository, vault, now: () => "2026-07-11T12:00:00.000Z" })
  };
}

describe("factory credential service", () => {
  it("creates credentials with encrypted storage and returns only a masked public shape", async () => {
    const { credentialService, repository } = service();

    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      secret: { apiKey: "sk-secret-value" }
    });

    expect(created).toMatchObject({
      workspaceId: "workspace_1",
      providerKind: "openai_api",
      label: "Founder OpenAI key",
      last4: "alue",
      masked: true
    });
    expect(JSON.stringify(created)).not.toContain("sk-secret-value");
    expect(JSON.stringify(repository.dump())).not.toContain("sk-secret-value");
  });

  it("lists only active masked credentials and never returns plaintext", async () => {
    const { credentialService } = service();
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "anthropic_api",
      label: "Anthropic key",
      secret: { apiKey: "sk-ant-secret" }
    });
    await credentialService.createCredential({
      workspaceId: "workspace_2",
      providerKind: "openrouter_api",
      label: "Other workspace key",
      secret: { apiKey: "sk-other-secret" }
    });

    const listed = await credentialService.listCredentials({ workspaceId: "workspace_1" });

    expect(listed).toEqual([created]);
    expect(JSON.stringify(listed)).not.toContain("sk-ant-secret");
    expect(JSON.stringify(listed)).not.toContain("sk-other-secret");
  });

  it("soft deletes credentials so masked lists and decrypts exclude them", async () => {
    const { credentialService } = service();
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "gemini_api",
      label: "Gemini key",
      secret: { apiKey: "sk-gemini-secret" }
    });

    await credentialService.deleteCredential({ workspaceId: "workspace_1", credentialId: created.id });

    await expect(
      credentialService.decryptCredential({
        workspaceId: "workspace_1",
        credentialId: created.id,
        runId: "run_1",
        purpose: "worker_execution"
      })
    ).rejects.toMatchObject({ code: "factory_credential_not_found" });
    await expect(credentialService.listCredentials({ workspaceId: "workspace_1" })).resolves.toEqual([]);
  });

  it("decrypts only through the worker boundary and records an audit event with purpose", async () => {
    const { credentialService, repository } = service();
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "openrouter_api",
      label: "OpenRouter key",
      secret: { apiKey: "sk-router-secret" }
    });

    const decrypted = await credentialService.decryptCredential({
      workspaceId: "workspace_1",
      credentialId: created.id,
      runId: "run_1",
      purpose: "worker_execution"
    });

    expect(decrypted).toEqual({ apiKey: "sk-router-secret" });
    expect(repository.dumpAuditEvents()).toEqual([
      expect.objectContaining({
        workspaceId: "workspace_1",
        credentialId: created.id,
        runId: "run_1",
        purpose: "worker_execution",
        accessedAt: "2026-07-11T12:00:00.000Z"
      })
    ]);
  });

  it("requires a purpose before decrypting a credential", async () => {
    const { credentialService } = service();
    const created = await credentialService.createCredential({
      workspaceId: "workspace_1",
      providerKind: "xai_grok_api",
      label: "Grok key",
      secret: { apiKey: "xai-secret-value" }
    });

    await expect(
      credentialService.decryptCredential({
        workspaceId: "workspace_1",
        credentialId: created.id,
        runId: "run_1",
        purpose: " "
      })
    ).rejects.toMatchObject({ code: "factory_credential_purpose_required" });
  });
});
