import { describe, expect, it, vi } from "vitest";

import { createDurableAuditSink } from "../src/audit/durable-audit.js";

describe("durable audit sink", () => {
  it("masks audit metadata and preserves non-uuid external entity ids safely", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const audit = createDurableAuditSink({ query });

    await audit({
      tenantId: "tenant-1",
      actorUserId: "user-1",
      eventType: "paperclip.secret_synced",
      entityType: "paperclip_secret_binding",
      entityId: "paperclip-secret-123",
      metadata: {
        apiKey: "sk-live-secret",
        nested: {
          refreshToken: "rt-secret"
        }
      }
    });

    expect(String(query.mock.calls[0]?.[0])).toMatch(/insert into wfpc\.audit_events/i);
    expect(query.mock.calls[0]?.[1]).toEqual([
      "tenant-1",
      "user-1",
      "paperclip.secret_synced",
      "paperclip_secret_binding",
      null,
      expect.any(String)
    ]);
    expect(query.mock.calls[0]?.[1]?.[5]).toContain("externalEntityId");
    expect(query.mock.calls[0]?.[1]?.[5]).not.toContain("sk-live-secret");
    expect(query.mock.calls[0]?.[1]?.[5]).not.toContain("rt-secret");
  });
});
