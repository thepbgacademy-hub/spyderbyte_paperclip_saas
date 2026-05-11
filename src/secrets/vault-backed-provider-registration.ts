import { createProviderCredentialService } from "./provider-credential-service.js";
import { createSecretService } from "./secret-service.js";

type SecretServiceOptions = Parameters<typeof createSecretService>[0];

export function createVaultBackedProviderCredentialRegistration(options: SecretServiceOptions & { runtimeEnv?: Record<string, string | undefined> }) {
  const secrets = createSecretService(options);
  return createProviderCredentialService({
    secrets,
    ...(options.runtimeEnv ? { runtimeEnv: options.runtimeEnv } : {})
  }).register;
}
