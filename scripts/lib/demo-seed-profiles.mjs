const CORE_CONNECT_FIRST = {
  packageId: "pkg_bib_connect",
  workflowId: "wf_connect_first_workflow",
  packageKey: "connect-first",
  packageName: "Connect First",
  packageKind: "core",
  packageMetadata: { workflowFamily: "connect-first" },
  workflowName: "Connect First Workflow",
  workflowDescription: "CEO-led first-workflow setup run inside the Wealth Factory harness."
};

const CORE_TAX_STRATEGY = {
  packageId: "pkg_tax_strategy",
  workflowId: "wf_tax_strategy",
  packageKey: "tax-strategy",
  packageName: "Tax Strategy",
  packageKind: "core",
  packageMetadata: { workflowFamily: "tax-strategy" },
  workflowName: "Tax Strategy Workflow",
  workflowDescription: "Bounded tax strategy review run inside the Wealth Factory harness."
};

const CORE_PACKAGE_FOLLOWUP = {
  packageId: "pkg_package_followup",
  workflowId: "wf_package_followup",
  packageKey: "package-followup",
  packageName: "Package Follow-up",
  packageKind: "core",
  packageMetadata: { workflowFamily: "package-followup" },
  workflowName: "Package Follow-up Workflow",
  workflowDescription: "Bounded package follow-up run inside the Wealth Factory harness."
};

export const DEMO_PROFILES = {
  primary: {
    ...CORE_CONNECT_FIRST,
    userId: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    providerReferenceId: "55555555-5555-4555-8555-555555555555",
    purchaseId: "66666666-6666-4666-8666-666666666666",
    tenantName: "Wealth Factory Demo",
    tenantSlug: "wealth-factory-demo",
    userEmail: "demo@wealthfactory.local",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_openai",
    providerMetadata: { project: "demo" }
  },
  secondary: {
    ...CORE_CONNECT_FIRST,
    userId: "11111111-1111-4111-8111-222222222222",
    tenantId: "22222222-2222-4222-8222-333333333333",
    providerReferenceId: "55555555-5555-4555-8555-666666666666",
    purchaseId: "66666666-6666-4666-8666-777777777777",
    tenantName: "Wealth Factory Demo Two",
    tenantSlug: "wealth-factory-demo-two",
    userEmail: "demo-two@wealthfactory.local",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_two_openai",
    providerMetadata: { project: "demo-two" }
  },
  tertiary: {
    ...CORE_TAX_STRATEGY,
    userId: "11111111-1111-4111-8111-333333333333",
    tenantId: "22222222-2222-4222-8222-444444444444",
    providerReferenceId: "55555555-5555-4555-8555-777777777777",
    purchaseId: "66666666-6666-4666-8666-888888888888",
    tenantName: "Wealth Factory Demo Three",
    tenantSlug: "wealth-factory-demo-three",
    userEmail: "demo-three@wealthfactory.local",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_three_openai",
    providerMetadata: { project: "demo-three" }
  },
  quaternary: {
    ...CORE_TAX_STRATEGY,
    userId: "11111111-1111-4111-8111-444444444444",
    tenantId: "22222222-2222-4222-8222-555555555555",
    providerReferenceId: "55555555-5555-4555-8555-888888888888",
    purchaseId: "66666666-6666-4666-8666-999999999999",
    tenantName: "Wealth Factory Demo Four",
    tenantSlug: "wealth-factory-demo-four",
    userEmail: "demo-four@wealthfactory.local",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_four_openai",
    providerMetadata: { project: "demo-four" }
  },
  quinary: {
    ...CORE_PACKAGE_FOLLOWUP,
    userId: "11111111-1111-4111-8111-555555555555",
    tenantId: "22222222-2222-4222-8222-666666666666",
    providerReferenceId: "55555555-5555-4555-8555-999999999999",
    purchaseId: "66666666-6666-4666-8666-aaaaaaaaaaaa",
    tenantName: "Wealth Factory Demo Five",
    tenantSlug: "wealth-factory-demo-five",
    userEmail: "demo-five@wealthfactory.local",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_five_openai",
    providerMetadata: { project: "demo-five" }
  },
  senary: {
    ...CORE_PACKAGE_FOLLOWUP,
    userId: "11111111-1111-4111-8111-666666666666",
    tenantId: "22222222-2222-4222-8222-777777777777",
    providerReferenceId: "55555555-5555-4555-8555-aaaaaaaaaaaa",
    purchaseId: "66666666-6666-4666-8666-bbbbbbbbbbbb",
    tenantName: "Wealth Factory Demo Six",
    tenantSlug: "wealth-factory-demo-six",
    userEmail: "demo-six@wealthfactory.local",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_six_openai",
    providerMetadata: { project: "demo-six" }
  },
  "tax-strategy": {
    ...CORE_TAX_STRATEGY,
    userId: "11111111-1111-4111-8111-777777777777",
    tenantId: "22222222-2222-4222-8222-888888888888",
    providerReferenceId: "55555555-5555-4555-8555-bbbbbbbbbbbb",
    purchaseId: "66666666-6666-4666-8666-cccccccccccc",
    tenantName: "Wealth Factory Tax Strategy Demo",
    tenantSlug: "wealth-factory-tax-strategy-demo",
    userEmail: "tax-strategy@wealthfactory.local",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_tax_strategy_openai",
    providerMetadata: { project: "tax-strategy" }
  },
  "package-followup": {
    ...CORE_PACKAGE_FOLLOWUP,
    userId: "11111111-1111-4111-8111-888888888888",
    tenantId: "22222222-2222-4222-8222-999999999999",
    providerReferenceId: "55555555-5555-4555-8555-cccccccccccc",
    purchaseId: "66666666-6666-4666-8666-dddddddddddd",
    tenantName: "Wealth Factory Package Follow-up Demo",
    tenantSlug: "wealth-factory-package-followup-demo",
    userEmail: "package-followup@wealthfactory.local",
    providerLabel: "OpenAI",
    providerSecretRef: "wf_secret_demo_package_followup_openai",
    providerMetadata: { project: "package-followup" }
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
    packageKey: args["package-key"] ?? source.WF_DEMO_PACKAGE_KEY ?? preset.packageKey,
    packageName: args["package-name"] ?? source.WF_DEMO_PACKAGE_NAME ?? preset.packageName,
    packageKind: args["package-kind"] ?? source.WF_DEMO_PACKAGE_KIND ?? preset.packageKind,
    packageMetadata: {
      ...preset.packageMetadata,
      ...parseJsonObject(source.WF_DEMO_PACKAGE_METADATA),
      ...parseJsonObject(args["package-metadata"])
    },
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
      packageId: CORE_CONNECT_FIRST.packageId,
      packageKey: CORE_CONNECT_FIRST.packageKey,
      packageName: CORE_CONNECT_FIRST.packageName,
      packageKind: CORE_CONNECT_FIRST.packageKind,
      packageMetadata: { ...CORE_CONNECT_FIRST.packageMetadata, lane: laneSlug },
      workflowName: CORE_CONNECT_FIRST.workflowName,
      workflowDescription: CORE_CONNECT_FIRST.workflowDescription,
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
