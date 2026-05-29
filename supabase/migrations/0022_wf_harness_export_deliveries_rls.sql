alter table wfpc.harness_export_deliveries enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'wfpc'
      and tablename = 'harness_export_deliveries'
      and policyname = 'members can read harness export deliveries'
  ) then
    create policy "members can read harness export deliveries"
    on wfpc.harness_export_deliveries for select
    to authenticated
    using (wfpc_private.is_tenant_member(tenant_id));
  end if;
end $$;
