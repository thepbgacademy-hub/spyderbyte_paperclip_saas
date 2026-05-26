import { ApiAuthError, type ApiSession } from "../api/dashboard-api.js";
import { randomUUID } from "node:crypto";
import type { DurableAuditEvent } from "../audit/durable-audit.js";
import type {
  HarnessBoardDecisionRecord,
  HarnessCardContinuityRecord,
  HarnessCardEventRecord,
  HarnessCardRecord,
  HarnessRunRecord
} from "./types.js";
import { createHarnessBoardDecisionRecord, createHarnessCardContinuityRecord, createHarnessCardEventRecord } from "./types.js";
import {
  isHarnessCardState,
  isHarnessChildPersona,
  isHarnessDeliverableType,
  normalizeHarnessDeliverableType,
  normalizeHarnessPersona
} from "./types.js";
import { deriveHarnessRunState, transitionHarnessCard, transitionHarnessRun } from "./state-machine.js";
import { createHarnessRuntime } from "./runtime.js";
import type { HarnessRepository } from "./repository.js";
import {
  deriveCurrentHarnessAttentionState,
  describeHarnessPostOutcomeActionKind,
  determineHarnessPostOutcomeAction,
  isSameAttentionAction,
  parseHarnessAttentionSnapshot,
  type HarnessAttentionState,
  type HarnessPostOutcomeAction
} from "./post-outcome.js";
import type { WealthFactoryWorkflowDefinition } from "../wealthfactory/workflow-registry.js";
import {
  ActivePackageInstallRequiredError,
  TenantMembershipRequiredError
} from "../db/supabase-repositories.js";
import type { HarnessProposalStatus, HarnessSubCardProposal } from "./runtime-contract.js";

export type HarnessBoardActivityItem = {
  id: string;
  label: string;
  timestampLabel: string;
};

export type HarnessBoardDetailSection = {
  id: string;
  title: string;
  body: string;
};

export type HarnessBoardCardView = {
  id: string;
  persona: string;
  title: string;
  summary: string;
  lane: string;
  statusLabel: string;
  priorityLabel: string;
  deliverableLabel: string;
  updatedAtLabel: string;
  outcome: string;
  focusPoints: string[];
  activity: HarnessBoardActivityItem[];
  detailSections: HarnessBoardDetailSection[];
};

export type HarnessBoardColumnView = {
  id: string;
  title: string;
  description: string;
  cardIds: string[];
};

export type HarnessBoardResponse = {
  runId: string;
  workflowId: string;
  packageId: string;
  columns: HarnessBoardColumnView[];
  cards: HarnessBoardCardView[];
  pendingApprovals: HarnessPendingApprovalView[];
  pendingAttention?: HarnessPendingAttentionView;
  recentDecisions: HarnessRecentDecisionView[];
  followThroughItems: HarnessFollowThroughView[];
  completionPackage?: HarnessCompletionPackageView;
};

export type HarnessActionRequestFieldView = {
  name: "decision" | "decisionNote" | "targetCardId" | "command" | "resumeSummary" | "completionSummary" | "mode";
  label: string;
  description?: string;
  required: boolean;
  allowedValues?: string[];
  requiredWhenValue?: string;
  supportedWhenValue?: string;
  suggestedValue?: string;
};

export type HarnessActionRequestExampleView = Partial<
  Record<HarnessActionRequestFieldView["name"], string>
>;

export type HarnessActionOptionView = {
  value: string;
  label: string;
  description: string;
  emphasis?: "primary" | "secondary" | "caution";
  nextEffectSummary?: string;
  requiresConfirmation?: boolean;
  confirmationLabel?: string;
  exampleRequest?: HarnessActionRequestExampleView;
};

export type HarnessPendingAttentionView = {
  kind: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>["kind"];
  runState: HarnessRunRecord["state"];
  statusLabel: string;
  summary: string;
  actionRoute?: "review-attention" | "resolve-attention" | "pending-approvals";
  actionPath?: string;
  actionMethod?: "POST";
  actionLabel?: string;
  actionDescription?: string;
  requestFields?: HarnessActionRequestFieldView[];
  actionOptions?: HarnessActionOptionView[];
  recommendedOptionValue?: string;
  allowedDecisions?: HarnessAttentionReviewDecision[];
  allowedCommands?: HarnessAttentionResolutionCommand[];
  pendingApprovalCount?: number;
  requestedAtLabel?: string;
  reasonLabel?: string;
  targetCardId?: string;
  targetPersona?: string;
  targetTitle?: string;
  targetSummary?: string;
};

export type HarnessFollowThroughView = {
  id: string;
  action: "opened_lane" | "reused_lane" | "handed_off_lane" | "packaged_outcome";
  summary: string;
  timestampLabel: string;
  targetCardId?: string;
  proposalId?: string;
  persona?: string;
  deliverableLabel?: string;
};

export type HarnessPendingApprovalView = {
  id: string;
  title: string;
  requestedByPersona: string;
  targetPersona: string;
  deliverableLabel: string;
  statusLabel: string;
  actionRoute: "proposal-decision";
  actionPath: string;
  actionMethod: "POST";
  actionLabel: string;
  actionDescription: string;
  requestFields: HarnessActionRequestFieldView[];
  actionOptions: HarnessActionOptionView[];
  recommendedOptionValue?: "approve";
  allowedDecisions: Array<"approve" | "defer" | "deny">;
  policyReasonLabel?: string;
  nextReviewTrigger?: string;
  lastDecisionAtLabel?: string;
  handoffTargetCardId?: string;
  handoffTargetPersona?: string;
  handoffTargetTitle?: string;
  targetSummary?: string;
};

export type HarnessCompletionPackageView = {
  status: "assembling" | "done";
  summary?: string;
  deferredApprovalCount: number;
  hasOpenGovernanceItems: boolean;
  packageNote?: string;
  recommendations: string[];
  objections: string[];
  governanceItems: Array<{
    proposalId: string;
    statusLabel: string;
    persona: string;
    deliverableLabel: string;
    policyReasonLabel?: string;
    recommendationSummary?: string;
    objectionSummary?: string;
    nextReviewTrigger?: string;
  }>;
  deliverables: Array<{
    cardId: string;
    persona: string;
    title: string;
    deliverableLabel: string;
    outcome: string;
  }>;
};

export type HarnessFreshCycleMode = "reopen_deferred" | "clean";
export type HarnessAttentionReviewDecision = "complete_run" | "start_fresh_cycle";
export type HarnessAttentionResolutionCommand = "resume_lane" | "unblock_lane";
export type HarnessResolvedAttentionDispatch = {
  tenantId: string;
  userId: string;
  runId: string;
  workflowId: string;
  cardId: string;
  command: HarnessAttentionResolutionCommand;
  state: "working" | "approved";
};
export type HarnessFreshCycleDispatch = {
  tenantId: string;
  userId: string;
  runId: string;
  workflowId: string;
  mode: HarnessFreshCycleMode;
  reopenedProposalCount: number;
};

export type HarnessRecentDecisionView = {
  id: string;
  decisionKind: string;
  label: string;
  resolution?: string;
  policyReasonLabel?: string;
  recommendationSummary?: string;
  objectionSummary?: string;
  timestampLabel: string;
};

type HarnessWorkflowRegistry = {
  listHarnessEligibleWorkflowIds(): string[];
  getDefinition(publicWorkflowId: string): WealthFactoryWorkflowDefinition;
};

const MAX_OPEN_CHILD_CARDS = 6;

export class HarnessCardCreationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessCardCreationConflictError";
  }
}

export class HarnessCardProgressionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessCardProgressionConflictError";
  }
}

export class HarnessRunCompletionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessRunCompletionConflictError";
  }
}

export class HarnessRunCycleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessRunCycleConflictError";
  }
}

type HarnessAudit = (event: DurableAuditEvent) => Promise<void>;

