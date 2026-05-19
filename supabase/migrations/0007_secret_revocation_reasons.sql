alter table wfpc.secret_references
add column if not exists revoked_reason text;

update wfpc.secret_references
set revoked_reason = 'manual'
where revoked_at is not null
  and revoked_reason is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'secret_references_revoked_reason_check'
      and conrelid = 'wfpc.secret_references'::regclass
  ) then
    alter table wfpc.secret_references
    add constraint secret_references_revoked_reason_check
    check (
      revoked_reason is null
      or revoked_reason in ('manual', 'superseded')
    );
  end if;
end $$;
