import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { loadScriptEnv } from "./lib/script-env.mjs";
import {
  DEFAULT_STAGE_SSH_ENV_FILE,
  DEFAULT_STAGE_PROOF_ENV_FILE,
  buildLaneProofEnv,
  buildStageProofPlan,
  parseStageProofArgs,
  resolveNodeCommand,
  selectSingleWorkflowTemplateId
} from "./lib/stage-live-proof.mjs";

const args = parseStageProofArgs(process.argv.slice(2));
const seedEnvFilePath = typeof args["env-file"] === "string" && args["env-file"].trim().length > 0
  ? args["env-file"].trim()
  : process.env.WF_STAGE_ENV_FILE ?? DEFAULT_STAGE_PROOF_ENV_FILE;
const sshEnvFilePath = typeof args["ssh-env-file"] === "string" && args["ssh-env-file"].trim().length > 0
  ? args["ssh-env-file"].trim()
  : process.env.WF_STAGE_SSH_ENV_FILE ?? DEFAULT_STAGE_SSH_ENV_FILE;
const source = {
  ...loadScriptEnv(sshEnvFilePath),
  ...loadScriptEnv(seedEnvFilePath)
};
const plan = buildStageProofPlan({ args, env: source });
const baseEnv = {
  ...process.env,
  ...source
};
const remoteSudoPassword = typeof source.VPS2_SUDO_PASSWORD === "string" ? source.VPS2_SUDO_PASSWORD : null;

runCommand("npm run build:server", resolveNodeCommand("npm"), ["run", "build:server"], { env: baseEnv });

const { createRuntimeSessionToken, loadRuntimeSessionAuthEnv } = await import("../dist/api/runtime-auth.js");
const runtimeAuthEnv = loadRuntimeSessionAuthEnv(baseEnv);
const summary = [];
const tunnel = plan.preflightDb.tunnelRequired && (!plan.preflightDb.sshTarget || !remoteSudoPassword)
  ? await startSshTunnel({
      sshTarget: plan.preflightDb.sshTarget,
      localPort: plan.preflightDb.localPort,
      remoteHost: plan.preflightDb.tunnelRemoteHost,
      remotePort: plan.preflightDb.tunnelRemotePort
    })
  : null;

try {
  for (const lane of plan.lanes) {
    const preflightWorkflowId = plan.preflightDb.tunnelRequired && plan.preflightDb.sshTarget && remoteSudoPassword
      ? await resolveRemoteWorkflowTemplateId({
          sshTarget: plan.preflightDb.sshTarget,
          sudoPassword: remoteSudoPassword,
          containerName: plan.preflightDb.remoteContainerName,
          tenantId: lane.tenantId
        })
      : lane.workflowId;
    const sessionToken = createRuntimeSessionToken({
      signingKey: runtimeAuthEnv.signingKey,
      issuer: runtimeAuthEnv.issuer,
      audience: runtimeAuthEnv.audience,
      session: {
        tenantId: lane.tenantId,
        userId: lane.userId,
        role: plan.role
      },
      expiresAt: new Date(Date.now() + plan.expiresInMinutes * 60_000)
    });
    const laneEnv = {
      ...baseEnv,
      SUPABASE_DB_URL: plan.preflightDb.resolvedDbUrl,
      ...buildLaneProofEnv({
        plan,
        lane,
        sessionToken
      })
    };

    process.stdout.write(`\n== Stage proof lane: ${lane.laneName} (${lane.workflowId}) ==\n`);
    if (plan.preflightDb.tunnelRequired && plan.preflightDb.sshTarget && remoteSudoPassword) {
      await runRemotePreflight({
        sshTarget: plan.preflightDb.sshTarget,
        sudoPassword: remoteSudoPassword,
        containerName: plan.preflightDb.remoteContainerName,
        tenantId: lane.tenantId,
        workflowId: preflightWorkflowId
      });
    } else {
      runCommand(
        "npm run check:live-runtime --",
        resolveNodeCommand("npm"),
        ["run", "check:live-runtime", "--", "--tenant", lane.tenantId, "--workflow", preflightWorkflowId],
        { env: laneEnv }
      );
    }
    runCommand(
      "node scripts/external-smoke-security.mjs",
      process.execPath,
      ["scripts/external-smoke-security.mjs"],
      { env: laneEnv }
    );
    runCommand(
      "npx playwright test apps/web/tests/live/deployment.spec.ts --config apps/web/playwright.live.config.ts",
      resolveNodeCommand("npx"),
      ["playwright", "test", "apps/web/tests/live/deployment.spec.ts", "--config", "apps/web/playwright.live.config.ts"],
      { env: laneEnv }
    );

    summary.push({
      lane: lane.laneName,
      workflowId: lane.workflowId,
      preflightWorkflowId,
      tenantId: lane.tenantId
    });
  }
} finally {
  if (tunnel) {
    tunnel.kill("SIGTERM");
    await onceClosed(tunnel);
  }
}

