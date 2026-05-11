export type ArtifactType = "pdf" | "slide_deck" | "image" | "video" | "document";
export type PurgeStatus = "retained" | "purged";

export type CreateArtifactInput = {
  tenantId: string;
  runId: string;
  packageId: string;
  type: ArtifactType;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
};

export type ArtifactMetadata = CreateArtifactInput & {
  id: string;
  createdAt: string;
  expiresAt: string;
  purgeStatus: PurgeStatus;
  blobRetained: boolean;
  exportStatus: "not_exported" | "exported";
};

export type ArtifactAuditEvent = {
  eventType: "artifact.created" | "artifact.download_link_created" | "artifact.purged";
  tenantId: string;
  artifactId: string;
  actorUserId?: string;
};

export function createArtifactService(
  options: { now?: () => Date; ttlHours?: number; maxArtifactBytes?: number; maxTenantBytes?: number } = {}
) {
  const now = options.now ?? (() => new Date());
  const ttlMs = (options.ttlHours ?? 24) * 60 * 60 * 1000;
  const maxArtifactBytes = options.maxArtifactBytes ?? Number.POSITIVE_INFINITY;
  const maxTenantBytes = options.maxTenantBytes ?? Number.POSITIVE_INFINITY;
  const artifacts = new Map<string, ArtifactMetadata>();
  const auditEvents: ArtifactAuditEvent[] = [];
  let nextId = 1;

  function findAvailable(tenantId: string, artifactId: string): ArtifactMetadata {
    const artifact = artifacts.get(artifactId);
    if (!artifact || artifact.tenantId !== tenantId || !artifact.blobRetained) {
      throw new Error("Artifact is not available");
    }
    return artifact;
  }

  return {
    createArtifact(input: CreateArtifactInput): ArtifactMetadata {
      if (input.byteSize > maxArtifactBytes) {
        throw new Error("Artifact exceeds the per-artifact size limit");
      }

      const retainedTenantBytes = Array.from(artifacts.values())
        .filter((artifact) => artifact.tenantId === input.tenantId && artifact.blobRetained)
        .reduce((total, artifact) => total + artifact.byteSize, 0);

      if (retainedTenantBytes + input.byteSize > maxTenantBytes) {
        throw new Error("Artifact exceeds the tenant temporary storage limit");
      }

      const created = now();
      const artifact: ArtifactMetadata = {
        ...input,
        id: `artifact-${nextId++}`,
        createdAt: created.toISOString(),
        expiresAt: new Date(created.getTime() + ttlMs).toISOString(),
        purgeStatus: "retained",
        blobRetained: true,
        exportStatus: "not_exported"
      };
      artifacts.set(artifact.id, artifact);
      auditEvents.push({ eventType: "artifact.created", tenantId: artifact.tenantId, artifactId: artifact.id });
      return { ...artifact };
    },

    createDownloadLink(input: { tenantId: string; userId: string; artifactId: string }): { url: string; expiresAt: string } {
      const artifact = findAvailable(input.tenantId, input.artifactId);
      const token = `${artifact.id}.${input.userId}.${Date.parse(artifact.expiresAt)}`;
      auditEvents.push({
        eventType: "artifact.download_link_created",
        tenantId: artifact.tenantId,
        artifactId: artifact.id,
        actorUserId: input.userId
      });
      return { url: `wf-download://${token}`, expiresAt: artifact.expiresAt };
    },

    purgeExpired(at: Date): string[] {
      const purged: string[] = [];
      for (const artifact of artifacts.values()) {
        if (artifact.blobRetained && Date.parse(artifact.expiresAt) <= at.getTime()) {
          artifact.blobRetained = false;
          artifact.purgeStatus = "purged";
          auditEvents.push({ eventType: "artifact.purged", tenantId: artifact.tenantId, artifactId: artifact.id });
          purged.push(artifact.id);
        }
      }
      return purged;
    },

    getMetadata(tenantId: string, artifactId: string): ArtifactMetadata {
      const artifact = artifacts.get(artifactId);
      if (!artifact || artifact.tenantId !== tenantId) {
        throw new Error("Artifact is not available");
      }
      return { ...artifact };
    },

    auditEvents(): ArtifactAuditEvent[] {
      return auditEvents.map((event) => ({ ...event }));
    }
  };
}
