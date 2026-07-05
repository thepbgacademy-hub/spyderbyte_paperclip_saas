export function validateExpectedAuthStateRefOnRunBinding(input) {
  const expectedAuthStateRef = normalizeValue(input.expectedAuthStateRef);
  const workflowId = normalizeValue(input.workflowId);
  const snapshot = input.durableSnapshot;
  const providerContext = Array.isArray(snapshot?.run?.providerContext) ? snapshot.run.providerContext : [];
  const firstBinding = providerContext[0];
  const observedAuthStateRef = normalizeValue(firstBinding?.metadata?.authStateRef);

  if (!expectedAuthStateRef) {
    return {
      ok: true,
      phase: "binding_auth_state_ref_not_required",
      notes: []
    };
  }

  if (!workflowId) {
    return {
      ok: false,
      phase: "binding_auth_state_ref_workflow_missing",
      notes: ["Native binding verification could not determine which workflow should own the auth-state reference seam."]
    };
  }

  if (providerContext.length !== 1) {
    return {
      ok: false,
      phase: "binding_auth_state_ref_missing",
      notes: [
        `Expected exactly one bound provider context while verifying auth-state reference consistency for ${workflowId}.`
      ]
    };
  }

  if (!observedAuthStateRef) {
    return {
      ok: false,
      phase: "binding_auth_state_ref_missing",
      notes: [
        `The live bound provider context for ${workflowId} did not carry authStateRef metadata.`
      ]
    };
  }

  if (observedAuthStateRef !== expectedAuthStateRef) {
    return {
      ok: false,
      phase: "binding_auth_state_ref_mismatch",
      notes: [
        `The live bound provider context for ${workflowId} carried authStateRef ${observedAuthStateRef}, expected ${expectedAuthStateRef}.`
      ]
    };
  }

  return {
    ok: true,
    phase: "binding_auth_state_ref_verified",
    notes: [
      `The live bound provider context for ${workflowId} matched authStateRef ${expectedAuthStateRef}.`
    ]
  };
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
