import { readFileSync } from "node:fs";
import process from "node:process";

export function parseDotEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => line.split(/=(.*)/s).slice(0, 2))
  );
}

export function loadScriptEnv(path = ".env") {
  return {
    ...parseDotEnvFile(path),
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => typeof value === "string")
    )
  };
}
