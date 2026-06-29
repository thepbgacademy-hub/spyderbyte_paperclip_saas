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

export type LiveHarnessExportReplayCycleCandidateId =
  | "governance_history_export"
  | "package_bundle_export"
  | string;

export type LiveHarnessExportReplayCycleAction = {
  actionRoute?: string | null;
  actionHandle?: string | null;
  actionPath?: string | null;
};

export type LiveHarnessExportReplayCycleDelivery = {
  status?: string | null;
  bundleRevision?: string | null;
  bundle_revision?: string | null;
  contractFreshness?: string | null;
  contract_freshness?: string | null;
  [key: string]: unknown;
};

export type LiveHarnessExportReplayCycleCandidate = {
  latestDelivery?: LiveHarnessExportReplayCycleDelivery | null;
  exportActions?: LiveHarnessExportReplayCycleAction[] | null;
  [key: string]: unknown;
};

export type LiveHarnessExportReplayCycleBoardCandidate = {
  board?: unknown;
  candidate?: LiveHarnessExportReplayCycleCandidate | null;
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
    candidateId: LiveHarnessExportReplayCycleCandidateId;
  }) => Promise<LiveHarnessExportReplayCycleBoardCandidate> | LiveHarnessExportReplayCycleBoardCandidate;
  loadCandidateDeliverySnapshot?: (input: {
    candidateId: LiveHarnessExportReplayCycleCandidateId;
  }) => Promise<LiveHarnessExportReplayCycleDelivery | null> | LiveHarnessExportReplayCycleDelivery | null;
  postCandidateAction: (input: {
    runId: string;
    candidateId: LiveHarnessExportReplayCycleCandidateId;
    action: LiveHarnessExportReplayCycleAction;
  }) => Promise<unknown> | unknown;
  waitForCandidateDeliveryStatus: (input: {
    candidateId: LiveHarnessExportReplayCycleCandidateId;
    acceptedStatuses: string[];
  }) => Promise<unknown> | unknown;
}): Promise<LiveHarnessExportReplayCycleResult>;
