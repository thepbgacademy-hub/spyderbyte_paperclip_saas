const DEFAULT_PACKAGE_ID = "33333333-3333-4333-8333-333333333333";

export const DEMO_PROFILES = {
  primary: {
    userId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    packageId: DEFAULT_PACKAGE_ID,
    workflowId: "44444444-4444-4444-8444-444444444444",
    providerReferenceId: "55555555-5555-4555-8555-555555555555",
    purchaseId: "66666666-6666-4666-8666-666666666666",
    tenantName: "Wealth Factory Demo",
    tenantSlug: "wealth-factory-demo",
    userEmail: "demo@wealthfactory.local",
    workflowName: "Wealth Factory Social Calendar",
    workflowDescription: "Plan approved social posts for the installed package.",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_openai",
    providerMetadata: { project: "demo" }
  },
  secondary: {
    userId: "11111111-1111-4111-8111-222222222222",
    tenantId: "22222222-2222-4222-8222-333333333333",
    packageId: DEFAULT_PACKAGE_ID,
    workflowId: "44444444-4444-4444-8444-555555555555",
    providerReferenceId: "55555555-5555-4555-8555-666666666666",
    purchaseId: "66666666-6666-4666-8666-777777777777",
    tenantName: "Wealth Factory Demo Two",
    tenantSlug: "wealth-factory-demo-two",
    userEmail: "demo-two@wealthfactory.local",
    workflowName: "Wealth Factory Social Calendar Two",
    workflowDescription: "Plan approved social posts for the installed package.",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_two_openai",
    providerMetadata: { project: "demo-two" }
  },
  tertiary: {
    userId: "11111111-1111-4111-8111-333333333333",
    tenantId: "22222222-2222-4222-8222-444444444444",
    packageId: DEFAULT_PACKAGE_ID,
    workflowId: "44444444-4444-4444-8444-666666666666",
    providerReferenceId: "55555555-5555-4555-8555-777777777777",
    purchaseId: "66666666-6666-4666-8666-888888888888",
    tenantName: "Wealth Factory Demo Three",
    tenantSlug: "wealth-factory-demo-three",
    userEmail: "demo-three@wealthfactory.local",
    workflowName: "Wealth Factory Social Calendar Three",
    workflowDescription: "Plan approved social posts for the installed package.",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_three_openai",
    providerMetadata: { project: "demo-three" }
  },
  quaternary: {
    userId: "11111111-1111-4111-8111-444444444444",
    tenantId: "22222222-2222-4222-8222-555555555555",
    packageId: DEFAULT_PACKAGE_ID,
    workflowId: "44444444-4444-4444-8444-777777777777",
    providerReferenceId: "55555555-5555-4555-8555-888888888888",
    purchaseId: "66666666-6666-4666-8666-999999999999",
    tenantName: "Wealth Factory Demo Four",
    tenantSlug: "wealth-factory-demo-four",
    userEmail: "demo-four@wealthfactory.local",
    workflowName: "Wealth Factory Social Calendar Four",
    workflowDescription: "Plan approved social posts for the installed package.",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_four_openai",
    providerMetadata: { project: "demo-four" }
  },
  quinary: {
    userId: "11111111-1111-4111-8111-555555555555",
    tenantId: "22222222-2222-4222-8222-666666666666",
    packageId: DEFAULT_PACKAGE_ID,
    workflowId: "44444444-4444-4444-8444-888888888888",
    providerReferenceId: "55555555-5555-4555-8555-999999999999",
    purchaseId: "66666666-6666-4666-8666-aaaaaaaaaaaa",
    tenantName: "Wealth Factory Demo Five",
    tenantSlug: "wealth-factory-demo-five",
    userEmail: "demo-five@wealthfactory.local",
    workflowName: "Wealth Factory Social Calendar Five",
    workflowDescription: "Plan approved social posts for the installed package.",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_five_openai",
    providerMetadata: { project: "demo-five" }
  },
  senary: {
    userId: "11111111-1111-4111-8111-666666666666",
    tenantId: "22222222-2222-4222-8222-777777777777",
    packageId: DEFAULT_PACKAGE_ID,
    workflowId: "44444444-4444-4444-8444-999999999999",
    providerReferenceId: "55555555-5555-4555-8555-aaaaaaaaaaaa",
    purchaseId: "66666666-6666-4666-8666-bbbbbbbbbbbb",
    tenantName: "Wealth Factory Demo Six",
    tenantSlug: "wealth-factory-demo-six",
    userEmail: "demo-six@wealthfactory.local",
    workflowName: "Wealth Factory Social Calendar Six",
    workflowDescription: "Plan approved social posts for the installed package.",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_six_openai",
    providerMetadata: { project: "demo-six" }
  }
};

