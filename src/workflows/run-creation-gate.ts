export type RunReservationInput = {
  tenantId: string;
  workflowId: string;
  idempotencyKey: string;
  entitlementAllowed: boolean;
  tenantPaused: boolean;
  credentialRevoked: boolean;
};

export type RunReservationDecision =
  | { reserved: true }
  | { reserved: false; reason: "duplicate" | "entitlement_denied" | "tenant_paused" | "credential_revoked" };

export function createRunCreationGate() {
  const reservations = new Set<string>();

  return {
    async reserve(input: RunReservationInput): Promise<RunReservationDecision> {
      if (!input.entitlementAllowed) return { reserved: false, reason: "entitlement_denied" };
      if (input.tenantPaused) return { reserved: false, reason: "tenant_paused" };
      if (input.credentialRevoked) return { reserved: false, reason: "credential_revoked" };

      const reservationKey = `${input.tenantId}:${input.workflowId}:${input.idempotencyKey}`;
      if (reservations.has(reservationKey)) {
        return { reserved: false, reason: "duplicate" };
      }

      reservations.add(reservationKey);
      return { reserved: true };
    }
  };
}
