import type { CSSProperties } from "react";

export interface HarnessActivityItem {
  id: string;
  label: string;
  timestampLabel: string;
}

export interface HarnessDetailSection {
  id: string;
  title: string;
  body: string;
}

export interface HarnessBoardCard {
  id: string;
  persona: string;
  title: string;
  summary: string;
  lane: string;
  statusLabel: string;
  priorityLabel: string;
  deliverableLabel: string;
  updatedAtLabel: string;
  outcome: string;
  focusPoints: string[];
  activity: HarnessActivityItem[];
  detailSections: HarnessDetailSection[];
}

export interface HarnessBoardColumn {
  id: string;
  title: string;
  description: string;
  cardIds: string[];
}

export interface HarnessBoardProps {
  activeCardId?: string | null;
  cards: HarnessBoardCard[];
  columns: HarnessBoardColumn[];
  onCardOpen: (cardId: string) => void;
}

const styles = {
  board: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
  } satisfies CSSProperties,
  column: {
    background: "rgba(7, 15, 24, 0.78)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "24px",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
    display: "flex",
    flexDirection: "column",
    gap: "0.9rem",
    minHeight: "320px",
    padding: "1rem"
  } satisfies CSSProperties,
  columnHeader: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem"
  } satisfies CSSProperties,
  columnTitle: {
    color: "#f8fafc",
    fontSize: "1rem",
    fontWeight: 700,
    margin: 0
  } satisfies CSSProperties,
  columnDescription: {
    color: "#94a3b8",
    fontSize: "0.9rem",
    margin: 0
  } satisfies CSSProperties,
  cardStack: {
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem"
  } satisfies CSSProperties,
  cardButton: {
    background: "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.78))",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "20px",
    color: "#e2e8f0",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "1rem",
    textAlign: "left",
    width: "100%"
  } satisfies CSSProperties,
  activeCardButton: {
    borderColor: "rgba(125, 211, 252, 0.8)",
    boxShadow: "0 0 0 1px rgba(125, 211, 252, 0.35), 0 18px 40px rgba(14, 116, 144, 0.18)"
  } satisfies CSSProperties,
  cardMetaRow: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    justifyContent: "space-between"
  } satisfies CSSProperties,
  personaPill: {
    background: "rgba(56, 189, 248, 0.14)",
    borderRadius: "999px",
    color: "#bae6fd",
    fontSize: "0.77rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    padding: "0.3rem 0.65rem",
    textTransform: "uppercase"
  } satisfies CSSProperties,
  updatedAt: {
    color: "#94a3b8",
    fontSize: "0.78rem"
  } satisfies CSSProperties,
  cardTitle: {
    color: "#f8fafc",
    fontSize: "1rem",
    fontWeight: 700,
    margin: 0
  } satisfies CSSProperties,
  cardSummary: {
    color: "#cbd5e1",
    fontSize: "0.92rem",
    lineHeight: 1.5,
    margin: 0
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.45rem"
  } satisfies CSSProperties,
  chip: {
    background: "rgba(148, 163, 184, 0.14)",
    borderRadius: "999px",
    color: "#cbd5e1",
    fontSize: "0.78rem",
    padding: "0.3rem 0.6rem"
  } satisfies CSSProperties,
  outcomeLabel: {
    color: "#7dd3fc",
    fontSize: "0.76rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    margin: 0,
    textTransform: "uppercase"
  } satisfies CSSProperties,
  outcomeText: {
    color: "#e2e8f0",
    fontSize: "0.86rem",
    lineHeight: 1.5,
    margin: 0
  } satisfies CSSProperties,
  emptyState: {
    color: "#64748b",
    fontSize: "0.9rem",
    margin: "0.5rem 0 0"
  } satisfies CSSProperties
};

export function HarnessBoard(props: HarnessBoardProps) {
  const cardsById = new Map(props.cards.map((card) => [card.id, card]));

  return (
    <section aria-label="Harness board" data-testid="harness-board" style={styles.board}>
      {props.columns.map((column) => {
        const columnCards = column.cardIds
          .map((cardId) => cardsById.get(cardId))
          .filter((card): card is HarnessBoardCard => Boolean(card));

        return (
          <article key={column.id} style={styles.column}>
            <header style={styles.columnHeader}>
              <h2 style={styles.columnTitle}>{column.title}</h2>
              <p style={styles.columnDescription}>{column.description}</p>
            </header>
            <div style={styles.cardStack}>
              {columnCards.length > 0 ? (
                columnCards.map((card) => {
                  const cardStyle =
                    props.activeCardId === card.id
                      ? { ...styles.cardButton, ...styles.activeCardButton }
                      : styles.cardButton;

                  return (
                    <button
                      key={card.id}
                      aria-label={`Open ${card.persona} card details`}
                      data-testid={`harness-card-${card.id}`}
                      onClick={() => props.onCardOpen(card.id)}
                      style={cardStyle}
                      type="button"
                    >
                      <div style={styles.cardMetaRow}>
                        <span style={styles.personaPill}>{card.persona}</span>
                        <span style={styles.updatedAt}>{card.updatedAtLabel}</span>
                      </div>
                      <div>
                        <h3 style={styles.cardTitle}>{card.title}</h3>
                        <p style={styles.cardSummary}>{card.summary}</p>
                      </div>
                      <div style={styles.chipRow}>
                        <span style={styles.chip}>{card.statusLabel}</span>
                        <span style={styles.chip}>{card.priorityLabel}</span>
                        <span style={styles.chip}>{card.deliverableLabel}</span>
                      </div>
                      <div>
                        <p style={styles.outcomeLabel}>Outcome</p>
                        <p style={styles.outcomeText}>{card.outcome}</p>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p style={styles.emptyState}>No persona cards in this lane.</p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

export default HarnessBoard;
