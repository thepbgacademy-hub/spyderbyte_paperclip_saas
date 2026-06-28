export type RemoteExportWriterConfig = {
  exportRoot: string | null;
  absolute: boolean;
  exists: boolean;
  directory: boolean;
  writable: boolean;
};

export type NormalizedRemoteExportWriterConfig = RemoteExportWriterConfig & {
  configured: boolean;
};

export type DeliveryWriterPrecondition = {
  ok: false;
  phase: "delivery_writer_not_configured";
  notes: string[];
  deliveryWriterConfig: NormalizedRemoteExportWriterConfig;
};

export function normalizeRemoteExportWriterConfig(
  input: Partial<RemoteExportWriterConfig> | null | undefined
): NormalizedRemoteExportWriterConfig;

export function buildRequiredDeliveryWriterPrecondition(input: {
  deliveryMode?: string | null | undefined;
  writerConfig?: Partial<RemoteExportWriterConfig> | null | undefined;
}): DeliveryWriterPrecondition | null;
