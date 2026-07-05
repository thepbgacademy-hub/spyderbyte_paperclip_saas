import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const scriptPath = "scripts/repair-openai-device-provider-binding.mjs";
const readinessProofPath = "audit/2026-07-02/codex-auth-home-readiness-api-stage-browser.json";

describe("OpenAI device provider binding repair script", () => {
  it("is exposed as a dry-run-first npm operator command", () => {
    const script = readFileSync(scriptPath, "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

    expect(packageJson.scripts["repair:openai-device-provider-binding"]).toBe(
      "node scripts/repair-openai-device-provider-binding.mjs"
    );
    expect(script).toContain("openai_chatgpt_codex_subscription");
    expect(script).toContain("--execute");
    expect(script).toContain("--codex-home-readiness-proof");
    expect(script).toContain("--rebind-existing-run");
    expect(script).toContain("workflow-template");
    expect(script).toContain("codexHomeFingerprint");
    expect(script).toContain("codexHome");
    expect(script).toContain("authStateRef");
    expect(script).toContain("DRY RUN");
    expect(script).not.toContain("PAPERCLIP");
    expect(script).not.toContain("api.spyderbyte.cloud");
  });

  it("prints a sanitized dry-run plan by default", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--tenant",
        "22222222-2222-4222-8222-222222222222",
        "--workflow",
        "wf_connect_first_workflow",
        "--codex-home",
        "/opt/wealth-factory/codex-auth/22222222-2222-4222-8222-222222222222",
        "--auth-state-ref",
        "codex-auth-state"
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8"
      }
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      dryRun: true,
      phase: "openai_device_provider_binding_repair_planned",
      tenantId: "22222222-2222-4222-8222-222222222222",
      workflowId: "wf_connect_first_workflow",
      workflowTemplateId: "wf_connect_first_workflow",
      providerKind: "openai_chatgpt_codex_subscription",
      codexHomeSupplied: true,
      authStateRefSupplied: true
    });
    expect(JSON.stringify(parsed)).not.toMatch(/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|postgresql:\/\/|the_secrets/i);
  });

  it("allows the public workflow proof target to resolve to an explicit live workflow template id", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--tenant",
        "22222222-2222-4222-8222-222222222222",
        "--workflow",
        "wf_connect_first_workflow",
        "--workflow-template",
        "44444444-4444-4444-8444-444444444444",
        "--codex-home",
        "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
        "--auth-state-ref",
        "first-subscriber-openai-device",
        "--codex-home-readiness-proof",
        readinessProofPath
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8"
      }
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      dryRun: true,
      workflowId: "wf_connect_first_workflow",
      workflowTemplateId: "44444444-4444-4444-8444-444444444444"
    });
    expect(JSON.stringify(parsed)).not.toMatch(/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|postgresql:\/\/|the_secrets/i);
  });

  it("fails closed in execute mode until device auth metadata is supplied", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [scriptPath, "--tenant", "tenant-1", "--workflow", "wf_connect_first_workflow", "--execute"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/--codex-home and --auth-state-ref are required/);
  });

  it("fails closed in execute mode until the VPS Codex auth home readiness gate is explicitly confirmed", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/opt/wealth-factory/codex-auth/22222222-2222-4222-8222-222222222222",
          "--auth-state-ref",
          "codex-auth-state",
          "--execute"
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/--confirm-codex-home-ready is required/);
  });

  it("fails closed in execute mode until a valid Codex auth-home readiness proof artifact is supplied", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/opt/wealth-factory/codex-auth/22222222-2222-4222-8222-222222222222",
          "--auth-state-ref",
          "codex-auth-state",
          "--execute",
          "--confirm-codex-home-ready"
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/--codex-home-readiness-proof is required/);
  });

  it("accepts a target-matched readiness proof artifact with a UTF-8 BOM", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "wf-codex-proof-"));
    const proofPath = join(tempDir, "proof.json");
    writeFileSync(proofPath, `\uFEFF${readFileSync(readinessProofPath, "utf8")}`, "utf8");

    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--tenant",
        "22222222-2222-4222-8222-222222222222",
        "--workflow",
        "wf_connect_first_workflow",
        "--workflow-template",
        "44444444-4444-4444-8444-444444444444",
        "--codex-home",
        "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
        "--auth-state-ref",
        "first-subscriber-openai-device",
        "--codex-home-readiness-proof",
        proofPath
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8"
      }
    );

    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      dryRun: true,
      codexHomeReadinessProofPhase: "codex_auth_home_ready"
    });
  });

  it("fails closed when the supplied Codex readiness proof is not green or target-matched", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/opt/wealth-factory/codex-auth/22222222-2222-4222-8222-222222222222",
          "--auth-state-ref",
          "codex-auth-state",
          "--execute",
          "--confirm-codex-home-ready",
          "--codex-home-readiness-proof",
          "audit/2026-06-30/first-subscriber-live-provider-binding-readonly.json"
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/Codex auth-home readiness proof must be green and match the requested repair target/);
  });

  it("fails closed when a green Codex readiness proof belongs to a different target", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "33333333-3333-4333-8333-333333333333",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
          "--auth-state-ref",
          "codex-auth-state",
          "--execute",
          "--confirm-codex-home-ready",
          "--codex-home-readiness-proof",
          readinessProofPath
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/matching tenant\/workflow\/auth-state\/CODEX_HOME fingerprint/);
  });

  it("fails closed when the Codex readiness proof belongs to a different CODEX_HOME", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/home/deploy/wealth-factory-stage/codex-homes/different-subscriber",
          "--auth-state-ref",
          "first-subscriber-openai-device",
          "--execute",
          "--confirm-codex-home-ready",
          "--codex-home-readiness-proof",
          readinessProofPath
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/CODEX_HOME fingerprint/);
  });

  it("documents the implemented mutation contract as tenant-scoped, transactional, and non-secret", () => {
    const script = readFileSync(scriptPath, "utf8");
    const acidMigration = readFileSync("supabase/migrations/0002_acid_race_guards.sql", "utf8");

    expect(script).toContain("BEGIN");
    expect(script).toContain("COMMIT");
    expect(script).toContain("WHERE tenant_id = $1");
    expect(script).toContain("id = $2");
    expect(script).toContain("provider_kind = $3");
    expect(script).toContain("wfpc.package_provider_requirements");
    expect(script).toContain("package_id = $1");
    expect(script).toContain("do not mutate package-scoped requirements");
    expect(script).toContain("verify package provider requirement seam exists without mutating package-scoped provider_kind");
    expect(script).not.toContain("wfpc.package_provider_requirements provider_kind for the target workflow package only");
    expect(script).toContain("openai_chatgpt_codex_subscription");
    expect(script).toContain("no vault_secrets write");
    expect(script).toContain("do not mutate existing workflow_runs unless --rebind-existing-run supplies an exact stale run id");
    expect(script).toContain("codexHomeReady:");
    expect(script).toContain("codexHomeWritable:");
    expect(script).toContain("codexHomeFingerprint:");
    expect(script).toContain("smokePromptPassed:");
    expect(acidMigration).toContain("secret_references_tenant_secret_ref_unique");
    expect(acidMigration).toContain("on wfpc.secret_references (tenant_id, secret_ref)");
    expect(script).toContain("where wfpc.secret_references.provider_kind = excluded.provider_kind");
    expect(script).not.toMatch(/insert\s+into\s+wfpc_private\.vault_secrets/i);
    expect(script).toMatch(/UPDATE\s+wfpc\.workflow_runs/i);
    expect(script).toContain("REBIND_EXACT_EXISTING_WORKFLOW_RUN");
    expect(script).not.toMatch(/DELETE\s+FROM/i);
  });

  it("fails closed in execute mode until the operator supplies a DB URL", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
          "--auth-state-ref",
          "first-subscriber-openai-device",
          "--execute",
          "--confirm-codex-home-ready",
          "--codex-home-readiness-proof",
          readinessProofPath
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe"
        }
      )
    ).toThrow(/SUPABASE_DB_URL or DATABASE_URL is required/);
  });

  it("executes the target-scoped transaction only after all execute gates pass", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--tenant",
        "22222222-2222-4222-8222-222222222222",
        "--workflow",
        "wf_connect_first_workflow",
        "--workflow-template",
        "44444444-4444-4444-8444-444444444444",
        "--codex-home",
        "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
        "--auth-state-ref",
        "first-subscriber-openai-device",
        "--execute",
        "--confirm-codex-home-ready",
        "--codex-home-readiness-proof",
        readinessProofPath
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "test",
          WF_REPAIR_PROVIDER_BINDING_MOCK_DB: "success"
        }
      }
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      dryRun: false,
      phase: "openai_device_provider_binding_repair_executed",
      tenantId: "22222222-2222-4222-8222-222222222222",
      workflowId: "wf_connect_first_workflow",
      workflowTemplateId: "44444444-4444-4444-8444-444444444444",
      providerKind: "openai_chatgpt_codex_subscription",
      workflowTemplateUpdated: true,
      packageProviderRequirementUpdated: false,
      secretReferenceActivated: true,
      workflowRunsTouched: false,
      paperclipTouched: false,
      dnsCaddyChanged: false
    });
    expect(parsed.executedSql).toEqual([
      "BEGIN",
      "SELECT_WORKFLOW_TEMPLATE_FOR_UPDATE",
      "ASSERT_PACKAGE_PROVIDER_REQUIREMENT_PRESENT",
      "UPDATE_WORKFLOW_TEMPLATE_PROVIDER",
      "REVOKE_ACTIVE_CODEX_SUBSCRIPTION_REFERENCES",
      "UPSERT_CODEX_SUBSCRIPTION_SECRET_REFERENCE",
      "COMMIT"
    ]);
    expect(JSON.stringify(parsed)).not.toMatch(/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|postgresql:\/\/|the_secrets/i);
  });

  it("can rebind one exact stale workflow run after the normal provider repair gates pass", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        "--tenant",
        "22222222-2222-4222-8222-222222222222",
        "--workflow",
        "wf_connect_first_workflow",
        "--workflow-template",
        "44444444-4444-4444-8444-444444444444",
        "--codex-home",
        "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
        "--auth-state-ref",
        "first-subscriber-openai-device",
        "--rebind-existing-run",
        "169c4ac8-ea8d-48fe-accc-6dcc60d4dd4d",
        "--execute",
        "--confirm-codex-home-ready",
        "--codex-home-readiness-proof",
        readinessProofPath
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "test",
          WF_REPAIR_PROVIDER_BINDING_MOCK_DB: "success"
        }
      }
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ok: true,
      workflowRunsTouched: true,
      reboundExistingRunId: "169c4ac8-ea8d-48fe-accc-6dcc60d4dd4d"
    });
    expect(parsed.executedSql).toContain("REBIND_EXACT_EXISTING_WORKFLOW_RUN");
    expect(JSON.stringify(parsed)).not.toMatch(/sk-[A-Za-z0-9_-]+|Bearer\s+[A-Za-z0-9._-]+|postgresql:\/\/|the_secrets/i);
  });

  it("rolls back and fails closed when the target workflow is missing", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
          "--auth-state-ref",
          "first-subscriber-openai-device",
          "--execute",
          "--confirm-codex-home-ready",
          "--codex-home-readiness-proof",
          readinessProofPath
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe",
          env: {
            ...process.env,
            NODE_ENV: "test",
            WF_REPAIR_PROVIDER_BINDING_MOCK_DB: "missing-workflow"
          }
        }
      )
    ).toThrow(/target workflow template was not found/);
  });

  it("rolls back and fails closed when the package provider requirement seam is missing", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
          "--auth-state-ref",
          "first-subscriber-openai-device",
          "--execute",
          "--confirm-codex-home-ready",
          "--codex-home-readiness-proof",
          readinessProofPath
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe",
          env: {
            ...process.env,
            NODE_ENV: "test",
            WF_REPAIR_PROVIDER_BINDING_MOCK_DB: "missing-requirement"
          }
        }
      )
    ).toThrow(/package provider requirement seam was not found/);
  });

  it("rolls back and fails closed when the generated secret_ref belongs to another provider lane", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          scriptPath,
          "--tenant",
          "22222222-2222-4222-8222-222222222222",
          "--workflow",
          "wf_connect_first_workflow",
          "--codex-home",
          "/home/deploy/wealth-factory-stage/codex-homes/first-subscriber",
          "--auth-state-ref",
          "first-subscriber-openai-device",
          "--execute",
          "--confirm-codex-home-ready",
          "--codex-home-readiness-proof",
          readinessProofPath
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe",
          env: {
            ...process.env,
            NODE_ENV: "test",
            WF_REPAIR_PROVIDER_BINDING_MOCK_DB: "conflicting-secret-ref"
          }
        }
      )
    ).toThrow(/existing secret_ref belongs to a different provider lane/);
  });
});
