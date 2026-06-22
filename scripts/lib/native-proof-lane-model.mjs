const DURABLE_NATIVE_PUBLIC_WORKFLOW_IDS = new Set([
  "wf_connect_first_workflow",
  "wf_tax_strategy",
  "wf_package_followup"
]);

export function isDurableNativePublicWorkflowId(workflowId) {
  return DURABLE_NATIVE_PUBLIC_WORKFLOW_IDS.has(String(workflowId ?? "").trim());
}

export function resolveNativeProofStartSelector(input) {
  const workflowId = normalizeValue(input?.workflowId);
  const workflowTemplateId = normalizeValue(input?.workflowTemplateId);

  if (!workflowId) {
    throw new Error("workflowId is required");
  }

  if (isUuid(workflowId)) {
    return {
      startPath: "direct_public_reservation",
      resolvedStartWorkflowId: workflowId
    };
  }

  if (workflowTemplateId) {
    if (!isUuid(workflowTemplateId)) {
      throw new Error("workflowTemplateId must be a UUID when provided");
    }
    return {
      startPath: "direct_public_reservation",
      resolvedStartWorkflowId: workflowTemplateId
    };
  }

  if (isDurableNativePublicWorkflowId(workflowId)) {
    throw new Error(`workflowTemplateId is required for durable native public workflow ${workflowId}`);
  }

  return {
    startPath: "dashboard_public_start",
    resolvedStartWorkflowId: workflowId
  };
}

export function alignDurableHarnessProofPlan(input) {
  const lanes = Array.isArray(input?.lanes) ? input.lanes : [];
  const requestedCycles = Number.isInteger(input?.cycles) ? Number(input.cycles) : 1;
  const notes = [];

  const alignedLanes = lanes.map((lane) => {
    if (!isDurableNativePublicWorkflowId(lane?.workflowId)) {
      return lane;
    }

    const requestedRuns = Number.isInteger(lane?.runs) ? Number(lane.runs) : 1;
    const laneLabel = typeof lane?.lane === "string" && lane.lane.trim().length > 0
      ? lane.lane.trim()
      : typeof lane?.laneName === "string" && lane.laneName.trim().length > 0
        ? lane.laneName.trim()
        : lane?.workflowId;
    if (requestedRuns !== 1) {
      notes.push(
        `Native public workflow ${lane.workflowId} uses one durable harness lane per tenant/workflow, so proof pressure is limited to a single start for ${laneLabel}.`
      );
    }

    return {
      ...lane,
      runs: 1
    };
  });

  const containsDurableLane = alignedLanes.some((lane) => isDurableNativePublicWorkflowId(lane?.workflowId));
  if (containsDurableLane && requestedCycles !== 1) {
    notes.push(
      "Durable native public workflow proofs cannot queue repeated fresh starts across cycles, so the proof plan is limited to a single cycle."
    );
  }

  return {
    lanes: alignedLanes,
    cycles: containsDurableLane ? 1 : requestedCycles,
    notes
  };
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}
