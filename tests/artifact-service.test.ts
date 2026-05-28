import { describe, expect, it } from "vitest";

import path from "node:path";

import { createArtifactService, resolveArtifactStoragePath, validateArtifactId } from "../src/artifacts/artifact-service.js";

describe("temporary artifact service", () => {
  it("creates authenticated tenant-scoped download records with 24 hour default TTL", () => {
    const service = createArtifactService({ now: () => new Date("2026-05-10T00:00:00.000Z"), maxArtifactBytes: 2048, maxTenantBytes: 4096 });
    const artifact = service.createArtifact({
      tenantId: "tenant-1",
      runId: "run-1",
      packageId: "pkg-social",
      type: "image",
      filename: "post.png",
      mimeType: "image/png",
      byteSize: 1024,
      checksum: "sha256:abc"
    });

    expect(artifact.expiresAt).toBe("2026-05-11T00:00:00.000Z");
    expect(artifact.blobRetained).toBe(true);
    expect(service.createDownloadLink({ tenantId: "tenant-1", userId: "user-1", artifactId: artifact.id }).url).toMatch(/^wf-download:\/\//);
    expect(() => service.createDownloadLink({ tenantId: "tenant-2", userId: "user-2", artifactId: artifact.id })).toThrow("Artifact is not available");
    expect(service.auditEvents()).toContainEqual(expect.objectContaining({ eventType: "artifact.created", tenantId: "tenant-1" }));
  });

  it("purges expired blobs while retaining metadata", () => {
    const service = createArtifactService({ now: () => new Date("2026-05-10T00:00:00.000Z") });
    const artifact = service.createArtifact({
      tenantId: "tenant-1",
      runId: "run-1",
      packageId: "pkg-social",
      type: "pdf",
      filename: "report.pdf",
      mimeType: "application/pdf",
      byteSize: 2048,
      checksum: "sha256:def"
    });

    const purged = service.purgeExpired(new Date("2026-05-11T00:00:01.000Z"));
    expect(purged).toEqual([artifact.id]);
    expect(service.getMetadata("tenant-1", artifact.id)).toMatchObject({ blobRetained: false, purgeStatus: "purged" });
    expect(() => service.createDownloadLink({ tenantId: "tenant-1", userId: "user-1", artifactId: artifact.id })).toThrow("Artifact is not available");
  });

  it("protects metadata from caller mutation and enforces storage limits", () => {
    const service = createArtifactService({ now: () => new Date("2026-05-10T00:00:00.000Z"), maxArtifactBytes: 1024, maxTenantBytes: 2048 });
    expect(() =>
      service.createArtifact({
        tenantId: "tenant-1",
        runId: "run-1",
        packageId: "pkg-social",
        type: "video",
        filename: "clip.mp4",
        mimeType: "video/mp4",
        byteSize: 1025,
        checksum: "sha256:big"
      })
    ).toThrow("Artifact exceeds the per-artifact size limit");

    const artifact = service.createArtifact({
      tenantId: "tenant-1",
      runId: "run-1",
      packageId: "pkg-social",
      type: "image",
      filename: "post.png",
      mimeType: "image/png",
      byteSize: 1024,
      checksum: "sha256:abc"
    });
    const metadata = service.getMetadata("tenant-1", artifact.id);
    metadata.tenantId = "tenant-2";
    expect(service.getMetadata("tenant-1", artifact.id).tenantId).toBe("tenant-1");
  });

  it("rejects unsafe artifact ids before availability checks or download link creation", () => {
    const service = createArtifactService({ now: () => new Date("2026-05-10T00:00:00.000Z") });

    expect(() =>
      service.createDownloadLink({ tenantId: "tenant-1", userId: "user-1", artifactId: "../artifact-1" })
    ).toThrow("Artifact id is invalid");
    expect(() => service.getMetadata("tenant-1", "artifact-%2fescape")).toThrow("Artifact id is invalid");
    expect(() => validateArtifactId("artifact..1")).toThrow("Artifact id is invalid");
    expect(validateArtifactId("artifact-1")).toBe("artifact-1");
  });

  it("resolves future artifact storage paths under the configured root only", () => {
    const artifactRoot = path.resolve("C:/wf-artifacts");

    expect(
      resolveArtifactStoragePath({
        artifactRoot,
        artifactId: "artifact-1",
        extension: "json"
      })
    ).toBe(path.join(artifactRoot, "artifact-1.json"));

    expect(() =>
      resolveArtifactStoragePath({
        artifactRoot,
        artifactId: "..%2fartifact-1"
      })
    ).toThrow("Artifact id is invalid");
  });
});
