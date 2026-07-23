import type { QueryClient } from "../db/supabase-repositories.js";
import type { TenantPackageInstallRole } from "../factory/packages/package-install-application-service.js";

/**
 * Maps wfpc.tenant_memberships.role (owner|admin|member|operator) to the
 * narrower TenantPackageInstallRole the install RBAC gate understands.
 * "operator" and any missing/unrecognized membership resolve to the
 * non-privileged "member" so the gate denies install-management actions --
 * this resolver never escalates and never consults session.role.
 */
export function createPostgresTenantPackageInstallRoleResolver(client: QueryClient) {
  return async function resolveTenantPackageInstallRole(input: {
    tenantId: string;
    userId: string;
  }): Promise<TenantPackageInstallRole> {
    const result = await client.query(
      "select role from wfpc.tenant_memberships where tenant_id = $1 and user_id = $2 limit 1",
      [input.tenantId, input.userId]
    );
    const role = (result.rows[0] as { role?: string } | undefined)?.role;
    return role === "owner" || role === "admin" ? role : "member";
  };
}
