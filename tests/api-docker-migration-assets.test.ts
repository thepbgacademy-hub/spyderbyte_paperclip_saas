import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const apiDockerfile = readFileSync("Dockerfile.api", "utf8").replace(/\r\n/g, "\n");

describe("api runtime image migration assets", () => {
  it("ships the repo migrations needed by the checked-in migration helper", () => {
    expect(apiDockerfile).toContain("COPY scripts ./scripts");
    expect(apiDockerfile).toContain("COPY supabase/migrations ./supabase/migrations");
  });
});
