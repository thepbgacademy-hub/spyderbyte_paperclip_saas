alter table wfpc.harness_cards
  add column if not exists execution_claim_token text null,
  add column if not exists execution_claimed_at timestamptz null;

update wfpc.harness_cards
set execution_claim_token = md5(random()::text || clock_timestamp()::text || id::text),
    execution_claimed_at = coalesce(updated_at, now())
where state = 'working'
  and (execution_claim_token is null or execution_claimed_at is null);

alter table wfpc.harness_cards
  drop constraint if exists harness_cards_execution_claim_consistency;

alter table wfpc.harness_cards
  add constraint harness_cards_execution_claim_consistency
  check (
    (state = 'working' and execution_claim_token is not null and execution_claimed_at is not null)
    or
    (state <> 'working' and execution_claim_token is null and execution_claimed_at is null)
  );

create index if not exists harness_cards_run_state_execution_claim_idx
on wfpc.harness_cards (run_id, state, execution_claim_token);
