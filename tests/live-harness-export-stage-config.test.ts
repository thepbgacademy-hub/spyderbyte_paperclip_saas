import { describe, expect, it } from "vitest";

import {
  buildRequiredDeliveryWriterPrecondition,
  normalizeRemoteExportWriterConfig
} from "../scripts/lib/live-harness-export-stage-config.mjs";

describe("live harness export stage config helper", () => {
  it("normalizes an absent remote writer root as not configured", () => {
    expect(normalizeRemoteExportWriterConfig(null)).toEqual({
      exportRoot: null,
      configured: false,
      absolute: false,
      exists: false,
      directory: false,
      writable: false
    });
  });

  it("does not block auto delivery mode when the remote writer is absent", () => {
    expect(buildRequiredDeliveryWriterPrecondition({
      deliveryMode: "auto",
      writerConfig: null
    })).toBeNull();
  });

  it("returns a structured precondition when strict delivery mode has no configured writer root", () => {
    expect(buildRequiredDeliveryWriterPrecondition({
      deliveryMode: "required",
      writerConfig: null
    })).toMatchObject({
      ok: false,
      phase: "delivery_writer_not_configured",
      deliveryWriterConfig: {
        exportRoot: null,
        configured: false
      }
    });
  });

  it("returns a structured precondition when the writer root exists but is not writable", () => {
    expect(buildRequiredDeliveryWriterPrecondition({
      deliveryMode: "required",
      writerConfig: {
        exportRoot: "/srv/wealth-factory/obsidian",
        absolute: true,
        exists: true,
        directory: true,
        writable: false
      }
    })).toMatchObject({
      ok: false,
      phase: "delivery_writer_not_configured",
      deliveryWriterConfig: {
        exportRoot: "/srv/wealth-factory/obsidian",
        configured: true,
        absolute: true,
        exists: true,
        directory: true,
        writable: false
      }
    });
  });

  it("allows strict delivery mode when the writer root is configured but will be created on first write", () => {
    expect(buildRequiredDeliveryWriterPrecondition({
      deliveryMode: "required",
      writerConfig: {
        exportRoot: "/srv/wealth-factory/obsidian",
        absolute: true,
        exists: false,
        directory: false,
        writable: false
      }
    })).toBeNull();
  });

  it("returns a structured precondition when the writer root resolves to a file instead of a directory", () => {
    expect(buildRequiredDeliveryWriterPrecondition({
      deliveryMode: "required",
      writerConfig: {
        exportRoot: "/srv/wealth-factory/obsidian",
        absolute: true,
        exists: true,
        directory: false,
        writable: true
      }
    })).toMatchObject({
      ok: false,
      phase: "delivery_writer_not_configured",
      deliveryWriterConfig: {
        exportRoot: "/srv/wealth-factory/obsidian",
        configured: true,
        absolute: true,
        exists: true,
        directory: false,
        writable: true
      }
    });
  });

  it("allows strict delivery mode once the writer root is configured and writable", () => {
    expect(buildRequiredDeliveryWriterPrecondition({
      deliveryMode: "required",
      writerConfig: {
        exportRoot: "/srv/wealth-factory/obsidian",
        absolute: true,
        exists: true,
        directory: true,
        writable: true
      }
    })).toBeNull();
  });
});
