# Hermes Wealth Factory Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current handcrafted Wealth Factory dashboard shell with a Hermes-derived shell, route model, and global theme-token system while preserving Wealth Factory naming, customer-safe flows, and hidden future routes behind flags.

**Architecture:** Introduce a Hermes-style app shell with a route-aware sidebar, mobile drawer, topbar, and page-header context. Split the current monolithic dashboard into shell primitives, route metadata, and page content modules so theme state and feature flags can be shared cleanly across the app. Keep existing business behaviors intact by moving current page content into route-driven page sections rather than rewriting workflow logic from scratch.

**Tech Stack:** React 19, TypeScript, Vite, `react-router-dom`, CSS custom properties, Vitest, Playwright, ESLint.

---

## File Structure

### Create

- `apps/web/src/main.tsx`
  - Browser entrypoint that mounts `BrowserRouter` and the app-wide theme provider.
- `apps/web/src/shell/page-header-context.ts`
  - Context type and provider interface for route-aware page titles and header actions.
- `apps/web/src/shell/use-page-header.ts`
  - Hook for pages to set title and header actions.
- `apps/web/src/shell/PageHeaderProvider.tsx`
  - Hermes-style topbar wrapper and scrollable main region.
- `apps/web/src/shell/theme-presets.ts`
  - Wealth Factory theme presets expressed as Hermes-style CSS variable maps.
- `apps/web/src/shell/theme-context.tsx`
  - Global theme state, `ThemePreset` type, and provider that writes CSS variables to `document.documentElement`.
- `apps/web/src/shell/feature-flags.ts`
  - Central hidden-route flags, defaulting future Hermes-like sections off.
- `apps/web/src/shell/navigation.tsx`
  - Visible nav metadata plus hidden route metadata and route-to-title/page-summary helpers.
- `apps/web/src/shell/ShellLayout.tsx`
  - Hermes-derived responsive shell frame adapted to Wealth Factory.
- `apps/web/src/pages/dashboard-data.ts`
  - Current static Wealth Factory arrays and helper functions extracted from `App.tsx`.
- `apps/web/src/pages/DashboardPages.tsx`
  - Route-driven page components using existing business logic and test ids.

### Modify

- `package.json`
  - Add `react-router-dom` dependency.
- `apps/web/index.html`
  - Change the module script source from `/src/App.tsx` to `/src/main.tsx`.
- `apps/web/src/App.tsx`
  - Reduce to app composition and route registration instead of containing all page markup and theme state.
- `apps/web/src/styles.css`
  - Replace the custom shell scaffold with Hermes-derived root tokens and Wealth Factory theme overrides.
- `apps/web/src/dashboard-client.ts`
  - Keep current API mapping, but export any route-facing helpers needed by the split page modules.
- `apps/web/tests/e2e/workflow.spec.ts`
  - Update selectors for route-based nav and global theme behavior.
- `apps/web/tests/e2e/tenant-isolation.spec.ts`
  - Update selectors and add assertions for hidden flagged routes staying invisible.
- `tests/dashboard-client.test.ts`
  - Preserve current mapping coverage and only adjust if the `dashboard-client` surface changes.

---

### Task 1: Add route, theme, and feature-flag scaffolding

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/shell/theme-presets.ts`
- Create: `apps/web/src/shell/theme-context.tsx`
- Create: `apps/web/src/shell/feature-flags.ts`
- Modify: `package.json`
- Modify: `apps/web/index.html`

- [ ] **Step 1: Write the failing unit test for global theme state**

Create `tests/web-theme-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { THEME_PRESETS, type ThemePreset } from "../apps/web/src/shell/theme-presets.js";

