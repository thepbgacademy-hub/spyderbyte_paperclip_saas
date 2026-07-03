drop index if exists wfpc.harness_runs_tenant_workflow_unique_idx;

create index if not exists harness_runs_tenant_workflow_latest_idx
on wfpc.harness_runs (tenant_id, workflow_id, updated_at desc, created_at desc);

create unique index if not exists harness_runs_previous_run_successor_unique_idx
on wfpc.harness_runs (tenant_id, workflow_id, (runtime_context ->> 'previousRunId'))
where runtime_context ? 'previousRunId';
