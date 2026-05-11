alter table wfpc_private.vault_secrets
alter column provider_kind type text
using provider_kind::text;
