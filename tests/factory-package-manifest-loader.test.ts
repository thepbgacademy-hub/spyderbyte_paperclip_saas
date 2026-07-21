import { describe, expect, it } from "vitest";

import {
  computeBlueprintPackageContentHash,
  loadBlueprintPackageArchive,
  loadBlueprintPackageManifest
} from "../src/factory/packages/package-manifest-loader.js";
import {
  createCurrentSliceManifest,
  createPositioningOnlyManifest
} from "./factory-package-manifest-fixtures.js";

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function uint16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function createStoredTwfPackage(entries: Record<string, string>) {
  return createStoredTwfPackageEntries(Object.entries(entries));
}

function createStoredTwfPackageEntries(entries: Array<[string, string]>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name);
    const contentBuffer = Buffer.from(content);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(contentBuffer.length),
      uint32(contentBuffer.length),
      uint16(nameBuffer.length),
      uint16(0),
      nameBuffer
    ]);

    localParts.push(localHeader, contentBuffer);
    centralParts.push(
      Buffer.concat([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(contentBuffer.length),
        uint32(contentBuffer.length),
        uint16(nameBuffer.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        nameBuffer
      ])
    );

    offset += localHeader.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    centralDirectory,
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(centralParts.length),
    uint16(centralParts.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);
}