describe("theme presets", () => {
  it("defines global CSS variables for every Wealth Factory preset", () => {
    for (const preset of Object.keys(THEME_PRESETS) as ThemePreset[]) {
      expect(THEME_PRESETS[preset]["--background-base"]).toBeTruthy();
      expect(THEME_PRESETS[preset]["--midground-base"]).toBeTruthy();
      expect(THEME_PRESETS[preset]["--theme-font-sans"]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- --run tests/web-theme-context.test.ts
```

Expected: FAIL with `Cannot find module '../apps/web/src/shell/theme-presets.js'`.

- [ ] **Step 3: Add routing and theme dependencies**

Update `package.json`:

```json
{
  "dependencies": {
    "lucide-react": "^1.14.0",
    "pg": "^8.20.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-router-dom": "^7.9.6"
  }
}
```

Then install:

```bash
npm install
```

Expected: `package-lock.json` updates and `react-router-dom` is added.

- [ ] **Step 4: Create the global theme preset map**

Create `apps/web/src/shell/theme-presets.ts`:

```ts
export type ThemePreset = "Foundry" | "Midnight" | "Ledger" | "Ember";

export const THEME_PRESETS: Record<ThemePreset, Record<string, string>> = {
  Foundry: {
    "--foreground-base": "#ffffff",
    "--midground-base": "#f4e6c6",
    "--background-base": "#071311",
    "--theme-font-sans": "\"Azeret Mono\", \"Segoe UI\", sans-serif",
    "--theme-font-mono": "\"JetBrains Mono\", monospace",
    "--theme-radius": "0.5rem"
  },
  Midnight: {
    "--foreground-base": "#ffffff",
    "--midground-base": "#d7e6ff",
    "--background-base": "#09111f",
    "--theme-font-sans": "\"Azeret Mono\", \"Segoe UI\", sans-serif",
    "--theme-font-mono": "\"JetBrains Mono\", monospace",
    "--theme-radius": "0.5rem"
  },
  Ledger: {
    "--foreground-base": "#ffffff",
    "--midground-base": "#ece6d8",
    "--background-base": "#11120f",
    "--theme-font-sans": "\"Azeret Mono\", \"Segoe UI\", sans-serif",
    "--theme-font-mono": "\"JetBrains Mono\", monospace",
    "--theme-radius": "0.4rem"
  },
  Ember: {
    "--foreground-base": "#ffffff",
    "--midground-base": "#ffd8b0",
    "--background-base": "#1a0d09",
    "--theme-font-sans": "\"Azeret Mono\", \"Segoe UI\", sans-serif",
    "--theme-font-mono": "\"JetBrains Mono\", monospace",
    "--theme-radius": "0.5rem"
  }
};
```

- [ ] **Step 5: Create the app-wide theme provider**

Create `apps/web/src/shell/theme-context.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { THEME_PRESETS, type ThemePreset } from "./theme-presets.js";

interface ThemeContextValue {
  theme: ThemePreset;
  setTheme: (theme: ThemePreset) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreset>("Foundry");

  useEffect(() => {
    const preset = THEME_PRESETS[theme];
    for (const [token, value] of Object.entries(preset)) {
      document.documentElement.style.setProperty(token, value);
    }
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
```

- [ ] **Step 6: Create hidden future-route flags**

Create `apps/web/src/shell/feature-flags.ts`:

```ts
export type HiddenShellFlag =
  | "showFutureAssistantStudio"
  | "showFutureOperations"
  | "showFutureAdvancedInsights";

export const HIDDEN_SHELL_FLAGS: Record<HiddenShellFlag, boolean> = {
  showFutureAssistantStudio: false,
  showFutureOperations: false,
  showFutureAdvancedInsights: false
};
```

- [ ] **Step 7: Create the browser entrypoint**

Create `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.js";
import { ThemeProvider } from "./shell/theme-context.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
```

- [ ] **Step 8: Point `index.html` at the new entrypoint**

Update `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SpyderByte Console</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Run tests and build to verify the scaffolding passes**

Run:

```bash
npm test -- --run tests/web-theme-context.test.ts
npm run build:web
```

Expected:

- Vitest PASS for `tests/web-theme-context.test.ts`
- Vite build succeeds

- [ ] **Step 10: Commit the scaffolding**

```bash
git add package.json package-lock.json apps/web/index.html apps/web/src/main.tsx apps/web/src/shell tests/web-theme-context.test.ts
git commit -m "feat: add dashboard route and theme scaffolding"
```

---

### Task 2: Build the Hermes-style shell and route metadata

**Files:**
- Create: `apps/web/src/shell/page-header-context.ts`
- Create: `apps/web/src/shell/use-page-header.ts`
- Create: `apps/web/src/shell/PageHeaderProvider.tsx`
- Create: `apps/web/src/shell/navigation.tsx`
- Create: `apps/web/src/shell/ShellLayout.tsx`
- Modify: `apps/web/src/App.tsx`
- Test: `apps/web/tests/e2e/workflow.spec.ts`

- [ ] **Step 1: Write the failing end-to-end assertion for route-based shell navigation**

Update `apps/web/tests/e2e/workflow.spec.ts` with this new test:

```ts
test("shell navigation uses route-aware links and preserves Wealth Factory headings", async ({ page }) => {
  await page.goto("/providers");
  await expect(page.getByTestId("dashboard-shell")).toBeVisible();
  await expect(page.getByTestId("page-providers")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Providers", exact: true })).toBeVisible();
  await page.getByTestId("nav-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("page-settings")).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run e2e -- --grep "route-aware links"
```

Expected: FAIL because direct deep linking and route-aware shell composition do not exist yet.

- [ ] **Step 3: Add the page-header context**

Create `apps/web/src/shell/page-header-context.ts`:

```ts
import { createContext, type ReactNode } from "react";

export interface PageHeaderContextValue {
  setTitle: (title: string | null) => void;
  setAfterTitle: (node: ReactNode) => void;
  setEnd: (node: ReactNode) => void;
}

export const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);
```

Create `apps/web/src/shell/use-page-header.ts`:

```ts
import { useContext } from "react";
import { PageHeaderContext } from "./page-header-context.js";

export function usePageHeader() {
  const context = useContext(PageHeaderContext);
  if (!context) {
    throw new Error("usePageHeader must be used within PageHeaderProvider");
  }
  return context;
}
```

- [ ] **Step 4: Create the Hermes-style page-header wrapper**

Create `apps/web/src/shell/PageHeaderProvider.tsx`:

```tsx
import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PageHeaderContext } from "./page-header-context.js";
import { getVisibleRouteMeta } from "./navigation.js";

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [titleOverride, setTitle] = useState<string | null>(null);
  const [afterTitle, setAfterTitle] = useState<ReactNode>(null);
  const [end, setEnd] = useState<ReactNode>(null);

  useLayoutEffect(() => {
    setTitle(null);
    setAfterTitle(null);
    setEnd(null);
  }, [pathname]);

  const routeMeta = getVisibleRouteMeta(pathname);
  const displayTitle = titleOverride ?? routeMeta.title;
  const value = useMemo(() => ({ setTitle, setAfterTitle, setEnd }), []);

  return (
    <PageHeaderContext.Provider value={value}>
      <div className="shellMain">
        <header className="shellTopbar">
          <div className="shellTopbarTitle">
            <h1>{displayTitle}</h1>
            {afterTitle}
          </div>
          {end ? <div className="shellTopbarActions">{end}</div> : null}
        </header>
        <main className="shellPageScroller">{children}</main>
      </div>
    </PageHeaderContext.Provider>
  );
}
```

- [ ] **Step 5: Create the nav metadata and hidden-route helpers**

Create `apps/web/src/shell/navigation.tsx`:

```tsx
import {
  Activity,
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
  Users,
  type LucideIcon
} from "lucide-react";
import { HIDDEN_SHELL_FLAGS } from "./feature-flags.js";

export type PageKey =
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
  | "settings";

export interface ShellRoute {
  key: string;
  path: string;
  title: string;
  summary: string;
  icon?: LucideIcon;
  hidden?: boolean;
}

export const VISIBLE_ROUTES: ShellRoute[] = [
  { key: "home", path: "/", title: "Home", summary: "What matters today, what is moving, and what needs your decision next.", icon: House },
  { key: "workflows", path: "/workflows", title: "Workflows", summary: "Run approved workflows inside your installed package boundary.", icon: Activity },
  { key: "results", path: "/results", title: "Results", summary: "Review outcomes, approvals, and delivery steps without exposing run mechanics.", icon: Library },
  { key: "team", path: "/team", title: "Team", summary: "Manage included roles, hired support, and premium power plays.", icon: Users },
  { key: "profiles", path: "/profiles", title: "Profiles", summary: "Switch between approved company contexts inside the same package family.", icon: BriefcaseBusiness },
  { key: "providers", path: "/providers", title: "Providers", summary: "Set up BYOK providers, subscriptions, and customer-owned storage in a calm, trustworthy way.", icon: KeyRound },
  { key: "insights", path: "/insights", title: "Insights", summary: "See customer-safe usage, output, and turnaround trends.", icon: Sparkles },
  { key: "package", path: "/package", title: "Package", summary: "Review the installed business system and the boundaries it creates.", icon: PackageCheck },
  { key: "files", path: "/files", title: "Files", summary: "Move important files into customer-owned storage before temporary delivery expires.", icon: HardDrive },
  { key: "assistant", path: "/assistant", title: "Assistant", summary: "Get package-grounded help and support intake without opening an unrestricted chatbot.", icon: Bot },
  { key: "billing", path: "/billing", title: "Billing", summary: "Monitor account health, renewals, and add-on charges.", icon: CreditCard },
  { key: "settings", path: "/settings", title: "Settings", summary: "Manage themes, notifications, support links, and account preferences.", icon: Settings2 }
];

export const HIDDEN_ROUTES: ShellRoute[] = [
  { key: "future-assistant-studio", path: "/assistant-studio", title: "Assistant Studio", summary: "Hidden future assistant surface.", hidden: !HIDDEN_SHELL_FLAGS.showFutureAssistantStudio },
  { key: "future-operations", path: "/operations", title: "Operations", summary: "Hidden future operations surface.", hidden: !HIDDEN_SHELL_FLAGS.showFutureOperations },
  { key: "future-advanced-insights", path: "/advanced-insights", title: "Advanced Insights", summary: "Hidden future analytics surface.", hidden: !HIDDEN_SHELL_FLAGS.showFutureAdvancedInsights }
];

export function getVisibleRouteMeta(pathname: string) {
  return (
    [...VISIBLE_ROUTES, ...HIDDEN_ROUTES].find((route) => route.path === pathname) ??
    VISIBLE_ROUTES[0]!
  );
}
```

- [ ] **Step 6: Create the Hermes-style shell frame**

Create `apps/web/src/shell/ShellLayout.tsx`:

```tsx
import { Menu, Search, Bell, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { VISIBLE_ROUTES } from "./navigation.js";

export function ShellLayout({
  children,
  roleLabel,
  packageName,
  tenantName
}: {
  children: ReactNode;
  roleLabel: string;
  packageName: string;
  tenantName: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <main className="appShell" data-testid="dashboard-shell">
      <button className={`mobileScrim${mobileOpen ? " active" : ""}`} onClick={() => setMobileOpen(false)} type="button" />
      <aside className={`shellSidebar${mobileOpen ? " open" : ""}`} aria-label="Workspace">
        <div className="shellBrand">
          <strong>Wealth Factory</strong>
          <span>{packageName}</span>
        </div>
        <div className="packageBadge">{packageName} | {tenantName}</div>
        <nav className="shellNav">
          {VISIBLE_ROUTES.map((route) => {
            const Icon = route.icon!;
            return (
              <NavLink key={route.key} className="shellNavLink" data-testid={`nav-${route.key}`} onClick={() => setMobileOpen(false)} to={route.path}>
                <Icon size={18} />
                <span>{route.title}</span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <section className="shellWorkspace">
        <header className="shellMobileHeader">
          <button className="iconButton" onClick={() => setMobileOpen(true)} type="button">
            <Menu size={18} />
          </button>
          <strong>Wealth Factory</strong>
          <button className="iconButton" onClick={() => setMobileOpen(false)} type="button">
            <X size={18} />
          </button>
        </header>
        <div className="shellUtilityBar">
          <label className="searchField">
            <Search size={16} />
            <input aria-label="Search" placeholder="Search workflows, results, providers" />
          </label>
          <button className="utilityButton" type="button">
            <Bell size={16} />
            3 alerts
          </button>
          <div className="roleBadge" aria-label="Role">{roleLabel}</div>
        </div>
        {children}
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Refactor `App.tsx` into shell composition**

Replace `apps/web/src/App.tsx` with:

```tsx
import { Navigate, Route, Routes } from "react-router-dom";
import { dashboardClient } from "./dashboard-client.js";
import { DashboardPages } from "./pages/DashboardPages.js";
import { PageHeaderProvider } from "./shell/PageHeaderProvider.js";
import { ShellLayout } from "./shell/ShellLayout.js";
import { VISIBLE_ROUTES } from "./shell/navigation.js";

type Role = "member" | "operator";

declare global {
  interface Window {
    __WF_SERVER_SESSION__?: { role: Role };
  }
}

function getInitialRole(): Role {
  return window.__WF_SERVER_SESSION__?.role === "operator" ? "operator" : "member";
}

export default function App() {
  const dashboard = dashboardClient.getSnapshot();
  const role = getInitialRole();

  return (
    <ShellLayout
      packageName={dashboard.packageName}
      roleLabel={role === "operator" ? "Operator" : "Member"}
      tenantName={dashboard.tenantName}
    >
      <PageHeaderProvider>
        <Routes>
          {VISIBLE_ROUTES.map((route) => (
            <Route
              key={route.key}
              path={route.path}
              element={<DashboardPages pageKey={route.key} role={role} />}
            />
          ))}
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </PageHeaderProvider>
    </ShellLayout>
  );
}
```

- [ ] **Step 8: Run the new end-to-end shell test and the web build**

Run:

```bash
npm run e2e -- --grep "route-aware links"
npm run build:web
```

Expected:

- Playwright PASS for the new shell route test
- Vite build succeeds

- [ ] **Step 9: Commit the shell**

```bash
git add apps/web/src/App.tsx apps/web/src/shell apps/web/tests/e2e/workflow.spec.ts
git commit -m "feat: add Hermes-style dashboard shell"
```

---

### Task 3: Move Wealth Factory page logic into route-driven page modules

**Files:**
- Create: `apps/web/src/pages/dashboard-data.ts`
- Create: `apps/web/src/pages/DashboardPages.tsx`
- Modify: `apps/web/src/dashboard-client.ts`
- Test: `tests/dashboard-client.test.ts`
- Test: `apps/web/tests/e2e/workflow.spec.ts`
- Test: `apps/web/tests/e2e/tenant-isolation.spec.ts`

- [ ] **Step 1: Preserve current behavior with failing regression assertions**

Append to `apps/web/tests/e2e/tenant-isolation.spec.ts`:

```ts
test("hidden future shell routes stay inaccessible by default", async ({ page }) => {
  await page.goto("/assistant-studio");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("page-home")).toBeVisible();
  await expect(page.getByRole("link", { name: "Assistant Studio" })).toHaveCount(0);
});
```

Append to `apps/web/tests/e2e/workflow.spec.ts`:

```ts
test("settings theme changes apply globally after route navigation", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Midnight" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "Midnight");
  await page.getByTestId("nav-workflows").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "Midnight");
});
```

- [ ] **Step 2: Run the focused e2e tests to verify they fail**

Run:

```bash
npm run e2e -- --grep "hidden future shell routes|settings theme changes"
```

Expected: FAIL because hidden routes and global theme persistence are not fully wired yet.

- [ ] **Step 3: Extract the dashboard data and helpers from the current monolith**

Create `apps/web/src/pages/dashboard-data.ts`:

```ts
import type { ThemePreset } from "../shell/theme-presets.js";
import type { PageKey } from "../shell/navigation.js";

export type Role = "member" | "operator";
export type RunStatus = "ready" | "queued" | "completed" | "paused";
export type ApprovalState = "Awaiting review" | "Approved" | "Revision needed";
export type TeamTab = "Included Team" | "Hired" | "Power Plays";
export type DateRange = "7D" | "30D" | "90D";
export type ProviderKey = "openai" | "anthropic" | "xaiGrok" | "openRouter" | "codex";

export const workflowCards = [
  { id: "wf-calendar", name: "Media calendar", description: "Plans a package-approved week of channel-ready campaign work." },
  { id: "wf-refresh", name: "Promotion refresh", description: "Reworks an active offer into package-safe launch copy and support assets." },
  { id: "wf-recap", name: "Weekly recap", description: "Packages completed work into a calm owner-facing update." }
] as const;

export function getThemeDescription(theme: ThemePreset): string {
  switch (theme) {
    case "Foundry":
      return "Dark green-black textured baseline with cream controls.";
    case "Midnight":
      return "Cool charcoal surfaces with sharper blue accents.";
    case "Ledger":
      return "Graphite and ivory surfaces with restrained contrast.";
    case "Ember":
      return "Warm dark panels with bronze-leaning action accents.";
  }
}

export function getPageTestId(page: PageKey) {
  return `page-${page}`;
}
```

- [ ] **Step 4: Create route-driven page components that preserve current page behaviors**

Create `apps/web/src/pages/DashboardPages.tsx`:

```tsx
import { Lock } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getPageTestId, getThemeDescription, workflowCards, type ApprovalState, type ProviderKey, type Role, type RunStatus } from "./dashboard-data.js";
import { useTheme } from "../shell/theme-context.js";
import type { PageKey } from "../shell/navigation.js";

export function DashboardPages({ pageKey, role }: { pageKey: string; role: Role }) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [connectedProviders, setConnectedProviders] = useState<Record<ProviderKey, boolean>>({
    openai: false,
    anthropic: false,
    xaiGrok: false,
    openRouter: false,
    codex: false
  });
  const [mediaProviderSaved, setMediaProviderSaved] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("ready");
  const [workflowsPaused, setWorkflowsPaused] = useState(false);
  const [resultApprovalStates] = useState<Record<string, ApprovalState>>({
    "result-241": "Awaiting review",
    "result-238": "Revision needed"
  });

  const providerReady = connectedProviders.openai;
  const packageReady = providerReady && mediaProviderSaved;
  const workflowLaunchReady = packageReady && !workflowsPaused;

  function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("apiKey") ?? "");
    if (!value.trim()) {
      return;
    }
    setConnectedProviders((current) => ({ ...current, openai: true }));
    event.currentTarget.reset();
  }

  if (pageKey === "settings") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("settings" as PageKey)}>
        <section className="panel">
          <h2>Theme and account settings</h2>
          <div className="themeSettings">
            {(["Foundry", "Midnight", "Ledger", "Ember"] as const).map((preset) => (
              <button key={preset} className={`themeSettingCard${theme === preset ? " active" : ""}`} onClick={() => setTheme(preset)} type="button">
                <strong>{preset}</strong>
                <span>{getThemeDescription(preset)}</span>
              </button>
            ))}
          </div>
        </section>
      </section>
    );
  }

  if (pageKey === "providers") {
    return (
      <section className="pageGrid singlePage" data-testid={getPageTestId("providers" as PageKey)}>
        <section className="panel providerForm">
          <form onSubmit={saveKey}>
            <label>
              API key
              <input aria-label="API key" name="apiKey" placeholder="Saved by reference only" type="password" />
            </label>
            <div className="actionRow">
              <button className="primaryButton" type="submit">
                <Lock size={16} />
                Save reference
              </button>
              <button className="secondaryButton" onClick={() => setMediaProviderSaved(true)} type="button">
                Connect image provider
              </button>
            </div>
          </form>
        </section>
      </section>
    );
  }

  if (pageKey === "workflows") {
    return (
      <section className="pageGrid workflowLayout" data-testid={getPageTestId("workflows" as PageKey)}>
        <section className="panel detailPanel">
          <h2>{workflowCards[0].name}</h2>
          <p>{workflowCards[0].description}</p>
          <button
            className="primaryButton"
            disabled={!workflowLaunchReady}
            onClick={() => {
              if (!workflowLaunchReady) {
                return;
              }
              setRunStatus("queued");
              navigate("/results");
            }}
            type="button"
          >
            Start workflow
          </button>
          {workflowsPaused ? <p>Workflow launches are paused for this tenant right now.</p> : null}
        </section>
      </section>
    );
  }

  if (pageKey === "results") {
    const statusMessage = runStatus === "queued" ? "Workflow queued. Secure worker is preparing the approved result." : "Results ready for review.";
    return (
      <section className="pageGrid resultsLayout" data-testid={getPageTestId("results" as PageKey)}>
        <section className="panel detailPanel" data-testid="workflow-result">
          <h2>Summer campaign calendar</h2>
          <p>{statusMessage}</p>
          <p>No prompts, tool traces, or backend activity are exposed here.</p>
          <p>{resultApprovalStates["result-241"]}</p>
        </section>
      </section>
    );
  }

  return <section className="pageGrid singlePage" data-testid={getPageTestId(pageKey as PageKey)}><section className="panel"><h2>{pageKey}</h2></section></section>;
}
```

- [ ] **Step 5: Adjust dashboard client tests only if needed**

If `apps/web/src/dashboard-client.ts` keeps the same external behavior, leave the implementation untouched and only ensure `tests/dashboard-client.test.ts` still passes.

If route metadata helpers are exported, use a non-breaking addition like:

```ts
export function getDashboardSnapshot() {
  return dashboardClient.getSnapshot();
}
```

- [ ] **Step 6: Run unit tests, focused e2e, and full web build**

Run:

```bash
npm test -- --run tests/dashboard-client.test.ts tests/web-theme-context.test.ts
npm run e2e -- --grep "member connects providers|operator can pause workflows|hidden future shell routes|settings theme changes"
npm run build:web
```

Expected:

- Vitest PASS for the dashboard client and theme tests
- Playwright PASS for the focused shell and behavior coverage
- Vite build succeeds

- [ ] **Step 7: Commit the page refactor**

```bash
git add apps/web/src/App.tsx apps/web/src/pages apps/web/src/dashboard-client.ts apps/web/tests/e2e/workflow.spec.ts apps/web/tests/e2e/tenant-isolation.spec.ts tests/dashboard-client.test.ts
git commit -m "feat: move dashboard pages into Hermes-style routes"
```

---

### Task 4: Port Hermes-derived global tokens and retire the old shell CSS

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/tests/e2e/workflow.spec.ts`

