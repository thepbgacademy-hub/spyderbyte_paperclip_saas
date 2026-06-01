import path from "node:path";
import { access, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { createFilesystemPackageBundleExportWriter } from "../src/obsidian/package-bundle-export-writer.js";
import { resolveGovernanceHistoryExportPath } from "../src/obsidian/governance-history-export-writer.js";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true }));
    }
  }
});

describe("package bundle export writer", () => {
  it("writes export-ready bundle files under the configured Obsidian root", async () => {
    const exportRoot = await mkdtemp(path.join(tmpdir(), "wf-obsidian-export-"));
    tempRoots.push(exportRoot);
    const writer = createFilesystemPackageBundleExportWriter({ exportRoot });

    const result = await writer.write({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "package_bundle_export",
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "package_deliverable_record",
      idempotencyKey: "idempotency_123",
      noteTitle: "Package bundle",
      noteFileName: "wf_connect_first_workflow-package-bundle.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/package-bundles/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md",
          mediaType: "text/markdown",
          byteSize: 18,
          checksum: "abc123",
          content: "# Package bundle"
        },
        {
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json",
          mediaType: "application/json",
          byteSize: 42,
          checksum: "def456",
          content: "{\"ok\":true}"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });

    expect(result.writerKind).toBe("obsidian_filesystem");
    expect(result.receipt.writtenFileCount).toBe(2);
    expect(result.receipt.primaryNotePath).toBe(
      "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md"
    );

    await expect(
      readFile(
        path.join(
          exportRoot,
          "wealth-factory",
          "package-bundles",
          "wf_connect_first_workflow",
          "wf_connect_first_workflow-package-bundle.md"
        ),
        "utf8"
      )
    ).resolves.toBe("# Package bundle");
  });

  it("writes the manifest last and surfaces a bounded partial receipt when a non-manifest file fails", async () => {
    const exportRoot = await mkdtemp(path.join(tmpdir(), "wf-obsidian-export-"));
    tempRoots.push(exportRoot);
    const writer = createFilesystemPackageBundleExportWriter({ exportRoot });
    const blockedNotePath =
      "wealth-factory/package-bundles/wf_connect_first_workflow/wf_connect_first_workflow-package-bundle.md";

    await mkdir(path.join(exportRoot, blockedNotePath), { recursive: true });

    const writePromise = writer.write({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "package_bundle_export",
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "package_deliverable_record",
      idempotencyKey: "idempotency_123",
      noteTitle: "Package bundle",
      noteFileName: "wf_connect_first_workflow-package-bundle.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/package-bundles/wf_connect_first_workflow",
        primaryNotePath: blockedNotePath,
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/export-manifest.json",
          mediaType: "application/json",
          byteSize: 42,
          checksum: "def456",
          content: "{\"ok\":true}"
        },
        {
          path: "wealth-factory/package-bundles/wf_connect_first_workflow/summary.md",
          mediaType: "text/markdown",
          byteSize: 18,
          checksum: "ghi789",
          content: "# Summary"
        },
        {
          path: blockedNotePath,
          mediaType: "text/markdown",
          byteSize: 18,
          checksum: "abc123",
          content: "# Package bundle"
        }
      ],
      recordCount: 2,
      disclosureSummary: "Decision summary only",
      redactionSummary: "Governance-safe redaction"
    });

    await expect(writePromise).rejects.toMatchObject({
      partialReceipt: {
        writtenFileCount: 1,
        lastAttemptedPath: blockedNotePath
      }
    });

    let writeError: Error | undefined;
    await writePromise.catch((error) => {
      writeError = error as Error;
    });
    expect(writeError?.message).toContain("after writing 1 file(s)");
    expect(writeError?.message).toContain(`last attempted path: ${blockedNotePath}`);
    expect(writeError?.message).not.toContain(exportRoot);

    await expect(
      readFile(path.join(exportRoot, "wealth-factory", "package-bundles", "wf_connect_first_workflow", "summary.md"), "utf8")
    ).resolves.toBe("# Summary");
    await expect(
      access(path.join(exportRoot, "wealth-factory", "package-bundles", "wf_connect_first_workflow", "export-manifest.json"))
    ).rejects.toThrow();
  });

  it("rejects file paths that escape the configured Obsidian root", () => {
    expect(() =>
      resolveGovernanceHistoryExportPath({
        exportRoot: "C:\\obsidian-vault",
        relativePath: "..\\outside.md"
      })
    ).toThrow(/escapes the configured Obsidian export root/i);
  });
});