export function createHarnessBoardService(options: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  repository: HarnessRepository;
  workflowRegistry: HarnessWorkflowRegistry;
  runAtomically?<T>(work: (repository: HarnessRepository) => Promise<T>): Promise<T>;
  audit?: HarnessAudit;
  onResolvedAttentionDispatch?: (dispatch: HarnessResolvedAttentionDispatch) => Promise<void> | void;
  onFreshCycleDispatch?: (dispatch: HarnessFreshCycleDispatch) => Promise<void> | void;
}) {
  const runtime = createHarnessRuntime();

  return {
    async listBoardState(request: { authorization: string; cookie?: string }): Promise<HarnessBoardResponse> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });
      const run = await getOrCreateCurrentRun({
        repository: options.repository,
        runtime,
        tenantId: access.session.tenantId,
        workflowDefinition: access.workflowDefinition,
        ...(options.runAtomically ? { runAtomically: options.runAtomically } : {})
      });

      const [cards, continuity, events, decisions] = await Promise.all([
        options.repository.listCardsForRun(run.id),
        options.repository.listCardContinuityForRun(run.id),
        options.repository.listEventsForRun(run.id),
        options.repository.listDecisionsForRun(run.id)
      ]);
      const proposals = await options.repository.listProposalsForRun(run.id);

      return buildHarnessBoardResponse({ run, cards, continuity, events, decisions, proposals });
    },

    async createTopLevelChildCard(request: {
      authorization: string;
      cookie?: string;
      persona: string;
      title: string;
      deliverableType: string;
    }): Promise<{ cardId: string } | { status: "deferred"; proposalId: string }> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      if (!options.runAtomically) {
        throw new Error("Harness card creation mutations require atomic execution");
      }

      const normalizedPersona = normalizeHarnessPersona(request.persona);
      const normalizedDeliverableType = normalizeHarnessDeliverableType(request.deliverableType);
      if (!isHarnessChildPersona(normalizedPersona) || !isHarnessDeliverableType(normalizedDeliverableType)) {
        throw new HarnessCardCreationConflictError("Harness child-card request is outside the approved workflow boundary");
      }

      const result: { cardId: string; auditEvents?: Awaited<ReturnType<typeof createHarnessAuditEvent>>[] } | {
        status: "deferred";
        proposalId: string;
        auditEvents?: Awaited<ReturnType<typeof createHarnessAuditEvent>>[];
      } = await options.runAtomically(async (repository) => {
        const run = await getOrCreateCurrentRun({
          repository,
          runtime,
          tenantId: access.session.tenantId,
          workflowDefinition: access.workflowDefinition
        });
        if (run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (run.state === "failed" || run.state === "cancelled") {
          throw new HarnessCardCreationConflictError("Harness direct child-card creation is closed for terminal runs");
        }

        const [cards, proposals, continuity] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listCardContinuityForRun(run.id)
        ]);
        runtime.resumeRun({ run, cards, proposals, continuity });
        const ceoCard = cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        const earlierUnresolvedDirectRequest = ceoCard
          ? findLatestUnresolvedTopLevelProposalForAssignment(proposals, {
              ceoCardId: ceoCard.id,
              persona: normalizedPersona,
              title: request.title,
              deliverableType: normalizedDeliverableType
            })
          : null;

        async function approveEarlierDirectRequestIntoExistingLane(input: {
          proposal: HarnessSubCardProposal;
          card: HarnessCardRecord;
          resolution: "update_existing_lane";
          reopenedCompletedLane?: boolean;
          reuseMessage: string;
          parentMessage: string;
        }): Promise<{
          cardId: string;
          auditEvents: Awaited<ReturnType<typeof createHarnessAuditEvent>>[];
        }> {
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: input.proposal.id,
            approvedCardId: input.card.id,
            resolution: input.resolution
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness direct child-card approval conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: input.card.id,
              eventKind: "proposal_absorbed",
              payload: {
                proposalId: input.proposal.id,
                parentCardId: input.proposal.parentCardId,
                requestedByPersona: input.proposal.requestedByPersona,
                requestedTitle: input.proposal.title,
                deliverableType: input.proposal.deliverableType,
                resolution: input.resolution
              }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: input.card.id,
              eventKind: "comment_added",
              payload: {
                message: input.reuseMessage
              }
            })
          );
          if (input.proposal.parentCardId !== input.card.id) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: input.proposal.parentCardId,
                eventKind: "comment_added",
                payload: {
                  message: input.parentMessage
                }
              })
            );
          }
          await recordAbsorbedLaneContinuity({
            repository,
            card: input.card,
            proposal: input.proposal,
            resolution: input.resolution
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: input.proposal.parentCardId,
              proposalId: input.proposal.id,
              targetCardId: input.card.id,
              persona: input.proposal.persona,
              deliverableType: input.proposal.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: input.resolution,
              recommendationSummary: createLaneRecommendationSummary({
                persona: input.proposal.persona,
                deliverableType: input.proposal.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );

          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            cardId: input.card.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: input.proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: input.card.id,
                  resolution: input.resolution,
                  reopenedCompletedLane: Boolean(input.reopenedCompletedLane),
                  requestedByPersona: input.proposal.requestedByPersona,
                  targetPersona: input.proposal.persona,
                  deliverableType: input.proposal.deliverableType,
                  hasDecisionNote: false
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        async function approveEarlierDirectRequestIntoNewLane(input: {
          proposal: HarnessSubCardProposal;
          card: HarnessCardRecord;
        }): Promise<{
          cardId: string;
          auditEvents: Awaited<ReturnType<typeof createHarnessAuditEvent>>[];
        }> {
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: input.proposal.id,
            approvedCardId: input.card.id,
            resolution: "create_lane"
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness direct child-card approval conflicted");
          }

          await repository.insertCard(input.card);
          for (const event of createBootstrapEvents(input.card)) {
            await repository.insertEvent(event);
          }
          await recordCardStateContinuity({
            repository,
            card: input.card
          });
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: input.proposal.parentCardId,
              eventKind: "result_recorded",
              payload: {
                title: input.proposal.title,
                targetPersona: input.proposal.persona,
                approvedCardId: input.card.id
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: input.proposal.parentCardId,
              proposalId: input.proposal.id,
              targetCardId: input.card.id,
              persona: input.proposal.persona,
              deliverableType: input.proposal.deliverableType,
              policyReason: "created_new_lane",
              resolution: "create_lane",
              recommendationSummary: createLaneRecommendationSummary({
                persona: input.proposal.persona,
                deliverableType: input.proposal.deliverableType,
                policyReason: "created_new_lane"
              })
            })
          );

          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            cardId: input.card.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: input.proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: input.card.id,
                  resolution: "create_lane",
                  requestedByPersona: input.proposal.requestedByPersona,
                  targetPersona: input.proposal.persona,
                  deliverableType: input.proposal.deliverableType,
                  hasDecisionNote: false
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        async function deferDirectChildRequest(input: {
          policyReason: "deliverable_owner_conflict" | "lane_cap" | "completed_lanes_only";
          decisionNote: string;
        }): Promise<{
          status: "deferred";
          proposalId: string;
          auditEvents: Awaited<ReturnType<typeof createHarnessAuditEvent>>[];
        }> {
          if (!ceoCard) {
            throw new Error("Harness CEO card missing for direct child-card defer");
          }

          if (earlierUnresolvedDirectRequest) {
            return {
              status: "deferred",
              proposalId: earlierUnresolvedDirectRequest.id,
              auditEvents: []
            };
          }

          const proposal = runtime.proposeSubCard(ceoCard.id, {
            persona: normalizedPersona,
            title: request.title,
            deliverableType: normalizedDeliverableType
          });
          await repository.insertProposal(proposal);
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote: input.decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness direct child-card defer conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: input.policyReason
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: input.policyReason,
              decisionNote: input.decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: input.policyReason,
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: input.policyReason
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            proposalId: proposal.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: input.policyReason,
                  hasDecisionNote: true,
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        if (run.state === "assembling" || run.state === "done") {
          return deferDirectChildRequest({
            policyReason: "completed_lanes_only",
            decisionNote: "CEO deferred this proposal because the board is already packaging completed work for this run."
          });
        }

        const existingCard = findMatchingOpenChildCard(cards, {
          persona: normalizedPersona,
          title: request.title,
          deliverableType: normalizedDeliverableType
        });
        if (existingCard) {
          if (earlierUnresolvedDirectRequest) {
            return approveEarlierDirectRequestIntoExistingLane({
              proposal: earlierUnresolvedDirectRequest,
              card: existingCard,
              resolution: "update_existing_lane",
              reuseMessage: `CEO resolved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by folding it into this active ${normalizedPersona.toUpperCase()} lane.`,
              parentMessage: `CEO approved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by folding it into the active ${normalizedPersona.toUpperCase()} lane.`
            });
          }
          return { cardId: existingCard.id };
        }
        const existingPersonaLane = findOpenChildCardByPersonaDeliverable(cards, {
          persona: normalizedPersona,
          deliverableType: normalizedDeliverableType
        });
        if (existingPersonaLane) {
          if (earlierUnresolvedDirectRequest) {
            return approveEarlierDirectRequestIntoExistingLane({
              proposal: earlierUnresolvedDirectRequest,
              card: existingPersonaLane,
              resolution: "update_existing_lane",
              reuseMessage: `CEO resolved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by adding it to the existing ${normalizedPersona.toUpperCase()} lane.`,
              parentMessage: `CEO approved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request and attached it to the existing ${normalizedPersona.toUpperCase()} lane.`
            });
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: existingPersonaLane.id,
              eventKind: "comment_added",
              payload: {
                message: `CEO folded this follow-on ${humanizeDeliverableType(
                  normalizedDeliverableType
                ).toLowerCase()} request into the existing ${normalizedPersona.toUpperCase()} lane.`
              }
            })
          );
          await recordDirectChildLaneReuseContinuity({
            repository,
            card: existingPersonaLane,
            title: request.title
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "lane_opened",
              cardId: existingPersonaLane.id,
              targetCardId: existingPersonaLane.id,
              persona: existingPersonaLane.persona,
              deliverableType: existingPersonaLane.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              recommendationSummary: createLaneRecommendationSummary({
                persona: existingPersonaLane.persona,
                deliverableType: existingPersonaLane.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );

          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            cardId: existingPersonaLane.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_card_reused",
                entityId: existingPersonaLane.id,
                metadata: {
                  runId: run.id,
                  parentCardId: existingPersonaLane.parentCardId,
                  persona: existingPersonaLane.persona,
                  deliverableType: existingPersonaLane.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        const latestDoneLane = findLatestDoneChildCardByPersonaDeliverable(cards, {
          persona: normalizedPersona,
          deliverableType: normalizedDeliverableType
        });
        if (
          latestDoneLane &&
          !findOpenChildCardByDeliverableType(cards, normalizedDeliverableType) &&
          isBoundedCardRefinement({
            title: request.title,
            candidateCard: latestDoneLane
          })
        ) {
          const reopenedCard = await repository.transitionCardState({
            cardId: latestDoneLane.id,
            expectedState: "done",
            state: "approved"
          });
          if (!reopenedCard) {
            throw new HarnessCardCreationConflictError("Harness completed lane reopen conflicted");
          }
          if (earlierUnresolvedDirectRequest) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reopenedCard.id,
                eventKind: "state_changed",
                payload: { from: "done", to: "approved" }
              })
            );
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reopenedCard.id,
                eventKind: "comment_added",
                payload: {
                  message: `CEO reopened this completed ${humanizeDeliverableType(
                    normalizedDeliverableType
                  ).toLowerCase()} lane and resolved the earlier bounded follow-on request into it.`
                }
              })
            );
            await recordCardStateContinuity({
              repository,
              card: reopenedCard
            });
            return approveEarlierDirectRequestIntoExistingLane({
              proposal: earlierUnresolvedDirectRequest,
              card: reopenedCard,
              resolution: "update_existing_lane",
              reopenedCompletedLane: true,
              reuseMessage: `CEO resolved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by reopening this completed ${normalizedPersona.toUpperCase()} lane.`,
              parentMessage: `CEO approved the earlier ${humanizeDeliverableType(
                normalizedDeliverableType
              ).toLowerCase()} request by reopening the existing ${normalizedPersona.toUpperCase()} lane.`
            });
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "state_changed",
              payload: { from: "done", to: "approved" }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "comment_added",
              payload: {
                message: `CEO reopened this completed ${humanizeDeliverableType(
                  normalizedDeliverableType
                ).toLowerCase()} lane for a bounded refinement.`
              }
            })
          );
          await recordCardStateContinuity({
            repository,
            card: reopenedCard
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "lane_opened",
              cardId: reopenedCard.id,
              targetCardId: reopenedCard.id,
              persona: reopenedCard.persona,
              deliverableType: reopenedCard.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              recommendationSummary: createLaneRecommendationSummary({
                persona: reopenedCard.persona,
                deliverableType: reopenedCard.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );

          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            cardId: reopenedCard.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_card_reopened",
                entityId: reopenedCard.id,
                metadata: {
                  runId: run.id,
                  parentCardId: reopenedCard.parentCardId,
                  persona: reopenedCard.persona,
                  deliverableType: reopenedCard.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (findOpenChildCardByDeliverableType(cards, normalizedDeliverableType)) {
          return deferDirectChildRequest({
            policyReason: "deliverable_owner_conflict",
            decisionNote: "CEO deferred this proposal because another active persona already owns that deliverable lane."
          });
        }
        if (countOpenChildCards(cards) >= MAX_OPEN_CHILD_CARDS) {
          return deferDirectChildRequest({
            policyReason: "lane_cap",
            decisionNote: "CEO deferred this proposal because the current run is at its active lane cap."
          });
        }
        const card = runtime.createApprovedChildCard(run.id, {
          persona: normalizedPersona,
          title: request.title,
          deliverableType: normalizedDeliverableType
        });
        if (earlierUnresolvedDirectRequest) {
          return approveEarlierDirectRequestIntoNewLane({
            proposal: earlierUnresolvedDirectRequest,
            card
          });
        }

        await repository.insertCard(card);
        for (const event of createBootstrapEvents(card)) {
          await repository.insertEvent(event);
        }
        await recordCardStateContinuity({
          repository,
          card
        });
        await repository.insertDecision(
          createHarnessBoardDecisionRecord({
            runId: run.id,
            tenantId: access.session.tenantId,
            actorUserId: access.session.userId,
            decisionKind: "lane_opened",
            cardId: card.id,
            targetCardId: card.id,
            persona: card.persona,
            deliverableType: card.deliverableType,
            policyReason: "created_new_lane",
            resolution: "create_lane",
            recommendationSummary: createLaneRecommendationSummary({
              persona: card.persona,
              deliverableType: card.deliverableType,
              policyReason: "created_new_lane"
            })
          })
        );

        const reconciledRun = await reconcileHarnessRunState({ repository, run });

        return {
          cardId: card.id,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_card_created",
              entityId: card.id,
              metadata: {
                runId: run.id,
                parentCardId: card.parentCardId,
                persona: card.persona,
                deliverableType: card.deliverableType
              }
            }),
            ...toRunAuditEvents({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              runId: run.id,
              previousState: run.state,
              nextRun: reconciledRun
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      if ("status" in result && result.status === "deferred") {
        return { status: "deferred", proposalId: result.proposalId };
      }
      return { cardId: (result as { cardId: string }).cardId };
    },

    async decideProposal(request: {
      authorization: string;
      cookie?: string;
      proposalId: string;
      decision: "approve" | "defer" | "deny";
      decisionNote?: string;
      targetCardId?: string;
    }): Promise<{ status: HarnessProposalStatus; cardId?: string }> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      if (!options.runAtomically) {
        throw new Error("Harness approval mutations require atomic execution");
      }

      const runApproval = async (
        repository: HarnessRepository
      ): Promise<{ status: HarnessProposalStatus; cardId?: string; auditEvents?: DurableAuditEvent[] }> => {
        const proposal = await repository.getProposal(request.proposalId);
        if (!proposal) {
          throw new Error("Harness proposal was not found");
        }

        const run = await repository.getRun(proposal.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (proposal.status === "approved" || proposal.status === "denied") {
          return {
            status: proposal.status,
            ...(proposal.approvedCardId ? { cardId: proposal.approvedCardId } : {})
          };
        }
        if (
          !isHarnessChildPersona(normalizeHarnessPersona(proposal.persona)) ||
          !isHarnessDeliverableType(normalizeHarnessDeliverableType(proposal.deliverableType))
        ) {
          throw new HarnessCardCreationConflictError("Harness proposal is outside the approved workflow boundary");
        }

        const [cards, proposals, decisions, continuity] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listDecisionsForRun(run.id),
          repository.listCardContinuityForRun(run.id)
        ]);
        const trimmedDecisionNote = request.decisionNote?.trim();
        const trimmedTargetCardId = request.targetCardId?.trim();
        const latestDecisionByProposalId = new Map<string, HarnessBoardDecisionRecord>();
        for (const decision of decisions) {
          if (decision.proposalId && !latestDecisionByProposalId.has(decision.proposalId)) {
            latestDecisionByProposalId.set(decision.proposalId, decision);
          }
        }
        const proposalPolicyReason = determineProposalPolicyReason({
          run,
          cards,
          proposal
        });
        const latestDecisionForProposal = latestDecisionByProposalId.get(proposal.id) ?? null;
        if (proposal.status === "deferred" && request.decision === "defer") {
          const unchangedDecisionNote =
            !trimmedDecisionNote ||
            trimmedDecisionNote === proposal.decisionNote?.trim();
          const unchangedPolicyReason =
            latestDecisionForProposal?.policyReason === proposalPolicyReason;
          if (unchangedDecisionNote && unchangedPolicyReason) {
            return { status: "deferred" };
          }
        }

        if (request.decision === "defer" || request.decision === "deny") {
          const status: HarnessProposalStatus = request.decision === "defer" ? "deferred" : "denied";
          const defaultDecisionNote =
            status === "deferred"
              ? "CEO deferred this proposal to keep the current lane set bounded."
              : "CEO denied this proposal because it would widen the workflow beyond the current boundary.";
          const decisionNote = trimmedDecisionNote ?? defaultDecisionNote;
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status,
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status,
                  deliverableType: proposal.deliverableType,
                  policyReason: proposalPolicyReason
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: status === "deferred" ? "proposal_deferred" : "proposal_denied",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: proposalPolicyReason,
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: proposalPolicyReason,
                status
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: proposalPolicyReason
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: status,
                  reason: proposalPolicyReason,
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        if (trimmedTargetCardId) {
          const targetCard = cards.find((card) => card.id === trimmedTargetCardId) ?? null;
          const canHandOff =
            targetCard &&
            targetCard.persona !== "ceo" &&
            isOpenCardState(targetCard.state) &&
            targetCard.deliverableType === proposal.deliverableType &&
            targetCard.persona !== proposal.persona &&
            proposalPolicyReason === "deliverable_owner_conflict";
          if (canHandOff) {
            const previousPersona = targetCard.persona;
            const previousTitle = targetCard.title;
            const reassignedCard = await repository.updateCardAssignment({
              cardId: targetCard.id,
              persona: proposal.persona,
              title: proposal.title
            });
            if (!reassignedCard) {
              throw new HarnessCardCreationConflictError("Harness lane handoff conflicted");
            }

            const approvalUpdate = await repository.markProposalApproved({
              proposalId: proposal.id,
              approvedCardId: reassignedCard.id,
              resolution: "handoff_existing_lane",
              ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
            });
            if (!approvalUpdate.updated) {
              throw new Error("Harness proposal approval conflicted");
            }

            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reassignedCard.id,
                eventKind: "lane_handed_off",
                payload: {
                  proposalId: proposal.id,
                  parentCardId: proposal.parentCardId,
                  fromPersona: previousPersona,
                  toPersona: proposal.persona,
                  previousTitle,
                  nextTitle: proposal.title,
                  deliverableType: proposal.deliverableType
                }
              })
            );
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reassignedCard.id,
                eventKind: "proposal_absorbed",
                payload: {
                  proposalId: proposal.id,
                  parentCardId: proposal.parentCardId,
                  requestedByPersona: proposal.requestedByPersona,
                  requestedTitle: proposal.title,
                  deliverableType: proposal.deliverableType,
                  resolution: "handoff_existing_lane"
                }
              })
            );
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: reassignedCard.id,
                eventKind: "comment_added",
                payload: {
                  message: `CEO handed this active ${humanizeDeliverableType(proposal.deliverableType).toLowerCase()} lane from ${previousPersona.toUpperCase()} to ${proposal.persona.toUpperCase()}.`
                }
              })
            );
            if (proposal.parentCardId !== reassignedCard.id) {
              await repository.insertEvent(
                createHarnessCardEventRecord({
                  cardId: proposal.parentCardId,
                  eventKind: "comment_added",
                  payload: {
                    message: `CEO approved this request by handing the active ${humanizeDeliverableType(
                      proposal.deliverableType
                    ).toLowerCase()} lane to ${proposal.persona.toUpperCase()}.`
                  }
                })
              );
            }
            await recordAbsorbedLaneContinuity({
              repository,
              card: reassignedCard,
              proposal,
              resolution: "handoff_existing_lane",
              continuitySourcePersona: previousPersona,
              continuitySourceTitle: previousTitle
            });
            await repository.insertDecision(
              createHarnessBoardDecisionRecord({
                runId: run.id,
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                decisionKind: "proposal_approved",
                cardId: proposal.parentCardId,
                proposalId: proposal.id,
                targetCardId: reassignedCard.id,
                persona: proposal.persona,
                deliverableType: proposal.deliverableType,
                policyReason: "deliverable_owner_conflict",
                resolution: "handoff_existing_lane",
                ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
                recommendationSummary: createHandoffRecommendationSummary({
                  persona: proposal.persona,
                  deliverableType: proposal.deliverableType
                })
              })
            );
            const reconciledRun = await reconcileHarnessRunState({ repository, run });

            return {
              status: "approved",
              cardId: reassignedCard.id,
              auditEvents: [
                createHarnessAuditEvent({
                  tenantId: access.session.tenantId,
                  actorUserId: access.session.userId,
                  eventType: "harness_proposal_approved",
                  entityId: proposal.id,
                  metadata: {
                    runId: run.id,
                    approvedCardId: reassignedCard.id,
                    resolution: "handoff_existing_lane",
                    requestedByPersona: proposal.requestedByPersona,
                    targetPersona: proposal.persona,
                    previousPersona,
                    deliverableType: proposal.deliverableType,
                    hasDecisionNote: Boolean(trimmedDecisionNote)
                  }
                }),
                ...toRunAuditEvents({
                  tenantId: access.session.tenantId,
                  actorUserId: access.session.userId,
                  runId: run.id,
                  previousState: run.state,
                  nextRun: reconciledRun
                })
              ]
            };
          }
        }

        const exactExistingCard = findMatchingOpenChildCard(cards, {
          persona: proposal.persona,
          title: proposal.title,
          deliverableType: proposal.deliverableType
        });
        if (exactExistingCard) {
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: proposal.id,
            approvedCardId: exactExistingCard.id,
            resolution: "update_existing_lane",
            ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness proposal approval conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: exactExistingCard.id,
              eventKind: "proposal_absorbed",
              payload: {
                proposalId: proposal.id,
                parentCardId: proposal.parentCardId,
                requestedByPersona: proposal.requestedByPersona,
                requestedTitle: proposal.title,
                deliverableType: proposal.deliverableType,
                resolution: "update_existing_lane"
              }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: exactExistingCard.id,
              eventKind: "comment_added",
              payload: {
                message: `${proposal.requestedByPersona.toUpperCase()} folded this request into the existing ${humanizeDeliverableType(
                  proposal.deliverableType
                ).toLowerCase()} lane.`
              }
            })
          );
          if (proposal.parentCardId !== exactExistingCard.id) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: proposal.parentCardId,
                eventKind: "comment_added",
                payload: {
                  message: `${proposal.requestedByPersona.toUpperCase()} approved this request and folded it into the existing ${humanizeDeliverableType(
                    proposal.deliverableType
                  ).toLowerCase()} lane.`
                }
              })
            );
          }
          await recordAbsorbedLaneContinuity({
            repository,
            card: exactExistingCard,
            proposal,
            resolution: "update_existing_lane"
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              targetCardId: exactExistingCard.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
              recommendationSummary: createLaneRecommendationSummary({
                persona: proposal.persona,
                deliverableType: proposal.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "approved",
            cardId: exactExistingCard.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: exactExistingCard.id,
                  resolution: "update_existing_lane",
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType,
                  hasDecisionNote: Boolean(trimmedDecisionNote)
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        const earlierUnresolvedSiblingProposal = findEarlierUnresolvedSiblingProposal(proposals, proposal);
        if (earlierUnresolvedSiblingProposal) {
          const siblingDecision = latestDecisionByProposalId.get(earlierUnresolvedSiblingProposal.id) ?? null;
          const repeatedRequestPolicyReason =
            earlierUnresolvedSiblingProposal.status === "deferred" &&
            (
              siblingDecision?.policyReason === "deliverable_owner_conflict" ||
              siblingDecision?.policyReason === "lane_cap" ||
              siblingDecision?.policyReason === "completed_lanes_only"
            )
              ? siblingDecision.policyReason
              : "scope_guardrail";
          const repeatedRequestStatus: HarnessProposalStatus =
            repeatedRequestPolicyReason === "scope_guardrail" ? "denied" : "deferred";
          const repeatedRequestDecisionNote =
            trimmedDecisionNote ??
            createRepeatedRequestDecisionNote({
              status: repeatedRequestStatus,
              policyReason: repeatedRequestPolicyReason,
              deliverableType: proposal.deliverableType
            });
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: repeatedRequestStatus,
            decisionNote: repeatedRequestDecisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: repeatedRequestStatus,
                  deliverableType: proposal.deliverableType,
                  policyReason: repeatedRequestPolicyReason
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: repeatedRequestStatus === "deferred" ? "proposal_deferred" : "proposal_denied",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: repeatedRequestPolicyReason,
              decisionNote: repeatedRequestDecisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: repeatedRequestPolicyReason,
                status: repeatedRequestStatus
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: repeatedRequestPolicyReason
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: repeatedRequestStatus,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: repeatedRequestStatus,
                  reason: repeatedRequestPolicyReason,
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (
          findOpenChildCardByPersonaDeliverable(cards, {
            persona: proposal.persona,
            deliverableType: proposal.deliverableType
          })
        ) {
          const existingCard = findOpenChildCardByPersonaDeliverable(cards, {
            persona: proposal.persona,
            deliverableType: proposal.deliverableType
          });
          if (!existingCard) {
            throw new HarnessCardCreationConflictError("Harness proposal approval conflicted");
          }
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: proposal.id,
            approvedCardId: existingCard.id,
            resolution: "update_existing_lane",
            ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness proposal approval conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: existingCard.id,
              eventKind: "proposal_absorbed",
              payload: {
                proposalId: proposal.id,
                parentCardId: proposal.parentCardId,
                requestedByPersona: proposal.requestedByPersona,
                requestedTitle: proposal.title,
                deliverableType: proposal.deliverableType,
                resolution: "update_existing_lane"
              }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: existingCard.id,
              eventKind: "comment_added",
              payload: {
                message: `${proposal.requestedByPersona.toUpperCase()} added follow-on work to the existing ${humanizeDeliverableType(
                  proposal.deliverableType
                ).toLowerCase()} lane instead of opening a new card.`
              }
            })
          );
          if (proposal.parentCardId !== existingCard.id) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: proposal.parentCardId,
                eventKind: "comment_added",
                payload: {
                  message: `${proposal.requestedByPersona.toUpperCase()} approved this request and attached it to the existing ${humanizeDeliverableType(
                    proposal.deliverableType
                  ).toLowerCase()} lane.`
                }
              })
            );
          }
          await recordAbsorbedLaneContinuity({
            repository,
            card: existingCard,
            proposal,
            resolution: "update_existing_lane"
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              targetCardId: existingCard.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
              recommendationSummary: createLaneRecommendationSummary({
                persona: proposal.persona,
                deliverableType: proposal.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "approved",
            cardId: existingCard.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: existingCard.id,
                  resolution: "update_existing_lane",
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType,
                  hasDecisionNote: Boolean(trimmedDecisionNote)
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        const latestDoneLane = findLatestDoneChildCardByPersonaDeliverable(cards, {
          persona: proposal.persona,
          deliverableType: proposal.deliverableType
        });
        if (
          latestDoneLane &&
          !findOpenChildCardByDeliverableType(cards, proposal.deliverableType) &&
          run.state !== "assembling" &&
          run.state !== "done" &&
          isBoundedLaneRefinement({
            proposal,
            candidateCard: latestDoneLane
          })
        ) {
          const reopenedCard = await repository.transitionCardState({
            cardId: latestDoneLane.id,
            expectedState: "done",
            state: "approved"
          });
          if (!reopenedCard) {
            throw new HarnessCardCreationConflictError("Harness completed lane refinement conflicted");
          }
          const approvalUpdate = await repository.markProposalApproved({
            proposalId: proposal.id,
            approvedCardId: reopenedCard.id,
            resolution: "update_existing_lane",
            ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
          });
          if (!approvalUpdate.updated) {
            throw new Error("Harness proposal approval conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "state_changed",
              payload: { from: "done", to: "approved" }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "proposal_absorbed",
              payload: {
                proposalId: proposal.id,
                parentCardId: proposal.parentCardId,
                requestedByPersona: proposal.requestedByPersona,
                requestedTitle: proposal.title,
                deliverableType: proposal.deliverableType,
                resolution: "update_existing_lane"
              }
            })
          );
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: reopenedCard.id,
              eventKind: "comment_added",
              payload: {
                message: `${proposal.requestedByPersona.toUpperCase()} reopened this completed ${humanizeDeliverableType(
                  proposal.deliverableType
                ).toLowerCase()} lane for a bounded refinement instead of starting a fresh card.`
              }
            })
          );
          if (proposal.parentCardId !== reopenedCard.id) {
            await repository.insertEvent(
              createHarnessCardEventRecord({
                cardId: proposal.parentCardId,
                eventKind: "comment_added",
                payload: {
                  message: `${proposal.requestedByPersona.toUpperCase()} approved this refinement and reopened the existing ${humanizeDeliverableType(
                    proposal.deliverableType
                  ).toLowerCase()} lane.`
                }
              })
            );
          }
          await recordAbsorbedLaneContinuity({
            repository,
            card: reopenedCard,
            proposal,
            resolution: "update_existing_lane"
          });
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_approved",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              targetCardId: reopenedCard.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "reused_existing_lane",
              resolution: "update_existing_lane",
              ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
              recommendationSummary: createLaneRecommendationSummary({
                persona: proposal.persona,
                deliverableType: proposal.deliverableType,
                policyReason: "reused_existing_lane"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "approved",
            cardId: reopenedCard.id,
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_approved",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  approvedCardId: reopenedCard.id,
                  resolution: "update_existing_lane",
                  reopenedCompletedLane: true,
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType,
                  hasDecisionNote: Boolean(trimmedDecisionNote)
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (findOpenChildCardByDeliverableType(cards, proposal.deliverableType)) {
          const decisionNote =
            trimmedDecisionNote ??
            "CEO deferred this proposal because another active persona already owns that deliverable lane.";
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: "deliverable_owner_conflict"
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "deliverable_owner_conflict",
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "deliverable_owner_conflict",
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "deliverable_owner_conflict"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: "deliverable_owner_conflict",
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (proposalPolicyReason === "completed_lanes_only") {
          const decisionNote =
            trimmedDecisionNote ??
            "CEO deferred this proposal because the board is already packaging completed work for this run.";
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: "completed_lanes_only"
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "completed_lanes_only",
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "completed_lanes_only",
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "completed_lanes_only"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: "completed_lanes_only",
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }
        if (countOpenChildCards(cards) >= MAX_OPEN_CHILD_CARDS) {
          const decisionNote =
            trimmedDecisionNote ?? "CEO deferred this proposal because the current run is at its active lane cap.";
          const decisionUpdate = await repository.markProposalStatus({
            proposalId: proposal.id,
            status: "deferred",
            decisionNote
          });
          if (!decisionUpdate.updated) {
            throw new Error("Harness proposal decision conflicted");
          }
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: proposal.parentCardId,
              eventKind: "comment_added",
              payload: {
                message: createPublicProposalDecisionMessage({
                  status: "deferred",
                  deliverableType: proposal.deliverableType,
                  policyReason: "lane_cap"
                })
              }
            })
          );
          await repository.insertDecision(
            createHarnessBoardDecisionRecord({
              runId: run.id,
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              decisionKind: "proposal_deferred",
              cardId: proposal.parentCardId,
              proposalId: proposal.id,
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "lane_cap",
              decisionNote,
              recommendationSummary: createGovernanceRecommendationSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "lane_cap",
                status: "deferred"
              }),
              objectionSummary: createGovernanceObjectionSummary({
                deliverableType: proposal.deliverableType,
                policyReason: "lane_cap"
              })
            })
          );
          const reconciledRun = await reconcileHarnessRunState({ repository, run });

          return {
            status: "deferred",
            auditEvents: [
              createHarnessAuditEvent({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                eventType: "harness_proposal_decided",
                entityId: proposal.id,
                metadata: {
                  runId: run.id,
                  decision: "deferred",
                  reason: "lane_cap",
                  hasDecisionNote: Boolean(trimmedDecisionNote),
                  requestedByPersona: proposal.requestedByPersona,
                  targetPersona: proposal.persona,
                  deliverableType: proposal.deliverableType
                }
              }),
              ...toRunAuditEvents({
                tenantId: access.session.tenantId,
                actorUserId: access.session.userId,
                runId: run.id,
                previousState: run.state,
                nextRun: reconciledRun
              })
            ]
          };
        }

        runtime.resumeRun({
          run,
          cards,
          proposals,
          continuity
        });
        const approvedCard = runtime.approveSubCard(request.proposalId, {
          cardId: randomUUID()
        });
        const approvalUpdate = await repository.markProposalApproved({
          proposalId: proposal.id,
          approvedCardId: approvedCard.id,
          resolution: "create_lane",
          ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {})
        });
        if (!approvalUpdate.updated) {
          const updatedProposal = await repository.getProposal(proposal.id);
          if (updatedProposal?.approvedCardId) {
            return { status: updatedProposal.status, cardId: updatedProposal.approvedCardId };
          }
          throw new Error("Harness proposal approval conflicted");
        }

        await repository.insertCard(approvedCard);
        await recordCardStateContinuity({
          repository,
          card: approvedCard
        });
        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: proposal.parentCardId,
            eventKind: "result_recorded",
            payload: {
              title: proposal.title,
              targetPersona: proposal.persona,
              approvedCardId: approvedCard.id
            }
          })
        );
        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: approvedCard.id,
            eventKind: "created",
            payload: {
              title: approvedCard.title,
              persona: approvedCard.persona,
              state: approvedCard.state
            }
          })
        );
        await repository.insertDecision(
          createHarnessBoardDecisionRecord({
            runId: run.id,
            tenantId: access.session.tenantId,
            actorUserId: access.session.userId,
            decisionKind: "proposal_approved",
            cardId: proposal.parentCardId,
            proposalId: proposal.id,
            targetCardId: approvedCard.id,
            persona: proposal.persona,
            deliverableType: proposal.deliverableType,
            policyReason: "created_new_lane",
            resolution: "create_lane",
            ...(trimmedDecisionNote ? { decisionNote: trimmedDecisionNote } : {}),
            recommendationSummary: createLaneRecommendationSummary({
              persona: proposal.persona,
              deliverableType: proposal.deliverableType,
              policyReason: "created_new_lane"
            })
          })
        );

        const reconciledRun = await reconcileHarnessRunState({ repository, run });

        return {
          status: "approved",
          cardId: approvedCard.id,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_proposal_approved",
              entityId: proposal.id,
              metadata: {
                runId: run.id,
                approvedCardId: approvedCard.id,
                resolution: "create_lane",
                parentCardId: proposal.parentCardId,
                requestedByPersona: proposal.requestedByPersona,
                targetPersona: proposal.persona,
                deliverableType: proposal.deliverableType
              }
            }),
            ...toRunAuditEvents({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              runId: run.id,
              previousState: run.state,
              nextRun: reconciledRun
            })
          ]
        };
      };

      const result = await options.runAtomically(runApproval);

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      return {
        status: result.status,
        ...(result.cardId ? { cardId: result.cardId } : {})
      };
    },

    async approveProposal(request: { authorization: string; cookie?: string; proposalId: string }): Promise<{ cardId: string }> {
      const result = await this.decideProposal({
        ...request,
        decision: "approve"
      });
      if (!result.cardId) {
        throw new HarnessCardCreationConflictError("Harness proposal approval did not produce a lane target");
      }
      return { cardId: result.cardId };
    },

    async advanceChildCard(request: {
      authorization: string;
      cookie?: string;
      cardId: string;
      state: HarnessCardRecord["state"];
      resultSummary?: string;
      resumeSummary?: string;
    }): Promise<{ cardId: string; state: HarnessCardRecord["state"] }> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      if (!options.runAtomically) {
        throw new Error("Harness card progression mutations require atomic execution");
      }

      const result = await options.runAtomically(async (repository) => {
        const card = await repository.getCard(request.cardId);
        if (!card) {
          throw new HarnessCardProgressionConflictError("Harness child card was not found");
        }
        if (card.persona === "ceo") {
          throw new HarnessCardProgressionConflictError("CEO cards cannot be advanced through the child-card seam");
        }
        const run = await repository.getRun(card.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (isTerminalHarnessRunState(run.state)) {
          throw new HarnessCardProgressionConflictError("Harness terminal runs are read-only through the child-card seam");
        }
        if (!isHarnessCardState(request.state)) {
          throw new HarnessCardProgressionConflictError("Harness child card requested an unsupported state");
        }

        const nextCard = transitionHarnessCard(card, request.state);
        const trimmedSummary = request.resultSummary?.trim();
        const trimmedResumeSummary = request.resumeSummary?.trim();
        if (trimmedSummary && nextCard.state !== "done") {
          throw new HarnessCardProgressionConflictError("Outcome summaries can only be recorded when a card reaches done");
        }
        if (trimmedResumeSummary && nextCard.state === "done") {
          throw new HarnessCardProgressionConflictError("Resume summaries cannot be recorded when a card reaches done");
        }

        const updatedCard = await repository.transitionCardState({
          cardId: card.id,
          expectedState: card.state,
          state: nextCard.state
        });
        if (!updatedCard) {
          throw new HarnessCardProgressionConflictError("Harness child card progression conflicted");
        }

        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: updatedCard.id,
            eventKind: "state_changed",
            payload: { from: card.state, to: updatedCard.state }
          })
        );

        if (trimmedSummary) {
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: updatedCard.id,
              eventKind: "result_recorded",
              payload: { summary: trimmedSummary }
            })
          );
          await recordLatestResultContinuity({
            repository,
            card: updatedCard,
            resultSummary: trimmedSummary
          });
        } else {
          await recordCardStateContinuity({
            repository,
            card: updatedCard,
            ...(trimmedResumeSummary ? { resumeSummary: trimmedResumeSummary } : {})
          });
        }

        const reconciledRun = await reconcileHarnessRunState({ repository, run });

        return {
          cardId: updatedCard.id,
          state: updatedCard.state,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_card_advanced",
              entityId: updatedCard.id,
              metadata: {
                runId: run.id,
                persona: updatedCard.persona,
                deliverableType: updatedCard.deliverableType,
                fromState: card.state,
                toState: updatedCard.state,
                hasResultSummary: Boolean(trimmedSummary)
              }
            }),
            ...toRunAuditEvents({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              runId: run.id,
              previousState: run.state,
              nextRun: reconciledRun
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      return { cardId: result.cardId, state: result.state };
    },

    async completeRun(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      completionSummary: string;
      resolvedAttention?: HarnessAttentionState;
    }): Promise<{ runId: string; state: "done" }> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      if (!options.runAtomically) {
        throw new Error("Harness completion mutations require atomic execution");
      }

      const result = await options.runAtomically(async (repository) => {
        const trimmedCompletionSummary = request.completionSummary.trim();
        if (trimmedCompletionSummary.length === 0) {
          throw new HarnessRunCompletionConflictError("Harness run completion summary is required");
        }
        const run = await repository.getRun(request.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (run.state === "done") {
          return { runId: run.id, state: "done" as const };
        }

        const [cards, proposals] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id)
        ]);
        const derivedState = deriveHarnessRunState({
          run,
          cards,
          proposals
        });
        if (derivedState !== "assembling") {
          throw new HarnessRunCompletionConflictError("Harness run is not ready for final assembly");
        }

        let currentRun = run;
        if (run.state !== "assembling") {
          const assemblingRun = transitionHarnessRun(run, "assembling");
          const reconciledRun = await repository.updateRunState({
            runId: run.id,
            state: assemblingRun.state
          });
          if (!reconciledRun) {
            throw new HarnessRunCompletionConflictError("Harness run reconciliation conflicted before completion");
          }
          currentRun = reconciledRun;
        }

        const ceoCard = cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        if (!ceoCard) {
          throw new HarnessRunCompletionConflictError("Harness run is missing the CEO assembly lane");
        }

        if (request.resolvedAttention?.action.kind === "queue_ceo_review") {
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: ceoCard.id,
              eventKind: "attention_resolved",
              payload: buildResolvedAttentionPayload(request.resolvedAttention)
            })
          );
        }

        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: ceoCard.id,
            eventKind: "result_recorded",
            payload: { summary: trimmedCompletionSummary }
          })
        );
        await recordLatestResultContinuity({
          repository,
          card: ceoCard,
          resultSummary: trimmedCompletionSummary
        });
        await repository.insertDecision(
          createHarnessBoardDecisionRecord({
            runId: run.id,
            tenantId: access.session.tenantId,
            actorUserId: access.session.userId,
            decisionKind: "run_completed",
            cardId: ceoCard.id,
            persona: ceoCard.persona,
            policyReason: "completed_lanes_only",
            recommendationSummary: "Package only completed lanes into the tenant-facing board outcome."
          })
        );
        const completedRun = await repository.updateRunState({
          runId: run.id,
          state: "done"
        });
        if (!completedRun) {
          throw new HarnessRunCompletionConflictError("Harness run completion conflicted");
        }

        return {
          runId: completedRun.id,
          state: "done" as const,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_run_completed",
              entityId: completedRun.id,
              metadata: {
                fromState: currentRun.state,
                toState: completedRun.state,
                ceoCardId: ceoCard.id,
                hasCompletionSummary: true
              }
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      return { runId: result.runId, state: result.state };
    },

    async reviewPendingAttention(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      decision: HarnessAttentionReviewDecision;
      completionSummary?: string;
      mode?: HarnessFreshCycleMode;
    }): Promise<
      | { status: "done"; runId: string }
      | { status: "fresh_cycle_started"; runId: string; reopenedProposalCount: number }
    > {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      const run = await options.repository.getRun(request.runId);
      if (!run || run.tenantId !== access.session.tenantId) {
        throw new ApiAuthError();
      }

      const [cards, proposals, events] = await Promise.all([
        options.repository.listCardsForRun(run.id),
        options.repository.listProposalsForRun(run.id),
        options.repository.listEventsForRun(run.id)
      ]);
      const pendingAttention = determineHarnessPostOutcomeAction({
        runState: run.state,
        cards,
        proposals,
        nextDispatchCard: null
      });
      const currentAttention = deriveCurrentHarnessAttentionState(events);
      if (
        !pendingAttention
        || pendingAttention.kind !== "queue_ceo_review"
        || (currentAttention && !isSameAttentionAction(currentAttention.action, pendingAttention))
      ) {
        throw new HarnessRunCompletionConflictError("Harness run is not waiting on CEO review");
      }
      const resolvedAttention = currentAttention ?? buildDerivedAttentionState(pendingAttention);

      if (request.decision === "complete_run") {
        const completionSummary = request.completionSummary?.trim();
        if (!completionSummary) {
          throw new HarnessRunCompletionConflictError("Harness run completion summary is required");
        }
        const completed = await this.completeRun({
          authorization: request.authorization,
          ...(request.cookie ? { cookie: request.cookie } : {}),
          runId: request.runId,
          completionSummary,
          resolvedAttention
        });
        return {
          status: "done",
          runId: completed.runId
        };
      }

      const reopened = await this.startFreshCycle({
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {}),
        runId: request.runId,
        resolvedAttention,
        ...(request.mode ? { mode: request.mode } : {})
      });
      return {
        status: "fresh_cycle_started",
        runId: reopened.runId,
        reopenedProposalCount: reopened.reopenedProposalCount
      };
    },

    async resolvePendingAttention(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      command: HarnessAttentionResolutionCommand;
      resumeSummary?: string;
    }): Promise<{ status: "resumed"; cardId: string; state: "working" } | { status: "unblocked"; cardId: string; state: "approved" }> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      if (!options.runAtomically) {
        throw new Error("Harness attention resolution mutations require atomic execution");
      }

      const result = await options.runAtomically(async (repository) => {
        const run = await repository.getRun(request.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }

        const [cards, proposals, events] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listEventsForRun(run.id)
        ]);
        const pendingAttention = determineHarnessPostOutcomeAction({
          runState: run.state,
          cards,
          proposals,
          nextDispatchCard: null
        });
        const currentAttention = deriveCurrentHarnessAttentionState(events);
        if (
          !pendingAttention
          || pendingAttention.kind === "dispatch_next_lane"
          || (currentAttention && !isSameAttentionAction(currentAttention.action, pendingAttention))
        ) {
          throw new HarnessCardProgressionConflictError("Harness run has no active attention to resolve");
        }

        if (
          (request.command === "resume_lane" && pendingAttention.kind !== "await_lane_resume")
          || (request.command === "unblock_lane" && pendingAttention.kind !== "await_unblock")
        ) {
          throw new HarnessCardProgressionConflictError("Harness run is not waiting on that attention command");
        }

        const targetCardId = "cardId" in pendingAttention ? pendingAttention.cardId : null;
        if (!targetCardId) {
          throw new HarnessCardProgressionConflictError("Harness attention target is missing");
        }
        const targetCard = cards.find((card) => card.id === targetCardId);
        if (!targetCard) {
          throw new HarnessCardProgressionConflictError("Harness attention target lane was not found");
        }

        const nextState = request.command === "resume_lane" ? "working" : "approved";
        const expectedState = request.command === "resume_lane" ? "waiting" : "blocked";
        if (targetCard.state !== expectedState) {
          throw new HarnessCardProgressionConflictError("Harness attention target is no longer waiting on that state");
        }

        const updatedCard = await repository.transitionCardState({
          cardId: targetCard.id,
          expectedState,
          state: nextState
        });
        if (!updatedCard) {
          throw new HarnessCardProgressionConflictError("Harness attention target progression conflicted");
        }

        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: updatedCard.id,
            eventKind: "state_changed",
            payload: { from: targetCard.state, to: updatedCard.state }
          })
        );

        const trimmedResumeSummary = request.resumeSummary?.trim();
        await recordCardStateContinuity({
          repository,
          card: updatedCard,
          ...(trimmedResumeSummary ? { resumeSummary: trimmedResumeSummary } : {})
        });
        const reconciledRun = await reconcileHarnessRunState({ repository, run });
        const nextRun = reconciledRun ?? run;
        const [cardsAfterResolution, proposalsAfterResolution, continuityAfterResolution] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listCardContinuityForRun(run.id)
        ]);
        const nextAttentionCandidate = determineHarnessPostOutcomeAction({
          runState: nextRun.state,
          fallbackCardId: updatedCard.id,
          nextDispatchCard: null,
          cards: cardsAfterResolution,
          proposals: proposalsAfterResolution
        });
        const nextAttention =
          nextAttentionCandidate && nextAttentionCandidate.kind !== "dispatch_next_lane"
            ? nextAttentionCandidate
            : null;

        if (currentAttention && (!nextAttention || !isSameAttentionAction(currentAttention.action, nextAttention))) {
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: "cardId" in currentAttention.action ? currentAttention.action.cardId : updatedCard.id,
              eventKind: "attention_resolved",
              payload: {
                actionKind: currentAttention.action.kind,
                runState: currentAttention.action.runState,
                ...(currentAttention.action.kind === "queue_ceo_review"
                  ? { reason: currentAttention.action.reason }
                  : { targetCardId: currentAttention.action.cardId }),
                ...currentAttention.snapshot
              }
            })
          );
        }

        if (
          nextAttention
          && (!currentAttention || !isSameAttentionAction(currentAttention.action, nextAttention))
        ) {
          const describedAttention = describeHarnessPostOutcomeActionKind(nextAttention);
          const nextAttentionTarget =
            nextAttention.kind === "await_lane_resume" || nextAttention.kind === "await_unblock"
              ? cardsAfterResolution.find((card) => card.id === nextAttention.cardId) ?? null
              : null;
          const nextAttentionContinuitySummary =
            nextAttentionTarget
              ? continuityAfterResolution.find((record) => record.cardId === nextAttentionTarget.id)?.continuitySummary
              : null;
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: "cardId" in nextAttention ? nextAttention.cardId : updatedCard.id,
              eventKind: "attention_requested",
              payload: {
                actionKind: nextAttention.kind,
                runState: nextAttention.runState,
                ...(nextAttention.kind === "queue_ceo_review"
                  ? { reason: nextAttention.reason, targetPersona: "ceo" }
                  : { targetCardId: nextAttention.cardId }),
                statusLabel: describedAttention.statusLabel,
                summary: nextAttentionContinuitySummary ?? describedAttention.summary,
                ...(describedAttention.reasonLabel ? { reasonLabel: describedAttention.reasonLabel } : {}),
                ...(nextAttentionTarget
                  ? {
                      targetCardId: nextAttentionTarget.id,
                      targetPersona: nextAttentionTarget.persona,
                      targetTitle: nextAttentionTarget.title
                    }
                  : {})
              }
            })
          );
        }

        const resolvedState = request.command === "resume_lane" ? "working" as const : "approved" as const;
        return {
          tenantId: access.session.tenantId,
          userId: access.session.userId,
          runId: run.id,
          workflowId: run.workflowId,
          cardId: updatedCard.id,
          command: request.command,
          state: resolvedState,
          status: request.command === "resume_lane" ? "resumed" as const : "unblocked" as const,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: request.command === "resume_lane" ? "harness_lane_resumed" : "harness_lane_unblocked",
              entityId: updatedCard.id,
              metadata: {
                runId: run.id,
                persona: updatedCard.persona,
                deliverableType: updatedCard.deliverableType,
                fromState: targetCard.state,
                toState: updatedCard.state,
                hasResumeSummary: Boolean(trimmedResumeSummary)
              }
            }),
            ...toRunAuditEvents({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              runId: run.id,
              previousState: run.state,
              nextRun
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      try {
        await options.onResolvedAttentionDispatch?.({
          tenantId: result.tenantId,
          userId: result.userId,
          runId: result.runId,
          workflowId: result.workflowId,
          cardId: result.cardId,
          command: result.command,
          state: result.state
        });
      } catch (error) {
        console.warn("Resolved harness attention dispatch hook failed after durable board mutation", {
          runId: result.runId,
          workflowId: result.workflowId,
          cardId: result.cardId,
          command: result.command,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
        });
      }
      if (result.status === "resumed") {
        return { status: "resumed", cardId: result.cardId, state: "working" };
      }
      return { status: "unblocked", cardId: result.cardId, state: "approved" };
    },

    async startFreshCycle(request: {
      authorization: string;
      cookie?: string;
      runId: string;
      mode?: HarnessFreshCycleMode;
      resolvedAttention?: HarnessAttentionState;
    }): Promise<{ runId: string; reopenedProposalCount: number }> {
      const access = await authorizeHarnessRequest({
        authenticate: options.authenticate,
        requireTenantMember: options.requireTenantMember,
        requireActivePackageInstall: options.requireActivePackageInstall,
        workflowRegistry: options.workflowRegistry,
        authorization: request.authorization,
        ...(request.cookie ? { cookie: request.cookie } : {})
      });

      if (!options.runAtomically) {
        throw new Error("Harness cycle mutations require atomic execution");
      }

      const result = await options.runAtomically(async (repository) => {
        const run = await repository.getRun(request.runId);
        if (!run || run.tenantId !== access.session.tenantId) {
          throw new ApiAuthError();
        }
        if (run.state !== "assembling" && run.state !== "done") {
          throw new HarnessRunCycleConflictError("Harness fresh cycle can only start from a packaged run");
        }
        const latestRun = await repository.findLatestRunForTenantWorkflow({
          tenantId: run.tenantId,
          workflowId: run.workflowId
        });
        if (!latestRun || latestRun.id !== run.id) {
          throw new HarnessRunCycleConflictError("Harness fresh cycle must start from the latest packaged run");
        }

        const freshCycleMode = request.mode ?? "reopen_deferred";

        const [cards, proposals, decisions] = await Promise.all([
          repository.listCardsForRun(run.id),
          repository.listProposalsForRun(run.id),
          repository.listDecisionsForRun(run.id)
        ]);
        const ceoCard = cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        if (!ceoCard) {
          throw new HarnessRunCycleConflictError("Harness packaged run is missing the CEO card");
        }

        if (request.resolvedAttention?.action.kind === "queue_ceo_review") {
          await repository.insertEvent(
            createHarnessCardEventRecord({
              cardId: ceoCard.id,
              eventKind: "attention_resolved",
              payload: buildResolvedAttentionPayload(request.resolvedAttention)
            })
          );
        }

        const nextRun = await seedFreshHarnessRun({
          repository,
          runtime,
          fromRun: run
        });
        const nextRunCards = await repository.listCardsForRun(nextRun.id);
        const nextRunCeoCard = nextRunCards.find((card) => card.persona === "ceo" && card.parentCardId === null);
        if (!nextRunCeoCard) {
          throw new HarnessRunCycleConflictError("Harness fresh cycle is missing the CEO card");
        }

        const latestDecisionByProposalId = new Map<string, HarnessBoardDecisionRecord>();
        for (const decision of decisions) {
          if (decision.proposalId && !latestDecisionByProposalId.has(decision.proposalId)) {
            latestDecisionByProposalId.set(decision.proposalId, decision);
          }
        }

        const carryForwardProposals =
          freshCycleMode === "clean"
            ? []
            : proposals.filter((proposal) => {
                if (proposal.status !== "deferred") {
                  return false;
                }
                return latestDecisionByProposalId.get(proposal.id)?.policyReason === "completed_lanes_only";
              });

        for (const proposal of carryForwardProposals) {
          await repository.insertProposal({
            id: randomUUID(),
            runId: nextRun.id,
            parentCardId: nextRunCeoCard.id,
            requestedByCardId: nextRunCeoCard.id,
            requestedByPersona: proposal.requestedByPersona,
            persona: proposal.persona,
            title: proposal.title,
            deliverableType: proposal.deliverableType,
            status: "proposed"
          });
        }

        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: ceoCard.id,
            eventKind: "comment_added",
            payload: {
              message:
                freshCycleMode === "clean"
                  ? "CEO started a completely clean board cycle without carrying deferred follow-on requests forward."
                  : carryForwardProposals.length > 0
                    ? `CEO started a fresh board cycle and carried ${carryForwardProposals.length} deferred follow-on request${carryForwardProposals.length === 1 ? "" : "s"} forward.`
                    : "CEO started a fresh board cycle for the next round of board work."
            }
          })
        );
        await repository.insertEvent(
          createHarnessCardEventRecord({
            cardId: nextRunCeoCard.id,
            eventKind: "comment_added",
            payload: {
              message:
                freshCycleMode === "clean"
                  ? "CEO opened a clean board cycle with no carried follow-on work."
                  : carryForwardProposals.length > 0
                    ? `CEO reopened ${carryForwardProposals.length} deferred follow-on request${carryForwardProposals.length === 1 ? "" : "s"} for this new board cycle.`
                    : "CEO opened a fresh board cycle for the next round of work."
            }
          })
        );

        return {
          tenantId: access.session.tenantId,
          userId: access.session.userId,
          runId: nextRun.id,
          workflowId: nextRun.workflowId,
          mode: freshCycleMode,
          reopenedProposalCount: carryForwardProposals.length,
          auditEvents: [
            createHarnessAuditEvent({
              tenantId: access.session.tenantId,
              actorUserId: access.session.userId,
              eventType: "harness_fresh_cycle_started",
              entityId: nextRun.id,
              metadata: {
                previousRunId: run.id,
                previousRunState: run.state,
                mode: freshCycleMode,
                reopenedProposalCount: carryForwardProposals.length
              }
            })
          ]
        };
      });

      await publishHarnessAuditEvents(options.audit, result.auditEvents ?? []);
      try {
        await options.onFreshCycleDispatch?.({
          tenantId: result.tenantId,
          userId: result.userId,
          runId: result.runId,
          workflowId: result.workflowId,
          mode: result.mode,
          reopenedProposalCount: result.reopenedProposalCount
        });
      } catch (error) {
        console.warn("Fresh harness cycle dispatch hook failed after durable board mutation", {
          runId: result.runId,
          workflowId: result.workflowId,
          mode: result.mode,
          reopenedProposalCount: result.reopenedProposalCount,
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) }
        });
      }
      return {
        runId: result.runId,
        reopenedProposalCount: result.reopenedProposalCount
      };
    }
  };
}

