create table if not exists wfpc.harness_board_decisions (
  id uuid primary key,
  run_id uuid not null references wfpc.harness_runs(id) on delete cascade,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  actor_user_id text not null,
  decision_kind text not null check (decision_kind in ('lane_opened', 'proposal_approved', 'proposal_deferred', 'proposal_denied', 'run_completed')),
  card_id uuid null references wfpc.harness_cards(id) on delete set null,
  proposal_id uuid null references wfpc.harness_subcard_proposals(id) on delete set null,
  target_card_id uuid null references wfpc.harness_cards(id) on delete set null,
  persona text null,
  deliverable_type text null,
  resolution text null check (resolution in ('create_lane', 'update_existing_lane')),
  decision_note text null,
  created_at timestamptz not null default now()
);

create index if not exists harness_board_decisions_run_created_at_idx
on wfpc.harness_board_decisions (run_id, created_at desc);

create index if not exists harness_board_decisions_tenant_created_at_idx
on wfpc.harness_board_decisions (tenant_id, created_at desc);
