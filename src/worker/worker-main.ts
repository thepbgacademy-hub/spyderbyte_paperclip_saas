import process from "node:process";

import { createWorkerRuntime, loadWorkerEnv } from "./runtime.js";

async function main() {
  const env = loadWorkerEnv(process.env);
  const runtime = createWorkerRuntime({ env });

  process.stdout.write("wealth_factory_worker_ready\n");

  const handleShutdownSignal = () => {
    void runtime.close().catch((error) => {
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
