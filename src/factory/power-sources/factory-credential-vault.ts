import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface FactoryCredentialEncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  wrappedDataKey: string;
  wrappedDataKeyIv: string;
  wrappedDataKeyTag: string;
}

export interface FactoryCredentialKey {
  version: string;
  masterKey: string;
}

export interface FactoryCredentialKeyring {
  current: FactoryCredentialKey;
  previous?: FactoryCredentialKey[];
}

export class FactoryCredentialDecryptError extends Error {
  readonly code = "factory_credential_decrypt_failed";

  constructor() {
    super("Factory credential could not be decrypted");
    this.name = "FactoryCredentialDecryptError";
  }
}

export function createFactoryCredentialVault(options: { keyring: FactoryCredentialKeyring }) {
  const keyring = normalizeKeyring(options.keyring);

  return {
    encrypt(secret: Record<string, string>) {
      const dataKey = randomBytes(32);
      const encryptedSecret = encryptBuffer(dataKey, Buffer.from(JSON.stringify(secret), "utf8"));
      const wrappedDataKey = encryptBuffer(keyring.current.masterKey, dataKey);
      return {
        keyVersion: keyring.current.version,
        payload: {
          ciphertext: encryptedSecret.ciphertext,
          iv: encryptedSecret.iv,
          tag: encryptedSecret.tag,
          wrappedDataKey: wrappedDataKey.ciphertext,
          wrappedDataKeyIv: wrappedDataKey.iv,
          wrappedDataKeyTag: wrappedDataKey.tag
        }
      };
    },

    decrypt(input: { payload: FactoryCredentialEncryptedPayload; keyVersion: string }) {
      try {
        const masterKey = findMasterKey(keyring, input.keyVersion);
        const dataKey = decryptBuffer(masterKey, {
          ciphertext: input.payload.wrappedDataKey,
          iv: input.payload.wrappedDataKeyIv,
          tag: input.payload.wrappedDataKeyTag
        });
        return JSON.parse(decryptBuffer(dataKey, input.payload).toString("utf8")) as Record<string, string>;
      } catch {
        throw new FactoryCredentialDecryptError();
      }
    },

    rewrapDataKey(input: { payload: FactoryCredentialEncryptedPayload; keyVersion: string }) {
      try {
        const previousMasterKey = findMasterKey(keyring, input.keyVersion);
        const dataKey = decryptBuffer(previousMasterKey, {
          ciphertext: input.payload.wrappedDataKey,
          iv: input.payload.wrappedDataKeyIv,
          tag: input.payload.wrappedDataKeyTag
        });
        const wrappedDataKey = encryptBuffer(keyring.current.masterKey, dataKey);
        return {
          keyVersion: keyring.current.version,
          payload: {
            ...input.payload,
            wrappedDataKey: wrappedDataKey.ciphertext,
            wrappedDataKeyIv: wrappedDataKey.iv,
            wrappedDataKeyTag: wrappedDataKey.tag
          }
        };
      } catch {
        throw new FactoryCredentialDecryptError();
      }
    }
  };
}

function normalizeKeyring(keyring: FactoryCredentialKeyring) {
  return {
    current: { ...keyring.current, masterKey: decodeMasterKey(keyring.current.masterKey) },
    previous: (keyring.previous ?? []).map((key) => ({ ...key, masterKey: decodeMasterKey(key.masterKey) }))
  };
}

function decodeMasterKey(masterKey: string) {
  const decoded = Buffer.from(masterKey, "base64");
  if (decoded.length !== 32) {
    throw new Error("SECRETS_MASTER_KEY must be a 32-byte base64 value");
  }
  return decoded;
}

function findMasterKey(
  keyring: {
    current: { version: string; masterKey: Buffer };
    previous: Array<{ version: string; masterKey: Buffer }>;
  },
  keyVersion: string
) {
  const match = [keyring.current, ...keyring.previous].find((key) => key.version === keyVersion);
  if (!match) {
    throw new FactoryCredentialDecryptError();
  }
  return match.masterKey;
}

function encryptBuffer(key: Buffer, value: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function decryptBuffer(key: Buffer, encrypted: { ciphertext: string; iv: string; tag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted.ciphertext, "base64")), decipher.final()]);
}
