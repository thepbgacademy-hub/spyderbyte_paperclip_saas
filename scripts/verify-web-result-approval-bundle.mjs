import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const storageKey = "wealth-factory.resultApprovalStates.v1";
const assetsDir = join(process.cwd(), "apps", "web", "dist", "assets");

if (!existsSync(assetsDir)) {
  throw new Error("apps/web/dist/assets is missing. Run npm run build:web before verifying the web result approval bundle.");
}

const bundleContainsStorageKey = readdirSync(assetsDir)
  .filter((fileName) => fileName.endsWith(".js"))
  .some((fileName) => readFileSync(join(assetsDir, fileName), "utf8").includes(storageKey));

if (!bundleContainsStorageKey) {
  throw new Error(`Built web bundle does not contain ${storageKey}. The approval persistence seam may not be wired into production assets.`);
}

process.stdout.write("web-result-approval-bundle: ok\n");
