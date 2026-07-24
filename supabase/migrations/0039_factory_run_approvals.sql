-- TASK-076: durable persistence for the factory run approval checkpoint.
-- Approval domain logic already exists (src/factory/approvals/approval-service.ts)
-- but was in-memory only; the sole approval table before this migration (0034)
-- is the legacy Paperclip harness flow, not the blueprint-native factory run.
-- Isolation is app-layer tenant_id scoping (WHERE tenant_id = $1) in the
-- repository, same load-bearing pattern as 0037/0038; RLS below is defense in
-- depth, not the mechanism the isolation test proves (TASK-076 AC3).
--
-- contract_key distinguishes the original positioning approval from the one
-- allowed revision (positioning-station-service.ts's "original" | "revision_1"),
-- so the one-revision cap can be enforced by inspecting a single row instead
-- of reconstructing full run state -- there is no separate factory run table.

create table if not exists wfpc.factory_run_approvals (
  approval_id text primary key,
  tenant_id uuid not null references wfpc.tenants(id) on delete cascade,
  run_id text not null,
  package_id text not null,
  package_version_id text not null,
  package_install_id text not null,
  station_key text not null check (station_key = 'positioning'),
  deliverable_id text not null,
  contract_key text not null check (contract_key in ('original', 'revision_1')),
  approval_status text not null check (approval_status in ('pending', 'approved', 'changes_requested')),
  requested_at timestamptz not null,
  resolved_at timestamptz null,
  resolution_summary text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factory_run_approvals_install_fk
    foreign key (package_install_id) references wfpc.factory_blueprint_package_installs(install_id),
  constraint factory_run_approvals_deliverable_fk
    foreign key (deliverable_id) references wfpc.factory_run_deliverables(deliverable_id),
  constraint factory_run_approvals_lifecycle_check check (
    (approval_status = 'pending' and resolved_at is null and resolution_summary is null)
    or (approval_status = 'approved' and resolved_at is not null)
    or (approval_status = 'changes_requested' and resolved_at is not null and resolution_summary is not null)
  )
);

comment on table wfpc.factory_run_approvals is
  'Blueprint-native factory run approval checkpoints; distinct from the legacy 0034 Paperclip harness approval table.';

-- At most one pending approval per (tenant_id, run_id), mirroring
-- intake-run-service.ts's single-slot activeApprovalId invariant. Tenant-scoped
-- because run_id is not globally unique across tenants; a bare (run_id) index
-- would let tenant B's pending approval collide with tenant A's.
create unique index if not exists factory_run_approvals_one_pending_per_run
  on wfpc.factory_run_approvals (tenant_id, run_id)
  where approval_status = 'pending';

create index if not exists factory_run_approvals_tenant_run_idx
  on wfpc.factory_run_approvals (tenant_id, run_id);

alter table wfpc.factory_run_approvals enable row level security;

drop policy if exists "members can read factory run approvals"
  on wfpc.factory_run_approvals;

create policy "members can read factory run approvals"
  on wfpc.factory_run_approvals
  for select
  to authenticated
  using (wfpc_private.is_tenant_member(tenant_id));
