export type LiveHarnessExportReplayCycleWriterConfig = {
  exportRoot?: string | null;
  configured?: boolean;
  absolute?: boolean;
  exists?: boolean;
  directory?: boolean;
  writable?: boolean;
};

export type LiveHarnessExportReplayCycleResult = {
  ok: boolean;
  phase: string;
  notes?: string[];
  [key: string]: unknown;
};

export function runLiveHarnessExportReplayCycle(input: {
  runId?: string | null;
  failureWriterRoot?: string | null;
  loadWriterConfig: () => Promise<LiveHarnessExportReplayCycleWriterConfig> | LiveHarnessExportReplayCycleWriterConfig;
  setWriterRootState: (input: {
    mode: "broken" | "healthy";
    writerRoot: string;
    restoreWriterRoot: string;
  }) => Promise<LiveHarnessExportReplayCycleWriterConfig> | LiveHarnessExportReplayCycleWriterConfig;
  loadClosedBoardCandidate: (input: {
    runId: string;
    candidateId: string;
  }) => Promise<unknown> | unknown;
  loadCandidateDeliverySnapshot?: (input: {
    candidateId: string;
  }) => Promise<unknown> | unknown;
  postCandidateAction: (input: {
    runId: string;
    candidateId: string;
    action: {
      actionRoute?: string | null;
      actionHandle?: string | null;
      actionPath?: string | null;
    };
  }) => Promise<unknown> | unknown;
  waitForCandidateDeliveryStatus: (input: {
    candidateId: string;
    acceptedStatuses: string[];
  }) => Promise<unknown> | unknown;
}): Promise<LiveHarnessExportReplayCycleResult>;
