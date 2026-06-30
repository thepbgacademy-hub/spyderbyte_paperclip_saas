import { spawnSync } from "node:child_process";
import process from "node:process";

import { loadScriptEnv } from "./lib/script-env.mjs";
import {
  buildPublicLaunchHostPlan,
  parsePublicLaunchHostArgs
} from "./lib/public-launch-host.mjs";

const args = parsePublicLaunchHostArgs(process.argv.slice(2));
const envFilePath = args["env-file"] || process.env.WF_PUBLIC_LAUNCH_ENV_FILE;
const fileEnv = envFilePath ? loadScriptEnv(envFilePath) : {};
const sourceEnv = {
  ...fileEnv,
  ...process.env
};
let plan = buildPublicLaunchHostPlan({ args, env: sourceEnv });

if (!plan.execute) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    dryRun: true,
    phase: "public_launch_host_proof_planned",
    launchPosture: plan.launchPosture,
    apiOrigin: plan.apiOrigin,
    portalOrigin: plan.portalOrigin,
    cutoverHost: plan.cutoverHost,
    authenticatedMode: plan.authenticatedMode,
    authenticatedSessionCookieSupplied: plan.authenticatedSessionCookieSupplied,
    authEnvFilePath: plan.authenticatedMode === "mint_session" && plan.authEnvFilePath ? "<operator-supplied>" : null,
    expiresInMinutes: plan.expiresInMinutes,
    note: "DRY RUN: no network calls made. Pass --execute to run the public launch host proof.",
    commands: plan.commands.map((command) => ({
      label: command.label,
      env: redactSensitiveEnv(command.env)
    }))
  }, null, 2)}\n`);
  process.exit(0);
}

if (plan.authenticatedMode === "mint_session") {
  runCommand("npm run build:server", "npm", ["run", "build:server"], { env: sourceEnv });
  const { createRuntimeSessionToken, loadRuntimeSessionAuthEnv } = await import("../dist/api/runtime-auth.js");
  const runtimeAuthEnv = loadRuntimeSessionAuthEnv(sourceEnv);
  const sessionToken = createRuntimeSessionToken({
    signingKey: runtimeAuthEnv.signingKey,
    issuer: runtimeAuthEnv.issuer,
    audience: runtimeAuthEnv.audience,
    session: {
      tenantId: plan.tenantId,
      userId: plan.userId,
      role: plan.role
    },
    expiresAt: new Date(Date.now() + plan.expiresInMinutes * 60_000)
  });
  sourceEnv.WF_PUBLIC_LAUNCH_SESSION_COOKIE_VALUE = sessionToken;
  plan = buildPublicLaunchHostPlan({ args, env: sourceEnv });
}

const results = [];
for (const command of plan.commands) {
  process.stdout.write(`\n>> ${command.label}\n`);
  const result = runCommand(command.label, command.command, command.args, {
    env: {
      ...sourceEnv,
      ...command.env
    }
  });
  results.push({
    label: command.label,
    status: result.status ?? 1,
    authenticatedChecks: buildAuthenticatedChecks({
      label: command.label,
      authenticatedSessionCookieSupplied: plan.authenticatedSessionCookieSupplied,
      status: result.status ?? 1
    })
  });
}

process.stdout.write(`\n${JSON.stringify({
  ok: true,
  dryRun: false,
  phase: plan.authenticatedSessionCookieSupplied ? "authenticated_public_launch_host_verified" : "public_launch_host_verified",
  launchPosture: plan.launchPosture,
  apiOrigin: plan.apiOrigin,
  portalOrigin: plan.portalOrigin,
  cutoverHost: plan.cutoverHost,
  authenticatedMode: plan.authenticatedMode,
  authenticatedSessionCookieSupplied: plan.authenticatedSessionCookieSupplied,
  results
}, null, 2)}\n`);

function buildAuthenticatedChecks({ label, authenticatedSessionCookieSupplied, status }) {
  if (!authenticatedSessionCookieSupplied || status !== 0) {
    return [];
  }
  if (label === "npm run smoke:external") {
    return ["html_shell", "html_shell", "harness_board_api"];
  }
  if (label === "npm run e2e:live") {
    return ["authenticated_shell", "authenticated_harness_board"];
  }
  return [];
}

function runCommand(label, command, args, options) {
  const resolvedCommand = resolveCommand(command);
  const result = spawnSync(resolvedCommand, args, {
    cwd: process.cwd(),
    shell: process.platform === "win32" && /\.cmd$/i.test(resolvedCommand),
    stdio: "inherit",
    ...options
  });
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
  if (result.error) {
    throw result.error;
  }
  return result;
}

function resolveCommand(command) {
  return process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
}

function redactSensitiveEnv(env) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [
    key,
    isSensitiveEnvKey(key) && value ? "<set>" : value
  ]));
}

function isSensitiveEnvKey(key) {
  return /(?:COOKIE|TOKEN|SECRET|PASSWORD|KEY)/i.test(key);
}
