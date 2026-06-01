import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import type { HarnessGovernanceHistoryExportReadyDispatch } from "../harness/board-service.js";

type ObsidianExportDispatchFile = HarnessGovernanceHistoryExportReadyDispatch["files"][number];

export type ObsidianExportPartialReceipt = {
  writtenFileCount: number;
  lastAttemptedPath: string;
};

export class ObsidianExportWriteError extends Error {
  readonly partialReceipt: ObsidianExportPartialReceipt;
  override readonly cause: unknown;

  constructor(input: { partialReceipt: ObsidianExportPartialReceipt; cause: unknown }) {
    const { partialReceipt, cause } = input;
    super(
      `Obsidian export failed after writing ${partialReceipt.writtenFileCount} file(s); last attempted path: ${partialReceipt.lastAttemptedPath}`
    );
    this.name = "ObsidianExportWriteError";
    this.partialReceipt = partialReceipt;
    this.cause = cause;
  }
}

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

export function resolveObsidianExportPath(input: {
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

export const resolveGovernanceHistoryExportPath = resolveObsidianExportPath;

export async function writeObsidianExportFiles(input: {
  exportRoot: string;
  files: readonly ObsidianExportDispatchFile[];
}): Promise<{ manifestPath: string | null; writtenFileCount: number }> {
  const manifestFile = input.files.find((file) => file.mediaType === "application/json") ?? null;
  const orderedFiles =
    manifestFile === null ? input.files : [...input.files.filter((file) => file !== manifestFile), manifestFile];
  let writtenFileCount = 0;

  for (const file of orderedFiles) {
    try {
      const resolvedPath = resolveObsidianExportPath({
        exportRoot: input.exportRoot,
        relativePath: file.path
      });
      await mkdir(path.dirname(resolvedPath), { recursive: true });
      await writeFile(resolvedPath, file.content, "utf8");
      writtenFileCount += 1;
    } catch (error) {
      throw new ObsidianExportWriteError({
        partialReceipt: {
          writtenFileCount,
          lastAttemptedPath: file.path
        },
        cause: error
      });
    }
  }

  return {
    manifestPath: manifestFile?.path ?? null,
    writtenFileCount
  };
}

export function createFilesystemGovernanceHistoryExportWriter(input: { exportRoot: string }): GovernanceHistoryExportWriter {
  return {
    async write(dispatch) {
      const writeResult = await writeObsidianExportFiles({
        exportRoot: input.exportRoot,
        files: dispatch.files
      });

      return {
        writerKind: "obsidian_filesystem",
        deliveredAt: new Date().toISOString(),
        receipt: {
          primaryNotePath: dispatch.placement.primaryNotePath,
          manifestPath: writeResult.manifestPath,
          writtenFileCount: writeResult.writtenFileCount
        }
      };
    }
  };
}