async function runRemotePreflight({ sshTarget, sudoPassword, containerName, tenantId, workflowId }) {
  process.stdout.write("\n>> remote runtime preflight via wf-stage-api\n");
  const escapedPassword = shellEscapeSingleQuotes(sudoPassword);
  const escapedContainerName = shellEscapeSingleQuotes(containerName);
  const remoteCommand =
    `printf '%s\\n' '${escapedPassword}' | sudo -S -p '' docker exec '${escapedContainerName}' sh -lc ` +
    `"node scripts/check-live-runtime-readiness.mjs --tenant ${tenantId} --workflow ${workflowId}"`;
  const result = await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
  process.stdout.write(result.stdout);
  if (result.stderr.trim()) {
    process.stderr.write(result.stderr);
  }
}

async function resolveRemoteWorkflowTemplateId({ sshTarget, sudoPassword, containerName, tenantId }) {
  process.stdout.write(">> resolve remote workflow template id\n");
  const escapedPassword = shellEscapeSingleQuotes(sudoPassword);
  const escapedContainerName = shellEscapeSingleQuotes(containerName);
  const remoteScript = [
    "const pg = require('pg');",
    "const client = new pg.Client({",
    "  connectionString: process.env.SUPABASE_DB_URL,",
    "  ssl: process.env.SUPABASE_DB_SSL === 'false' ? undefined : { rejectUnauthorized: true }",
    "});",
    "(async () => {",
    "  await client.connect();",
    `  const result = await client.query(\"select id from wfpc.workflow_templates where tenant_id = '${tenantId}' order by created_at desc\");`,
    "  console.log(JSON.stringify(result.rows));",
    "  await client.end();",
    "})().catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});"
  ].join(" ");
  const remoteCommand =
    `printf '%s\\n' '${escapedPassword}' | sudo -S -p '' docker exec '${escapedContainerName}' node -e ` +
    `"${escapeDoubleQuotes(remoteScript)}"`;
  const result = await sshExec({
    sshTarget,
    remoteCommand,
    timeoutMs: 30000,
    maxBufferBytes: 1024 * 1024
  });
  return selectSingleWorkflowTemplateId(JSON.parse(result.stdout.trim()));
}

process.stdout.write(`\n${JSON.stringify({
  ok: true,
  apiOrigin: plan.apiOrigin,
  portalOrigin: plan.portalOrigin,
  envFilePath: plan.envFilePath,
  lanes: summary
}, null, 2)}\n`);

function runCommand(label, command, commandArgs, options) {
  process.stdout.write(`\n>> ${label}\n`);
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    shell: process.platform === "win32" && /\.cmd$/i.test(command),
    stdio: "inherit",
    ...options
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
}

async function startSshTunnel({ sshTarget, localPort, remoteHost, remotePort }) {
  if (!sshTarget) {
    throw new Error("Stage proof needs an SSH target to tunnel the private database reachability seam");
  }

  process.stdout.write(`\n>> ssh db tunnel ${sshTarget} (${localPort} -> ${remoteHost}:${remotePort})\n`);
  const child = spawn("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ExitOnForwardFailure=yes",
    "-N",
    "-L",
    `${localPort}:${remoteHost}:${remotePort}`,
    sshTarget
  ], {
    stdio: ["ignore", "ignore", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(stderr.trim() || `SSH tunnel exited early with code ${child.exitCode}`);
    }
    if (await canConnect("127.0.0.1", localPort)) {
      return child;
    }
    await delay(500);
  }

  child.kill("SIGTERM");
  await onceClosed(child);
  throw new Error(stderr.trim() || `SSH tunnel did not open local port ${localPort}`);
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function onceClosed(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
  });
}

function sshExec({ sshTarget, remoteCommand, timeoutMs, maxBufferBytes }) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [sshTarget, remoteCommand], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBufferBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error(`SSH stdout exceeded ${maxBufferBytes} bytes`));
        }
        return;
      }
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxBufferBytes) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error(`SSH stderr exceeded ${maxBufferBytes} bytes`));
        }
        return;
      }
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `SSH command exited with code ${code}`));
    });
  });
}

function shellEscapeSingleQuotes(value) {
  return String(value).replace(/'/g, `'\"'\"'`);
}

function escapeDoubleQuotes(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
