import type { CSSProperties } from "react";

import type { HarnessBoardCard } from "./HarnessBoard.js";

export interface HarnessCardDrawerProps {
  card: HarnessBoardCard | null;
  open: boolean;
  onClose: () => void;
}

const styles = {
  drawer: {
    background: "linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.88))",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "28px",
    boxShadow: "0 30px 70px rgba(15, 23, 42, 0.28)",
    color: "#e2e8f0",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    minHeight: "100%",
    padding: "1.25rem",
    position: "relative"
  } satisfies CSSProperties,
  drawerHidden: {
    display: "none"
  } satisfies CSSProperties,
  header: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
    alignItems: "flex-start"
  } satisfies CSSProperties,
  eyebrow: {
    color: "#7dd3fc",
    fontSize: "0.76rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    margin: "0 0 0.35rem",
    textTransform: "uppercase"
  } satisfies CSSProperties,
  title: {
    color: "#f8fafc",
    fontSize: "1.25rem",
    fontWeight: 700,
    margin: 0
  } satisfies CSSProperties,
  summary: {
    color: "#cbd5e1",
    fontSize: "0.95rem",
    lineHeight: 1.6,
    margin: "0.5rem 0 0"
  } satisfies CSSProperties,
  closeButton: {
    background: "rgba(148, 163, 184, 0.12)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: "999px",
    color: "#e2e8f0",
    cursor: "pointer",
    fontSize: "0.84rem",
    padding: "0.45rem 0.8rem"
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.55rem"
  } satisfies CSSProperties,
  metaChip: {
    background: "rgba(148, 163, 184, 0.12)",
    borderRadius: "999px",
    color: "#cbd5e1",
    fontSize: "0.78rem",
    padding: "0.32rem 0.64rem"
  } satisfies CSSProperties,
  section: {
    background: "rgba(15, 23, 42, 0.48)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "20px",
    padding: "1rem"
  } satisfies CSSProperties,
  sectionTitle: {
    color: "#f8fafc",
    fontSize: "0.95rem",
    fontWeight: 700,
    margin: "0 0 0.55rem"
  } satisfies CSSProperties,
  sectionBody: {
    color: "#cbd5e1",
    fontSize: "0.9rem",
    lineHeight: 1.6,
    margin: 0
  } satisfies CSSProperties,
  list: {
    color: "#cbd5e1",
    display: "grid",
    gap: "0.55rem",
    margin: 0,
    paddingInlineStart: "1rem"
  } satisfies CSSProperties,
  timeline: {
    display: "grid",
    gap: "0.75rem"
  } satisfies CSSProperties,
  timelineItem: {
    display: "grid",
    gap: "0.15rem"
  } satisfies CSSProperties,
  timelineLabel: {
    color: "#e2e8f0",
    fontSize: "0.88rem",
    margin: 0
  } satisfies CSSProperties,
  timelineTime: {
    color: "#94a3b8",
    fontSize: "0.78rem",
    margin: 0
  } satisfies CSSProperties
};

export function HarnessCardDrawer(props: HarnessCardDrawerProps) {
  if (!props.open || !props.card) {
    return <aside data-testid="harness-card-drawer" hidden style={styles.drawerHidden} />;
  }

  return (
    <aside
      aria-label="Card details"
      data-testid="harness-card-drawer"
      style={styles.drawer}
    >
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Card details</p>
          <h2 style={styles.title}>{props.card.title}</h2>
          <p style={styles.summary}>{props.card.summary}</p>
        </div>
        <button onClick={props.onClose} style={styles.closeButton} type="button">
          Close
        </button>
      </header>

      <div style={styles.metaRow}>
        <span style={styles.metaChip}>{props.card.persona}</span>
        <span style={styles.metaChip}>{props.card.statusLabel}</span>
        <span style={styles.metaChip}>{props.card.priorityLabel}</span>
        <span style={styles.metaChip}>{props.card.deliverableLabel}</span>
      </div>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Outcome</h3>
        <p style={styles.sectionBody}>{props.card.outcome}</p>
      </section>

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Focus points</h3>
        <ul style={styles.list}>
          {props.card.focusPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </section>

      {props.card.detailSections.map((section) => (
        <section key={section.id} style={styles.section}>
          <h3 style={styles.sectionTitle}>{section.title}</h3>
          <p style={styles.sectionBody}>{section.body}</p>
        </section>
      ))}

      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>Recent activity</h3>
        <div style={styles.timeline}>
          {props.card.activity.map((item) => (
            <div key={item.id} style={styles.timelineItem}>
              <p style={styles.timelineLabel}>{item.label}</p>
              <p style={styles.timelineTime}>{item.timestampLabel}</p>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export default HarnessCardDrawer;