- [ ] **Step 1: Write the failing visual regression assertion for global theme attributes**

Append to `apps/web/tests/e2e/workflow.spec.ts`:

```ts
test("global theme attributes stay attached to the document shell", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Ember" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "Ember");
  await expect(page.locator(":root")).toHaveCSS("--background-base", "rgb(26, 13, 9)");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm run e2e -- --grep "global theme attributes"
```

Expected: FAIL because the current stylesheet does not yet use the Hermes-derived root token model.

- [ ] **Step 3: Replace the root token scaffold with Hermes-derived CSS**

At the top of `apps/web/src/styles.css`, replace the root setup with:

```css
:root {
  --foreground-base: #ffffff;
  --midground-base: #f4e6c6;
  --background-base: #071311;
  --foreground: color-mix(in srgb, var(--foreground-base) 100%, transparent);
  --midground: color-mix(in srgb, var(--midground-base) 100%, transparent);
  --background: color-mix(in srgb, var(--background-base) 100%, transparent);
  --theme-font-sans: "Azeret Mono", "Segoe UI", sans-serif;
  --theme-font-mono: "JetBrains Mono", monospace;
  --theme-radius: 0.5rem;
  --theme-line-height: 1.55;
  --component-sidebar-background: color-mix(in srgb, var(--background-base) 94%, transparent);
  --component-header-background: color-mix(in srgb, var(--background-base) 76%, transparent);
}

html {
  font-family: var(--theme-font-sans);
  background: var(--background-base);
  color: var(--midground);
  height: 100dvh;
  overflow: hidden;
}

body,
#root {
  min-height: 0;
  height: 100%;
  margin: 0;
  overflow: hidden;
}
```

