import { describe, expect, it } from "vitest";

import {
  deprecateBlueprintPackageVersion,
  publishBlueprintPackageVersion,
  yankBlueprintPackageVersion
} from "../src/factory/packages/package-catalog-service.js";
import { createCurrentSliceManifest } from "./factory-package-manifest-fixtures.js";

function uint16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function createStoredTwfPackage(entries: Record<string, string>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const contentBuffer = Buffer.from(content);
    const localHeader = Buffer.concat([
      uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(0), uint32(contentBuffer.length), uint32(contentBuffer.length),
      uint16(nameBuffer.length), uint16(0), nameBuffer
    ]);

    localParts.push(localHeader, contentBuffer);
    centralParts.push(Buffer.concat([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0),
      uint16(0), uint32(0), uint32(contentBuffer.length), uint32(contentBuffer.length),
      uint16(nameBuffer.length), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(0), uint32(offset), nameBuffer
    ]));

    offset += localHeader.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    centralDirectory,
    uint32(0x06054b50), uint16(0), uint16(0), uint16(centralParts.length),
    uint16(centralParts.length), uint32(centralDirectory.length), uint32(offset), uint16(0)
  ]);
}

function createArchive(version = "1.0.0", name?: string) {
  const manifest = createCurrentSliceManifest();
  manifest.version = version;
  if (name) {
    manifest.name = name;
  }
  return createStoredTwfPackage({ "manifest.json": JSON.stringify(manifest) });
}

