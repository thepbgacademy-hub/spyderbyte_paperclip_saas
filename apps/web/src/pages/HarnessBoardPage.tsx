import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { createHarnessBoardClient } from "../harness-board-client.js";
import {
  HarnessBoard,
  type HarnessBoardCard,
  type HarnessBoardColumn
} from "../components/HarnessBoard.js";
import { HarnessCardDrawer } from "../components/HarnessCardDrawer.js";

const harnessBoardClient = createHarnessBoardClient();

const styles = {
  page: {
    background: "radial-gradient(circle at top, rgba(14, 165, 233, 0.16), transparent 28%), #020617",
    color: "#e2e8f0",
    display: "grid",
    gap: "1.25rem",
    minHeight: "100%",
    padding: "1.5rem"
  } satisfies CSSProperties,
  hero: {
    background: "linear-gradient(135deg, rgba(8, 47, 73, 0.96), rgba(15, 23, 42, 0.94))",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    borderRadius: "32px",
    boxShadow: "0 30px 80px rgba(2, 8, 23, 0.45)",
    display: "grid",
    gap: "1rem",
    padding: "1.6rem"
  } satisfies CSSProperties,
  eyebrow: {
    color: "#7dd3fc",
    fontSize: "0.8rem",
    fontWeight: 700,
    letterSpacing: "0.1em",
    margin: 0,
    textTransform: "uppercase"
  } satisfies CSSProperties,
  heroTitle: {
    color: "#f8fafc",
    fontSize: "2.1rem",
    lineHeight: 1.05,
    margin: 0
  } satisfies CSSProperties,
  heroSummary: {
    color: "#cbd5e1",
    fontSize: "1rem",
    lineHeight: 1.7,
    margin: 0,
    maxWidth: "56rem"
  } satisfies CSSProperties,
  metricGrid: {
    display: "grid",
    gap: "0.9rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
  } satisfies CSSProperties,
  metricCard: {
    background: "rgba(15, 23, 42, 0.58)",
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: "22px",
    display: "grid",
    gap: "0.35rem",
    padding: "1rem"
  } satisfies CSSProperties,
  metricLabel: {
    color: "#94a3b8",
    fontSize: "0.82rem",
    margin: 0
  } satisfies CSSProperties,
  metricValue: {
    color: "#f8fafc",
    fontSize: "1.45rem",
    fontWeight: 700,
    margin: 0
  } satisfies CSSProperties,
  content: {
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: "minmax(0, 1.8fr) minmax(320px, 0.95fr)"
  } satisfies CSSProperties,
  rail: {
    display: "grid",
    gap: "1rem"
  } satisfies CSSProperties,
  panel: {
    background: "rgba(7, 15, 24, 0.8)",
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: "28px",
    padding: "1.15rem"
  } satisfies CSSProperties,
  panelTitle: {
    color: "#f8fafc",
    fontSize: "1rem",
    fontWeight: 700,
    margin: "0 0 0.4rem"
  } satisfies CSSProperties,
  panelBody: {
    color: "#cbd5e1",
    fontSize: "0.92rem",
    lineHeight: 1.6,
    margin: 0
  } satisfies CSSProperties,
  personaList: {
    display: "grid",
    gap: "0.75rem",
    margin: "0.8rem 0 0",
    padding: 0
  } satisfies CSSProperties,
  personaItem: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    listStyle: "none"
  } satisfies CSSProperties,
  personaName: {
    color: "#e2e8f0",
    fontWeight: 600
  } satisfies CSSProperties,
  personaDetail: {
    color: "#94a3b8",
    fontSize: "0.82rem"
  } satisfies CSSProperties
};

function getPersonaMetrics(cards: HarnessBoardCard[]) {
  const personaCounts = new Map<string, number>();

  for (const card of cards) {
    personaCounts.set(card.persona, (personaCounts.get(card.persona) ?? 0) + 1);
  }

  return Array.from(personaCounts.entries()).map(([persona, count]) => ({
    persona,
    count
  }));
}

