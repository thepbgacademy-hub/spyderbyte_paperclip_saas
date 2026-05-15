import type { DashboardHttpRequest, DashboardHttpResponse } from "./dashboard-http.js";
import { createSecurityHeaders } from "../security/cors.js";
import { assertWealthFactoryResponse } from "../wealthfactory/response-guard.js";

type DashboardApi = {
  listDashboard(request: { authorization: string; cookie?: string }): Promise<unknown>;
};

export function createAppShellHandler(options: {
  dashboardApi: DashboardApi;
  webAppEntryUrl: string;
  webAppStylesheetUrl?: string;
  pageTitle?: string;
}) {
  const pageTitle = options.pageTitle ?? "Wealth Factory";

  return async function handleAppShellRequest(request: DashboardHttpRequest): Promise<DashboardHttpResponse> {
    if (!shouldServeAppShell(request.path, request.method)) {
      return {
        status: 404,
        headers: { ...createSecurityHeaders() },
        body: { code: "not_found" }
      };
    }

    try {
      const initialResponse = await options.dashboardApi.listDashboard({
        authorization: request.headers.authorization ?? "",
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {})
      });
      const bootstrap = { initialResponse };
      assertWealthFactoryResponse(bootstrap);

      return {
        status: 200,
        headers: {
          ...createShellSecurityHeaders({
            webAppEntryUrl: options.webAppEntryUrl,
            ...(options.webAppStylesheetUrl ? { webAppStylesheetUrl: options.webAppStylesheetUrl } : {})
          }),
          "content-type": "text/html; charset=utf-8"
        },
        body: renderAppShell({
          bootstrapJson: escapeJsonScript(JSON.stringify(bootstrap)),
          pageTitle,
          webAppEntryUrl: options.webAppEntryUrl,
          ...(options.webAppStylesheetUrl ? { webAppStylesheetUrl: options.webAppStylesheetUrl } : {})
        })
      };
    } catch {
      return {
        status: 401,
        headers: { ...createSecurityHeaders() },
        body: { code: "unauthorized" }
      };
    }
  };
}

function shouldServeAppShell(path: string, method: string): boolean {
  if (method !== "GET") {
    return false;
  }
  if (path.startsWith("/api/") || path === "/api" || path === "/health") {
    return false;
  }
  return !path.split("/").some((segment) => segment.includes("."));
}

function renderAppShell(input: { bootstrapJson: string; pageTitle: string; webAppEntryUrl: string; webAppStylesheetUrl?: string }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.pageTitle)}</title>
    ${input.webAppStylesheetUrl ? `<link rel="stylesheet" href="${escapeHtml(input.webAppStylesheetUrl)}" />` : ""}
  </head>
  <body>
    <div id="root"></div>
    <script id="wf-dashboard-bootstrap" type="application/json">${input.bootstrapJson}</script>
    <script type="module" src="${escapeHtml(input.webAppEntryUrl)}"></script>
  </body>
</html>`;
}

function createShellSecurityHeaders(input: { webAppEntryUrl: string; webAppStylesheetUrl?: string }) {
  const assetOrigins = Array.from(
    new Set(
      [input.webAppEntryUrl, input.webAppStylesheetUrl]
        .filter((value): value is string => Boolean(value))
        .map((value) => new URL(value).origin)
    )
  );
  const assetSources = assetOrigins.join(" ");

  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "content-security-policy": `default-src 'self'; script-src 'self' ${assetSources}; connect-src 'self' ${assetSources}; style-src 'self' 'unsafe-inline' ${assetSources}; img-src 'self' data: blob: ${assetSources}; font-src 'self' data: ${assetSources}; frame-ancestors 'none'; base-uri 'self'`
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function escapeJsonScript(value: string) {
  return value
    .replace(/</gu, "\\u003c")
    .replace(/>/gu, "\\u003e")
    .replace(/&/gu, "\\u0026");
}
