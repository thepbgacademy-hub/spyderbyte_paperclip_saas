import type { BlueprintPackageDefinition } from "../domain/types.js";
import { loadBlueprintPackageArchive } from "./package-manifest-loader.js";

export interface PublishedBlueprintPackageVersion {
  readonly packageId: string;
  readonly key: string;
  readonly version: string;
  readonly packageVersionId: string;
  readonly title: string;
  readonly source: Readonly<NonNullable<BlueprintPackageDefinition["source"]>>;
  readonly publishedAt: string;
  readonly publishedByUserId: string;
}

interface CatalogPackageVersionLifecycleBase {
  readonly packageId: string;
  readonly packageVersionId: string;
  readonly sourceContentHash: string;
  readonly publishedAt: string;
  readonly publishedByUserId: string;
}

export interface PublishedCatalogPackageVersionLifecycle extends CatalogPackageVersionLifecycleBase {
  readonly status: "published";
}

export interface DeprecatedCatalogPackageVersionLifecycle extends CatalogPackageVersionLifecycleBase {
  readonly status: "deprecated";
  readonly deprecatedAt: string;
  readonly deprecatedByUserId: string;
}

export interface YankedCatalogPackageVersionLifecycle extends CatalogPackageVersionLifecycleBase {
  readonly status: "yanked";
  readonly yankedAt: string;
  readonly yankedByUserId: string;
}

export type CatalogPackageVersionLifecycle =
  | PublishedCatalogPackageVersionLifecycle
  | DeprecatedCatalogPackageVersionLifecycle
  | YankedCatalogPackageVersionLifecycle;

export interface CatalogAuditIntent {
  readonly action:
    | "package_version_published"
    | "package_version_deprecated"
    | "package_version_yanked";
  readonly actorUserId: string;
  readonly packageId: string;
  readonly packageVersionId: string;
  readonly contentHash: string;
  readonly occurredAt: string;
}

export interface PublishBlueprintPackageVersionInput {
  archive: Buffer;
  existingVersions: readonly PublishedBlueprintPackageVersion[];
  publishedAt: string;
  publishedByUserId: string;
}

export interface ActOnBlueprintPackageVersionLifecycleInput {
  lifecycle: CatalogPackageVersionLifecycle;
  actedAt: string;
  actedByUserId: string;
}

export function publishBlueprintPackageVersion(input: PublishBlueprintPackageVersionInput): {
  publishedVersion: PublishedBlueprintPackageVersion;
  lifecycle: CatalogPackageVersionLifecycle;
  auditIntent: CatalogAuditIntent;
} {
  const blueprintPackage = loadBlueprintPackageArchive(input.archive);
  const source = blueprintPackage.source;

  if (!source) {
    throw new Error(`Blueprint package "${blueprintPackage.packageVersionId}" is missing source metadata`);
  }

  if (input.existingVersions.some((version) => version.packageVersionId === blueprintPackage.packageVersionId)) {
    throw new Error(`Blueprint package version "${blueprintPackage.packageVersionId}" is already published`);
  }

  const publishedVersion: PublishedBlueprintPackageVersion = Object.freeze({
    packageId: blueprintPackage.packageId,
    key: blueprintPackage.key,
    version: blueprintPackage.version,
    packageVersionId: blueprintPackage.packageVersionId,
    title: blueprintPackage.title,
    source: Object.freeze({ ...source }),
    publishedAt: input.publishedAt,
    publishedByUserId: input.publishedByUserId
  });
  const lifecycle: CatalogPackageVersionLifecycle = Object.freeze({
    packageId: publishedVersion.packageId,
    packageVersionId: publishedVersion.packageVersionId,
    sourceContentHash: publishedVersion.source.contentHash,
    status: "published",
    publishedAt: input.publishedAt,
    publishedByUserId: input.publishedByUserId
  });
  const auditIntent: CatalogAuditIntent = Object.freeze({
    action: "package_version_published",
    actorUserId: input.publishedByUserId,
    packageId: publishedVersion.packageId,
    packageVersionId: publishedVersion.packageVersionId,
    contentHash: publishedVersion.source.contentHash,
    occurredAt: input.publishedAt
  });

  return {
    publishedVersion,
    lifecycle,
    auditIntent
  };
}

export function deprecateBlueprintPackageVersion(input: ActOnBlueprintPackageVersionLifecycleInput): {
  lifecycle: CatalogPackageVersionLifecycle;
  auditIntent: CatalogAuditIntent;
} {
  const { lifecycle } = input;

  if (lifecycle.status === "deprecated") {
    throw new Error(`Blueprint package version "${lifecycle.packageVersionId}" is already deprecated`);
  }

  if (lifecycle.status === "yanked") {
    throw new Error(
      `Blueprint package version "${lifecycle.packageVersionId}" has already been yanked and cannot be deprecated`
    );
  }

  const nextLifecycle: CatalogPackageVersionLifecycle = Object.freeze({
    ...lifecycle,
    status: "deprecated",
    deprecatedAt: input.actedAt,
    deprecatedByUserId: input.actedByUserId
  });

  return {
    lifecycle: nextLifecycle,
    auditIntent: createAuditIntent({
      action: "package_version_deprecated",
      lifecycle: nextLifecycle,
      actedAt: input.actedAt,
      actedByUserId: input.actedByUserId
    })
  };
}

export function yankBlueprintPackageVersion(input: ActOnBlueprintPackageVersionLifecycleInput): {
  lifecycle: CatalogPackageVersionLifecycle;
  auditIntent: CatalogAuditIntent;
} {
  const { lifecycle } = input;

  if (lifecycle.status === "yanked") {
    throw new Error(`Blueprint package version "${lifecycle.packageVersionId}" is already yanked`);
  }

  const nextLifecycle: CatalogPackageVersionLifecycle = Object.freeze({
    packageId: lifecycle.packageId,
    packageVersionId: lifecycle.packageVersionId,
    sourceContentHash: lifecycle.sourceContentHash,
    status: "yanked",
    publishedAt: lifecycle.publishedAt,
    publishedByUserId: lifecycle.publishedByUserId,
    yankedAt: input.actedAt,
    yankedByUserId: input.actedByUserId
  });

  return {
    lifecycle: nextLifecycle,
    auditIntent: createAuditIntent({
      action: "package_version_yanked",
      lifecycle: nextLifecycle,
      actedAt: input.actedAt,
      actedByUserId: input.actedByUserId
    })
  };
}

function createAuditIntent(input: {
  action: CatalogAuditIntent["action"];
  lifecycle: CatalogPackageVersionLifecycle;
  actedAt: string;
  actedByUserId: string;
}): CatalogAuditIntent {
  return Object.freeze({
    action: input.action,
    actorUserId: input.actedByUserId,
    packageId: input.lifecycle.packageId,
    packageVersionId: input.lifecycle.packageVersionId,
    contentHash: input.lifecycle.sourceContentHash,
    occurredAt: input.actedAt
  });
}
