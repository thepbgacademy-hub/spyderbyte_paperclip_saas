import { describe, expect, it } from "vitest";

describe("resolve web assets script", () => {
  it("maps built dist assets onto the public app-assets prefix", async () => {
    const indexHtml = [
      "<!doctype html>",
      '<html lang="en">',
      "  <head>",
      '    <link rel="stylesheet" href="/assets/index-abc123.css">',
      "  </head>",
      "  <body>",
      '    <script type="module" src="/assets/index-xyz789.js"></script>',
      "  </body>",
      "</html>"
    ].join("\n");
    // @ts-expect-error Runtime-loaded NodeNext helper is exercised directly in this test.
    const { resolveBuiltAssetUrls } = (await import("../scripts/resolve-web-assets.mjs")) as {
      resolveBuiltAssetUrls: (input: {
        indexHtml: string;
        publicOrigin: string;
        assetPrefix: string;
      }) => { entryUrl: string; stylesheetUrl?: string };
    };

    expect(
      resolveBuiltAssetUrls({
        indexHtml,
        publicOrigin: "https://api.spyderbyte.cloud",
        assetPrefix: "/app-assets"
      })
    ).toEqual({
      entryUrl: expect.stringMatching(/^https:\/\/api\.spyderbyte\.cloud\/app-assets\/index-[A-Za-z0-9_-]+\.js$/),
      stylesheetUrl: expect.stringMatching(/^https:\/\/api\.spyderbyte\.cloud\/app-assets\/index-[A-Za-z0-9_-]+\.css$/)
    });
  });
});
