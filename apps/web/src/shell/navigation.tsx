import type { ComponentType } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CreditCard,
  HardDrive,
  House,
  KeyRound,
  Library,
  PackageCheck,
  Settings2,
  Sparkles,
  Users
} from "lucide-react";
import { HIDDEN_SHELL_FLAGS, type HiddenShellFlag } from "./feature-flags.js";

export type ShellRouteKey =
  | "home"
  | "workflows"
  | "results"
  | "team"
  | "profiles"
  | "providers"
  | "insights"
  | "package"
  | "files"
  | "assistant"
  | "billing"
  | "settings"
  | "assistantStudio"
  | "operations"
  | "advancedInsights";

export type ShellNavigationSection = "primary" | "secondary";

export type ShellFeatureFlags = Record<HiddenShellFlag, boolean>;

type ShellIcon = ComponentType<{ size?: number; className?: string }>;

export interface ShellRouteDefinition {
  aliases?: readonly string[];
  flag?: HiddenShellFlag;
  group: ShellNavigationSection;
  header: {
    summary: string;
    title: string;
  };
  hidden?: boolean;
  icon: ShellIcon;
  key: ShellRouteKey;
  label: string;
  path: string;
  pageTestId: `page-${string}`;
  showInNavigation: boolean;
  testId: `nav-${string}`;
}

export const DEFAULT_SHELL_FEATURE_FLAGS: ShellFeatureFlags = HIDDEN_SHELL_FLAGS;

export const VISIBLE_WEALTH_FACTORY_ROUTES: readonly ShellRouteDefinition[] = [
  {
    aliases: ["/home"],
    group: "primary",
    header: {
      summary: "What matters today, what is moving, and what needs your decision next.",
      title: "Home"
    },
    icon: House,
    key: "home",
    label: "Home",
    path: "/",
    pageTestId: "page-home",
    showInNavigation: true,
    testId: "nav-home"
  },
  {
    group: "primary",
    header: {
      summary: "Run approved workflows inside your installed package boundary.",
      title: "Workflows"
    },
    icon: Activity,
    key: "workflows",
    label: "Workflows",
    path: "/workflows",
    pageTestId: "page-workflows",
    showInNavigation: true,
    testId: "nav-workflows"
  },
  {
    group: "primary",
    header: {
      summary: "Review outcomes, approvals, and delivery steps without exposing run mechanics.",
      title: "Results"
    },
    icon: Library,
    key: "results",
    label: "Results",
    path: "/results",
    pageTestId: "page-results",
    showInNavigation: true,
    testId: "nav-results"
  },
  {
    group: "primary",
    header: {
      summary: "Manage included roles, hired support, and premium power plays.",
      title: "Team"
    },
    icon: Users,
    key: "team",
    label: "Team",
    path: "/team",
    pageTestId: "page-team",
    showInNavigation: true,
    testId: "nav-team"
  },
  {
    group: "primary",
    header: {
      summary: "Switch between approved company contexts inside the same package family.",
      title: "Profiles"
    },
    icon: BriefcaseBusiness,
    key: "profiles",
    label: "Profiles",
    path: "/profiles",
    pageTestId: "page-profiles",
    showInNavigation: true,
    testId: "nav-profiles"
  },
  {
    group: "primary",
    header: {
      summary: "Set up BYOK providers, subscriptions, and customer-owned storage in a calm, trustworthy way.",
      title: "Providers"
    },
    icon: KeyRound,
    key: "providers",
    label: "Providers",
    path: "/providers",
    pageTestId: "page-providers",
    showInNavigation: true,
    testId: "nav-providers"
  },
  {
    group: "primary",
    header: {
      summary: "See customer-safe usage, output, and turnaround trends.",
      title: "Insights"
    },
    icon: Sparkles,
    key: "insights",
    label: "Insights",
    path: "/insights",
    pageTestId: "page-insights",
    showInNavigation: true,
    testId: "nav-insights"
  },
  {
    group: "primary",
    header: {
      summary: "Review the installed business system and the boundaries it creates.",
      title: "Package"
    },
    icon: PackageCheck,
    key: "package",
    label: "Package",
    path: "/package",
    pageTestId: "page-package",
    showInNavigation: true,
    testId: "nav-package"
  },
  {
    group: "primary",
    header: {
      summary: "Move important files into customer-owned storage before temporary delivery expires.",
      title: "Files"
    },
    icon: HardDrive,
    key: "files",
    label: "Files",
    path: "/files",
    pageTestId: "page-files",
    showInNavigation: true,
    testId: "nav-files"
  },
  {
    group: "primary",
    header: {
      summary: "Get package-grounded help and support intake without opening an unrestricted chatbot.",
      title: "Assistant"
    },
    icon: Bot,
    key: "assistant",
    label: "Assistant",
    path: "/assistant",
    pageTestId: "page-assistant",
    showInNavigation: true,
    testId: "nav-assistant"
  },
  {
    group: "secondary",
    header: {
      summary: "Monitor account health, renewals, and add-on charges.",
      title: "Billing"
    },
    icon: CreditCard,
    key: "billing",
    label: "Billing",
    path: "/billing",
    pageTestId: "page-billing",
    showInNavigation: true,
    testId: "nav-billing"
  },
  {
    group: "secondary",
    header: {
      summary: "Manage themes, notifications, support links, and account preferences.",
      title: "Settings"
    },
    icon: Settings2,
    key: "settings",
    label: "Settings",
    path: "/settings",
    pageTestId: "page-settings",
    showInNavigation: true,
    testId: "nav-settings"
  }
];

