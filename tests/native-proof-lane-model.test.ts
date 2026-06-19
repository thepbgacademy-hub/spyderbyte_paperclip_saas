import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";
import { CURRENT_CORE_NATIVE_WORKFLOW_IDS } from "../src/worker/native-workflow-definitions.js";

const require = createRequire(import.meta.url);
const {
  alignDurableHarnessProofPlan,
  isDurableNativePublicWorkflowId,
  isTenantTemplateDirectNativeProofWorkflowId,
  resolveNativeProofStartSelector
} = require("../scripts/lib/native-proof-lane-model.mjs");

describe("native proof lane model helpers", () => {
  it("keeps every canonical current core workflow id on the durable proof path", () => {
    expect(CURRENT_CORE_NATIVE_WORKFLOW_IDS.every((workflowId) => isDurableNativePublicWorkflowId(workflowId))).toBe(true);
  });

  it("identifies the durable native public workflow ids used by the harness bootstrap path", () => {
    expect(isDurableNativePublicWorkflowId("wf_connect_first_workflow")).toBe(true);
    expect(isDurableNativePublicWorkflowId("wf_tax_strategy")).toBe(true);
    expect(isDurableNativePublicWorkflowId("wf_package_followup")).toBe(true);
    expect(isDurableNativePublicWorkflowId("wf-example-audit")).toBe(false);
    expect(isDurableNativePublicWorkflowId("workflow-uuid-like-value")).toBe(false);
  });

  it("limits direct tenant-template proof reservation to the core native workflow family", () => {
    expect(isTenantTemplateDirectNativeProofWorkflowId("wf_connect_first_workflow")).toBe(true);
    expect(isTenantTemplateDirectNativeProofWorkflowId("wf_tax_strategy")).toBe(true);
    expect(isTenantTemplateDirectNativeProofWorkflowId("wf_package_followup")).toBe(true);
    expect(isTenantTemplateDirectNativeProofWorkflowId("wf-example-audit")).toBe(false);
    expect(isTenantTemplateDirectNativeProofWorkflowId("workflow-uuid-like-value")).toBe(false);
  });

  it("fails closed for core tenant-template workflows unless an explicit template id is supplied", () => {
    expect(() =>
      resolveNativeProofStartSelector({
        workflowId: "wf_connect_first_workflow"
      })
    ).toThrow(/requires --workflow-template or WF_STAGE_WORKFLOW_TEMPLATE_ID/i);
  });

  it("uses the dashboard surface for non-core public workflow ids when no template override is given", () => {
    expect(
      resolveNativeProofStartSelector({
        workflowId: "wf-example-audit"
      })
    ).toEqual({
      startPath: "dashboard_public_start",
      resolvedStartWorkflowId: "wf-example-audit"
    });
  });

  it("uses direct reservation when a workflow template id is explicit", () => {
    expect(
      resolveNativeProofStartSelector({
        workflowId: "wf_connect_first_workflow",
        workflowTemplateId: "44444444-4444-4444-8444-444444444444"
      })
    ).toEqual({
      startPath: "direct_public_reservation",
      resolvedStartWorkflowId: "44444444-4444-4444-8444-444444444444"
    });
  });

  it("clamps durable native public proof pressure to a single run and a single cycle", () => {
    expect(
      alignDurableHarnessProofPlan({
        lanes: [
          { lane: "primary", tenantId: "tenant-1", userId: "user-1", workflowId: "wf_connect_first_workflow", runs: 3 },
          { lane: "secondary", tenantId: "tenant-2", userId: "user-2", workflowId: "wf_tax_strategy", runs: 2 }
        ],
        cycles: 8
      })
    ).toEqual({
      lanes: [
        { lane: "primary", tenantId: "tenant-1", userId: "user-1", workflowId: "wf_connect_first_workflow", runs: 1 },
        { lane: "secondary", tenantId: "tenant-2", userId: "user-2", workflowId: "wf_tax_strategy", runs: 1 }
      ],
      cycles: 1,
      notes: [
        "Native public workflow wf_connect_first_workflow uses one durable harness lane per tenant/workflow, so proof pressure is limited to a single start for primary.",
        "Native public workflow wf_tax_strategy uses one durable harness lane per tenant/workflow, so proof pressure is limited to a single start for secondary.",
        "Durable native public workflow proofs cannot queue repeated fresh starts across cycles, so the proof plan is limited to a single cycle."
      ]
    });
  });

  it("leaves non-durable proof lanes unchanged", () => {
    expect(
      alignDurableHarnessProofPlan({
        lanes: [
          { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 3 }
        ],
        cycles: 4
      })
    ).toEqual({
      lanes: [
        { lane: "alpha", tenantId: "tenant-1", userId: "user-1", workflowId: "workflow-1", runs: 3 }
      ],
      cycles: 4,
      notes: []
    });
  });
});
