import type {
  BlueprintPackageDefinition,
  SpecialistKey,
  StationFamilyKey
} from "../domain/types.js";
import { createBlueprintPackage } from "./package-registry.js";
import { resolveExpectedStationSpecialistKey } from "../specialists/specialist-registry.js";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

type ExternalActionMode = "approval_required" | "denied";
type PreferredTier = "economy" | "standard" | "premium";
type ReadableDeliverablesScope = "own_package" | "declared_dependencies";
type CheckpointMode = "none" | "required";

export interface BlueprintManifestV1 {
  manifest_schema: 1;
  package_id: string;
  package_key: string;
  name: string;
  version: string;
  type: "business_framework";
  description: string;
  publisher: string;
  license_note: string;
  min_platform_version: string;
  requires: string[];
  permissions: {
    tools: string[];
    external_actions: Record<string, ExternalActionMode>;
    data_access: {
      tenant_scope_only: boolean;
      package_scope_only: boolean;
      readable_deliverables: ReadableDeliverablesScope;
    };
  };
  provider_requirements: {
    llm: {
      required: boolean;
      capabilities: string[];
      preferred_tier: PreferredTier;
    };
  };
  budgets: {
    max_run_cost_usd: number;
    max_run_minutes: number;
    max_step_cost_usd: number;
    approval_required_above_usd: number;
  };
  personas: Array<{
    id: string;
    name: string;
    tagline: string;
    definition: string;
    allowed_stations: string[];
    allowed_tools: string[];
    role_class?: string;
  }>;
  workflow: {
    stations: Array<{
      id: string;
      name: string;
      persona: string;
      quality_check?: string;
      inputs: string[];
      outputs: string[];
      checkpoint: CheckpointMode;
    }>;
  };
  deliverables: Array<{
    key: string;
    name: string;
    schema: string;
    template: string;
  }>;
  guardrails: {
    scope_statement: string;
    denied_actions: string[];
  };
}

const BOUNDED_TOOL_REGISTRY = new Set([
  "structured_interview",
  "document_generation",
  "deliverable_write",
  "brand_profile_update",
  "web_research_readonly"
]);

type PackageContentEntry = string | Buffer | BlueprintManifestV1 | Record<string, unknown>;

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (value && typeof value === "object" && !(value instanceof Buffer)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalizeJson(nestedValue)])
    );
  }

  return value;
}

function normalizeContentEntry(path: string, content: PackageContentEntry): string {
  if (Buffer.isBuffer(content)) {
    return normalizeContentEntry(path, content.toString("utf8"));
  }

  if (typeof content === "string") {
    if (path.endsWith(".json")) {
      return JSON.stringify(canonicalizeJson(JSON.parse(content)));
    }

    return content;
  }

  return JSON.stringify(canonicalizeJson(content));
}

