import { describe, expect, it, vi } from "vitest";

import {
  RESULT_APPROVAL_STATES_STORAGE_KEY,
  createDefaultResultApprovalStates,
  getBrowserResultApprovalStorage,
  readStoredResultApprovalStates,
  writeStoredResultApprovalStates
} from "../apps/web/src/result-approval-storage.js";

describe("app result approval state persistence", () => {
  it("hydrates approved result state from storage while preserving fallback defaults", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify({ "result-241": "Approved" }))
    };

    expect(readStoredResultApprovalStates(storage)).toEqual({
      ...createDefaultResultApprovalStates(),
      "result-241": "Approved"
    });
  });

  it("ignores malformed or unsupported stored approval states", () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(
        JSON.stringify({
          "result-241": "Approved",
          "result-bad": "Leaked prompt",
          "result-238": 42
        })
      )
    };

    expect(readStoredResultApprovalStates(storage)).toEqual({
      ...createDefaultResultApprovalStates(),
      "result-241": "Approved"
    });
  });

  it("falls back safely when storage cannot be read", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("storage unavailable");
      })
    };

    expect(readStoredResultApprovalStates(storage)).toEqual(createDefaultResultApprovalStates());
  });

  it("falls back when browser localStorage access itself is unavailable", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("localStorage denied");
      }
    });

    expect(getBrowserResultApprovalStorage()).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("writes approval states to storage without exposing unsupported fields", () => {
    const storage = {
      setItem: vi.fn()
    };

    writeStoredResultApprovalStates(storage, {
      "result-241": "Approved",
      "result-238": "Revision needed"
    });

    expect(storage.setItem).toHaveBeenCalledWith(
      RESULT_APPROVAL_STATES_STORAGE_KEY,
      JSON.stringify({
        "result-241": "Approved",
        "result-238": "Revision needed"
      })
    );
  });

  it("round-trips approval states written to storage", () => {
    let storedValue = "";
    const storage = {
      getItem: vi.fn(() => storedValue),
      setItem: vi.fn((_key: string, value: string) => {
        storedValue = value;
      })
    };

    writeStoredResultApprovalStates(storage, {
      "result-241": "Approved",
      "result-238": "Revision needed"
    });

    expect(readStoredResultApprovalStates(storage)).toEqual({
      "result-241": "Approved",
      "result-238": "Revision needed"
    });
  });
});
