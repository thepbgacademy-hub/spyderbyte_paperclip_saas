import type { QueryClient } from "../db/supabase-repositories.js";

type Audit = (event: {
  tenantId: string;
  actorUserId: string;
  eventType: string;
  entityType: string;
  metadata: Record<string, unknown>;
}) => void | Promise<void>;

export class OperatorOperationNotImplementedError extends Error {
  readonly code = "operator_operation_not_implemented";

  constructor(operation: string) {
    super(`Operator operation is not implemented: ${operation}`);
    this.name = "OperatorOperationNotImplementedError";
  }
}

export function createPostgresOperatorDependencies(client: QueryClient, audit: Audit) {
  return {
    async isOperator(input: { tenantId: string; actorUserId: string }): Promise<boolean> {
      const result = await client.query(
        `select tenant_id
         from wfpc.tenant_memberships
         where tenant_id = $1
           and user_id = $2
           and role in ('owner', 'admin', 'operator')
         limit 1`,
        [input.tenantId, input.actorUserId]
      );
      return result.rows.length > 0;
    },
    tenantControls: {
      async pause(input: { tenantId: string; reason: string }): Promise<void> {
        await client.query(
          `update wfpc.tenants
           set paused_at = now(),
               updated_at = now()
           where id = $1`,
          [input.tenantId]
        );
      },
      async resume(input: { tenantId: string; reason?: string }): Promise<void> {
        await client.query(
          `update wfpc.tenants
           set paused_at = null,
               updated_at = now()
           where id = $1`,
          [input.tenantId]
        );
      },
      async disablePaperclip(_input: { tenantId: string; reason: string }): Promise<void> {
        throw new OperatorOperationNotImplementedError("tenantControls.disablePaperclip");
      }
    },
    jobs: {
      async inspect(_input: { tenantId: string; jobId: string }): Promise<Record<string, unknown>> {
        throw new OperatorOperationNotImplementedError("jobs.inspect");
      },
      async retry(_input: { tenantId: string; jobId: string }): Promise<void> {
        throw new OperatorOperationNotImplementedError("jobs.retry");
      },
      async cancel(_input: { tenantId: string; jobId: string }): Promise<void> {
        throw new OperatorOperationNotImplementedError("jobs.cancel");
      },
      async deadLetters(_input: { tenantId: string }): Promise<Record<string, unknown>[]> {
        throw new OperatorOperationNotImplementedError("jobs.deadLetters");
      }
    },
    runs: {
      async cancelBySecretRef(_input: { tenantId: string; secretRef: string }): Promise<{ cancelled: number; runIds: string[] }> {
        throw new OperatorOperationNotImplementedError("runs.cancelBySecretRef");
      }
    },
    secrets: {
      async rotate(_input: { tenantId: string; actorUserId: string; secretRef: string; nextSecretValues: Record<string, string> }): Promise<unknown> {
        throw new OperatorOperationNotImplementedError("secrets.rotate");
      },
      async revoke(_input: { tenantId: string; actorUserId: string; secretRef: string }): Promise<unknown> {
        throw new OperatorOperationNotImplementedError("secrets.revoke");
      }
    },
    audit
  };
}
