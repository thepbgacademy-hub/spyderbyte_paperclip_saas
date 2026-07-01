import { readFileSync } from "node:fs";

export function validateCodexReadinessProofGate(input) {
  const apiPath = normalizeValue(input.apiCodexHomeReadinessProofPath);
  const workerPath = normalizeValue(input.workerCodexHomeReadinessProofPath);
  if (!apiPath || !workerPath) {
    return {
      ok: false,
      phase: "codex_readiness_gate_missing",
      notes: [
        "Both --api-codex-home-readiness-proof and --worker-codex-home-readiness-proof are required before live native execution."
      ]
    };
  }

  const apiProof = readJsonProof(apiPath, "api");
  const workerProof = readJsonProof(workerPath, "worker");
  const apiFingerprint = normalizeValue(apiProof.codexHomeFingerprint);
  const workerFingerprint = normalizeValue(workerProof.codexHomeFingerprint);
  const notes = [
    ...validateSingleProof({
      label: "api",
      proof: apiProof,
      expectedContainer: "wf-stage-api",
      expectedTenantId: input.expectedTenantId,
      expectedWorkflowId: input.expectedWorkflowId,
      expectedAuthStateRef: input.expectedAuthStateRef
    }),
    ...validateSingleProof({
      label: "worker",
      proof: workerProof,
      expectedContainer: "wf-stage-worker",
      expectedTenantId: input.expectedTenantId,
      expectedWorkflowId: input.expectedWorkflowId,
      expectedAuthStateRef: input.expectedAuthStateRef
    }),
    ...(apiFingerprint && workerFingerprint && apiFingerprint !== workerFingerprint
      ? ["API and worker readiness proof CODEX_HOME fingerprints must match."]
      : [])
  ];

  if (notes.length > 0) {
    return {
      ok: false,
      phase: "codex_readiness_gate_blocked",
      proofs: {
        api: summarizeProof(apiProof),
        worker: summarizeProof(workerProof)
      },
      notes
    };
  }

  return {
    ok: true,
    phase: "codex_readiness_gate_verified",
    proofs: {
      api: summarizeProof(apiProof),
      worker: summarizeProof(workerProof)
    },
    notes: [
      "API and worker Codex auth-home readiness proofs are both green for the requested tenant/workflow.",
      "Live native execution may proceed to the bounded proof step."
    ]
  };
}

function readJsonProof(path, label) {
  try {
    const parsed = JSON.parse(readJsonText(path));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {
          ok: false,
          phase: "codex_readiness_artifact_invalid",
          readError: `${label} readiness proof is not a JSON object`
        };
  } catch (error) {
    return {
      ok: false,
      phase: "codex_readiness_artifact_unreadable",
      readError: error instanceof Error ? error.message : `${label} readiness proof could not be read`
    };
  }
}

function readJsonText(path) {
  const buffer = readFileSync(path);
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return swapUtf16Bytes(buffer.subarray(2)).toString("utf16le");
  }
  if (looksLikeUtf16Le(buffer)) {
    return buffer.toString("utf16le");
  }
  if (looksLikeUtf16Be(buffer)) {
    return swapUtf16Bytes(buffer).toString("utf16le");
  }
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function looksLikeUtf16Le(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x7b && buffer[1] === 0x00;
}

function looksLikeUtf16Be(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x7b;
}

function swapUtf16Bytes(buffer) {
  const swapped = Buffer.from(buffer);
  for (let index = 0; index + 1 < swapped.length; index += 2) {
    const first = swapped[index];
    swapped[index] = swapped[index + 1];
    swapped[index + 1] = first;
  }
  return swapped;
}

function validateSingleProof({ label, proof, expectedContainer, expectedTenantId, expectedWorkflowId, expectedAuthStateRef }) {
  const notes = [];
  if (proof.ok !== true) {
    notes.push(`${label} readiness proof ok is ${String(proof.ok)}, expected true.`);
  }
  if (proof.phase !== "codex_auth_home_ready") {
    notes.push(`${label} readiness proof is ${String(proof.phase)}, expected codex_auth_home_ready.`);
  }
  if (proof.container !== expectedContainer) {
    notes.push(`${label} readiness proof container is ${String(proof.container)}, expected ${expectedContainer}.`);
  }
  if (normalizeValue(expectedTenantId) && proof.targetTenantId !== expectedTenantId) {
    notes.push(`${label} readiness proof targetTenantId is ${String(proof.targetTenantId)}, expected ${expectedTenantId}.`);
  }
  if (normalizeValue(expectedWorkflowId) && proof.targetWorkflowId !== expectedWorkflowId) {
    notes.push(`${label} readiness proof targetWorkflowId is ${String(proof.targetWorkflowId)}, expected ${expectedWorkflowId}.`);
  }
  if (normalizeValue(expectedAuthStateRef) && proof.authStateRef !== expectedAuthStateRef) {
    notes.push(`${label} readiness proof authStateRef is ${String(proof.authStateRef)}, expected ${expectedAuthStateRef}.`);
  }
  if (!normalizeValue(proof.authStateRef)) {
    notes.push(`${label} readiness proof did not include authStateRef.`);
  }
  if (!normalizeValue(proof.codexHomeFingerprint)) {
    notes.push(`${label} readiness proof did not include CODEX_HOME fingerprint.`);
  }
  if (proof.codexCliPresent !== true) {
    notes.push(`${label} readiness proof did not confirm Codex CLI presence.`);
  }
  if (proof.codexHomeExists !== true) {
    notes.push(`${label} readiness proof did not confirm CODEX_HOME exists.`);
  }
  if (proof.codexHomeWritable !== true) {
    notes.push(`${label} readiness proof did not confirm CODEX_HOME is writable.`);
  }
  if (proof.smokePromptPassed !== true) {
    notes.push(`${label} readiness proof did not confirm the non-secret smoke prompt passed.`);
  }
  if (proof.mutationPerformed !== false) {
    notes.push(`${label} readiness proof mutationPerformed is ${String(proof.mutationPerformed)}, expected false.`);
  }
  if (proof.dbRowsWritten !== false) {
    notes.push(`${label} readiness proof dbRowsWritten is ${String(proof.dbRowsWritten)}, expected false.`);
  }
  if (proof.workflowRunsTouched !== false) {
    notes.push(`${label} readiness proof workflowRunsTouched is ${String(proof.workflowRunsTouched)}, expected false.`);
  }
  return notes;
}

function summarizeProof(proof) {
  return {
    ok: proof.ok === true,
    phase: typeof proof.phase === "string" ? proof.phase : "unknown",
    container: typeof proof.container === "string" ? proof.container : "unknown",
    targetTenantId: typeof proof.targetTenantId === "string" ? proof.targetTenantId : null,
    targetWorkflowId: typeof proof.targetWorkflowId === "string" ? proof.targetWorkflowId : null,
    authStateRef: typeof proof.authStateRef === "string" ? proof.authStateRef : null,
    codexHomeFingerprint: typeof proof.codexHomeFingerprint === "string" ? proof.codexHomeFingerprint : null,
    mutationPerformed: proof.mutationPerformed === true,
    dbRowsWritten: proof.dbRowsWritten === true,
    workflowRunsTouched: proof.workflowRunsTouched === true
  };
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
