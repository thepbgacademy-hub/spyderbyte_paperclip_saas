import { describe, expect, it, vi } from "vitest";

import { createAcidWorkflowStatusRecorder } from "../src/workflows/acid-status-recorder.js";

describe("ACID workflow status recorder", () => {
  it("allows queued status to be restored from a previously running workflow row", async () => {
    const repository = {
      transitionWorkflowRunStatus: vi.fn().mockResolvedValue({ transitioned: true, status: "queued" })
    };
    const recordStatus = createAcidWorkflowStatusRecorder(repository);

    await expect(recordStatus({ tenantId: "tenant-1", runId: "run-1", status: "queued" })).resolves.toEqual({
      transitioned: true,
      status: "queued"
    });

    expect(repository.transitionWorkflowRunStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      from: ["queued", "running"],
      to: "queued"
    });
  });

  it("uses guarded transitions so terminal states are not overwritten", async () => {
    const repository = {
      transitionWorkflowRunStatus: vi.fn().mockResolvedValue({ transitioned: true, status: "completed" })
    };
    const recordStatus = createAcidWorkflowStatusRecorder(repository);

    await expect(recordStatus({ tenantId: "tenant-1", runId: "run-1", status: "completed" })).resolves.toEqual({
      transitioned: true,
      status: "completed"
    });

    expect(repository.transitionWorkflowRunStatus).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      runId: "run-1",
      from: ["queued", "running"],
      to: "completed"
    });
  });
});
