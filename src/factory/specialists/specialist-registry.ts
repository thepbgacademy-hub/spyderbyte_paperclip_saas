import type { DeliverableKind, SpecialistKey, StationFamilyKey } from "../domain/types.js";

export interface SpecialistDefinition {
  key: SpecialistKey;
  title: string;
  responsibilities: [string, string, string];
}

export interface StationFamilyContract {
  familyKey: StationFamilyKey;
  specialistKey: SpecialistKey;
  approvalMode: "none" | "customer_checkpoint";
  handoffTarget: SpecialistKey | null;
}

export const SPECIALIST_DEFINITIONS: readonly SpecialistDefinition[] = [
  {
    key: "direction",
    title: "Direction Specialist",
    responsibilities: ["business_direction", "priorities", "decision_checkpoints"]
  },
  {
    key: "finance",
    title: "Finance Specialist",
    responsibilities: ["pricing_logic", "margin_pressure_testing", "financial_constraints"]
  },
  {
    key: "market",
    title: "Market Specialist",
    responsibilities: ["positioning", "messaging", "audience_fit"]
  },
  {
    key: "operations",
    title: "Operations Specialist",
    responsibilities: ["systemization", "delivery_flow", "workflow_readiness"]
  },
  {
    key: "offer",
    title: "Offer Specialist",
    responsibilities: ["offer_design", "package_design", "conversion_framing"]
  }
] as const;

const STATION_FAMILY_SPECIALIST_OWNERS: Readonly<Record<StationFamilyKey, SpecialistKey>> = {
  intake: "direction",
  founder_profile_synthesis: "direction",
  strategic_priorities: "direction",
  decision_checkpoints: "direction",
  launch_direction_review: "direction",
  pricing_analysis: "finance",
  margin_review: "finance",
  cost_structure_review: "finance",
  revenue_sensitivity_review: "finance",
  financial_approval_checkpoints: "finance",
  positioning: "market",
  messaging_refinement: "market",
  audience_clarity_review: "market",
  market_offer_framing: "market",
  campaign_direction_review: "market",
  delivery_design: "operations",
  workflow_sequencing: "operations",
  sop_drafting: "operations",
  implementation_readiness_review: "operations",
  handoff_packaging: "operations",
  offer_shaping: "offer",
  package_design: "offer",
  objection_handling_review: "offer",
  conversion_review: "offer",
  launch_offer_validation: "offer"
};

const EXECUTABLE_STATION_FAMILY_CONTRACTS: Readonly<Record<"intake" | "positioning", StationFamilyContract>> =
  {
    intake: {
      familyKey: "intake",
      specialistKey: "direction",
      approvalMode: "none",
      handoffTarget: "market"
    },
    positioning: {
      familyKey: "positioning",
      specialistKey: "market",
      approvalMode: "customer_checkpoint",
      handoffTarget: null
    }
  };

const DELIVERABLE_SPECIALIST_OWNERS: Readonly<Record<DeliverableKind, SpecialistKey>> = {
  founder_profile: "direction",
  positioning_brief: "market"
};

export function resolveExpectedStationSpecialistKey(familyKey: StationFamilyKey): SpecialistKey {
  return STATION_FAMILY_SPECIALIST_OWNERS[familyKey];
}

export function resolveStationFamilyContract(familyKey: "intake" | "positioning"): StationFamilyContract {
  return EXECUTABLE_STATION_FAMILY_CONTRACTS[familyKey];
}

export function resolveDeliverableSpecialistOwner(kind: DeliverableKind): SpecialistKey {
  const specialistKey = DELIVERABLE_SPECIALIST_OWNERS[kind];
  if (!specialistKey) {
    throw new Error(
      `Deliverable kind "${kind}" is not part of the bounded specialist ownership contract`
    );
  }

  return specialistKey;
}