describe("factory package catalog service", () => {
  it("rejects an invalid archive through the package validation boundary", () => {
    expect(() => publishBlueprintPackageVersion({
      archive: Buffer.from("not a package archive"),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    })).toThrow("Package archive is not a valid .twfpkg zip file");
  });

  it("publishes a validated archive as one immutable package version with audit intent", () => {
    const result = publishBlueprintPackageVersion({
      archive: createArchive(),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    });

    expect(result.publishedVersion).toMatchObject({
      packageId: "pkg_connect_first",
      key: "connect-first",
      version: "1.0.0",
      packageVersionId: "pkg_connect_first@1.0.0",
      title: "Connect First Operating System",
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1",
      source: { kind: "twfpkg" }
    });
    expect(result.auditIntent).toMatchObject({
      action: "package_version_published",
      actorUserId: "operator_1",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      occurredAt: "2026-07-10T12:00:00.000Z"
    });
    expect(result.lifecycle).toEqual({
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      sourceContentHash: result.publishedVersion.source.contentHash,
      status: "published",
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    });
    expect(Object.isFrozen(result.publishedVersion)).toBe(true);
    expect(Object.isFrozen(result.publishedVersion.source)).toBe(true);
    expect(Object.isFrozen(result.auditIntent)).toBe(true);
    expect(Object.isFrozen(result.lifecycle)).toBe(true);
  });

  it("rejects a duplicate package version even when the archive content differs", () => {
    const existing = publishBlueprintPackageVersion({
      archive: createArchive(),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    }).publishedVersion;
    const changedArchive = createArchive("1.0.0", "Changed Connect First Operating System");

    expect(() => publishBlueprintPackageVersion({
      archive: changedArchive,
      existingVersions: [existing],
      publishedAt: "2026-07-10T12:01:00.000Z",
      publishedByUserId: "operator_2"
    })).toThrow('Blueprint package version "pkg_connect_first@1.0.0" is already published');
  });

  it("allows a new version for the same stable package identity", () => {
    const firstVersion = publishBlueprintPackageVersion({
      archive: createArchive("1.0.0"),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    }).publishedVersion;

    const result = publishBlueprintPackageVersion({
      archive: createArchive("1.1.0"),
      existingVersions: [firstVersion],
      publishedAt: "2026-07-10T12:02:00.000Z",
      publishedByUserId: "operator_1"
    });

    expect(result.publishedVersion.packageId).toBe(firstVersion.packageId);
    expect(result.publishedVersion.packageVersionId).toBe("pkg_connect_first@1.1.0");
  });

  it("reuses the archive loader guardrails when the twfpkg archive is invalid", () => {
    expect(() =>
      publishBlueprintPackageVersion({
        archive: createStoredTwfPackage({
          "personas/founder_guide.yaml": "role: founder guide\n"
        }),
        existingVersions: [],
        publishedAt: "2026-07-10T12:03:00.000Z",
        publishedByUserId: "operator_1"
      })
    ).toThrow("Package archive must include manifest.json at the archive root");
  });

  it("deprecates a published package lifecycle without changing its immutable version record", () => {
    const published = publishBlueprintPackageVersion({
      archive: createArchive(),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    });

    const result = deprecateBlueprintPackageVersion({
      lifecycle: published.lifecycle,
      actedAt: "2026-07-10T13:00:00.000Z",
      actedByUserId: "operator_2"
    });

    expect(published.publishedVersion).toMatchObject({
      packageVersionId: "pkg_connect_first@1.0.0",
      source: { kind: "twfpkg" }
    });
    expect(result.lifecycle).toMatchObject({
      packageVersionId: "pkg_connect_first@1.0.0",
      status: "deprecated",
      sourceContentHash: published.publishedVersion.source.contentHash,
      deprecatedAt: "2026-07-10T13:00:00.000Z",
      deprecatedByUserId: "operator_2"
    });
    expect(result.auditIntent).toEqual({
      action: "package_version_deprecated",
      actorUserId: "operator_2",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      contentHash: published.publishedVersion.source.contentHash,
      occurredAt: "2026-07-10T13:00:00.000Z"
    });
  });

  it("yanks a deprecated package version and preserves its immutable version identity", () => {
    const published = publishBlueprintPackageVersion({
      archive: createArchive(),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    });
    const deprecatedVersion = deprecateBlueprintPackageVersion({
      lifecycle: published.lifecycle,
      actedAt: "2026-07-10T13:00:00.000Z",
      actedByUserId: "operator_2"
    }).lifecycle;

    const result = yankBlueprintPackageVersion({
      lifecycle: deprecatedVersion,
      actedAt: "2026-07-10T14:00:00.000Z",
      actedByUserId: "operator_3"
    });

    expect(result.lifecycle).toMatchObject({
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      status: "yanked",
      sourceContentHash: published.publishedVersion.source.contentHash
    });
    expect(result.auditIntent.action).toBe("package_version_yanked");
  });

  it("yanks a published package lifecycle with a complete audit intent", () => {
    const published = publishBlueprintPackageVersion({
      archive: createArchive(),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    });

    const result = yankBlueprintPackageVersion({
      lifecycle: published.lifecycle,
      actedAt: "2026-07-10T13:00:00.000Z",
      actedByUserId: "operator_2"
    });

    expect(result.lifecycle).toEqual({
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      sourceContentHash: published.publishedVersion.source.contentHash,
      status: "yanked",
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1",
      yankedAt: "2026-07-10T13:00:00.000Z",
      yankedByUserId: "operator_2"
    });
    expect(result.auditIntent).toEqual({
      action: "package_version_yanked",
      actorUserId: "operator_2",
      packageId: "pkg_connect_first",
      packageVersionId: "pkg_connect_first@1.0.0",
      contentHash: published.publishedVersion.source.contentHash,
      occurredAt: "2026-07-10T13:00:00.000Z"
    });
  });

  it("rejects repeated lifecycle actions instead of silently rewriting catalog history", () => {
    const published = publishBlueprintPackageVersion({
      archive: createArchive(),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    });
    const deprecatedVersion = deprecateBlueprintPackageVersion({
      lifecycle: published.lifecycle,
      actedAt: "2026-07-10T13:00:00.000Z",
      actedByUserId: "operator_2"
    }).lifecycle;
    const yankedVersion = yankBlueprintPackageVersion({
      lifecycle: deprecatedVersion,
      actedAt: "2026-07-10T14:00:00.000Z",
      actedByUserId: "operator_3"
    }).lifecycle;

    expect(() => deprecateBlueprintPackageVersion({
      lifecycle: deprecatedVersion,
      actedAt: "2026-07-10T14:01:00.000Z",
      actedByUserId: "operator_3"
    })).toThrow('Blueprint package version "pkg_connect_first@1.0.0" is already deprecated');
    expect(() => yankBlueprintPackageVersion({
      lifecycle: yankedVersion,
      actedAt: "2026-07-10T14:02:00.000Z",
      actedByUserId: "operator_3"
    })).toThrow('Blueprint package version "pkg_connect_first@1.0.0" is already yanked');
  });

  it("rejects deprecating a yanked package version", () => {
    const published = publishBlueprintPackageVersion({
      archive: createArchive(),
      existingVersions: [],
      publishedAt: "2026-07-10T12:00:00.000Z",
      publishedByUserId: "operator_1"
    });
    const yankedVersion = yankBlueprintPackageVersion({
      lifecycle: published.lifecycle,
      actedAt: "2026-07-10T13:00:00.000Z",
      actedByUserId: "operator_2"
    }).lifecycle;

    expect(() => deprecateBlueprintPackageVersion({
      lifecycle: yankedVersion,
      actedAt: "2026-07-10T14:00:00.000Z",
      actedByUserId: "operator_3"
    })).toThrow('Blueprint package version "pkg_connect_first@1.0.0" has already been yanked and cannot be deprecated');
  });
});