async function authorizeHarnessRequest(input: {
  authenticate(input: { authorization: string; cookie?: string }): Promise<ApiSession | null>;
  requireTenantMember(input: { tenantId: string; userId: string }): Promise<void>;
  requireActivePackageInstall(input: { tenantId: string; packageId: string }): Promise<void>;
  workflowRegistry: HarnessWorkflowRegistry;
  authorization: string;
  cookie?: string;
}): Promise<{ session: ApiSession; workflowDefinition: WealthFactoryWorkflowDefinition }> {
  const session = await input.authenticate({
    authorization: input.authorization,
    ...(input.cookie ? { cookie: input.cookie } : {})
  });
  if (!session) {
    throw new ApiAuthError();
  }

  const workflowIds = input.workflowRegistry.listHarnessEligibleWorkflowIds();
  if (workflowIds.length === 0) {
    throw new Error("Harness workflow is not enabled");
  }
  if (workflowIds.length > 1) {
    throw new Error("Harness workflow selector is ambiguous");
  }
  const workflowId = workflowIds[0];
  if (!workflowId) {
    throw new Error("Harness workflow is not enabled");
  }

  const workflowDefinition = input.workflowRegistry.getDefinition(workflowId);
  try {
    await input.requireTenantMember({ tenantId: session.tenantId, userId: session.userId });
    await input.requireActivePackageInstall({
      tenantId: session.tenantId,
      packageId: workflowDefinition.packageId
    });
  } catch (error) {
    if (
      error instanceof TenantMembershipRequiredError ||
      error instanceof ActivePackageInstallRequiredError
    ) {
      throw new ApiAuthError();
    }

    throw error;
  }

  return { session, workflowDefinition };
}

