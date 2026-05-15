import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import {
  PageHeaderContext,
  type PageHeaderDefinition,
  type PageHeaderRegistration
} from "./page-header-context.js";

export interface PageHeaderProviderProps {
  activePath: string;
  children: ReactNode;
  defaultHeader: PageHeaderDefinition;
  persistentActions?: ReactNode;
}

function resolveHeaderValue(
  base: string | null | undefined,
  override: string | null | undefined
): string | null | undefined {
  return override ?? base;
}

export function PageHeaderProvider(props: PageHeaderProviderProps) {
  const [headerRegistration, setHeaderRegistration] = useState<PageHeaderRegistration | null>(null);

  useLayoutEffect(() => {
    setHeaderRegistration(null);
  }, [props.activePath]);

  const value = useMemo(
    () => ({
      setActions(actions: ReactNode) {
        setHeaderRegistration((current) => ({ ...current, actions }));
      },
      setAfterTitle(afterTitle: ReactNode) {
        setHeaderRegistration((current) => ({ ...current, afterTitle }));
      },
      setEyebrow(eyebrow: string | null) {
        setHeaderRegistration((current) => ({ ...current, eyebrow }));
      },
      setPageHeader(header: PageHeaderRegistration | null) {
        setHeaderRegistration(header);
      },
      setSummary(summary: string | null) {
        setHeaderRegistration((current) => ({ ...current, summary }));
      },
      setTitle(title: string | null) {
        setHeaderRegistration((current) => ({ ...current, title }));
      }
    }),
    []
  );

  const resolvedEyebrow = resolveHeaderValue(props.defaultHeader.eyebrow, headerRegistration?.eyebrow);
  const resolvedTitle = resolveHeaderValue(props.defaultHeader.title, headerRegistration?.title) ?? props.defaultHeader.title;
  const resolvedSummary = resolveHeaderValue(props.defaultHeader.summary, headerRegistration?.summary);

  return (
    <PageHeaderContext.Provider value={value}>
      <div
        data-testid="shell-content-frame"
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden"
        }}
      >
        <header
          data-testid="page-header"
          style={{
            backdropFilter: "blur(18px)",
            background: "color-mix(in srgb, var(--background-base, #071311) 88%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, var(--foreground-base, #f5efde) 14%, transparent)",
            flexShrink: 0
          }}
        >
          <div
            style={{
              alignItems: "flex-start",
              display: "flex",
              gap: "1rem",
              justifyContent: "space-between",
              minWidth: 0,
              padding: "1.25rem 1.5rem"
            }}
          >
            <div style={{ display: "grid", gap: "0.45rem", minWidth: 0 }}>
              {resolvedEyebrow ? (
                <p
                  data-testid="page-header-eyebrow"
                  style={{
                    color: "color-mix(in srgb, var(--foreground-base, #f5efde) 64%, transparent)",
                    fontSize: "0.72rem",
                    letterSpacing: "0.14em",
                    margin: 0,
                    textTransform: "uppercase"
                  }}
                >
                  {resolvedEyebrow}
                </p>
              ) : null}

              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  minWidth: 0
                }}
              >
                <h1
                  style={{
                    color: "var(--foreground-base, #f5efde)",
                    fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
                    letterSpacing: "-0.04em",
                    margin: 0
                  }}
                >
                  {resolvedTitle}
                </h1>
                {headerRegistration?.afterTitle}
              </div>

              {resolvedSummary ? (
                <p
                  data-testid="page-header-summary"
                  style={{
                    color: "color-mix(in srgb, var(--foreground-base, #f5efde) 74%, transparent)",
                    fontSize: "0.97rem",
                    lineHeight: 1.5,
                    margin: 0,
                    maxWidth: "56rem"
                  }}
                >
                  {resolvedSummary}
                </p>
              ) : null}
            </div>

            {headerRegistration?.actions || props.persistentActions ? (
              <div
                data-testid="page-header-actions"
                style={{
                  alignItems: "center",
                  display: "flex",
                  flexShrink: 0,
                  flexWrap: "wrap",
                  gap: "0.75rem",
                  justifyContent: "flex-end"
                }}
              >
                {headerRegistration?.actions}
                {props.persistentActions}
              </div>
            ) : null}
          </div>
        </header>

        <main
          data-testid="page-scroll-region"
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflowX: "hidden",
            overflowY: "auto"
          }}
        >
          {props.children}
        </main>
      </div>
    </PageHeaderContext.Provider>
  );
}