describe("factory package manifest loader", () => {
  it("loads a complete bounded manifest into the reboot blueprint package shape", () => {
    const blueprint = loadBlueprintPackageManifest(createCurrentSliceManifest());

    expect(blueprint.packageId).toBe("pkg_connect_first");
    expect(blueprint.key).toBe("connect-first");
    expect(blueprint.version).toBe("1.0.0");
    expect(blueprint.packageVersionId).toBe("pkg_connect_first@1.0.0");
    expect(blueprint.kind).toBe("blueprint");
    expect(blueprint.personas.map((persona) => persona.key)).toEqual([
      "founder_guide",
      "market_strategist"
    ]);
    expect(blueprint.stations.map((station) => station.key)).toEqual(["intake", "positioning"]);
  });

  it("fails closed when a manifest station references an undeclared persona", () => {
    const manifest = createCurrentSliceManifest();
    manifest.workflow.stations[0] = {
      ...manifest.workflow.stations[0]!,
      persona: "ghost_persona"
    };

    expect(() => loadBlueprintPackageManifest(manifest)).toThrow(
      'Station "intake" references undeclared persona "ghost_persona" in blueprint package "connect-first"'
    );
  });

  it("fails closed when duplicate persona ids are declared in the manifest", () => {
    const manifest = createCurrentSliceManifest();
    manifest.personas[1] = {
      ...manifest.personas[1]!,
      id: "founder_guide"
    };

    expect(() => loadBlueprintPackageManifest(manifest)).toThrow(
      'Duplicate persona key "founder_guide" is not allowed for blueprint package "connect-first"'
    );
  });

  it("fails closed when a later workflow family is declared before the reboot slice ships", () => {
    const manifest = createPositioningOnlyManifest({ packageKey: "future-family", name: "Future Family" });
    manifest.personas[0] = {
      ...manifest.personas[0]!,
      id: "finance_reviewer",
      name: "Finance Reviewer",
      tagline: "Reviews pricing assumptions.",
      definition: "personas/finance_reviewer.yaml",
      allowed_stations: ["pricing"],
      allowed_tools: ["document_generation", "deliverable_write", "brand_profile_update"]
    };
    manifest.workflow.stations[0] = {
      id: "pricing",
      name: "Pricing Station",
      persona: "finance_reviewer",
      inputs: ["founder_profile"],
      outputs: ["positioning_brief"],
      checkpoint: "required"
    };

    expect(() => loadBlueprintPackageManifest(manifest)).toThrow(
      'Manifest persona declares unsupported station "pricing" outside the bounded reboot slice'
    );
  });

  it("fails closed when a manifest station references an unknown output deliverable", () => {
    const manifest = createCurrentSliceManifest();
    manifest.workflow.stations[1] = {
      ...manifest.workflow.stations[1]!,
      outputs: ["missing_output"]
    };

    expect(() => loadBlueprintPackageManifest(manifest)).toThrow(
      'Manifest station "positioning" references unknown output deliverable "missing_output" in package "connect-first"'
    );
  });

  it("derives a distinct packageVersionId when the manifest version changes under the same package identity", () => {
    const v1 = loadBlueprintPackageManifest(createCurrentSliceManifest());
    const v2Manifest = createCurrentSliceManifest();
    v2Manifest.version = "1.1.0";

    const v2 = loadBlueprintPackageManifest(v2Manifest);

    expect(v1.packageId).toBe(v2.packageId);
    expect(v1.packageVersionId).toBe("pkg_connect_first@1.0.0");
    expect(v2.packageVersionId).toBe("pkg_connect_first@1.1.0");
  });

  it("attaches deterministic manifest source metadata when loading a manifest", () => {
    const manifest = createCurrentSliceManifest();
    const blueprint = loadBlueprintPackageManifest(manifest);

    expect(blueprint.source).toEqual({
      kind: "manifest",
      contentHash: computeBlueprintPackageContentHash({ "manifest.json": manifest })
    });
  });

  it("keeps the content hash stable when identical archive content is repacked in a different entry order", () => {
    const manifest = createCurrentSliceManifest();
    const archiveA = createStoredTwfPackage({
      "manifest.json": JSON.stringify(manifest),
      "personas/founder_guide.yaml": "role: founder guide\n"
    });
    const archiveB = createStoredTwfPackage({
      "personas/founder_guide.yaml": "role: founder guide\n",
      "manifest.json": JSON.stringify(manifest)
    });

    const packageA = loadBlueprintPackageArchive(archiveA);
    const packageB = loadBlueprintPackageArchive(archiveB);

    expect(packageA.source?.kind).toBe("twfpkg");
    expect(packageA.source?.contentHash).toBe(packageB.source?.contentHash);
  });

  it("loads a minimal .twfpkg archive that contains only the root manifest", () => {
    const manifest = createCurrentSliceManifest();
    const archive = createStoredTwfPackage({
      "manifest.json": JSON.stringify(manifest)
    });

    const blueprint = loadBlueprintPackageArchive(archive);

    expect(blueprint.packageId).toBe("pkg_connect_first");
    expect(blueprint.key).toBe("connect-first");
    expect(blueprint.packageVersionId).toBe("pkg_connect_first@1.0.0");
    expect(blueprint.source).toEqual({
      kind: "twfpkg",
      contentHash: computeBlueprintPackageContentHash({
        "manifest.json": JSON.stringify(manifest)
      })
    });
  });

  it("changes the archive content hash when package content changes", () => {
    const manifest = createCurrentSliceManifest();
    const archiveA = createStoredTwfPackage({
      "manifest.json": JSON.stringify(manifest),
      "personas/founder_guide.yaml": "role: founder guide\n"
    });
    const archiveB = createStoredTwfPackage({
      "manifest.json": JSON.stringify(manifest),
      "personas/founder_guide.yaml": "role: founder guide changed\n"
    });

    expect(loadBlueprintPackageArchive(archiveA).source?.contentHash).not.toBe(
      loadBlueprintPackageArchive(archiveB).source?.contentHash
    );
  });

  it("fails closed when a .twfpkg archive does not contain manifest.json", () => {
    const archive = createStoredTwfPackage({
      "personas/founder_guide.yaml": "role: founder guide\n"
    });

    expect(() => loadBlueprintPackageArchive(archive)).toThrow(
      "Package archive must include manifest.json at the archive root"
    );
  });

  it("fails with a package error when a zip end record is truncated", () => {
    expect(() => loadBlueprintPackageArchive(Buffer.from([0x50, 0x4b, 0x05, 0x06]))).toThrow(
      "Package archive end record is malformed"
    );
  });

  it("fails closed when a .twfpkg archive contains duplicate entry paths", () => {
    const manifest = createCurrentSliceManifest();
    const archive = createStoredTwfPackageEntries([
      ["manifest.json", JSON.stringify({ ...manifest, package_key: "shadowed" })],
      ["manifest.json", JSON.stringify(manifest)]
    ]);

    expect(() => loadBlueprintPackageArchive(archive)).toThrow(
      'Package archive contains duplicate entry path "manifest.json"'
    );
  });
});