async function getOrCreateCurrentRun(input: {
  repository: HarnessRepository;
  runAtomically?<T>(work: (repository: HarnessRepository) => Promise<T>): Promise<T>;
  runtime: ReturnType<typeof createHarnessRuntime>;
  tenantId: string;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}): Promise<HarnessRunRecord> {
  return (
    (await input.repository.findLatestRunForTenantWorkflow({
      tenantId: input.tenantId,
      workflowId: input.workflowDefinition.publicId
    })) ??
    (await ensureSeededHarnessRun({
      repository: input.repository,
      runtime: input.runtime,
      tenantId: input.tenantId,
      workflowDefinition: input.workflowDefinition,
      ...(input.runAtomically ? { runAtomically: input.runAtomically } : {})
    }))
  );
}

async function ensureSeededHarnessRun(input: {
  repository: HarnessRepository;
  runAtomically?<T>(work: (repository: HarnessRepository) => Promise<T>): Promise<T>;
  runtime: ReturnType<typeof createHarnessRuntime>;
  tenantId: string;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}): Promise<HarnessRunRecord> {
  const seedWork = async (repository: HarnessRepository) => {
    const existing = await repository.findLatestRunForTenantWorkflow({
      tenantId: input.tenantId,
      workflowId: input.workflowDefinition.publicId
    });
    if (existing) {
      return existing;
    }

    return seedHarnessRun({
      repository,
      runtime: input.runtime,
      tenantId: input.tenantId,
      workflowDefinition: input.workflowDefinition
    });
  };

  try {
    if (input.runAtomically) {
      return await input.runAtomically(seedWork);
    }

    return await seedWork(input.repository);
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const existing = await input.repository.findLatestRunForTenantWorkflow({
        tenantId: input.tenantId,
        workflowId: input.workflowDefinition.publicId
      });
      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

async function seedHarnessRun(input: {
  repository: HarnessRepository;
  runtime: ReturnType<typeof createHarnessRuntime>;
  tenantId: string;
  workflowDefinition: WealthFactoryWorkflowDefinition;
}): Promise<HarnessRunRecord> {
  const session = input.runtime.startRun({
    tenantId: input.tenantId,
    workflowId: input.workflowDefinition.publicId,
    packageId: input.workflowDefinition.packageId,
    runtimeContext: {
      providerKind: "openai_api",
      credentialLabel: "Connected provider"
    }
  });

  const run = transitionHarnessRun(session.run, "active");
  const ceoCard = session.ceoCard;
  const cards = [ceoCard];

  await input.repository.insertRun(run);
  for (const card of cards) {
    await input.repository.insertCard(card);
    for (const event of createBootstrapEvents(card)) {
      await input.repository.insertEvent(event);
    }
  }

  return run;
}

async function seedFreshHarnessRun(input: {
  repository: HarnessRepository;
  runtime: ReturnType<typeof createHarnessRuntime>;
  fromRun: HarnessRunRecord;
}): Promise<HarnessRunRecord> {
  const session = input.runtime.startRun({
    tenantId: input.fromRun.tenantId,
    workflowId: input.fromRun.workflowId,
    packageId: input.fromRun.packageId,
    runtimeContext: {
      providerKind: input.fromRun.runtimeContext.providerKind,
      credentialLabel: input.fromRun.runtimeContext.credentialLabel
    }
  });

  const run = transitionHarnessRun(session.run, "active");
  const ceoCard = session.ceoCard;

  await input.repository.insertRun(run);
  await input.repository.insertCard(ceoCard);
  for (const event of createBootstrapEvents(ceoCard)) {
    await input.repository.insertEvent(event);
  }

  return run;
}

function createBootstrapEvents(card: HarnessCardRecord): HarnessCardEventRecord[] {
  const events = [
    createHarnessCardEventRecord({
      cardId: card.id,
      eventKind: "created",
      payload: { title: card.title, persona: card.persona, state: card.state }
    })
  ];

  if (card.state !== "queued") {
    events.push(
      createHarnessCardEventRecord({
        cardId: card.id,
        eventKind: "state_changed",
        payload: { to: card.state }
      })
    );
  }

  return events;
}

async function reconcileHarnessRunState(input: {
  repository: HarnessRepository;
  run: HarnessRunRecord;
}): Promise<HarnessRunRecord | null> {
  if (isTerminalHarnessRunState(input.run.state)) {
    return null;
  }

  const [cards, proposals] = await Promise.all([
    input.repository.listCardsForRun(input.run.id),
    input.repository.listProposalsForRun(input.run.id)
  ]);
  const nextState = deriveHarnessRunState({
    run: input.run,
    cards,
    proposals
  });
  if (nextState === input.run.state) {
    return null;
  }

  const transitionedRun = transitionHarnessRun(input.run, nextState);
  return input.repository.updateRunState({
    runId: input.run.id,
    state: transitionedRun.state
  });
}

function createHarnessAuditEvent(input: {
  tenantId: string;
  actorUserId: string;
  eventType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}): DurableAuditEvent {
  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    entityType: "harness",
    entityId: input.entityId,
    metadata: input.metadata
  };
}

function toRunAuditEvents(input: {
  tenantId: string;
  actorUserId: string;
  runId: string;
  previousState: HarnessRunRecord["state"];
  nextRun: HarnessRunRecord | null;
}): DurableAuditEvent[] {
  if (!input.nextRun || input.nextRun.state === input.previousState) {
    return [];
  }

  return [
    createHarnessAuditEvent({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      eventType: "harness_run_reconciled",
      entityId: input.runId,
      metadata: {
        fromState: input.previousState,
        toState: input.nextRun.state
      }
    })
  ];
}

async function publishHarnessAuditEvents(audit: HarnessAudit | undefined, events: readonly DurableAuditEvent[]) {
  if (!audit || events.length === 0) {
    return;
  }

  for (const event of events) {
    try {
      await audit(event);
    } catch (error) {
      console.warn("Harness audit publish failed after mutation commit", {
        eventType: event.eventType,
        entityId: event.entityId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function findMatchingOpenChildCard(
  cards: readonly HarnessCardRecord[],
  target: { persona: string; title: string; deliverableType: string }
): HarnessCardRecord | undefined {
  return cards.find(
    (card) =>
      card.persona !== "ceo" &&
      isOpenCardState(card.state) &&
      card.persona === target.persona &&
      titlesLikelySameAssignment(card.title, target.title) &&
      card.deliverableType === target.deliverableType
  );
}

function findOpenChildCardByDeliverableType(
  cards: readonly HarnessCardRecord[],
  deliverableType: string
): HarnessCardRecord | undefined {
  return cards.find(
    (card) =>
      card.persona !== "ceo" &&
      isOpenCardState(card.state) &&
      card.deliverableType === deliverableType
  );
}

function findOpenChildCardByPersonaDeliverable(
  cards: readonly HarnessCardRecord[],
  target: { persona: string; deliverableType: string }
): HarnessCardRecord | undefined {
  return cards.find(
    (card) =>
      card.persona !== "ceo" &&
      isOpenCardState(card.state) &&
      card.persona === target.persona &&
      card.deliverableType === target.deliverableType
  );
}

function findLatestDoneChildCardByPersonaDeliverable(
  cards: readonly HarnessCardRecord[],
  target: { persona: string; deliverableType: string }
): HarnessCardRecord | undefined {
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index];
    if (
      card &&
      card.persona !== "ceo" &&
      card.state === "done" &&
      card.persona === target.persona &&
      card.deliverableType === target.deliverableType
    ) {
      return card;
    }
  }

  return undefined;
}

function isBoundedLaneRefinement(input: {
  proposal: HarnessSubCardProposal;
  candidateCard: HarnessCardRecord;
}): boolean {
  return (
    titlesLikelySameAssignment(input.proposal.title, input.candidateCard.title) ||
    input.proposal.parentCardId === input.candidateCard.id ||
    input.proposal.requestedByCardId === input.candidateCard.id
  );
}

function isBoundedCardRefinement(input: {
  title: string;
  candidateCard: HarnessCardRecord;
}): boolean {
  return titlesLikelySameAssignment(input.title, input.candidateCard.title);
}

function titlesLikelySameAssignment(left: string, right: string): boolean {
  const leftTokens = tokenizeAssignmentTitle(left);
  const rightTokens = tokenizeAssignmentTitle(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }

  const leftCanonical = leftTokens.join(" ");
  const rightCanonical = rightTokens.join(" ");
  if (leftCanonical === rightCanonical) {
    return true;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const overlapCount = [...leftSet].filter((token) => rightSet.has(token)).length;
  const overlapRatio = overlapCount / Math.max(leftSet.size, rightSet.size);
  const firstTokenMatches = leftTokens[0] === rightTokens[0];
  const lastTokenMatches = leftTokens.at(-1) === rightTokens.at(-1);

  return Math.min(leftSet.size, rightSet.size) >= 3 && overlapRatio >= 0.75 && (firstTokenMatches || lastTokenMatches);
}

function tokenizeAssignmentTitle(title: string): string[] {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => normalizeAssignmentToken(token))
    .filter((token) => token.length > 0);
}

function normalizeAssignmentToken(token: string): string {
  if (token.endsWith("ing") && token.length > 5) {
    return token.slice(0, -3);
  }
  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && token.length > 4) {
    return token.slice(0, -1);
  }
  return token;
}

function findEarlierUnresolvedSiblingProposal(
  proposals: readonly HarnessSubCardProposal[],
  currentProposal: HarnessSubCardProposal
): HarnessSubCardProposal | null {
  const currentIndex = proposals.findIndex((proposal) => proposal.id === currentProposal.id);
  if (currentIndex <= 0) {
    return null;
  }

  const earlierProposals = proposals.slice(0, currentIndex);
  for (let index = earlierProposals.length - 1; index >= 0; index -= 1) {
    const proposal = earlierProposals[index];
    if (!proposal) {
      continue;
    }

    if (
      proposal.requestedByCardId === currentProposal.requestedByCardId &&
      proposal.persona === currentProposal.persona &&
      titlesLikelySameAssignment(proposal.title, currentProposal.title) &&
      proposal.deliverableType === currentProposal.deliverableType &&
      (proposal.status === "proposed" || proposal.status === "deferred")
    ) {
      return proposal;
    }
  }

  return null;
}

function findLatestUnresolvedTopLevelProposalForAssignment(
  proposals: readonly HarnessSubCardProposal[],
  target: { ceoCardId: string; persona: string; title: string; deliverableType: string }
): HarnessSubCardProposal | null {
  for (let index = proposals.length - 1; index >= 0; index -= 1) {
    const proposal = proposals[index];
    if (!proposal) {
      continue;
    }

    if (
      proposal.parentCardId === target.ceoCardId &&
      proposal.requestedByCardId === target.ceoCardId &&
      proposal.persona === target.persona &&
      proposal.deliverableType === target.deliverableType &&
      titlesLikelySameAssignment(proposal.title, target.title) &&
      (proposal.status === "proposed" || proposal.status === "deferred")
    ) {
      return proposal;
    }
  }

  return null;
}

function countOpenChildCards(cards: readonly HarnessCardRecord[]): number {
  return cards.filter((card) => card.persona !== "ceo" && isOpenCardState(card.state)).length;
}

function isOpenCardState(state: HarnessCardRecord["state"]): boolean {
  return state !== "done" && state !== "cancelled";
}

async function recordAbsorbedLaneContinuity(input: {
  repository: HarnessRepository;
  card: HarnessCardRecord;
  proposal: HarnessSubCardProposal;
  resolution: "update_existing_lane" | "handoff_existing_lane";
  continuitySourcePersona?: string;
  continuitySourceTitle?: string;
}): Promise<void> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  const absorbedWorkItem = createContinuityAbsorbedWorkItem({
    resolution: input.resolution,
    requestedByPersona: input.continuitySourcePersona ?? input.proposal.requestedByPersona,
    title: input.continuitySourceTitle ?? input.proposal.title
  });
  const absorbedWorkItems = mergeContinuityAbsorbedWorkItems(existing?.absorbedWorkItems ?? [], absorbedWorkItem);

  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: input.card.id,
      runId: input.card.runId,
      continuitySource: input.resolution === "handoff_existing_lane" ? "lane_handoff" : "proposal_absorbed",
      latestResultSummary: existing?.latestResultSummary ?? null,
      continuitySummary: createAbsorbedLaneResumeSummary({
        card: input.card,
        absorbedWorkItem,
        resolution: input.resolution
      }),
      absorbedWorkItems
    })
  );
}

