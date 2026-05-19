with ranked_active as (
  select id,
         row_number() over (
           partition by tenant_id, provider_kind
           order by updated_at desc nulls last, created_at desc nulls last, id desc
         ) as active_rank
  from wfpc.secret_references
  where revoked_at is null
)
update wfpc.secret_references secrets
set revoked_at = now(),
    updated_at = now()
from ranked_active ranked
where secrets.id = ranked.id
  and ranked.active_rank > 1;

drop index if exists wfpc.secret_references_active_unique;
drop index if exists secret_references_active_unique;

create unique index if not exists secret_references_active_provider_lane_unique
on wfpc.secret_references (tenant_id, provider_kind)
where revoked_at is null;
