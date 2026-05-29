import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import type { HarnessGovernanceHistoryExportReadyDispatch } from "../harness/board-service.js";

export type GovernanceHistoryExportWriterResult = {
  writerKind: "obsidian_filesystem";
  deliveredAt: string;
  receipt: {
    primaryNotePath: string;
    manifestPath: string | null;
    writtenFileCount: number;
  };
};

export type GovernanceHistoryExportWriter = {
  write(dispatch: HarnessGovernanceHistoryExportReadyDispatch): Promise<GovernanceHistoryExportWriterResult>;
};

export function resolveGovernanceHistoryExportPath(input: {
  exportRoot: string;
  relativePath: string;
}): string {
  if (path.isAbsolute(input.relativePath)) {
    throw new Error("Obsidian export path must be relative");
  }

  const exportRoot = path.resolve(input.exportRoot);
  const resolvedPath = path.resolve(exportRoot, input.relativePath);
  const normalizedRoot = exportRoot.endsWith(path.sep) ? exportRoot : `${exportRoot}${path.sep}`;
  if (resolvedPath !== exportRoot && !resolvedPath.startsWith(normalizedRoot)) {
    throw new Error("Obsidian export path escapes the configured Obsidian export root");
  }
  return resolvedPath;
}

export function createFilesystemGovernanceHistoryExportWriter(input: { exportRoot: string }): GovernanceHistoryExportWriter {
  return {
    async write(dispatch) {
      for (const file of dispatch.files) {
        const resolvedPath = resolveGovernanceHistoryExportPath({
          exportRoot: input.exportRoot,
          relativePath: file.path
        });
        await mkdir(path.dirname(resolvedPath), { recursive: true });
        await writeFile(resolvedPath, file.content, "utf8");
      }

      return {
        writerKind: "obsidian_filesystem",
        deliveredAt: new Date().toISOString(),
        receipt: {
          primaryNotePath: dispatch.placement.primaryNotePath,
          manifestPath: dispatch.files.find((file) => file.mediaType === "application/json")?.path ?? null,
          writtenFileCount: dispatch.files.length
        }
      };
    }
  };
}
