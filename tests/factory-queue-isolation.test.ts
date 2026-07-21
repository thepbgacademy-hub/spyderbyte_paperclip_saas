import {
  FACTORY_CREDENTIAL_VALIDATION_QUEUE_NAME,
  FACTORY_QUEUE_NAMESPACE_PREFIX,
  FACTORY_RUNTIME_QUEUE_NAME,
  LEGACY_WORKFLOW_QUEUE_NAMES,
  assertFactoryQueueNameIsolated,
  assertFactoryQueuePrefixIsolated,
  createFactoryCredentialValidationQueueConfig
} from "../src/factory/queues/factory-queue-names.js";
import { describe, expect, it } from "vitest";

describe("factory queue isolation", () => {
  it("uses blueprint-owned queue names and prefixes by default", () => {
    const config = createFactoryCredentialValidationQueueConfig();

    expect(config).toEqual({
      queueName: FACTORY_CREDENTIAL_VALIDATION_QUEUE_NAME,
      prefix: FACTORY_QUEUE_NAMESPACE_PREFIX
    });
    expect(config.queueName).toBe("wealth-factory-validations-v1");
    expect(config.prefix).toBe("wealth-factory-blueprint-v1");
    expect(FACTORY_RUNTIME_QUEUE_NAME).toBe("wealth-factory-runs-v1");
    expect(LEGACY_WORKFLOW_QUEUE_NAMES).not.toContain(config.queueName);
    expect(LEGACY_WORKFLOW_QUEUE_NAMES).not.toContain(FACTORY_RUNTIME_QUEUE_NAME);
  });

  it.each([
    "wfpc-workflow-runs",
    "wfpc-workflow-runs-stage",
    "wfpc-validations-v1",
    "paperclip-workflow-runs",
    "paperclip-validations"
  ])("rejects legacy or Paperclip-shaped queue names: %s", (queueName) => {
    expect(() => assertFactoryQueueNameIsolated(queueName)).toThrow(
      "Factory queue name must not reuse a legacy queue namespace"
    );
  });

  it.each(["", "   "])("rejects blank queue names: %s", (queueName) => {
    expect(() => assertFactoryQueueNameIsolated(queueName)).toThrow("Factory queue name is required");
  });

  it("normalizes explicitly provided blueprint queue names and prefixes", () => {
    expect(
      createFactoryCredentialValidationQueueConfig({
        queueName: " wealth-factory-validations-stage ",
        prefix: " wealth-factory-stage "
      })
    ).toEqual({
      queueName: "wealth-factory-validations-stage",
      prefix: "wealth-factory-stage"
    });
  });

  it.each(["wfpc", "wfpc-stage", "paperclip", "paperclip-stage"])(
    "rejects legacy or Paperclip-shaped Redis key prefixes: %s",
    (prefix) => {
      expect(() => assertFactoryQueuePrefixIsolated(prefix)).toThrow(
        "Factory queue prefix must not reuse a legacy queue namespace"
      );
    }
  );
});
