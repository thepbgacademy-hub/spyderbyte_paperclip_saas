import process from "node:process";

import { closeServerGracefully } from "./server-lifecycle.js";
import { createStaticRuntimeAuth, loadStaticRuntimeAuthEnv } from "./runtime-auth.js";
import { createDashboardRuntime, loadRuntimeEnv } from "./runtime-server.js";

async function main() {
  const env = loadRuntimeEnv(process.env);
  const auth = createStaticRuntimeAuth(loadStaticRuntimeAuthEnv(process.env));
  const runtime = createDashboardRuntime({ env, auth });

  runtime.server.listen(env.apiPort, "0.0.0.0", () => {
    process.stdout.write(`wealth_factory_api_listening:${env.apiPort}\n`);
  });

  const shutdown = async () => {
    await closeServerGracefully(runtime.server);
    await runtime.close();
  };

  const handleShutdownSignal = () => {
    void shutdown().catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
  };

  process.on("SIGINT", handleShutdownSignal);
  process.on("SIGTERM", handleShutdownSignal);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
