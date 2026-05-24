create table if not exists wfpc.harness_card_continuity (
  card_id uuid primary key references wfpc.harness_cards(id) on delete cascade,
  run_id uuid not null references wfpc.harness_runs(id) on delete cascade,
  continuity_summary text null,
  latest_result_summary text null,
  absorbed_work_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(absorbed_work_items) = 'array')
);

create index if not exists harness_card_continuity_run_updated_at_idx
on wfpc.harness_card_continuity (run_id, updated_at desc);
