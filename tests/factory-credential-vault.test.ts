import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createFactoryCredentialVault,
  FactoryCredentialDecryptError,
  type FactoryCredentialEncryptedPayload,
  type FactoryCredentialKeyring
} from "../src/factory/power-sources/factory-credential-vault.js";

function masterKey() {
  return randomBytes(32).toString("base64");
}

describe("factory credential vault", () => {
  it("encrypts credentials with a wrapped data key and decrypts them with the matching key version", () => {
    const vault = createFactoryCredentialVault({
      keyring: { current: { version: "v1", masterKey: masterKey() } }
    });

    const encrypted = vault.encrypt({ apiKey: "sk-live-secret" });

    expect(JSON.stringify(encrypted.payload)).not.toContain("sk-live-secret");
    expect(encrypted.keyVersion).toBe("v1");
    expect(vault.decrypt({ payload: encrypted.payload, keyVersion: encrypted.keyVersion })).toEqual({ apiKey: "sk-live-secret" });
  });

  it("fails authentication when the master key is wrong", () => {
    const encrypted = createFactoryCredentialVault({
      keyring: { current: { version: "v1", masterKey: masterKey() } }
    }).encrypt({ apiKey: "sk-live-secret" });

    const wrongVault = createFactoryCredentialVault({
      keyring: { current: { version: "v1", masterKey: masterKey() } }
    });

    expect(() => wrongVault.decrypt(encrypted)).toThrow(FactoryCredentialDecryptError);
  });

  it("fails authentication when ciphertext is tampered", () => {
    const vault = createFactoryCredentialVault({
      keyring: { current: { version: "v1", masterKey: masterKey() } }
    });
    const encrypted = vault.encrypt({ apiKey: "sk-live-secret" });
    const tamperedPayload: FactoryCredentialEncryptedPayload = {
      ...encrypted.payload,
      ciphertext: Buffer.from("tampered").toString("base64")
    };

    expect(() => vault.decrypt({ ...encrypted, payload: tamperedPayload })).toThrow(FactoryCredentialDecryptError);
  });

  it("re-wraps the data key for key rotation without changing credential ciphertext", () => {
    const oldKey = masterKey();
    const nextKey = masterKey();
    const oldVault = createFactoryCredentialVault({
      keyring: { current: { version: "v1", masterKey: oldKey } }
    });
    const encrypted = oldVault.encrypt({ apiKey: "sk-live-secret" });

    const rotatedVault = createFactoryCredentialVault({
      keyring: {
        current: { version: "v2", masterKey: nextKey },
        previous: [{ version: "v1", masterKey: oldKey }]
      }
    });
    const rewrapped = rotatedVault.rewrapDataKey(encrypted);

    expect(rewrapped.keyVersion).toBe("v2");
    expect(rewrapped.payload.ciphertext).toBe(encrypted.payload.ciphertext);
    expect(rotatedVault.decrypt(rewrapped)).toEqual({ apiKey: "sk-live-secret" });
  });

  it("rejects missing master keys before credentials can be encrypted", () => {
    const keyring: FactoryCredentialKeyring = {
      current: { version: "v1", masterKey: Buffer.alloc(16).toString("base64") }
    };

    expect(() => createFactoryCredentialVault({ keyring })).toThrow("SECRETS_MASTER_KEY");
  });
});
