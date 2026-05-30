import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import type { HarnessPackageBundleExportReadyDispatch } from "../harness/board-service.js";
import { resolveObsidianExportPath } from "./governance-history-export-writer.js";

export type PackageBundleExportWriterResult = {
  writerKind: "obsidian_filesystem";
  deliveredAt: string;
  receipt: {
    primaryNotePath: string;
    manifestPath: string | null;
    writtenFileCount: number;
  };
};

export type PackageBundleExportWriter = {
  write(dispatch: HarnessPackageBundleExportReadyDispatch): Promise<PackageBundleExportWriterResult>;
};

export function createFilesystemPackageBundleExportWriter(input: { exportRoot: string }): PackageBundleExportWriter {
  return {
    async write(dispatch) {
      for (const file of dispatch.files) {
        const resolvedPath = resolveObsidianExportPath({
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
