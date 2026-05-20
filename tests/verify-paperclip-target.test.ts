import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("verify paperclip target script", () => {
  it("prints structured success output for a live-style health payload", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", deploymentMode: "authenticated", bootstrapStatus: "ready" }));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected test server address");
    }

    try {
      const { stdout } = await execFileAsync("node", ["scripts/verify-paperclip-target.mjs"], {
        cwd: "E:\\REPOS\\spyderbyte_paperclip_saas",
        env: {
          ...process.env,
          WF_PAPERCLIP_VERIFY_URL: `http://127.0.0.1:${address.port}`,
          WF_PAPERCLIP_EXPECT_MODE: "authenticated"
        }
      });
      const output = JSON.parse(stdout);

      expect(output.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ check: "paperclip_health_status", status: "pass" }),
          expect.objectContaining({ check: "paperclip_health_shape", status: "pass" }),
          expect.objectContaining({ check: "paperclip_deployment_mode", status: "pass" })
        ])
      );
    } finally {
      server.close();
      await once(server, "close");
    }
  }, 15000);

  it("prints structured failure output when the target is unreachable", async () => {
    try {
      await execFileAsync("node", ["scripts/verify-paperclip-target.mjs"], {
        cwd: "E:\\REPOS\\spyderbyte_paperclip_saas",
        env: {
          ...process.env,
          WF_PAPERCLIP_VERIFY_URL: "http://127.0.0.1:9",
          WF_PAPERCLIP_EXPECT_MODE: "authenticated",
          WF_PAPERCLIP_VERIFY_TIMEOUT_MS: "250"
        }
      });
      throw new Error("Expected script to fail");
    } catch (error) {
      const output = JSON.parse((error as { stdout: string }).stdout);
      expect(output.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ check: "paperclip_health_request", status: "fail" })
        ])
      );
    }
  }, 15000);
});