export function computeBlueprintPackageContentHash(entries: Record<string, PackageContentEntry>): string {
  const hash = createHash("sha256");

  for (const path of Object.keys(entries).sort()) {
    const content = entries[path];
    if (content === undefined) {
      continue;
    }

    hash.update(path);
    hash.update("\0");
    hash.update(normalizeContentEntry(path, content));
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}

function readZipEntries(archive: Buffer): Record<string, Buffer> {
  const endOfCentralDirectoryOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endOfCentralDirectoryOffset === -1) {
    throw new Error("Package archive is not a valid .twfpkg zip file");
  }

  if (endOfCentralDirectoryOffset + 22 > archive.length) {
    throw new Error("Package archive end record is malformed");
  }

  const centralDirectoryEntryCount = archive.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const centralDirectoryOffset = archive.readUInt32LE(endOfCentralDirectoryOffset + 16);
  if (centralDirectoryOffset > endOfCentralDirectoryOffset) {
    throw new Error("Package archive central directory is malformed");
  }

  const entries: Record<string, Buffer> = {};
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < centralDirectoryEntryCount; index += 1) {
    if (cursor + 46 > endOfCentralDirectoryOffset) {
      throw new Error("Package archive central directory is malformed");
    }

    if (archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Package archive central directory is malformed");
    }

    const compressionMethod = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const fileNameLength = archive.readUInt16LE(cursor + 28);
    const extraFieldLength = archive.readUInt16LE(cursor + 30);
    const fileCommentLength = archive.readUInt16LE(cursor + 32);
    const localHeaderOffset = archive.readUInt32LE(cursor + 42);
    const centralDirectoryEntryEnd = cursor + 46 + fileNameLength + extraFieldLength + fileCommentLength;
    if (centralDirectoryEntryEnd > endOfCentralDirectoryOffset) {
      throw new Error("Package archive central directory is malformed");
    }

    const path = archive.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);

    if (entries[path]) {
      throw new Error(`Package archive contains duplicate entry path "${path}"`);
    }

    if (localHeaderOffset + 30 > archive.length || archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Package archive entry "${path}" has a malformed local header`);
    }

    const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraFieldLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    if (dataOffset + compressedSize > archive.length) {
      throw new Error(`Package archive entry "${path}" content is malformed`);
    }

    const compressedContent = archive.subarray(dataOffset, dataOffset + compressedSize);

    if (compressionMethod === 0) {
      entries[path] = compressedContent;
    } else if (compressionMethod === 8) {
      entries[path] = inflateRawSync(compressedContent);
    } else {
      throw new Error(`Package archive entry "${path}" uses unsupported compression method "${compressionMethod}"`);
    }

    cursor = centralDirectoryEntryEnd;
  }

  return entries;
}

function resolveBoundedStationKind(stationId: string) {
  if (stationId === "intake") {
    return "structured_interview" as const;
  }

  if (stationId === "positioning") {
    return "analysis" as const;
  }

  throw new Error(
    `Manifest station "${stationId}" is outside the bounded intake/positioning reboot slice`
  );
}

function deriveManifestPersonaSpecialistKey(allowedStations: string[]): SpecialistKey {
  if (allowedStations.length === 0) {
    throw new Error("Manifest persona must declare at least one allowed station");
  }

  const specialistKeys = new Set<SpecialistKey>();
  for (const stationKey of allowedStations) {
    const specialistKey = resolveExpectedStationSpecialistKey(stationKey as StationFamilyKey);
    if (!specialistKey) {
      throw new Error(
        `Manifest persona declares unsupported station "${stationKey}" outside the bounded reboot slice`
      );
    }

    specialistKeys.add(specialistKey);
  }

  if (specialistKeys.size !== 1) {
    throw new Error(
      `Manifest persona crosses multiple specialist owners in the bounded reboot slice: ${allowedStations.join(", ")}`
    );
  }

  const [specialistKey] = [...specialistKeys];
  if (!specialistKey) {
    throw new Error("Manifest persona specialist binding could not be derived");
  }

  return specialistKey;
}

function validateManifestTools(manifest: BlueprintManifestV1) {
  for (const tool of manifest.permissions.tools) {
    if (!BOUNDED_TOOL_REGISTRY.has(tool)) {
      throw new Error(`Manifest declares unknown tool "${tool}" in package "${manifest.package_key}"`);
    }
  }

  for (const persona of manifest.personas) {
    for (const tool of persona.allowed_tools) {
      if (!BOUNDED_TOOL_REGISTRY.has(tool)) {
        throw new Error(
          `Manifest persona "${persona.id}" declares unknown tool "${tool}" in package "${manifest.package_key}"`
        );
      }

      if (!manifest.permissions.tools.includes(tool)) {
        throw new Error(
          `Manifest persona "${persona.id}" uses undeclared package tool "${tool}" in package "${manifest.package_key}"`
        );
      }
    }
  }
}

function validateManifestDeliverableReferences(manifest: BlueprintManifestV1) {
  const deliverableKeys = new Set(manifest.deliverables.map((deliverable) => deliverable.key));

  for (const station of manifest.workflow.stations) {
    for (const inputKey of station.inputs) {
      if (!deliverableKeys.has(inputKey)) {
        throw new Error(
          `Manifest station "${station.id}" references unknown input deliverable "${inputKey}" in package "${manifest.package_key}"`
        );
      }
    }

    for (const outputKey of station.outputs) {
      if (!deliverableKeys.has(outputKey)) {
        throw new Error(
          `Manifest station "${station.id}" references unknown output deliverable "${outputKey}" in package "${manifest.package_key}"`
        );
      }
    }
  }
}

export function loadBlueprintPackageManifest(
  manifest: BlueprintManifestV1,
  source?: BlueprintPackageDefinition["source"]
): BlueprintPackageDefinition {
  if (manifest.manifest_schema !== 1) {
    throw new Error(`Unsupported manifest schema "${manifest.manifest_schema}" for package "${manifest.package_key}"`);
  }

  if (manifest.type !== "business_framework") {
    throw new Error(
      `Manifest package "${manifest.package_key}" must be a "business_framework" in the bounded reboot slice`
    );
  }

  validateManifestTools(manifest);
  validateManifestDeliverableReferences(manifest);

  for (const station of manifest.workflow.stations) {
    if (station.quality_check) {
      throw new Error(
        `Manifest station "${station.id}" uses unsupported quality_check "${station.quality_check}" in the bounded reboot slice`
      );
    }
  }

  return createBlueprintPackage({
    packageId: manifest.package_id,
    key: manifest.package_key,
    version: manifest.version,
    title: manifest.name,
    permissions: {
      tools: [...manifest.permissions.tools],
      externalActions: Object.fromEntries(
        Object.entries(manifest.permissions.external_actions).map(([action, mode]) => [
          action.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
          mode
        ])
      ),
      dataAccess: {
        tenantScopeOnly: manifest.permissions.data_access.tenant_scope_only,
        packageScopeOnly: manifest.permissions.data_access.package_scope_only,
        readableDeliverables: manifest.permissions.data_access.readable_deliverables
      }
    },
    budgets: {
      maxRunCostUsd: manifest.budgets.max_run_cost_usd,
      maxRunMinutes: manifest.budgets.max_run_minutes,
      maxStepCostUsd: manifest.budgets.max_step_cost_usd,
      approvalRequiredAboveUsd: manifest.budgets.approval_required_above_usd
    },
    source: source ?? {
      kind: "manifest",
      contentHash: computeBlueprintPackageContentHash({ "manifest.json": manifest })
    },
    personas: manifest.personas.map((persona) => ({
      key: persona.id,
      name: persona.name,
      tagline: persona.tagline,
      specialistKey: deriveManifestPersonaSpecialistKey(persona.allowed_stations),
      allowedStationKeys: [...persona.allowed_stations]
    })),
    stations: manifest.workflow.stations.map((station) => ({
      key: station.id,
      familyKey: station.id as StationFamilyKey,
      personaKey: station.persona,
      kind: resolveBoundedStationKind(station.id),
      title: station.name
    }))
  });
}

export function loadBlueprintPackageArchive(archive: Buffer): BlueprintPackageDefinition {
  const entries = readZipEntries(archive);
  const manifestBuffer = entries["manifest.json"];
  if (!manifestBuffer) {
    throw new Error("Package archive must include manifest.json at the archive root");
  }

  const manifest = JSON.parse(manifestBuffer.toString("utf8")) as BlueprintManifestV1;
  return loadBlueprintPackageManifest(manifest, {
    kind: "twfpkg",
    contentHash: computeBlueprintPackageContentHash(entries)
  });
}
