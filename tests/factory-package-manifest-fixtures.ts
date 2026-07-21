import type { BlueprintManifestV1 } from "../src/factory/packages/package-manifest-loader.js";

function createBaseManifest(input?: {
  packageId?: string;
  packageKey?: string;
  name?: string;
}): Omit<
  BlueprintManifestV1,
  "personas" | "workflow" | "deliverables"
> {
  return {
    manifest_schema: 1,
    package_id: input?.packageId ?? "pkg_connect_first",
    package_key: input?.packageKey ?? "connect-first",
    name: input?.name ?? "Connect First Operating System",
    version: "1.0.0",
    type: "business_framework",
    description: "Bounded reboot manifest for the current Wealth Factory slice.",
    publisher: "the-wealth-factory",
    license_note: "proprietary-content",
    min_platform_version: "1.0.0",
    requires: [],
    permissions: {
      tools: [
        "structured_interview",
        "document_generation",
        "deliverable_write",
        "brand_profile_update"
      ],
      external_actions: {
        publish: "approval_required",
        send_email: "denied"
      },
      data_access: {
        tenant_scope_only: true,
        package_scope_only: true,
        readable_deliverables: "own_package"
      }
    },
    provider_requirements: {
      llm: {
        required: true,
        capabilities: ["structured_output", "long_context"],
        preferred_tier: "standard"
      }
    },
    budgets: {
      max_run_cost_usd: 25,
      max_run_minutes: 90,
      max_step_cost_usd: 5,
      approval_required_above_usd: 10
    },
    guardrails: {
      scope_statement: "Bounded current-slice manifest only.",
      denied_actions: ["create_unrelated_business", "access_other_tenant_data"]
    }
  };
}

export function createCurrentSliceManifest(input?: {
  packageId?: string;
  packageKey?: string;
  name?: string;
}): BlueprintManifestV1 {
  return {
    ...createBaseManifest(input),
    personas: [
      {
        id: "founder_guide",
        name: "Founder Guide",
        tagline: "Guides the founder through intake.",
        definition: "personas/founder_guide.yaml",
        allowed_stations: ["intake"],
        allowed_tools: ["structured_interview", "brand_profile_update", "deliverable_write"]
      },
      {
        id: "market_strategist",
        name: "Market Strategist",
        tagline: "Shapes the positioning brief.",
        definition: "personas/market_strategist.yaml",
        allowed_stations: ["positioning"],
        allowed_tools: ["document_generation", "deliverable_write", "brand_profile_update"]
      }
    ],
    workflow: {
      stations: [
        {
          id: "intake",
          name: "Intake Station",
          persona: "founder_guide",
          inputs: [],
          outputs: ["founder_profile"],
          checkpoint: "none"
        },
        {
          id: "positioning",
          name: "Positioning Station",
          persona: "market_strategist",
          inputs: ["founder_profile"],
          outputs: ["positioning_brief"],
          checkpoint: "required"
        }
      ]
    },
    deliverables: [
      {
        key: "founder_profile",
        name: "Founder Profile",
        schema: "schemas/founder_profile.json",
        template: "templates/founder_profile.md.hbs"
      },
      {
        key: "positioning_brief",
        name: "Positioning Brief",
        schema: "schemas/positioning_brief.json",
        template: "templates/positioning_brief.md.hbs"
      }
    ]
  };
}

export function createIntakeOnlyManifest(input?: {
  packageId?: string;
  packageKey?: string;
  name?: string;
}): BlueprintManifestV1 {
  return {
    ...createBaseManifest(input),
    personas: [
      {
        id: "founder_guide",
        name: "Founder Guide",
        tagline: "Guides the founder through intake.",
        definition: "personas/founder_guide.yaml",
        allowed_stations: ["intake"],
        allowed_tools: ["structured_interview", "brand_profile_update", "deliverable_write"]
      }
    ],
    workflow: {
      stations: [
        {
          id: "intake",
          name: "Intake Station",
          persona: "founder_guide",
          inputs: [],
          outputs: ["founder_profile"],
          checkpoint: "none"
        }
      ]
    },
    deliverables: [
      {
        key: "founder_profile",
        name: "Founder Profile",
        schema: "schemas/founder_profile.json",
        template: "templates/founder_profile.md.hbs"
      }
    ]
  };
}

export function createPositioningOnlyManifest(input?: {
  packageId?: string;
  packageKey?: string;
  name?: string;
}): BlueprintManifestV1 {
  return {
    ...createBaseManifest(input),
    personas: [
      {
        id: "market_strategist",
        name: "Market Strategist",
        tagline: "Shapes the positioning brief.",
        definition: "personas/market_strategist.yaml",
        allowed_stations: ["positioning"],
        allowed_tools: ["document_generation", "deliverable_write", "brand_profile_update"]
      }
    ],
    workflow: {
      stations: [
        {
          id: "positioning",
          name: "Positioning Station",
          persona: "market_strategist",
          inputs: ["founder_profile"],
          outputs: ["positioning_brief"],
          checkpoint: "required"
        }
      ]
    },
    deliverables: [
      {
        key: "founder_profile",
        name: "Founder Profile",
        schema: "schemas/founder_profile.json",
        template: "templates/founder_profile.md.hbs"
      },
      {
        key: "positioning_brief",
        name: "Positioning Brief",
        schema: "schemas/positioning_brief.json",
        template: "templates/positioning_brief.md.hbs"
      }
    ]
  };
}
