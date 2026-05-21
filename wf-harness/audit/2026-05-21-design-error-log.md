# Wealth Factory Harness Design Error Log

Date: 2026-05-21
Phase: Design kickoff

## Purpose

Capture design-stage mistakes, false assumptions, and pressure-test lessons so they are not repeated in the custom harness effort.

## Known Lessons Imported From The Prior Build

1. Paperclip proved the concept but became the sustained hotspot under commercial-style soak.
2. Queue reliability does not guarantee execution-engine reliability.
3. Tenant safety, fairness, and backpressure must be first-class system rules.
4. Tenant-facing UX should stay calm and structured; backend chatter is not product value.
5. BYOK must remain in Wealth Factory, not leak into the execution engine boundary.
6. Recovery from interruption must be based on persisted state, not conversation memory.

## Current Design-Stage Risks To Avoid

1. Recreating Paperclip's weak spots by copying implementation literally instead of mirroring behavior intentionally.
2. Letting child personas talk directly to each other and causing uncontrolled drift.
3. Allowing uncontrolled dynamic card creation until the board becomes unreadable.
4. Building a dashboard that exposes backend execution details instead of meaningful progress.
5. Turning the new harness into a broad “agent OS” instead of a bounded Wealth Factory orchestration slice.