- [ ] **Step 4: Add Hermes-style shell layout classes and remove the old sidebar/topbar system**

In `apps/web/src/styles.css`, add:

```css
.appShell {
  display: flex;
  min-height: 100%;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--midground-base) 12%, transparent), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--background-base) 92%, black), var(--background-base));
  color: var(--midground);
}

.shellSidebar {
  width: 16rem;
  display: flex;
  flex-direction: column;
  border-right: 1px solid color-mix(in srgb, var(--midground-base) 18%, transparent);
  background: var(--component-sidebar-background);
  backdrop-filter: blur(16px);
}

.shellWorkspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.shellTopbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 3.5rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--midground-base) 18%, transparent);
  background: var(--component-header-background);
  backdrop-filter: blur(16px);
}

.shellPageScroller {
  min-height: 0;
  overflow-y: auto;
}
```

Then delete obsolete class blocks that exclusively power the retired shell:

```css
.sidebar { }
.workspace { }
.topbar { }
.sidebarFooter { }
.themeDock { }
```

Replace them with the new `.shellSidebar`, `.shellWorkspace`, `.shellUtilityBar`, `.shellBrand`, `.shellNav`, `.shellNavLink`, `.shellMobileHeader`, and `.mobileScrim` class families.

- [ ] **Step 5: Run lint, build, unit tests, and the full e2e suite**

