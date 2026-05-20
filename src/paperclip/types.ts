export type PaperclipRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type PaperclipHealth = {
  ok: boolean;
};

export type CreatePaperclipRunInput = {
  companyId: string;
  workflowId: string;
  spyderbyteRunId: string;
  providerContext?: readonly PaperclipProviderContext[];
};

export type PaperclipProviderContext = {
  capability: string;
  providerKind: string;
  label: string;
  secretRef: string;
  metadata: Record<string, unknown>;
};

export function toPaperclipProviderContext(
  providerContext:
    | readonly (PaperclipProviderContext & {
        secretValues?: Record<string, string>;
      })[]
    | undefined
): readonly PaperclipProviderContext[] | undefined {
  if (!providerContext) {
    return undefined;
  }

  return providerContext.map(({ capability, providerKind, label, secretRef, metadata }) => ({
    capability,
    providerKind,
    label,
    secretRef,
    metadata
  }));
}

export type PaperclipRunReference = {
  paperclipRunId: string;
  status: PaperclipRunStatus;
};

export type GetPaperclipRunStatusInput = {
  companyId: string;
  paperclipRunId: string;
};

export type CancelPaperclipRunInput = GetPaperclipRunStatusInput;

export type PaperclipClient = {
  healthCheck(): Promise<PaperclipHealth>;
  createRun(input: CreatePaperclipRunInput): Promise<PaperclipRunReference>;
  getRunStatus(input: GetPaperclipRunStatusInput): Promise<PaperclipRunReference>;
  cancelRun(input: CancelPaperclipRunInput): Promise<PaperclipRunReference>;
};
