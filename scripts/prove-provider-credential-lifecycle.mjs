import process from "node:process";

import { createPgPool, createPgPoolQueryClient } from "../dist/db/postgres-client.js";
import { createDashboardRuntime, loadRuntimeEnv } from "../dist/api/runtime-server.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenant || !args.user || !args.providerKind || !args.label) {
    throw new Error("Missing required args: --tenant, --user, --provider-kind, --label");
  }

  const env = loadRuntimeEnv(process.env);
  const runtime = createDashboardRuntime({
    env,
    auth: { authenticate: async () => null }
  });
  const pool = createPgPool({
    connectionString: env.supabaseDbUrl,
    ...(env.supabaseDbSsl ? { sslMode: env.supabaseDbSsl } : {})
  });
  const client = createPgPoolQueryClient(pool);

  try {
    const metadata = parseMetadata(args.metadata);
    const secretName = args.secretName?.trim() || "apiKey";
    const mode = args.mode ?? "full";
    const result = await runLifecycleMode({
      runtime,
      client,
      mode,
      tenantId: args.tenant,
      userId: args.user,
      providerKind: args.providerKind,
      label: args.label,
      secretName,
      metadata,
      secretRef: args.secretRef
    });

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          mode,
          tenantId: args.tenant,
          providerKind: args.providerKind,
          label: args.label,
          secretName,
          ...result
        },
        null,
        2
      ) + "\n"
    );
  } finally {
    await runtime.close();
    await pool.end();
  }
}

await main();

function parseArgs(values) {
  const args = {
    mode: undefined,
    tenant: undefined,
    user: undefined,
    providerKind: undefined,
    label: undefined,
    secretName: undefined,
    secretRef: undefined,
    metadata: undefined
  };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "string" || !value.startsWith("--")) {
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (typeof next !== "string") {
      continue;
    }
    switch (key) {
      case "tenant":
        args.tenant = next;
        break;
      case "mode":
        args.mode = next;
        break;
      case "user":
        args.user = next;
        break;
      case "provider-kind":
        args.providerKind = next;
        break;
      case "label":
        args.label = next;
        break;
      case "secret-name":
        args.secretName = next;
        break;
      case "secret-ref":
        args.secretRef = next;
        break;
      case "metadata":
        args.metadata = next;
        break;
      default:
        break;
    }
    index += 1;
  }
  return args;
}

async function runLifecycleMode(input) {
  const registerValue = input.mode === "rotate" || input.mode === "revoke" ? null : requireEnv("WF_LIFECYCLE_SECRET_VALUE");
  const rotateValue = input.mode === "register" || input.mode === "revoke" ? null : requireEnv("WF_LIFECYCLE_SECRET_VALUE_NEXT");

  if (input.mode === "register") {
    await input.runtime.registerProviderCredential({
      tenantId: input.tenantId,
      actorUserId: input.userId,
      providerKind: input.providerKind,
      label: input.label,
      secretValues: toSecretValues(input.secretName, registerValue),
      metadata: input.metadata
    });
    return {
      register: await loadCredentialState(input.client, input)
    };
  }

  const currentState = await loadCredentialState(input.client, input);
  const currentSecretRef = input.secretRef ?? currentState.secretRef;
  if (!currentSecretRef) {
    throw new Error("No active secret reference was found for the requested tenant/provider/label");
  }

  if (input.mode === "rotate") {
    const rotateResult = await input.runtime.rotateProviderCredential({
      tenantId: input.tenantId,
      actorUserId: input.userId,
      secretRef: currentSecretRef,
      nextSecretValues: toSecretValues(input.secretName, rotateValue)
    });
    return {
      beforeRotate: currentState,
      rotate: {
        returnedSecretRef: rotateResult.secretRef,
        state: await loadCredentialState(input.client, input)
      }
    };
  }

  if (input.mode === "revoke") {
    await input.runtime.revokeProviderCredential({
      tenantId: input.tenantId,
      actorUserId: input.userId,
      secretRef: currentSecretRef
    });
    return {
      beforeRevoke: currentState,
      revoke: await loadCredentialState(input.client, input)
    };
  }

  await input.runtime.registerProviderCredential({
    tenantId: input.tenantId,
    actorUserId: input.userId,
    providerKind: input.providerKind,
    label: input.label,
    secretValues: toSecretValues(input.secretName, registerValue),
    metadata: input.metadata
  });
  const afterRegister = await loadCredentialState(input.client, input);
  if (!afterRegister.secretRef) {
    throw new Error("Provider registration did not produce an active secret reference");
  }
  const rotateResult = await input.runtime.rotateProviderCredential({
    tenantId: input.tenantId,
    actorUserId: input.userId,
    secretRef: afterRegister.secretRef,
    nextSecretValues: toSecretValues(input.secretName, rotateValue)
  });
  const afterRotate = await loadCredentialState(input.client, input);
  await input.runtime.revokeProviderCredential({
    tenantId: input.tenantId,
    actorUserId: input.userId,
    secretRef: rotateResult.secretRef
  });
  return {
    register: afterRegister,
    rotate: {
      returnedSecretRef: rotateResult.secretRef,
      state: afterRotate
    },
    revoke: await loadCredentialState(input.client, input)
  };
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseMetadata(raw) {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--metadata must be a JSON object");
  }
  return parsed;
}

async function loadCredentialState(client, input) {
  const [secretResult, bindingResult] = await Promise.all([
    client.query(
      `select id, secret_ref, revoked_at, revoked_reason
       from wfpc.secret_references
       where tenant_id = $1
         and provider_kind = $2::wfpc.provider_kind
         and label = $3
       order by case when revoked_at is null then 0 else 1 end,
                created_at desc
       limit 1`,
      [input.tenantId, input.providerKind, input.label]
    ),
    client.query(
      `select bindings.paperclip_company_id,
              bindings.paperclip_agent_id,
              bindings.paperclip_env_key,
              bindings.paperclip_secret_id,
              bindings.paperclip_secret_version,
              bindings.binding_status,
              bindings.last_error
       from wfpc.paperclip_secret_bindings bindings
       join wfpc.secret_references secrets
         on secrets.id = bindings.wealth_factory_secret_reference_id
       where secrets.tenant_id = $1
         and secrets.provider_kind = $2::wfpc.provider_kind
         and secrets.label = $3
       order by bindings.updated_at desc
       limit 1`,
      [input.tenantId, input.providerKind, input.label]
    )
  ]);

  const secret = asRecord(secretResult.rows[0]);
  const binding = asRecord(bindingResult.rows[0]);
  return {
    secretReferenceId: readOptionalString(secret.id),
    secretRef: readOptionalString(secret.secret_ref),
    revokedAt: readOptionalString(secret.revoked_at),
    revokedReason: readOptionalString(secret.revoked_reason),
    binding: readOptionalString(binding.paperclip_secret_id)
      ? {
          paperclipCompanyId: String(binding.paperclip_company_id),
          paperclipAgentId: String(binding.paperclip_agent_id),
          paperclipEnvKey: String(binding.paperclip_env_key),
          paperclipSecretId: String(binding.paperclip_secret_id),
          paperclipSecretVersion: readOptionalString(binding.paperclip_secret_version),
          bindingStatus: String(binding.binding_status),
          lastError: readOptionalString(binding.last_error)
        }
      : null
  };
}

function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function readOptionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toSecretValues(secretName, value) {
  if (value === null) {
    throw new Error(`Missing lifecycle secret value for ${secretName}`);
  }
  return { [secretName]: value };
}