Run:

```bash
npm run lint
npm run build
npm run build:web
npm test
npm run e2e
```

Expected:

- ESLint PASS
- TypeScript PASS
- Vite build PASS
- Vitest PASS
- Playwright PASS

- [ ] **Step 6: Commit the stylesheet migration**

```bash
git add apps/web/src/styles.css apps/web/tests/e2e/workflow.spec.ts
git commit -m "feat: port Hermes theme tokens into dashboard styles"
```

---

### Task 5: Final review, repo update, and handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-05-15-hermes-wealth-factory-shell-design.md` (only if the implementation forces a design clarification)
- Modify: `docs/superpowers/plans/2026-05-15-hermes-wealth-factory-shell-implementation.md` (check off completed steps if your workflow does that)

- [ ] **Step 1: Run a final detail review pass**

Review for:

- hidden routes accidentally exposed
- theme state only partially global
- route redirects that leak inaccessible pages
- nav labels drifting from Wealth Factory language
- bloat or over-abstracted helpers
- stale selectors or broken mobile nav dismissal

- [ ] **Step 2: If the implementation changed the approved design, write the narrow clarification**

Only if needed, append a note like this to the design spec:

```md
## Implementation Clarification

The first Hermes shell pass keeps hidden future routes registered only through central metadata, but does not render placeholder route bodies for disabled sections. This preserves the flag boundary without exposing incomplete pages.
```

- [ ] **Step 3: Update the repo with the build-phase checkpoint**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:

- clean working tree after commits
- recent commits show the shell, route/page split, and theme migration milestones

- [ ] **Step 4: Commit any final doc clarifications**

```bash
git add docs/superpowers/specs/2026-05-15-hermes-wealth-factory-shell-design.md docs/superpowers/plans/2026-05-15-hermes-wealth-factory-shell-implementation.md
git commit -m "docs: record Hermes shell implementation decisions"
```