async function recordDirectChildLaneReuseContinuity(input: {
  repository: HarnessRepository;
  card: HarnessCardRecord;
  title: string;
}): Promise<void> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  const absorbedWorkItem = createContinuityAbsorbedWorkItem({
    resolution: "update_existing_lane",
    requestedByPersona: "ceo",
    title: input.title
  });
  const absorbedWorkItems = mergeContinuityAbsorbedWorkItems(existing?.absorbedWorkItems ?? [], absorbedWorkItem);

  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: input.card.id,
      runId: input.card.runId,
      continuitySource: "proposal_absorbed",
      latestResultSummary: existing?.latestResultSummary ?? null,
      continuitySummary: createAbsorbedLaneResumeSummary({
        card: input.card,
        absorbedWorkItem,
        resolution: "update_existing_lane"
      }),
      absorbedWorkItems
    })
  );
}

async function recordCardStateContinuity(input: {
  repository: HarnessRepository;
  card: HarnessCardRecord;
  resumeSummary?: string;
}): Promise<void> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: input.card.id,
      runId: input.card.runId,
      continuitySource: input.resumeSummary ? "resume_override" : "state_transition",
      continuitySummary: input.resumeSummary ?? createDefaultResumeSummary(input.card),
      latestResultSummary: existing?.latestResultSummary ?? null,
      absorbedWorkItems: existing?.absorbedWorkItems ?? []
    })
  );
}

