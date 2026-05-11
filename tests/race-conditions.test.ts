import { describe, expect, it } from "vitest";

import { createRunCreationGate } from "../src/workflows/run-creation-gate.js";

describe("run creation race and idempotency controls", () => {
  it("deduplicates concurrent run creation by tenant workflow and idempotency key", async () => {
    const gate = createRunCreationGate();

    const first = await gate.reserve({
      tenantId: "tenant-1",
      workflowId: "wf-social-calendar",
      idempotencyKey: "idem-1",
      entitlementAllowed: true,
      tenantPaused: false,
      credentialRevoked: false
    });
    const second = await gate.reserve({
      tenantId: "tenant-1",
      workflowId: "wf-social-calendar",
      idempotencyKey: "idem-1",
      entitlementAllowed: true,
      tenantPaused: false,
      credentialRevoked: false
    });

    expect(first).toEqual({ reserved: true });
    expect(second).toEqual({ reserved: false, reason: "duplicate" });
  });

  it("fails closed when entitlement, tenant pause, or credential state changes before enqueue", async () => {
    const gate = createRunCreationGate();

    await expect(
      gate.reserve({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        idempotencyKey: "idem-2",
        entitlementAllowed: false,
        tenantPaused: false,
        credentialRevoked: false
      })
    ).resolves.toEqual({ reserved: false, reason: "entitlement_denied" });

    await expect(
      gate.reserve({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        idempotencyKey: "idem-3",
        entitlementAllowed: true,
        tenantPaused: true,
        credentialRevoked: false
      })
    ).resolves.toEqual({ reserved: false, reason: "tenant_paused" });

    await expect(
      gate.reserve({
        tenantId: "tenant-1",
        workflowId: "wf-social-calendar",
        idempotencyKey: "idem-4",
        entitlementAllowed: true,
        tenantPaused: false,
        credentialRevoked: true
      })
    ).resolves.toEqual({ reserved: false, reason: "credential_revoked" });
  });
});
