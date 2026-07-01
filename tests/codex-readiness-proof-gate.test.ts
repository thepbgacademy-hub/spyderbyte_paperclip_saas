import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { validateCodexReadinessProofGate } = require("../scripts/lib/codex-readiness-proof-gate.mjs") as {
  validateCodexReadinessProofGate(input: {
    apiCodexHomeReadinessProofPath?: string | null;
    workerCodexHomeReadinessProofPath?: string | null;
    expectedTenantId: string;
    expectedWorkflowId: string;
    expectedAuthStateRef?: string | null;
  }): {
    ok: boolean;
    phase: string;
    proofs?: unknown;
    notes: string[];
  };
};

describe("Codex readiness proof gate", () => {
  it("accepts only matching API and worker codex_auth_home_ready artifacts with no mutation", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-codex-ready-"));
    const apiProof = writeProof(dir, "api.json", {
      ok: true,
      phase: "codex_auth_home_ready",
      container: "wf-stage-api",
      targetTenantId: "tenant-1",
      targetWorkflowId: "wf_connect_first_workflow",
      authStateRef: "codex-home:first-subscriber",
      codexHomeFingerprint: "fingerprint-123",
      codexCliPresent: true,
      codexHomeExists: true,
      codexHomeWritable: true,
      smokePromptPassed: true,
      mutationPerformed: false,
      dbRowsWritten: false,
      workflowRunsTouched: false
    });
    const workerProof = writeProof(dir, "worker.json", {
      ok: true,
      phase: "codex_auth_home_ready",
      container: "wf-stage-worker",
      targetTenantId: "tenant-1",
      targetWorkflowId: "wf_connect_first_workflow",
      authStateRef: "codex-home:first-subscriber",
      codexHomeFingerprint: "fingerprint-123",
      codexCliPresent: true,
      codexHomeExists: true,
      codexHomeWritable: true,
      smokePromptPassed: true,
      mutationPerformed: false,
      dbRowsWritten: false,
      workflowRunsTouched: false
    });

    expect(
      validateCodexReadinessProofGate({
        apiCodexHomeReadinessProofPath: apiProof,
        workerCodexHomeReadinessProofPath: workerProof,
        expectedTenantId: "tenant-1",
        expectedWorkflowId: "wf_connect_first_workflow",
        expectedAuthStateRef: "codex-home:first-subscriber"
      })
    ).toMatchObject({
      ok: true,
      phase: "codex_readiness_gate_verified",
      notes: [
        "API and worker Codex auth-home readiness proofs are both green for the requested tenant/workflow.",
        "Live native execution may proceed to the bounded proof step."
      ]
    });
  });

  it("fails closed when either readiness artifact is revoked instead of green", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-codex-revoked-"));
    const apiProof = writeProof(dir, "api.json", greenProof("wf-stage-api"));
    const workerProof = writeProof(dir, "worker.json", {
      ...greenProof("wf-stage-worker"),
      ok: false,
      phase: "codex_auth_session_revoked",
      smokePromptPassed: false
    });

    expect(
      validateCodexReadinessProofGate({
        apiCodexHomeReadinessProofPath: apiProof,
        workerCodexHomeReadinessProofPath: workerProof,
        expectedTenantId: "tenant-1",
        expectedWorkflowId: "wf_connect_first_workflow",
        expectedAuthStateRef: "codex-home:first-subscriber"
      })
    ).toMatchObject({
      ok: false,
      phase: "codex_readiness_gate_blocked",
      notes: expect.arrayContaining([
        "worker readiness proof is codex_auth_session_revoked, expected codex_auth_home_ready."
      ])
    });
  });

  it("accepts UTF-16LE JSON artifacts produced by PowerShell evidence writes", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-codex-utf16-"));
    const apiProof = writeProof(dir, "api.json", greenProof("wf-stage-api"), "utf16le");
    const workerProof = writeProof(dir, "worker.json", greenProof("wf-stage-worker"), "utf16le");

    expect(
      validateCodexReadinessProofGate({
        apiCodexHomeReadinessProofPath: apiProof,
        workerCodexHomeReadinessProofPath: workerProof,
        expectedTenantId: "tenant-1",
        expectedWorkflowId: "wf_connect_first_workflow",
        expectedAuthStateRef: "codex-home:first-subscriber"
      })
    ).toMatchObject({
      ok: true,
      phase: "codex_readiness_gate_verified"
    });
  });

  it("fails closed when auth-state references or CODEX_HOME fingerprints are missing or mismatched", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-codex-identity-"));
    const apiProof = writeProof(dir, "api.json", greenProof("wf-stage-api"));
    const workerProof = writeProof(dir, "worker.json", {
      ...greenProof("wf-stage-worker"),
      authStateRef: "codex-home:other",
      codexHomeFingerprint: "fingerprint-other"
    });

    expect(
      validateCodexReadinessProofGate({
        apiCodexHomeReadinessProofPath: apiProof,
        workerCodexHomeReadinessProofPath: workerProof,
        expectedTenantId: "tenant-1",
        expectedWorkflowId: "wf_connect_first_workflow",
        expectedAuthStateRef: "codex-home:first-subscriber"
      })
    ).toMatchObject({
      ok: false,
      phase: "codex_readiness_gate_blocked",
      notes: expect.arrayContaining([
        "worker readiness proof authStateRef is codex-home:other, expected codex-home:first-subscriber.",
        "API and worker readiness proof CODEX_HOME fingerprints must match."
      ])
    });
  });

  it("fails closed when readiness proof paths are missing or target the wrong workflow", () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-codex-wrong-"));
    const apiProof = writeProof(dir, "api.json", greenProof("wf-stage-api"));

    expect(
      validateCodexReadinessProofGate({
        apiCodexHomeReadinessProofPath: apiProof,
        workerCodexHomeReadinessProofPath: null,
        expectedTenantId: "tenant-1",
        expectedWorkflowId: "wf_connect_first_workflow",
        expectedAuthStateRef: "codex-home:first-subscriber"
      })
    ).toMatchObject({
      ok: false,
      phase: "codex_readiness_gate_missing",
      notes: ["Both --api-codex-home-readiness-proof and --worker-codex-home-readiness-proof are required before live native execution."]
    });

    const wrongWorkerProof = writeProof(dir, "worker-wrong.json", {
      ...greenProof("wf-stage-worker"),
      targetWorkflowId: "wf_tax_strategy"
    });
    expect(
      validateCodexReadinessProofGate({
        apiCodexHomeReadinessProofPath: apiProof,
        workerCodexHomeReadinessProofPath: wrongWorkerProof,
        expectedTenantId: "tenant-1",
        expectedWorkflowId: "wf_connect_first_workflow",
        expectedAuthStateRef: "codex-home:first-subscriber"
      })
    ).toMatchObject({
      ok: false,
      phase: "codex_readiness_gate_blocked",
      notes: expect.arrayContaining([
        "worker readiness proof targetWorkflowId is wf_tax_strategy, expected wf_connect_first_workflow."
      ])
    });
  });
});

function greenProof(container: string) {
  return {
    ok: true,
    phase: "codex_auth_home_ready",
    container,
    targetTenantId: "tenant-1",
    targetWorkflowId: "wf_connect_first_workflow",
    authStateRef: "codex-home:first-subscriber",
    codexHomeFingerprint: "fingerprint-123",
    codexCliPresent: true,
    codexHomeExists: true,
    codexHomeWritable: true,
    smokePromptPassed: true,
    mutationPerformed: false,
    dbRowsWritten: false,
    workflowRunsTouched: false
  };
}

function writeProof(dir: string, name: string, value: unknown, encoding: BufferEncoding = "utf8") {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value), encoding);
  return path;
}
