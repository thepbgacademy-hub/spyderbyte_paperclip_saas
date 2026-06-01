import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  createFilesystemGovernanceHistoryExportWriter,
  resolveGovernanceHistoryExportPath
} from "../src/obsidian/governance-history-export-writer.js";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true }));
    }
  }
});

describe("governance history export writer", () => {
  it("writes export-ready bundle files under the configured Obsidian root", async () => {
    const exportRoot = await mkdtemp(path.join(tmpdir(), "wf-obsidian-export-"));
    tempRoots.push(exportRoot);
    const writer = createFilesystemGovernanceHistoryExportWriter({ exportRoot });

    const result = await writer.write({
      tenantId: "tenant_123",
      userId: "user_123",
      runId: "run_123",
      workflowId: "wf_connect_first_workflow",
      packageId: "pkg_bib_connect",
      candidateId: "governance_history_export",
      bundleId: "bundle_123",
      bundleRevision: "bundle_revision_123",
      exportFormat: "obsidian_markdown_bundle",
      recordTarget: "governance_history_record",
      idempotencyKey: "idempotency_123",
      noteTitle: "Governance history",
      noteFileName: "wf_connect_first_workflow-governance-history.md",
      placement: {
        targetSystem: "obsidian_vault",
        vaultFolder: "wealth-factory/governance-history/wf_connect_first_workflow",
        primaryNotePath:
          "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
        syncStrategy: "append_history_entry",
        confirmationRequirement: "tenant_export_confirmation"
      },
      files: [
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md",
          mediaType: "text/markdown",
          byteSize: 20,
          checksum: "abc123",
          content: "# Governance history"
        },
        {
          path: "wealth-factory/governance-history/wf_connect_first_workflow/manifest.json",
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
      "wealth-factory/governance-history/wf_connect_first_workflow/wf_connect_first_workflow-governance-history.md"
    );

    await expect(
      readFile(
        path.join(
          exportRoot,
          "wealth-factory",
          "governance-history",
          "wf_connect_first_workflow",
          "wf_connect_first_workflow-governance-history.md"
        ),
        "utf8"
      )
    ).resolves.toBe("# Governance history");
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
