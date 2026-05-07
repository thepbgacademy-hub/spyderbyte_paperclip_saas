export type PaperclipRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type PaperclipHealth = {
  ok: boolean;
};

export type CreatePaperclipRunInput = {
  companyId: string;
  workflowId: string;
  spyderbyteRunId: string;
};

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
