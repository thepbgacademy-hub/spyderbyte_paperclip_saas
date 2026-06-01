import type { HarnessPackageBundleExportReadyDispatch } from "../harness/board-service.js";
import { writeObsidianExportFiles } from "./governance-history-export-writer.js";

export type PackageBundleExportWriterResult = {
  writerKind: "obsidian_filesystem";
  deliveredAt: string;
  receipt: {
    primaryNotePath: string;
    manifestPath: string | null;
    writtenFileCount: number;
    writtenPaths: string[];
  };
};

export type PackageBundleExportWriter = {
  write(dispatch: HarnessPackageBundleExportReadyDispatch): Promise<PackageBundleExportWriterResult>;
};

export function createFilesystemPackageBundleExportWriter(input: { exportRoot: string }): PackageBundleExportWriter {
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
          writtenFileCount: writeResult.writtenFileCount,
          writtenPaths: writeResult.writtenPaths
        }
      };
    }
  };
}