async function recordLatestResultContinuity(input: {
  repository: HarnessRepository;
  card: HarnessCardRecord;
  resultSummary: string;
  resumeSummary?: string;
}): Promise<void> {
  const existing = await input.repository.getCardContinuity(input.card.id);
  await input.repository.upsertCardContinuity(
    createHarnessCardContinuityRecord({
      cardId: input.card.id,
      runId: input.card.runId,
      continuitySource: "result_recorded",
      continuitySummary: input.resumeSummary ?? createDefaultResumeSummary(input.card),
      latestResultSummary: input.resultSummary,
      absorbedWorkItems: existing?.absorbedWorkItems ?? []
    })
  );
}

function buildHarnessBoardResponse(input: {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  continuity: readonly HarnessCardContinuityRecord[];
  events: readonly HarnessCardEventRecord[];
  decisions: readonly HarnessBoardDecisionRecord[];
  proposals: readonly HarnessSubCardProposal[];
}): HarnessBoardResponse {
  const eventsByCardId = new Map<string, HarnessCardEventRecord[]>();
  const activityByCardId = new Map<string, HarnessBoardActivityItem[]>();
  const latestResultSummaryByCardId = new Map<string, string>();
  for (const event of input.events) {
    const cardEvents = eventsByCardId.get(event.cardId) ?? [];
    eventsByCardId.set(event.cardId, [...cardEvents, event]);
    const items = activityByCardId.get(event.cardId) ?? [];
    activityByCardId.set(event.cardId, [...items, toBoardActivityItem(event)]);
    if (event.eventKind === "result_recorded") {
      const summary = readOptionalString(event.payload.summary);
      if (summary) {
        latestResultSummaryByCardId.set(event.cardId, summary);
      }
    }
  }
  const continuityByCardId = new Map<string, HarnessCardContinuityRecord>();
  for (const record of input.continuity) {
    continuityByCardId.set(record.cardId, record);
    if (record.latestResultSummary) {
      latestResultSummaryByCardId.set(record.cardId, record.latestResultSummary);
    }
  }

  const cards = input.cards.map((card) =>
    toBoardCardView({
      card,
      cardEvents: eventsByCardId.get(card.id) ?? [],
      activity: activityByCardId.get(card.id) ?? [],
      continuity: continuityByCardId.get(card.id) ?? null,
      ...(latestResultSummaryByCardId.has(card.id)
        ? { resultSummary: latestResultSummaryByCardId.get(card.id)! }
        : {})
    })
  );

  const columns = createBoardColumns(cards);
  const completionPackage = buildCompletionPackage({
    run: input.run,
    cards: input.cards,
    latestResultSummaryByCardId,
    proposals: input.proposals,
    decisions: input.decisions
  });
  const recentDecisions = input.decisions.slice(0, 8).map(toRecentDecisionView);
  const followThroughItems = input.decisions
    .filter(isFollowThroughDecision)
    .slice(0, 8)
    .map(toFollowThroughView);
  const pendingAttention = buildPendingAttentionView({
    run: input.run,
    cards: input.cards,
    continuityByCardId,
    proposals: input.proposals,
    events: input.events
  });
  const latestDecisionByProposalId = new Map<string, HarnessBoardDecisionRecord>();
  for (const decision of input.decisions) {
    if (decision.proposalId && !latestDecisionByProposalId.has(decision.proposalId)) {
      latestDecisionByProposalId.set(decision.proposalId, decision);
    }
  }

  return {
    runId: input.run.id,
    workflowId: input.run.workflowId,
    packageId: input.run.packageId,
    columns,
    cards,
    pendingApprovals: input.proposals
      .filter((proposal) => proposal.status === "proposed" || proposal.status === "deferred")
      .map((proposal) => {
        const policyView = toPendingApprovalPolicyView({
          cards: input.cards,
          proposal,
          latestDecision: latestDecisionByProposalId.get(proposal.id) ?? null
        });

        return {
          id: proposal.id,
          title: proposal.title,
          requestedByPersona: proposal.requestedByPersona.toUpperCase(),
          targetPersona: proposal.persona.toUpperCase(),
          deliverableLabel: humanizeDeliverableType(proposal.deliverableType),
          statusLabel: proposal.status === "deferred" ? "Deferred for later CEO review" : "Pending CEO approval",
          actionRoute: "proposal-decision",
          actionPath: `/api/harness/proposals/${encodeURIComponent(proposal.id)}/decision`,
          actionMethod: "POST" as const,
          actionLabel: "Review proposal decision",
          actionDescription: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
          requestFields: buildPendingApprovalRequestFields(policyView.handoffTargetCardId),
          actionOptions: buildPendingApprovalActionOptions(policyView),
          ...(proposal.status === "proposed" ? { recommendedOptionValue: "approve" as const } : {}),
          allowedDecisions: ["approve", "defer", "deny"],
          ...(policyView.handoffTargetPersona && policyView.handoffTargetTitle
            ? {
                targetSummary: `Reuse ${policyView.handoffTargetPersona} lane: ${policyView.handoffTargetTitle}`
              }
            : {}),
          ...policyView
        };
      }),
    ...(pendingAttention ? { pendingAttention } : {}),
    recentDecisions,
    followThroughItems,
    ...(completionPackage ? { completionPackage } : {})
  };
}

function toBoardActivityItem(event: HarnessCardEventRecord): HarnessBoardActivityItem {
  const payloadTitle = readOptionalString(event.payload.title);
  const payloadState = readOptionalString(event.payload.to) ?? readOptionalString(event.payload.state);
  const payloadSummary = readOptionalString(event.payload.summary);
  const payloadMessage = readOptionalString(event.payload.message);
  const payloadRequestedTitle = readOptionalString(event.payload.requestedTitle);
  const payloadRequestedByPersona = readOptionalString(event.payload.requestedByPersona);
  const payloadFromPersona = readOptionalString(event.payload.fromPersona);
  const payloadToPersona = readOptionalString(event.payload.toPersona);
  const payloadActionKind = readOptionalString(event.payload.actionKind);
  const payloadAttentionReason = readOptionalString(event.payload.reason);
  const attentionSnapshot = parseHarnessAttentionSnapshot(event.payload);
  const labelByKind: Record<HarnessCardEventRecord["eventKind"], string> = {
    created: `${payloadTitle ?? "Card"} was opened for this persona lane.`,
    state_changed: `Lane status moved to ${humanizeLabel(payloadState ?? "updated")}.`,
    comment_added: payloadMessage ?? "A new progress note was added to this lane.",
    subcard_proposed: "A supporting sub-card was proposed for CEO review.",
    proposal_absorbed:
      payloadRequestedTitle && payloadRequestedByPersona
        ? `${payloadRequestedByPersona.toUpperCase()} folded "${payloadRequestedTitle}" into this active lane.`
        : "The CEO folded a supporting request into this active lane.",
    lane_handed_off:
      payloadFromPersona && payloadToPersona
        ? `CEO handed this lane from ${payloadFromPersona.toUpperCase()} to ${payloadToPersona.toUpperCase()}.`
        : "CEO handed this active lane to a new persona owner.",
    attention_requested:
      attentionSnapshot
        ? formatAttentionActivityLabel({
            kind: "attention_requested",
            snapshot: attentionSnapshot
          })
        : describeAttentionRequestedActivity({
            actionKind: payloadActionKind,
            reason: payloadAttentionReason
          }),
    attention_resolved:
      attentionSnapshot
        ? formatAttentionActivityLabel({
            kind: "attention_resolved",
            snapshot: attentionSnapshot
          })
        : describeAttentionResolvedActivity({
            actionKind: payloadActionKind,
            reason: payloadAttentionReason
          }),
    result_recorded: payloadSummary
      ? `A new outcome snapshot was recorded for this lane: ${payloadSummary}`
      : "A new outcome snapshot was recorded for this lane."
  };

  return {
    id: event.id,
    label: labelByKind[event.eventKind],
    timestampLabel: formatBoardTimestamp(event.createdAt)
  };
}

function buildResolvedAttentionPayload(attention: HarnessAttentionState): Record<string, unknown> {
  return {
    actionKind: attention.action.kind,
    runState: attention.action.runState,
    ...(attention.action.kind === "queue_ceo_review"
      ? { reason: attention.action.reason }
      : { targetCardId: attention.action.cardId }),
    ...attention.snapshot
  };
}

function buildDerivedAttentionState(
  action: Exclude<HarnessPostOutcomeAction, { kind: "dispatch_next_lane" }>
): HarnessAttentionState {
  const described = describeHarnessPostOutcomeActionKind(action);
  return {
    action,
    requestedAt: new Date().toISOString(),
    snapshot: {
      statusLabel: described.statusLabel,
      summary: described.summary,
      ...(described.reasonLabel ? { reasonLabel: described.reasonLabel } : {})
    }
  };
}

function buildPendingAttentionView(input: {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  continuityByCardId: ReadonlyMap<string, HarnessCardContinuityRecord>;
  proposals: readonly HarnessSubCardProposal[];
  events: readonly HarnessCardEventRecord[];
}): HarnessPendingAttentionView | null {
  const action = determineHarnessPostOutcomeAction({
    runState: input.run.state,
    cards: input.cards,
    proposals: input.proposals,
    nextDispatchCard: null
  });
  if (!action || action.kind === "dispatch_next_lane") {
    return null;
  }

  const described = describeHarnessPostOutcomeActionKind(action);
  const currentAttention = deriveCurrentHarnessAttentionState(input.events);
  const persistedSnapshot =
    currentAttention && isSameAttentionAction(currentAttention.action, action)
      ? currentAttention.snapshot
      : null;
  const targetCard = "cardId" in action
    ? input.cards.find((card) => card.id === action.cardId) ?? null
    : null;
  const continuitySummary =
    targetCard ? input.continuityByCardId.get(targetCard.id)?.continuitySummary ?? null : null;
  const attentionReasonLabel = persistedSnapshot?.reasonLabel ?? described.reasonLabel;
  const attentionTargetCardId = persistedSnapshot?.targetCardId ?? targetCard?.id;
  const attentionTargetPersona = persistedSnapshot?.targetPersona ?? (targetCard ? targetCard.persona.toUpperCase() : undefined);
  const attentionTargetTitle = persistedSnapshot?.targetTitle ?? targetCard?.title;
  const pendingApprovalCount = input.proposals.filter(
    (proposal) => proposal.status === "proposed" || proposal.status === "deferred"
  ).length;

  return {
    kind: action.kind,
    runState: action.runState,
    statusLabel: persistedSnapshot?.statusLabel ?? described.statusLabel,
    summary: persistedSnapshot?.summary ?? continuitySummary ?? described.summary,
    ...(action.kind === "queue_ceo_review"
      ? (action.runState === "assembling"
          ? {
              actionRoute: "review-attention" as const,
              actionPath: `/api/harness/runs/${encodeURIComponent(input.run.id)}/review-attention`,
              actionMethod: "POST" as const,
              actionLabel: "Review final assembly",
              actionDescription: "Finish the current board cycle or intentionally start the next one.",
              requestFields: [
                {
                  name: "decision",
                  label: "Review decision",
                  description: "Choose whether to close the current board cycle or start the next one.",
                  required: true,
                  allowedValues: ["complete_run", "start_fresh_cycle"]
                },
                {
                  name: "completionSummary",
                  label: "Completion summary",
                  description: "Optional tenant-facing summary to package with the completed run.",
                  required: false,
                  requiredWhenValue: "complete_run"
                },
                {
                  name: "mode",
                  label: "Fresh-cycle mode",
                  description: "Choose whether the next cycle should reopen deferred work or start clean.",
                  required: false,
                  supportedWhenValue: "start_fresh_cycle",
                  allowedValues: ["reopen_deferred", "clean"]
                }
              ] satisfies HarnessActionRequestFieldView[],
              actionOptions: [
                {
                  value: "complete_run",
                  label: "Complete run",
                  description: "Close the current board cycle and package the current business outcome.",
                  emphasis: "primary",
                  nextEffectSummary: "The current run closes as done and the tenant-facing package stays on this board cycle.",
                  exampleRequest: {
                    decision: "complete_run"
                  }
                },
                {
                  value: "start_fresh_cycle",
                  label: "Start fresh cycle",
                  description: "Open the next board cycle from this run, with or without reopening deferred work.",
                  emphasis: "secondary",
                  nextEffectSummary: "A new run starts from this board, optionally carrying deferred follow-on work into the next cycle.",
                  requiresConfirmation: true,
                  confirmationLabel: "Start a new board cycle from this run?",
                  exampleRequest: {
                    decision: "start_fresh_cycle",
                    mode: "reopen_deferred"
                  }
                }
              ] satisfies HarnessActionOptionView[],
              recommendedOptionValue: "complete_run" as const,
              allowedDecisions: ["complete_run", "start_fresh_cycle"] as HarnessAttentionReviewDecision[]
            }
          : {
              actionRoute: "pending-approvals" as const,
              actionLabel: "Review pending approvals",
              actionDescription: "Open the proposal review queue to clear governance backlog before more work starts.",
              pendingApprovalCount
            })
      : {
          actionRoute: "resolve-attention" as const,
          actionPath: `/api/harness/runs/${encodeURIComponent(input.run.id)}/resolve-attention`,
          actionMethod: "POST" as const,
          actionLabel: action.kind === "await_lane_resume" ? "Resume lane" : "Unblock lane",
          actionDescription:
            action.kind === "await_lane_resume"
              ? "Resume the waiting lane when the required board input is ready."
              : "Clear the blocked lane when the missing dependency has been resolved.",
          requestFields: [
            {
              name: "command",
              label: "Resolution command",
              description: "Choose the single bounded command that resolves this attention state.",
              required: true,
              allowedValues: [action.kind === "await_lane_resume" ? "resume_lane" : "unblock_lane"]
            },
            {
              name: "resumeSummary",
              label: action.kind === "await_lane_resume" ? "Resume summary" : "Unblock summary",
              description: "Optional tenant-safe note describing what changed before execution resumes.",
              required: false
            }
          ] satisfies HarnessActionRequestFieldView[],
          actionOptions: [
            {
              value: action.kind === "await_lane_resume" ? "resume_lane" : "unblock_lane",
              label: action.kind === "await_lane_resume" ? "Resume lane" : "Unblock lane",
              description:
                action.kind === "await_lane_resume"
                  ? "Return the lane to active execution with an optional bounded resume note."
                  : "Move the lane out of its blocked state so execution can continue.",
              emphasis: "primary",
              nextEffectSummary:
                action.kind === "await_lane_resume"
                  ? "The lane returns to active execution and re-enters the worker queue through the existing harness path."
                  : "The lane leaves its blocked state and re-enters the worker queue through the existing harness path.",
              exampleRequest:
                action.kind === "await_lane_resume"
                  ? { command: "resume_lane" }
                  : { command: "unblock_lane" }
            }
          ] satisfies HarnessActionOptionView[],
          recommendedOptionValue: action.kind === "await_lane_resume" ? "resume_lane" : "unblock_lane",
          allowedCommands: [action.kind === "await_lane_resume" ? "resume_lane" : "unblock_lane"] as HarnessAttentionResolutionCommand[]
        }),
    ...(currentAttention && isSameAttentionAction(currentAttention.action, action)
      ? { requestedAtLabel: formatBoardTimestamp(currentAttention.requestedAt) }
      : {}),
    ...(attentionReasonLabel
      ? { reasonLabel: attentionReasonLabel }
      : {}),
    ...(attentionTargetCardId
      ? {
          targetCardId: attentionTargetCardId,
          ...(attentionTargetPersona
            ? { targetPersona: attentionTargetPersona }
            : {}),
          ...(attentionTargetTitle
            ? { targetTitle: attentionTargetTitle }
            : {}),
          ...(attentionTargetPersona && attentionTargetTitle
            ? {
                targetSummary:
                  action.kind === "await_lane_resume"
                    ? `Resume ${attentionTargetPersona} lane: ${attentionTargetTitle}`
                    : `Unblock ${attentionTargetPersona} lane: ${attentionTargetTitle}`
              }
            : {})
        }
      : {})
  };
}

