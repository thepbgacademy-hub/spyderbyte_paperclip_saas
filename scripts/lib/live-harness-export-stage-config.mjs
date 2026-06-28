export function normalizeRemoteExportWriterConfig(input) {
  const exportRoot = normalizeValue(input?.exportRoot);
  return {
    exportRoot,
    configured: Boolean(exportRoot),
    absolute: Boolean(input?.absolute),
    exists: Boolean(input?.exists),
    directory: input?.directory === false ? false : Boolean(input?.directory),
    writable: Boolean(input?.writable)
  };
}

export function buildRequiredDeliveryWriterPrecondition(input) {
  const deliveryMode = normalizeValue(input?.deliveryMode) ?? "auto";
  const writerConfig = normalizeRemoteExportWriterConfig(input?.writerConfig);
  if (deliveryMode !== "required") {
    return null;
  }
  if (
    writerConfig.configured &&
    writerConfig.absolute &&
    (!writerConfig.exists || (writerConfig.directory && writerConfig.writable))
  ) {
    return null;
  }

  const notes = [
    "Strict export delivery proof requires the bounded Obsidian writer seam to be configured on the isolated Wealth Factory lane before governance-history delivery can reach delivered state."
  ];

  if (!writerConfig.configured) {
    notes.push("WF_OBSIDIAN_EXPORT_ROOT is not configured in the isolated stage runtime environment.");
  } else if (!writerConfig.absolute) {
    notes.push("WF_OBSIDIAN_EXPORT_ROOT is configured but did not resolve to an absolute runtime path.");
  } else if (writerConfig.exists && !writerConfig.directory) {
    notes.push("WF_OBSIDIAN_EXPORT_ROOT is configured but currently resolves to a file instead of a writable directory path.");
  } else if (!writerConfig.writable) {
    notes.push("WF_OBSIDIAN_EXPORT_ROOT is configured but is not writable from the runtime container.");
  }

  return {
    ok: false,
    phase: "delivery_writer_not_configured",
    notes,
    deliveryWriterConfig: writerConfig
  };
}

function normalizeValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
