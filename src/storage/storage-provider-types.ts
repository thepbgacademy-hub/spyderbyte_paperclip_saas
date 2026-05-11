export type StorageProviderKind = "google_drive" | "dropbox" | "onedrive_sharepoint" | "s3_compatible" | "supabase_storage";

export type StorageProviderDefinition = {
  kind: StorageProviderKind;
  label: string;
  requiredSecretRefs: readonly string[];
  capability: "media_storage";
};

export const CUSTOMER_STORAGE_PROVIDERS: readonly StorageProviderDefinition[] = [
  { kind: "google_drive", label: "Google Drive", requiredSecretRefs: ["oauthTokenRef", "refreshTokenRef"], capability: "media_storage" },
  { kind: "dropbox", label: "Dropbox", requiredSecretRefs: ["oauthTokenRef", "refreshTokenRef"], capability: "media_storage" },
  { kind: "onedrive_sharepoint", label: "OneDrive/SharePoint", requiredSecretRefs: ["oauthTokenRef", "refreshTokenRef"], capability: "media_storage" },
  { kind: "s3_compatible", label: "Customer S3-Compatible Storage", requiredSecretRefs: ["accessKeyRef", "secretKeyRef"], capability: "media_storage" },
  { kind: "supabase_storage", label: "Customer Supabase Storage", requiredSecretRefs: ["serviceTokenRef"], capability: "media_storage" }
];
