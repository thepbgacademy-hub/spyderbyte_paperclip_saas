import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("analyze-resource-saturation script", () => {
  it("reports invalid measurement output when no usable docker or reachable queue samples were parsed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wf-analyze-saturation-"));
    const dockerPath = join(dir, "docker.jsonl");
    const queuePath = join(dir, "queue.jsonl");

    await writeFile(dockerPath, "not-json\n", "utf8");
    await writeFile(
      queuePath,
      `${JSON.stringify({
        observedAt: "2026-05-20T12:00:00.000Z",
        reachable: false,
        counts: null
      })}\n`,
      "utf8"
    );

    const { stdout } = await execFileAsync("node", [
      "scripts/analyze-resource-saturation.mjs",
      "--docker-stats",
      dockerPath,
      "--queue-snapshots",
      queuePath
    ], {
      cwd: "E:\\REPOS\\spyderbyte_paperclip_saas"
    });

    const result = JSON.parse(stdout);
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "no_docker_samples_parsed",
        "no_reachable_queue_snapshots"
      ])
    );
    expect(result.summary.docker.valid).toBe(false);
    expect(result.summary.queue.valid).toBe(false);
  }, 15000);
});
