import { Bell, CalendarRange, Menu, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import { dashboardClient } from "../dashboard-client.js";
import { PageHeaderProvider } from "./PageHeaderProvider.js";
import { HIDDEN_SHELL_FLAGS } from "./feature-flags.js";
import {
  getShellNavigationSections,
  resolveShellRoute,
  type ShellFeatureFlags,
  type ShellRouteDefinition
} from "./navigation.js";

export interface ShellLayoutProps {
  activePath: string;
  children: ReactNode;
  featureFlags?: Partial<ShellFeatureFlags>;
  headerUtilities?: ReactNode;
  onNavigate?: (path: string) => void;
  roleLabel?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  tenantName?: string;
  packageName?: string;
  onSearchChange?: (value: string) => void;
}

function getDefaultRoute(): ShellRouteDefinition {
  return resolveShellRoute("/") ?? getShellNavigationSections().primary[0]!;
}

function buttonChrome(isActive: boolean) {
  return {
    alignItems: "center",
    background: isActive
      ? "color-mix(in srgb, var(--midground-base, #f4e6c6) 16%, transparent)"
      : "transparent",
    border: "1px solid",
    borderColor: isActive
      ? "color-mix(in srgb, var(--midground-base, #f4e6c6) 20%, transparent)"
      : "transparent",
    borderRadius: "1rem",
    color: isActive
      ? "var(--foreground-base, #f5efde)"
      : "color-mix(in srgb, var(--foreground-base, #f5efde) 72%, transparent)",
    cursor: "pointer",
    display: "flex",
    gap: "0.75rem",
    padding: "0.8rem 0.95rem",
    textAlign: "left" as const,
    width: "100%"
  };
}

export function ShellLayout(props: ShellLayoutProps) {
  const snapshot = dashboardClient.getSnapshot();
  const featureFlags = useMemo(() => ({ ...HIDDEN_SHELL_FLAGS, ...props.featureFlags }), [props.featureFlags]);
  const navigation = useMemo(() => getShellNavigationSections(featureFlags), [featureFlags]);
  const activeRoute = useMemo(
    () => resolveShellRoute(props.activePath, featureFlags) ?? getDefaultRoute(),
    [featureFlags, props.activePath]
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1024px)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktopState = (matches: boolean) => {
      setIsDesktop(matches);
      if (matches) {
        setMobileOpen(false);
      }
    };

    syncDesktopState(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      syncDesktopState(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const tenantName = props.tenantName ?? snapshot.tenantName;
  const packageName = props.packageName ?? snapshot.packageName;

  function navigateTo(path: string) {
    props.onNavigate?.(path);
    setMobileOpen(false);
  }

  function handleNavigationClick(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (!props.onNavigate) {
      setMobileOpen(false);
      return;
    }

    event.preventDefault();
    navigateTo(path);
  }

  const defaultUtilities =
    props.headerUtilities ?? (
      <>
        <label
          style={{
            alignItems: "center",
            background: "color-mix(in srgb, var(--midground-base, #f4e6c6) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--foreground-base, #f5efde) 12%, transparent)",
            borderRadius: "999px",
            display: "flex",
            gap: "0.55rem",
            minWidth: "16rem",
            padding: "0.7rem 0.9rem"
          }}
        >
          <Search size={16} />
          <input
            aria-label="Search"
            onChange={(event) => props.onSearchChange?.(event.currentTarget.value)}
            placeholder={props.searchPlaceholder ?? "Search workflows, results, providers"}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              minWidth: 0,
              width: "100%"
            }}
            value={props.searchValue ?? ""}
          />
        </label>

        <button
          style={{
            alignItems: "center",
            background: "transparent",
            border: "1px solid color-mix(in srgb, var(--foreground-base, #f5efde) 12%, transparent)",
            borderRadius: "999px",
            color: "inherit",
            cursor: "pointer",
            display: "inline-flex",
            gap: "0.45rem",
            padding: "0.7rem 0.9rem"
          }}
          type="button"
        >
          <CalendarRange size={16} />
          Today
        </button>

        <button
          style={{
            alignItems: "center",
            background: "transparent",
            border: "1px solid color-mix(in srgb, var(--foreground-base, #f5efde) 12%, transparent)",
            borderRadius: "999px",
            color: "inherit",
            cursor: "pointer",
            display: "inline-flex",
            gap: "0.45rem",
            padding: "0.7rem 0.9rem"
          }}
          type="button"
        >
          <Bell size={16} />
          3 alerts
        </button>

        <div
          aria-label="Role"
          style={{
            background: "color-mix(in srgb, var(--midground-base, #f4e6c6) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--foreground-base, #f5efde) 12%, transparent)",
            borderRadius: "999px",
            padding: "0.7rem 0.9rem"
          }}
        >
          {props.roleLabel ?? "Member"}
        </div>
      </>
    );

  const navigationPanel = (
    <aside
      aria-label="Workspace"
      data-testid="shell-navigation"
      id="wealth-factory-shell-nav"
      style={{
        backdropFilter: "blur(24px)",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--background-base, #071311) 95%, transparent), color-mix(in srgb, black 82%, var(--background-base, #071311) 18%))",
        borderRight: "1px solid color-mix(in srgb, var(--foreground-base, #f5efde) 10%, transparent)",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        minHeight: 0,
        padding: "1.25rem",
        width: isDesktop ? "18.5rem" : "min(19rem, 82vw)"
      }}
    >
      <div style={{ alignItems: "center", display: "flex", gap: "0.9rem" }}>
        <div
          aria-hidden="true"
          style={{
            alignItems: "center",
            background: "linear-gradient(135deg, #f3e6c6, #dcbf8b)",
            borderRadius: "1rem",
            color: "#152019",
            display: "inline-flex",
            fontSize: "1.05rem",
            fontWeight: 700,
            height: "2.85rem",
            justifyContent: "center",
            width: "2.85rem"
          }}
        >
          W
        </div>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", fontSize: "1rem" }}>Wealth Factory</strong>
          <span
            style={{
              color: "color-mix(in srgb, var(--foreground-base, #f5efde) 68%, transparent)",
              display: "block",
              fontSize: "0.88rem"
            }}
          >
            Installed Package
          </span>
        </div>

        {!isDesktop ? (
          <button
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              marginLeft: "auto",
              padding: 0
            }}
            type="button"
          >
            <X size={20} />
          </button>
        ) : null}
      </div>

      <div
        style={{
          background: "color-mix(in srgb, var(--midground-base, #f4e6c6) 7%, transparent)",
          border: "1px solid color-mix(in srgb, var(--foreground-base, #f5efde) 10%, transparent)",
          borderRadius: "999px",
          color: "color-mix(in srgb, var(--foreground-base, #f5efde) 70%, transparent)",
          fontSize: "0.88rem",
          padding: "0.75rem 0.9rem"
        }}
      >
        {packageName} | {tenantName}
      </div>

      <nav style={{ display: "grid", gap: "0.45rem" }}>
        {navigation.primary.map((route) => {
          const Icon = route.icon;
          const isActive = activeRoute.key === route.key;

          return (
            <a
              aria-current={isActive ? "page" : undefined}
              data-testid={route.testId}
              href={route.path}
              key={route.key}
              onClick={(event) => handleNavigationClick(event, route.path)}
              style={buttonChrome(isActive)}
            >
              <Icon size={18} />
              <span>{route.label}</span>
            </a>
          );
        })}
      </nav>

      <div style={{ display: "grid", gap: "0.45rem", marginTop: "auto" }}>
        {navigation.secondary.map((route) => {
          const Icon = route.icon;
          const isActive = activeRoute.key === route.key;

          return (
            <a
              aria-current={isActive ? "page" : undefined}
              data-testid={route.testId}
              href={route.path}
              key={route.key}
              onClick={(event) => handleNavigationClick(event, route.path)}
              style={buttonChrome(isActive)}
            >
              <Icon size={18} />
              <span>{route.label}</span>
            </a>
          );
        })}
      </div>
    </aside>
  );

  return (
    <div
      data-testid="dashboard-shell"
      className="appShell"
      style={{
        background:
          "radial-gradient(circle at top left, rgba(110, 140, 102, 0.18), transparent 24%), linear-gradient(145deg, #08110d, #0f1613 46%, #111916 100%)",
        color: "var(--foreground-base, #f5efde)",
        display: "flex",
        minHeight: "100vh"
      }}
    >
      {!isDesktop && mobileOpen ? (
        <button
          aria-label="Dismiss navigation"
          onClick={() => setMobileOpen(false)}
          style={{
            background: "rgba(0, 0, 0, 0.56)",
            border: "none",
            inset: 0,
            position: "fixed",
            zIndex: 40
          }}
          type="button"
        />
      ) : null}

      {isDesktop ? (
        navigationPanel
      ) : mobileOpen ? (
        <div
          style={{
            inset: "0 auto 0 0",
            position: "fixed",
            zIndex: 50
          }}
        >
          {navigationPanel}
        </div>
      ) : null}

      <div style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
        {!isDesktop ? (
          <header
            style={{
              alignItems: "center",
              backdropFilter: "blur(18px)",
              background: "color-mix(in srgb, var(--background-base, #071311) 90%, transparent)",
              borderBottom: "1px solid color-mix(in srgb, var(--foreground-base, #f5efde) 14%, transparent)",
              display: "flex",
              gap: "0.85rem",
              padding: "0.85rem 1rem"
            }}
          >
            <button
              aria-controls="wealth-factory-shell-nav"
              aria-expanded={mobileOpen}
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                padding: 0
              }}
              type="button"
            >
              <Menu size={20} />
            </button>
            <strong>Wealth Factory</strong>
          </header>
        ) : null}

        <PageHeaderProvider
          activePath={activeRoute.path}
          defaultHeader={{
            eyebrow: `${packageName} operating system`,
            summary: activeRoute.header.summary,
            title: activeRoute.header.title
          }}
          persistentActions={defaultUtilities}
        >
          {props.children}
        </PageHeaderProvider>
      </div>
    </div>
  );
}