function buildPendingApprovalRequestFields(handoffTargetCardId?: string): HarnessActionRequestFieldView[] {
  const fields: HarnessActionRequestFieldView[] = [
    {
      name: "decision",
      label: "Proposal decision",
      description: "Choose whether this proposed follow-on work should be approved, deferred, or denied.",
      required: true,
      allowedValues: ["approve", "defer", "deny"]
    },
    {
      name: "decisionNote",
      label: "Decision note",
      description: "Optional bounded note explaining the decision or what should change before review resumes.",
      required: false
    }
  ];

  if (handoffTargetCardId) {
    fields.push({
      name: "targetCardId",
      label: "Handoff target lane",
      description: "Optional existing lane to reuse when approval should fold this work into an active owner-conflict handoff.",
      required: false,
      supportedWhenValue: "approve",
      suggestedValue: handoffTargetCardId
    });
  }

  return fields;
}

function buildPendingApprovalActionOptions(input: {
  handoffTargetCardId?: string;
  handoffTargetPersona?: string;
  handoffTargetTitle?: string;
}): HarnessActionOptionView[] {
  return [
    {
      value: "approve",
      label: "Approve proposal",
      description: input.handoffTargetCardId
        ? `Approve this work and optionally fold it into ${input.handoffTargetPersona ?? "the existing"} lane${input.handoffTargetTitle ? ` (${input.handoffTargetTitle})` : ""}.`
        : "Approve this work so it can move into the bounded execution flow.",
      emphasis: "primary",
      nextEffectSummary: input.handoffTargetCardId
        ? `This proposal can move forward by reusing the existing lane instead of opening a duplicate card.`
        : "This proposal can move into the bounded execution flow and open or advance the intended lane.",
      exampleRequest: input.handoffTargetCardId
        ? {
            decision: "approve",
            targetCardId: input.handoffTargetCardId
          }
        : {
            decision: "approve"
          }
    },
    {
      value: "defer",
      label: "Defer proposal",
      description: "Pause this follow-on work without dropping it so the CEO can revisit it later.",
      emphasis: "secondary",
      nextEffectSummary: "This proposal stays visible in the pending-approval queue for later CEO review.",
      exampleRequest: {
        decision: "defer"
      }
    },
    {
      value: "deny",
      label: "Deny proposal",
      description: "Reject this follow-on work when it should not expand the current board cycle.",
      emphasis: "caution",
      nextEffectSummary: "This proposal closes without opening or advancing any new work lane.",
      requiresConfirmation: true,
      confirmationLabel: "Deny this proposal and close the follow-on request?",
      exampleRequest: {
        decision: "deny"
      }
    }
  ];
}

function formatAttentionActivityLabel(input: {
  kind: "attention_requested" | "attention_resolved";
  snapshot: {
    statusLabel: string;
    summary: string;
    reasonLabel?: string;
  };
}): string {
  const status = input.snapshot.reasonLabel
    ? `${input.snapshot.statusLabel} (${input.snapshot.reasonLabel})`
    : input.snapshot.statusLabel;
  if (input.kind === "attention_requested") {
    return `${status}: ${input.snapshot.summary}`;
  }
  return `${status} resolved: ${input.snapshot.summary}`;
}

function describeAttentionRequestedActivity(input: {
  actionKind: string | undefined;
  reason: string | undefined;
}): string {
  switch (input.actionKind) {
    case "queue_ceo_review":
      if (input.reason === "final_assembly") {
        return "Board attention is now waiting on CEO final assembly review.";
      }
      if (input.reason === "governance_backlog") {
        return "Board attention is now waiting on CEO governance backlog review.";
      }
      if (input.reason === "governance_hold") {
        return "Board attention is now waiting on CEO governance-hold review.";
      }
      return "Board attention is now waiting on CEO review.";
    case "await_lane_resume":
      return "Board attention is now waiting on a lane resume decision.";
    case "await_unblock":
      return "Board attention is now waiting on a lane unblock decision.";
    default:
      return "Board attention is waiting on the next bounded orchestration step.";
  }
}

function describeAttentionResolvedActivity(input: {
  actionKind: string | undefined;
  reason: string | undefined;
}): string {
  switch (input.actionKind) {
    case "queue_ceo_review":
      if (input.reason === "final_assembly") {
        return "Board attention no longer needs CEO final assembly review.";
      }
      if (input.reason === "governance_backlog") {
        return "Board attention no longer needs CEO governance backlog review.";
      }
      if (input.reason === "governance_hold") {
        return "Board attention no longer needs CEO governance-hold review.";
      }
      return "Board attention no longer needs CEO review.";
    case "await_lane_resume":
      return "Board attention no longer needs a lane resume decision.";
    case "await_unblock":
      return "Board attention no longer needs a lane unblock decision.";
    default:
      return "Board attention has moved past the prior orchestration hold.";
  }
}

function toBoardCardView(input: {
  card: HarnessCardRecord;
  cardEvents: readonly HarnessCardEventRecord[];
  activity: readonly HarnessBoardActivityItem[];
  continuity: HarnessCardContinuityRecord | null;
  resultSummary?: string;
}): HarnessBoardCardView {
  const personaLabel = input.card.persona.toUpperCase();
  const lane = mapCardStateToLane(input.card.state);
  const deliverableLabel = humanizeDeliverableType(input.card.deliverableType);
  const activity = input.activity.length > 0 ? [...input.activity] : [defaultActivityForCard(input.card)];
  const absorbedWorkItems = input.continuity?.absorbedWorkItems.length
    ? input.continuity.absorbedWorkItems.map((item) => parseContinuityAbsorbedWorkItem(item).label)
    : extractAbsorbedWorkItems(input.cardEvents);
  const detailSections: HarnessBoardDetailSection[] = [
    {
      id: "snapshot",
      title: "Snapshot",
      body: describeContinuitySnapshot(input.card, input.continuity)
    }
  ];
  if (input.resultSummary) {
    detailSections.push({
      id: "latest-outcome",
      title: "Latest Outcome",
      body: input.resultSummary
    });
  }
  if (absorbedWorkItems.length > 0) {
    detailSections.push({
      id: "absorbed-work",
      title: "Absorbed Work",
      body: absorbedWorkItems.map((item) => `- ${item}`).join("\n")
    });
  }

  return {
    id: input.card.id,
    persona: personaLabel,
    title: input.card.title,
    summary: `${personaLabel} is moving this deliverable forward inside a bounded assignment lane.`,
    lane,
    statusLabel: humanizeLabel(input.card.state),
    priorityLabel: input.card.persona === "ceo" ? "High priority" : lane === "done" ? "Ready" : "Active",
    deliverableLabel,
    updatedAtLabel: `Updated ${formatBoardTimestamp(input.card.updatedAt)}`,
    outcome: describeCardOutcome(input.card, input.resultSummary),
    focusPoints: [
      "Keep the tenant-facing update concise",
      "Advance the deliverable without backend noise",
      "Respect the package boundary before expanding scope"
    ],
    activity,
    detailSections
  };
}

function buildCompletionPackage(input: {
  run: HarnessRunRecord;
  cards: readonly HarnessCardRecord[];
  latestResultSummaryByCardId: ReadonlyMap<string, string>;
  proposals: readonly HarnessSubCardProposal[];
  decisions: readonly HarnessBoardDecisionRecord[];
}): HarnessCompletionPackageView | undefined {
  if (input.run.state !== "assembling" && input.run.state !== "done") {
    return undefined;
  }

  const deliverables = input.cards
    .filter((card) => card.persona !== "ceo" && card.state === "done")
    .map((card) => ({
      cardId: card.id,
      persona: card.persona.toUpperCase(),
      title: card.title,
      deliverableLabel: humanizeDeliverableType(card.deliverableType),
      outcome: describeCardOutcome(card, input.latestResultSummaryByCardId.get(card.id))
    }));

  if (deliverables.length === 0) {
    return undefined;
  }

  const ceoCard = input.cards.find((card) => card.persona === "ceo" && card.parentCardId === null);
  const summary = ceoCard ? input.latestResultSummaryByCardId.get(ceoCard.id) : undefined;
  const latestDecisionByProposalId = new Map<string, HarnessBoardDecisionRecord>();
  for (const decision of input.decisions) {
    if (decision.proposalId && !latestDecisionByProposalId.has(decision.proposalId)) {
      latestDecisionByProposalId.set(decision.proposalId, decision);
    }
  }
  const latestRunCompletedDecision = input.decisions.find((decision) => decision.decisionKind === "run_completed") ?? null;
  const deferredApprovalCount = input.proposals.filter((proposal) => proposal.status === "deferred").length;
  const deniedApprovalCount = input.proposals.filter((proposal) => proposal.status === "denied").length;
  const governanceEntries = input.proposals
    .filter((proposal) => proposal.status === "deferred" || proposal.status === "denied")
    .map((proposal) => {
      const latestDecision = latestDecisionByProposalId.get(proposal.id) ?? null;
      return {
        proposalId: proposal.id,
        status: proposal.status,
        createdAt: latestDecision?.createdAt ?? "",
        item: {
          proposalId: proposal.id,
          statusLabel:
            proposal.status === "deferred" ? "Deferred for later CEO review" : "Denied by the CEO",
          persona: proposal.persona.toUpperCase(),
          deliverableLabel: humanizeDeliverableType(proposal.deliverableType),
          ...(latestDecision?.policyReason ? { policyReasonLabel: humanizePolicyReason(latestDecision.policyReason) } : {}),
          ...(latestDecision?.recommendationSummary
            ? { recommendationSummary: latestDecision.recommendationSummary }
            : {}),
          ...(latestDecision?.objectionSummary ? { objectionSummary: latestDecision.objectionSummary } : {}),
          ...(proposal.status === "deferred"
            ? { nextReviewTrigger: describeNextReviewTrigger(latestDecision?.policyReason ?? null) }
            : {})
        }
      };
    })
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "deferred" ? -1 : 1;
      }
      return right.createdAt.localeCompare(left.createdAt);
    });
  const governanceItems = governanceEntries.map((entry) => entry.item).slice(0, 6);
  const recommendations = [
    ...(latestRunCompletedDecision?.recommendationSummary ? [latestRunCompletedDecision.recommendationSummary] : []),
    ...governanceEntries
      .map((entry) => entry.item.recommendationSummary ?? null)
      .filter((summary): summary is string => Boolean(summary))
  ]
    .filter((summary, index, values) => values.indexOf(summary) === index)
    .slice(0, 4);
  const objections = governanceEntries
    .map((entry) => entry.item.objectionSummary ?? null)
    .filter((summary): summary is string => Boolean(summary))
    .filter((summary, index, values) => values.indexOf(summary) === index)
    .slice(0, 4);
  const hasOpenGovernanceItems = governanceEntries.length > 0;
  const packageNote = buildCompletionPackageNote({
    deferredApprovalCount,
    deniedApprovalCount,
    recommendationCount: recommendations.length,
    objectionCount: objections.length
  });

  return {
    status: input.run.state,
    ...(summary ? { summary } : {}),
    deferredApprovalCount,
    hasOpenGovernanceItems,
    ...(packageNote ? { packageNote } : {}),
    recommendations,
    objections,
    governanceItems,
    deliverables
  };
}

function createBoardColumns(cards: readonly HarnessBoardCardView[]): HarnessBoardColumnView[] {
  const laneOrder = [
    { id: "planning", title: "Planning", description: "Work being shaped by the orchestrator." },
    { id: "working", title: "Working", description: "Active persona lanes moving the run forward." },
    { id: "waiting", title: "Waiting", description: "Lanes paused on a dependency or decision." },
    { id: "blocked", title: "Blocked", description: "Visible blockers that need resolution before progress continues." },
    { id: "done", title: "Done", description: "Completed outputs ready for review." }
  ] as const;

  return laneOrder.map((lane) => ({
    id: lane.id,
    title: lane.title,
    description: lane.description,
    cardIds: cards.filter((card) => card.lane === lane.id).map((card) => card.id)
  }));
}

function mapCardStateToLane(state: HarnessCardRecord["state"]): string {
  switch (state) {
    case "queued":
    case "planning":
    case "approved":
      return "planning";
    case "working":
      return "working";
    case "waiting":
      return "waiting";
    case "blocked":
    case "cancelled":
      return "blocked";
    case "done":
      return "done";
    default:
      return "planning";
  }
}

function describeCardOutcome(card: HarnessCardRecord, resultSummary?: string): string {
  if (resultSummary) {
    return resultSummary;
  }
  const deliverable = humanizeDeliverableType(card.deliverableType).toLowerCase();
  if (card.state === "done") {
    return `This ${deliverable} is packaged and ready for the tenant-facing next step.`;
  }
  if (card.state === "working") {
    return `This ${deliverable} is actively being advanced in the current persona lane.`;
  }
  if (card.state === "waiting") {
    return `This ${deliverable} is paused on a dependency while preserving its bounded scope.`;
  }
  if (card.state === "blocked" || card.state === "cancelled") {
    return `This ${deliverable} is blocked and needs a deliberate unblock before more work starts.`;
  }
  return `This ${deliverable} is being shaped into the next clean business-facing move.`;
}

function defaultActivityForCard(card: HarnessCardRecord): HarnessBoardActivityItem {
  return {
    id: `${card.id}-default-activity`,
    label: `${card.persona.toUpperCase()} is maintaining this lane inside the approved workflow boundary.`,
    timestampLabel: formatBoardTimestamp(card.updatedAt)
  };
}

function extractAbsorbedWorkItems(events: readonly HarnessCardEventRecord[]): string[] {
  return events
    .filter((event) => event.eventKind === "proposal_absorbed")
    .map((event) => {
      const requestedTitle = readOptionalString(event.payload.requestedTitle) ?? "follow-on work";
      const requestedByPersona = readOptionalString(event.payload.requestedByPersona)?.toUpperCase() ?? "A BOARD PERSONA";
      return `${requestedByPersona}: ${requestedTitle}`;
    });
}

const CONTINUITY_HANDOFF_PREFIX = "handoff_existing_lane|";
const CONTINUITY_UPDATE_PREFIX = "update_existing_lane|";

function createContinuityAbsorbedWorkItem(input: {
  resolution: "update_existing_lane" | "handoff_existing_lane";
  requestedByPersona: string;
  title: string;
}): string {
  const label = `${input.requestedByPersona.toUpperCase()}: ${input.title}`;
  const prefix = input.resolution === "handoff_existing_lane" ? CONTINUITY_HANDOFF_PREFIX : CONTINUITY_UPDATE_PREFIX;
  return `${prefix}${label}`;
}

function parseContinuityAbsorbedWorkItem(value: string): {
  resolution: "update_existing_lane" | "handoff_existing_lane";
  label: string;
} {
  if (value.startsWith(CONTINUITY_HANDOFF_PREFIX)) {
    return {
      resolution: "handoff_existing_lane",
      label: value.slice(CONTINUITY_HANDOFF_PREFIX.length)
    };
  }
  if (value.startsWith(CONTINUITY_UPDATE_PREFIX)) {
    return {
      resolution: "update_existing_lane",
      label: value.slice(CONTINUITY_UPDATE_PREFIX.length)
    };
  }
  return {
    resolution: "update_existing_lane",
    label: value
  };
}

