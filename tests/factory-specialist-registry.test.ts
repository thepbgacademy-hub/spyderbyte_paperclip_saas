import { describe, expect, it } from "vitest";

import {
  SPECIALIST_DEFINITIONS,
  resolveDeliverableSpecialistOwner,
  resolveStationFamilyContract
} from "../src/factory/specialists/specialist-registry.js";

describe("factory specialist registry", () => {
  it("defines the bounded specialist roster required by the blueprint reboot", () => {
    expect(SPECIALIST_DEFINITIONS).toEqual([
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
    ]);
  });

  it("enforces one primary specialist owner per station family", () => {
    expect(resolveStationFamilyContract("intake")).toEqual({
      familyKey: "intake",
      specialistKey: "direction",
      approvalMode: "none",
      handoffTarget: "market"
    });
    expect(resolveStationFamilyContract("positioning")).toEqual({
      familyKey: "positioning",
      specialistKey: "market",
      approvalMode: "customer_checkpoint",
      handoffTarget: null
    });
  });

  it("derives station-family ownership without a second station-level specialist field", () => {
    expect(resolveStationFamilyContract("intake").specialistKey).toBe("direction");
    expect(resolveStationFamilyContract("positioning").specialistKey).toBe("market");
  });

  it("attributes bounded deliverable ownership to the specialist that owns the station family", () => {
    expect(resolveDeliverableSpecialistOwner("founder_profile")).toBe("direction");
    expect(resolveDeliverableSpecialistOwner("positioning_brief")).toBe("market");
  });

  it("fails closed for unknown deliverable ownership lookups", () => {
    expect(() => resolveDeliverableSpecialistOwner("launch_kit" as never)).toThrow(
      'Deliverable kind "launch_kit" is not part of the bounded specialist ownership contract'
    );
  });
});