export function HarnessBoardPage() {
  const browserFallbackEnabled = harnessBoardClient.isBrowserFallbackEnabled();
  const [board, setBoard] = useState(() => (browserFallbackEnabled ? harnessBoardClient.getFallback() : null));
  const [openCardId, setOpenCardId] = useState<string>(() =>
    browserFallbackEnabled ? harnessBoardClient.getFallback().cards[0]?.id ?? "" : ""
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    harnessBoardClient
      .fetchBoard()
      .then((nextBoard) => {
        if (cancelled) {
          return;
        }
        setLoadError(null);
        setBoard(nextBoard);
        setOpenCardId((current) =>
          nextBoard.cards.some((card) => card.id === current) ? current : nextBoard.cards[0]?.id || ""
        );
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        if (browserFallbackEnabled) {
          const fallbackBoard = harnessBoardClient.getFallback();
          setLoadError(null);
          setBoard(fallbackBoard);
          setOpenCardId((current) =>
            fallbackBoard.cards.some((card) => card.id === current) ? current : fallbackBoard.cards[0]?.id || ""
          );
          return;
        }

        setLoadError("Unable to load the harness board right now.");
        setBoard(null);
        setOpenCardId("");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const cards = board?.cards ?? [];
  const columns = board?.columns ?? [];
  const pendingApprovals = board?.pendingApprovals ?? [];
  const activeCard = cards.find((card) => card.id === openCardId) ?? null;
  const personaMetrics = useMemo(() => getPersonaMetrics(cards), [cards]);
  const currentFocus = activeCard?.title ?? cards[0]?.title ?? "Preparing the next move";

  return (
    <main data-testid="page-board" style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.eyebrow}>Harness board</p>
          <h1 style={styles.heroTitle}>Orchestrator board for clean tenant-facing progress</h1>
          <p style={styles.heroSummary}>
            Persona cards stay concise, high-level, and readable. The board shows what each lane is advancing
            without exposing backend mechanics or internal run chatter.
          </p>
        </div>
        <div style={styles.metricGrid}>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Active cards</p>
            <p style={styles.metricValue}>{cards.length}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Current focus</p>
            <p style={styles.metricValue}>{currentFocus}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>Persona workload</p>
            <p style={styles.metricValue}>{personaMetrics.length > 1 ? "Balanced" : "Focused"}</p>
          </article>
          <article style={styles.metricCard}>
            <p style={styles.metricLabel}>CEO approvals</p>
            <p style={styles.metricValue}>{pendingApprovals.length}</p>
          </article>
        </div>
      </section>

      <section style={styles.content}>
        <HarnessBoard
          activeCardId={openCardId}
          cards={cards as HarnessBoardCard[]}
          columns={columns as HarnessBoardColumn[]}
          onCardOpen={setOpenCardId}
        />

        <aside style={styles.rail}>
          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>Persona workload</h2>
            <p style={styles.panelBody}>A quick view of which business personas are currently carrying visible work.</p>
            <ul style={styles.personaList}>
              {personaMetrics.map((metric) => (
                <li key={metric.persona} style={styles.personaItem}>
                  <span style={styles.personaName}>{metric.persona}</span>
                  <span style={styles.personaDetail}>{metric.count} card</span>
                </li>
              ))}
            </ul>
            {!board && loadError ? <p style={{ ...styles.panelBody, marginTop: "0.8rem" }}>{loadError}</p> : null}
          </section>

          <section style={styles.panel}>
            <h2 style={styles.panelTitle}>CEO approvals</h2>
            <p style={styles.panelBody}>Pending sub-card requests that still need CEO approval before new lanes open.</p>
            <ul style={styles.personaList}>
              {pendingApprovals.length === 0 ? (
                <li style={styles.personaItem}>
                  <span style={styles.personaName}>No pending approvals</span>
                  <span style={styles.personaDetail}>Board is staying bounded</span>
                </li>
              ) : (
                pendingApprovals.map((approval) => (
                  <li key={approval.id} style={styles.personaItem}>
                    <span style={styles.personaName}>{approval.targetPersona}</span>
                    <span style={styles.personaDetail}>{approval.statusLabel}</span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <HarnessCardDrawer card={activeCard} onClose={() => setOpenCardId("")} open={Boolean(activeCard)} />
        </aside>
      </section>
    </main>
  );
}

export default HarnessBoardPage;
