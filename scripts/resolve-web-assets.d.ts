declare module "../scripts/resolve-web-assets.mjs" {
  export function resolveBuiltAssetUrls(input: {
    indexHtml: string;
    publicOrigin: string;
    assetPrefix: string;
  }): {
    entryUrl: string;
    stylesheetUrl?: string;
  };

  export function runCli(): void;
}