export const HIDDEN_FUTURE_ROUTES: readonly ShellRouteDefinition[] = [
  {
    flag: "showFutureAssistantStudio",
    group: "primary",
    header: {
      summary: "Future assistant workspaces can live here without changing Wealth Factory navigation contracts.",
      title: "Assistant Studio"
    },
    hidden: true,
    icon: Bot,
    key: "assistantStudio",
    label: "Assistant Studio",
    path: "/assistant-studio",
    pageTestId: "page-assistant-studio",
    showInNavigation: true,
    testId: "nav-assistant-studio"
  },
  {
    flag: "showFutureOperations",
    group: "secondary",
    header: {
      summary: "Future internal operations views can be enabled later without surfacing them to customers today.",
      title: "Operations"
    },
    hidden: true,
    icon: Activity,
    key: "operations",
    label: "Operations",
    path: "/operations",
    pageTestId: "page-operations",
    showInNavigation: true,
    testId: "nav-operations"
  },
  {
    flag: "showFutureAdvancedInsights",
    group: "primary",
    header: {
      summary: "Future advanced analytics surfaces can be staged here behind a single central flag.",
      title: "Advanced Insights"
    },
    hidden: true,
    icon: BarChart3,
    key: "advancedInsights",
    label: "Advanced Insights",
    path: "/advanced-insights",
    pageTestId: "page-advanced-insights",
    showInNavigation: true,
    testId: "nav-advanced-insights"
  }
];

export const WEALTH_FACTORY_SHELL_ROUTES: readonly ShellRouteDefinition[] = [
  ...VISIBLE_WEALTH_FACTORY_ROUTES,
  ...HIDDEN_FUTURE_ROUTES
];

export function mergeShellFeatureFlags(overrides?: Partial<ShellFeatureFlags>): ShellFeatureFlags {
  return {
    ...DEFAULT_SHELL_FEATURE_FLAGS,
    ...overrides
  };
}

export function normalizeShellPath(path: string): string {
  const [pathname = ""] = path.split(/[?#]/u);
  const normalizedRoot = pathname.trim() === "" ? "/" : pathname.trim();
  const withLeadingSlash = normalizedRoot.startsWith("/") ? normalizedRoot : `/${normalizedRoot}`;

  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")) {
    return withLeadingSlash.slice(0, -1);
  }

  return withLeadingSlash;
}

export function isShellRouteEnabled(
  route: ShellRouteDefinition,
  featureFlags: ShellFeatureFlags = DEFAULT_SHELL_FEATURE_FLAGS
): boolean {
  return route.flag ? featureFlags[route.flag] : true;
}

export function resolveShellRoute(
  path: string,
  featureFlags: ShellFeatureFlags = DEFAULT_SHELL_FEATURE_FLAGS
): ShellRouteDefinition | null {
  const normalizedPath = normalizeShellPath(path);

  for (const route of WEALTH_FACTORY_SHELL_ROUTES) {
    if (!isShellRouteEnabled(route, featureFlags)) {
      continue;
    }

    if (route.path === normalizedPath || route.aliases?.includes(normalizedPath)) {
      return route;
    }
  }

  return null;
}

export function getShellNavigationSections(
  featureFlags: ShellFeatureFlags = DEFAULT_SHELL_FEATURE_FLAGS
): Record<ShellNavigationSection, ShellRouteDefinition[]> {
  const routes = WEALTH_FACTORY_SHELL_ROUTES.filter(
    (route) => route.showInNavigation && isShellRouteEnabled(route, featureFlags)
  );

  return {
    primary: routes.filter((route) => route.group === "primary"),
    secondary: routes.filter((route) => route.group === "secondary")
  };
}

export function getVisibleShellRoutes(
  featureFlags: ShellFeatureFlags = DEFAULT_SHELL_FEATURE_FLAGS
): ShellRouteDefinition[] {
  return WEALTH_FACTORY_SHELL_ROUTES.filter((route) => isShellRouteEnabled(route, featureFlags));
}

export function getPageHeaderForPath(
  path: string,
  featureFlags: ShellFeatureFlags = DEFAULT_SHELL_FEATURE_FLAGS
): ShellRouteDefinition["header"] | null {
  return resolveShellRoute(path, featureFlags)?.header ?? null;
}
