alter table wfpc.paperclip_secret_bindings
  drop constraint if exists paperclip_secret_bindings_binding_status_check;

alter table wfpc.paperclip_secret_bindings
  add constraint paperclip_secret_bindings_binding_status_check
  check (binding_status in ('active', 'synced', 'revoked', 'error'));