function mergeContinuityAbsorbedWorkItems(existing: readonly string[], nextValue: string): string[] {
  const merged: string[] = [];
  for (const value of [...existing, nextValue]) {
    const priorIndex = merged.indexOf(value);
    if (priorIndex >= 0) {
      merged.splice(priorIndex, 1);
    }
    merged.push(value);
  }
  return merged.slice(-6);
}

function createAbsorbedLaneResumeSummary(input: {
  card: HarnessCardRecord;
  absorbedWorkItem: string;
  resolution: "update_existing_lane" | "handoff_existing_lane";
}): string {
  const parsedItem = parseContinuityAbsorbedWorkItem(input.absorbedWorkItem);
  const deliverableLabel = humanizeDeliverableType(input.card.deliverableType).toLowerCase();
  const personaLabel = input.card.persona.toUpperCase();
  if (input.resolution === "handoff_existing_lane") {
    return `${personaLabel} should resume this handed-off ${deliverableLabel} lane from ${parsedItem.label}.`;
  }
  return `${personaLabel} should fold the absorbed follow-on work from ${parsedItem.label} into this ${deliverableLabel} lane.`;
}

function createDefaultResumeSummary(card: HarnessCardRecord): string | null {
  const personaLabel = card.persona.toUpperCase();
  const deliverableLabel = humanizeDeliverableType(card.deliverableType).toLowerCase();
  switch (card.state) {
    case "queued":
      return `${personaLabel} should start this queued ${deliverableLabel} lane from the approved assignment "${card.title}".`;
    case "planning":
      return `${personaLabel} should shape the next bounded move for "${card.title}".`;
    case "approved":
      return `${personaLabel} should begin this approved ${deliverableLabel} lane: ${card.title}.`;
    case "working":
      return `${personaLabel} should continue this active ${deliverableLabel} lane: ${card.title}.`;
    case "waiting":
      return `${personaLabel} should resolve the waiting dependency before restarting "${card.title}".`;
    case "blocked":
      return `${personaLabel} should unblock this ${deliverableLabel} lane before more work starts.`;
    case "done":
    case "cancelled":
      return null;
    default:
      return `${personaLabel} should resume this ${deliverableLabel} lane from persisted state.`;
  }
}

function describeContinuitySnapshot(
  card: HarnessCardRecord,
  continuity: HarnessCardContinuityRecord | null
): string {
  if (continuity?.continuitySummary) {
    return continuity.continuitySummary;
  }
  if (continuity?.continuitySource === "result_recorded") {
    return `${card.persona.toUpperCase()} completed this ${humanizeDeliverableType(
      card.deliverableType
    ).toLowerCase()} lane and preserved the latest outcome for later review.`;
  }
  const personaLabel = card.persona.toUpperCase();
  const deliverableLabel = humanizeDeliverableType(card.deliverableType).toLowerCase();
  if (card.state === "done") {
    return `${personaLabel} completed this ${deliverableLabel} lane and preserved the latest outcome for later review.`;
  }
  if (card.state === "cancelled") {
    return `${personaLabel} closed this ${deliverableLabel} lane without reopening work in the current board cycle.`;
  }
  const latestAbsorbedWorkItem = continuity?.absorbedWorkItems.at(-1);
  if (latestAbsorbedWorkItem) {
    const parsedItem = parseContinuityAbsorbedWorkItem(latestAbsorbedWorkItem);
    if (continuity?.continuitySource === "lane_handoff" || parsedItem.resolution === "handoff_existing_lane") {
      return `${personaLabel} can resume this ${deliverableLabel} lane after a CEO handoff from ${parsedItem.label}.`;
    }
    return `${personaLabel} can resume this ${deliverableLabel} lane with absorbed follow-on work from ${parsedItem.label}.`;
  }
  return `${personaLabel} owns a deliverable-focused card that can resume from persisted state after interruption.`;
}

function humanizeDeliverableType(value: string): string {
  return humanizeLabel(value.replace(/_/gu, " "));
}

function humanizeLabel(value: string): string {
  return value
    .split(/[\s_-]+/u)
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function formatBoardTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC"
  });
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toRecentDecisionView(decision: HarnessBoardDecisionRecord): HarnessRecentDecisionView {
  return {
    id: decision.id,
    decisionKind: decision.decisionKind,
    label: describeBoardDecision(decision),
    ...(decision.resolution ? { resolution: decision.resolution } : {}),
    ...(decision.policyReason ? { policyReasonLabel: humanizePolicyReason(decision.policyReason) } : {}),
    ...(decision.recommendationSummary ? { recommendationSummary: decision.recommendationSummary } : {}),
    ...(decision.objectionSummary ? { objectionSummary: decision.objectionSummary } : {}),
    timestampLabel: formatBoardTimestamp(decision.createdAt)
  };
}

function isFollowThroughDecision(decision: HarnessBoardDecisionRecord): boolean {
  return decision.decisionKind === "lane_opened" || decision.decisionKind === "proposal_approved" || decision.decisionKind === "run_completed";
}

function toFollowThroughView(decision: HarnessBoardDecisionRecord): HarnessFollowThroughView {
  return {
    id: decision.id,
    action: classifyFollowThroughAction(decision),
    summary: describeBoardDecision(decision),
    timestampLabel: formatBoardTimestamp(decision.createdAt),
    ...(decision.targetCardId ? { targetCardId: decision.targetCardId } : {}),
    ...(decision.proposalId ? { proposalId: decision.proposalId } : {}),
    ...(decision.persona ? { persona: decision.persona.toUpperCase() } : {}),
    ...(decision.deliverableType ? { deliverableLabel: humanizeDeliverableType(decision.deliverableType) } : {})
  };
}

function classifyFollowThroughAction(decision: HarnessBoardDecisionRecord): HarnessFollowThroughView["action"] {
  if (decision.decisionKind === "lane_opened") {
    return "opened_lane";
  }
  if (decision.decisionKind === "run_completed") {
    return "packaged_outcome";
  }
  if (decision.resolution === "create_lane") {
    return "opened_lane";
  }
  if (decision.resolution === "handoff_existing_lane") {
    return "handed_off_lane";
  }
  return "reused_lane";
}

function describeBoardDecision(decision: HarnessBoardDecisionRecord): string {
  const persona = decision.persona ? decision.persona.toUpperCase() : "CEO";
  const deliverable = decision.deliverableType
    ? humanizeDeliverableType(decision.deliverableType).toLowerCase()
    : "lane";

  switch (decision.decisionKind) {
    case "lane_opened":
      return `CEO opened a new ${deliverable} lane for ${persona}.`;
    case "proposal_approved":
      if (decision.resolution === "handoff_existing_lane") {
        return `CEO handed the active ${deliverable} lane to ${persona}.`;
      }
      if (decision.resolution === "update_existing_lane") {
        return `CEO folded a proposal into the existing ${deliverable} lane.`;
      }
      return `CEO approved a new ${deliverable} lane for ${persona}.`;
    case "proposal_deferred":
      return `CEO deferred a ${deliverable} request for ${persona}.`;
    case "proposal_denied":
      return `CEO denied a ${deliverable} request for ${persona}.`;
    case "run_completed":
      return "CEO packaged the final board outcome for the tenant.";
    default:
      return "A board decision was recorded.";
  }
}

function toPendingApprovalPolicyView(input: {
  cards: readonly HarnessCardRecord[];
  proposal: HarnessSubCardProposal;
  latestDecision: HarnessBoardDecisionRecord | null;
}): Partial<HarnessPendingApprovalView> {
  const handoffTarget = selectDeliverableOwnerConflictTarget({
    cards: input.cards,
    proposal: input.proposal
  });
  if (input.proposal.status !== "deferred") {
    return handoffTarget
      ? {
          handoffTargetCardId: handoffTarget.id,
          handoffTargetPersona: handoffTarget.persona.toUpperCase(),
          handoffTargetTitle: handoffTarget.title
        }
      : {};
  }

  const decision = input.latestDecision;
  return {
    ...(decision?.policyReason ? { policyReasonLabel: humanizePolicyReason(decision.policyReason) } : {}),
    nextReviewTrigger: describeNextReviewTrigger(decision?.policyReason ?? null),
    ...(decision ? { lastDecisionAtLabel: formatBoardTimestamp(decision.createdAt) } : {}),
    ...(handoffTarget
      ? {
          handoffTargetCardId: handoffTarget.id,
          handoffTargetPersona: handoffTarget.persona.toUpperCase(),
          handoffTargetTitle: handoffTarget.title
        }
      : {})
  };
}

function selectDeliverableOwnerConflictTarget(input: {
  cards: readonly HarnessCardRecord[];
  proposal: Pick<HarnessSubCardProposal, "persona" | "deliverableType">;
}): HarnessCardRecord | null {
  return (
    input.cards.find(
      (card) =>
        card.persona !== "ceo" &&
        isOpenCardState(card.state) &&
        card.deliverableType === input.proposal.deliverableType &&
        card.persona !== input.proposal.persona
    ) ?? null
  );
}

function buildCompletionPackageNote(input: {
  deferredApprovalCount: number;
  deniedApprovalCount: number;
  recommendationCount: number;
  objectionCount: number;
}): string | undefined {
  if (input.deferredApprovalCount > 0) {
    return "The board is packaging completed work while keeping deferred follow-up requests visible for later CEO review.";
  }
  if (input.deniedApprovalCount > 0) {
    return "The board outcome keeps denied governance requests visible so the tenant can see where the CEO held the workflow boundary.";
  }
  if (input.objectionCount > 0) {
    return "The board outcome includes completed work alongside bounded objections that still need attention.";
  }
  if (input.recommendationCount > 0) {
    return "The board outcome includes clear next-step recommendations for the tenant-facing handoff.";
  }
  return undefined;
}

function createLaneRecommendationSummary(input: {
  persona: string;
  deliverableType: string;
  policyReason: "created_new_lane" | "reused_existing_lane" | "completed_lanes_only";
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  const persona = input.persona.toUpperCase();
  if (input.policyReason === "reused_existing_lane") {
    return `Advance this ${deliverable} inside the existing ${persona} lane.`;
  }
  if (input.policyReason === "completed_lanes_only") {
    return "Package only completed lanes into the tenant-facing board outcome.";
  }
  return `Open a dedicated ${deliverable} lane for ${persona}.`;
}

function createHandoffRecommendationSummary(input: {
  persona: string;
  deliverableType: string;
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  const persona = input.persona.toUpperCase();
  return `Hand this ${deliverable} lane to ${persona} and continue the work inside the existing board lane.`;
}

function createGovernanceObjectionSummary(input: {
  deliverableType: string;
  policyReason: "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  switch (input.policyReason) {
    case "deliverable_owner_conflict":
      return `Wait for the current ${deliverable} owner to clear or hand off that lane first.`;
    case "lane_cap":
      return `Hold this ${deliverable} request until the active lane count drops.`;
    case "completed_lanes_only":
      return `Do not reopen new ${deliverable} work until the CEO deliberately starts a fresh board cycle.`;
    case "scope_guardrail":
    default:
      return `Do not widen this run beyond the approved ${deliverable} workflow boundary.`;
  }
}

function determineProposalPolicyReason(input: {
  run: Pick<HarnessRunRecord, "state">;
  cards: readonly HarnessCardRecord[];
  proposal: Pick<HarnessSubCardProposal, "persona" | "deliverableType">;
}): "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only" {
  if (input.run.state === "assembling" || input.run.state === "done") {
    return "completed_lanes_only";
  }
  if (
    findOpenChildCardByDeliverableType(input.cards, input.proposal.deliverableType) &&
    !findOpenChildCardByPersonaDeliverable(input.cards, {
      persona: input.proposal.persona,
      deliverableType: input.proposal.deliverableType
    })
  ) {
    return "deliverable_owner_conflict";
  }
  if (countOpenChildCards(input.cards) >= MAX_OPEN_CHILD_CARDS) {
    return "lane_cap";
  }
  return "scope_guardrail";
}

function createGovernanceRecommendationSummary(input: {
  deliverableType: string;
  policyReason: "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
  status: "deferred" | "denied";
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  switch (input.policyReason) {
    case "deliverable_owner_conflict":
      return `Keep advancing the current ${deliverable} lane and revisit this request after a clear handoff.`;
    case "lane_cap":
      return `Finish or close one active lane before reopening this ${deliverable} request.`;
    case "completed_lanes_only":
      return `Package only completed lanes into the tenant-facing board outcome until the CEO deliberately starts a fresh board cycle.`;
    case "scope_guardrail":
    default:
      return input.status === "denied"
        ? `Keep this ${deliverable} work inside the current approved package boundary unless the CEO deliberately widens scope.`
        : `Revisit this ${deliverable} request only if the CEO deliberately widens the approved workflow boundary.`;
  }
}

function createRepeatedRequestDecisionNote(input: {
  status: "deferred" | "denied";
  policyReason: "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
  deliverableType: string;
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  switch (input.policyReason) {
    case "deliverable_owner_conflict":
      return `CEO deferred this proposal because an equivalent request is already waiting on the current ${deliverable} owner.`;
    case "lane_cap":
      return `CEO deferred this proposal because an equivalent request is already waiting for lane capacity.`;
    case "completed_lanes_only":
      return `CEO deferred this proposal because an equivalent request is already waiting for a fresh board cycle.`;
    case "scope_guardrail":
    default:
      return input.status === "denied"
        ? "CEO denied this proposal because an equivalent request is already pending CEO review."
        : `CEO deferred this proposal because an equivalent ${deliverable} request is already pending CEO review.`;
  }
}

function createPublicProposalDecisionMessage(input: {
  status: "deferred" | "denied";
  deliverableType: string;
  policyReason: "deliverable_owner_conflict" | "lane_cap" | "scope_guardrail" | "completed_lanes_only";
}): string {
  const deliverable = humanizeDeliverableType(input.deliverableType).toLowerCase();
  switch (input.policyReason) {
    case "deliverable_owner_conflict":
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request because the current lane owner still controls that work.`
        : `CEO deferred this ${deliverable} request until the current lane owner clears or hands off the work.`;
    case "lane_cap":
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request because the current run is already carrying its maximum active lane count.`
        : `CEO deferred this ${deliverable} request because the current run is already carrying its maximum active lane count.`;
    case "completed_lanes_only":
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request because this board cycle is already packaging completed work.`
        : `CEO deferred this ${deliverable} request because this board cycle is already packaging completed work.`;
    case "scope_guardrail":
    default:
      return input.status === "denied"
        ? `CEO denied this ${deliverable} request to keep the board inside the approved workflow boundary.`
        : `CEO deferred this ${deliverable} request until the approved workflow boundary is widened.`;
  }
}

function humanizePolicyReason(value: NonNullable<HarnessBoardDecisionRecord["policyReason"]>): string {
  switch (value) {
    case "created_new_lane":
      return "New lane approved";
    case "reused_existing_lane":
      return "Existing lane reused";
    case "deliverable_owner_conflict":
      return "Waiting on current lane owner";
    case "lane_cap":
      return "Lane cap protection";
    case "scope_guardrail":
      return "Scope guardrail";
    case "completed_lanes_only":
      return "Completed lanes only";
    default:
      return humanizeLabel(value);
  }
}

function describeNextReviewTrigger(policyReason: HarnessBoardDecisionRecord["policyReason"]): string {
  switch (policyReason) {
    case "deliverable_owner_conflict":
      return "Review again when the current deliverable owner clears or hands off the lane.";
    case "lane_cap":
      return "Review again when one of the active child lanes closes.";
    case "completed_lanes_only":
      return "Review again only if the CEO deliberately starts a fresh board cycle for follow-on work.";
    case "scope_guardrail":
      return "Review again only if the CEO widens the approved workflow boundary.";
    default:
      return "Review again when the CEO reopens this request for board consideration.";
  }
}

function isTerminalHarnessRunState(state: HarnessRunRecord["state"]): boolean {
  return state === "done" || state === "failed" || state === "cancelled";
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: string; message?: string };
  return (
    record.code === "23505" ||
    (typeof record.message === "string" && record.message.includes("harness_runs_tenant_workflow_unique_idx"))
  );
}
