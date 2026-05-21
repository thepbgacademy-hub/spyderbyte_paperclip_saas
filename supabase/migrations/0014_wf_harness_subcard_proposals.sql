create table if not exists wfpc.harness_subcard_proposals (
  id uuid primary key,
  run_id uuid not null references wfpc.harness_runs(id) on delete cascade,
  parent_card_id uuid not null references wfpc.harness_cards(id) on delete cascade,
  requested_by_card_id uuid not null references wfpc.harness_cards(id) on delete cascade,
  requested_by_persona text not null,
  persona text not null,
  title text not null,
  deliverable_type text not null,
  status text not null check (status in ('proposed', 'approved')),
  approved_card_id uuid null references wfpc.harness_cards(id) on delete set null deferrable initially deferred,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists harness_subcard_proposals_run_created_at_idx
on wfpc.harness_subcard_proposals (run_id, created_at asc);

create unique index if not exists harness_subcard_proposals_approved_card_idx
on wfpc.harness_subcard_proposals (approved_card_id)
where approved_card_id is not null;