export function resolveDemoSeedProfile(args, source) {
  const laneName = typeof args.lane === "string" && args.lane.trim().length > 0 ? args.lane.trim() : "primary";
  const preset = DEMO_PROFILES[laneName];
  if (preset) {
    return buildResolvedProfile({ laneName, preset, args, source });
  }
  return buildCustomProfile({ laneName, args, source });
}

function buildResolvedProfile({ laneName, preset, args, source }) {
  return {
    laneName,
    userId: args.user ?? source.WF_DEMO_USER_ID ?? preset.userId,
    tenantId: args.tenant ?? source.WF_DEMO_TENANT_ID ?? preset.tenantId,
    packageId: args.package ?? source.WF_DEMO_PACKAGE_ID ?? preset.packageId,
    workflowId: args.workflow ?? source.WF_DEMO_WORKFLOW_ID ?? preset.workflowId,
    providerReferenceId: args["provider-reference"] ?? source.WF_DEMO_PROVIDER_REFERENCE_ID ?? preset.providerReferenceId,
    purchaseId: args.purchase ?? source.WF_DEMO_PURCHASE_ID ?? preset.purchaseId,
    tenantName: args["tenant-name"] ?? source.WF_DEMO_TENANT_NAME ?? preset.tenantName,
    tenantSlug: args["tenant-slug"] ?? source.WF_DEMO_TENANT_SLUG ?? preset.tenantSlug,
    userEmail: args["user-email"] ?? source.WF_DEMO_USER_EMAIL ?? preset.userEmail,
    workflowName: args["workflow-name"] ?? source.WF_DEMO_WORKFLOW_NAME ?? preset.workflowName,
    workflowDescription: args["workflow-description"] ?? source.WF_DEMO_WORKFLOW_DESCRIPTION ?? preset.workflowDescription,
    providerLabel: args["provider-label"] ?? source.WF_DEMO_PROVIDER_LABEL ?? preset.providerLabel,
    providerSecretRef: args["provider-secret-ref"] ?? source.WF_DEMO_PROVIDER_SECRET_REF ?? preset.providerSecretRef,
    providerMetadata: {
      ...preset.providerMetadata,
      ...parseJsonObject(source.WF_DEMO_PROVIDER_METADATA),
      ...parseJsonObject(args["provider-metadata"])
    }
  };
}

function buildCustomProfile({ laneName, args, source }) {
  const base = DEMO_PROFILES.primary;
  const required = {
    userId: args.user ?? source.WF_DEMO_USER_ID,
    tenantId: args.tenant ?? source.WF_DEMO_TENANT_ID,
    workflowId: args.workflow ?? source.WF_DEMO_WORKFLOW_ID,
    providerReferenceId: args["provider-reference"] ?? source.WF_DEMO_PROVIDER_REFERENCE_ID,
    purchaseId: args.purchase ?? source.WF_DEMO_PURCHASE_ID
  };
  const missing = Object.entries(required)
    .filter(([, value]) => typeof value !== "string" || value.trim().length === 0)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(
      `Unknown demo lane '${laneName}'. Use a known preset (${Object.keys(DEMO_PROFILES).join(", ")}) or provide --user, --tenant, --workflow, --provider-reference, and --purchase.`
    );
  }

  const laneSlug = toLaneSlug(laneName);
  const laneTitle = toLaneTitle(laneName);
  return buildResolvedProfile({
    laneName,
    preset: {
      ...base,
      userId: required.userId,
      tenantId: required.tenantId,
      workflowId: required.workflowId,
      providerReferenceId: required.providerReferenceId,
      purchaseId: required.purchaseId,
      tenantName: `Wealth Factory ${laneTitle}`,
      tenantSlug: `wealth-factory-${laneSlug}`,
      userEmail: `${laneSlug}@wealthfactory.local`,
      workflowName: `Wealth Factory Social Calendar ${laneTitle}`,
      providerSecretRef: `wf_secret_demo_${laneSlug}_openai`,
      providerMetadata: { project: laneSlug }
    },
    args,
    source
  });
}

function parseJsonObject(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function toLaneSlug(value) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "custom";
}

function toLaneTitle(value) {
  return value
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
