import { readFileSync } from "node:fs";
import process from "node:process";
import { URL } from "node:url";
import { pathToFileURL } from "node:url";

if (isDirectExecution()) {
  runCli();
}

export function runCli() {
  const indexPath = process.env.WF_WEB_DIST_INDEX_PATH ?? "apps/web/dist/index.html";
  const publicOrigin = process.env.WF_WEB_PUBLIC_ASSET_ORIGIN;
  const assetPrefix = process.env.WF_WEB_PUBLIC_ASSET_PREFIX ?? "/app-assets";

  if (!publicOrigin) {
    throw new Error("WF_WEB_PUBLIC_ASSET_ORIGIN is required");
  }

  const indexHtml = readFileSync(indexPath, "utf8");
  const assetUrls = resolveBuiltAssetUrls({
    indexHtml,
    publicOrigin,
    assetPrefix
  });

  process.stdout.write(`WF_WEB_APP_ENTRY_URL=${assetUrls.entryUrl}\n`);
  if (assetUrls.stylesheetUrl) {
    process.stdout.write(`WF_WEB_APP_STYLESHEET_URL=${assetUrls.stylesheetUrl}\n`);
  }
}

export function resolveBuiltAssetUrls(input) {
  const scriptMatch = /<script[^>]+type="module"[^>]+src="([^"]+)"/u.exec(input.indexHtml);
  if (!scriptMatch?.[1]) {
    throw new Error("Unable to locate built app entry script");
  }

  const stylesheetMatch = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/u.exec(input.indexHtml);

  return {
    entryUrl: toPublicAssetUrl(scriptMatch[1], input.publicOrigin, input.assetPrefix),
    ...(stylesheetMatch?.[1] ? { stylesheetUrl: toPublicAssetUrl(stylesheetMatch[1], input.publicOrigin, input.assetPrefix) } : {})
  };
}

function toPublicAssetUrl(assetPath, publicOrigin, assetPrefix) {
  const normalizedPath = assetPath.startsWith("/assets/") ? `${trimTrailingSlash(assetPrefix)}/${assetPath.slice("/assets/".length)}` : assetPath;
  return new URL(normalizedPath, ensureTrailingSlash(publicOrigin)).toString();
}

function trimTrailingSlash(value) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}
