export type WealthFactoryPublicError = {
  code: "workflow_failed" | "credential_invalid" | "workflow_timed_out" | "tenant_paused" | "service_unavailable";
};

export function toPublicWorkflowError(error: unknown): WealthFactoryPublicError {
  if (isErrorCode(error, "paperclip_disabled") || isErrorCode(error, "tenant_paused")) {
    return { code: "tenant_paused" };
  }

  if (isErrorCode(error, "credential_invalid")) {
    return { code: "credential_invalid" };
  }

  if (isErrorCode(error, "workflow_timed_out")) {
    return { code: "workflow_timed_out" };
  }

  return { code: "workflow_failed" };
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
