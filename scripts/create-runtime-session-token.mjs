import process from "node:process";

import { createRuntimeSessionToken, loadRuntimeSessionAuthEnv } from "../dist/api/runtime-auth.js";

const args = parseArgs(process.argv.slice(2));

for (const key of ["tenant", "user", "role", "expires-in-minutes"]) {
  if (!args[key]) {
    throw new Error(`Missing required arg --${key}`);
  }
}

const expiresInMinutes = Number(args["expires-in-minutes"]);
if (!Number.isInteger(expiresInMinutes) || expiresInMinutes < 1) {
  throw new Error("--expires-in-minutes must be a positive integer");
}
if (expiresInMinutes > 60) {
  throw new Error("--expires-in-minutes must be 60 or less");
}

if (args.role !== "member" && args.role !== "operator") {
  throw new Error("--role must be member or operator");
}

const env = loadRuntimeSessionAuthEnv(process.env);
const token = createRuntimeSessionToken({
  signingKey: env.signingKey,
  issuer: env.issuer,
  audience: env.audience,
  session: {
    tenantId: args.tenant,
    userId: args.user,
    role: args.role
  },
  expiresAt: new Date(Date.now() + expiresInMinutes * 60_000)
});

process.stdout.write(`${token}\n`);

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    output[arg.slice(2)] = argv[index + 1] ?? "";
    index += 1;
  }
  return output;
}
