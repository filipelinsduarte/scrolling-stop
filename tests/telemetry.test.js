import { describe, expect, it } from "vitest";

import {
  DEFAULT_TELEMETRY,
  UNINSTALL_URL,
  buildEventPayload,
  buildUninstallUrl,
  ensureClientId,
  isAllowedEventName,
  normalizeTelemetry,
  shouldReportInstall,
} from "../src/telemetry.js";

describe("telemetry settings", () => {
  it("defaults to enabled with no client id and no reported version", () => {
    expect(normalizeTelemetry(undefined)).toEqual({
      enabled: true,
      clientId: "",
      reportedVersion: "",
    });
    expect(DEFAULT_TELEMETRY.enabled).toBe(true);
  });

  it("keeps an explicit opt-out and never silently re-enables it", () => {
    expect(normalizeTelemetry({ enabled: false }).enabled).toBe(false);
    expect(normalizeTelemetry({ enabled: false, clientId: "x" }).enabled).toBe(false);
    // A corrupt value falls back to the default rather than to false, so a
    // storage glitch cannot quietly turn reporting on for an opted-out user
    // only when the value is genuinely absent.
    expect(normalizeTelemetry({ enabled: "no" }).enabled).toBe(true);
  });

  it("discards a client id that is not a well formed uuid", () => {
    const valid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(normalizeTelemetry({ clientId: valid }).clientId).toBe(valid);
    expect(normalizeTelemetry({ clientId: "abc" }).clientId).toBe("");
    expect(normalizeTelemetry({ clientId: 12345 }).clientId).toBe("");
    expect(normalizeTelemetry({ clientId: "<script>" }).clientId).toBe("");
  });

  it("normalizes a corrupt reported version to an empty string", () => {
    expect(normalizeTelemetry({ reportedVersion: "1.5.6" }).reportedVersion).toBe("1.5.6");
    expect(normalizeTelemetry({ reportedVersion: 156 }).reportedVersion).toBe("");
  });
});

describe("client id creation", () => {
  it("creates an id once and reuses it on every later call", () => {
    const generated = ["3f2504e0-4f89-41d3-9a0c-0305e82c3301"];
    const generate = () => generated.shift();

    const first = ensureClientId({}, generate);
    const second = ensureClientId(first, () => "11111111-1111-4111-8111-111111111111");

    expect(first.clientId).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    expect(second.clientId).toBe(first.clientId);
  });

  it("does not create an id for an opted-out user", () => {
    const optedOut = ensureClientId(
      { enabled: false },
      () => "11111111-1111-4111-8111-111111111111",
    );
    expect(optedOut.clientId).toBe("");
  });
});

describe("install reporting decision", () => {
  const clean = { enabled: true, clientId: "", reportedVersion: "" };

  it("reports the first install", () => {
    expect(shouldReportInstall(clean, "1.5.6")).toBe(true);
  });

  it("does not report the same version twice", () => {
    expect(shouldReportInstall({ ...clean, reportedVersion: "1.5.6" }, "1.5.6")).toBe(false);
  });

  it("reports again after an update to a new version", () => {
    expect(shouldReportInstall({ ...clean, reportedVersion: "1.5.5" }, "1.5.6")).toBe(true);
  });

  it("never reports when the user opted out", () => {
    expect(shouldReportInstall({ ...clean, enabled: false }, "1.5.6")).toBe(false);
  });

  it("never reports without a version", () => {
    expect(shouldReportInstall(clean, "")).toBe(false);
    expect(shouldReportInstall(clean, undefined)).toBe(false);
  });
});

describe("event payload", () => {
  it("sends only the event name, client id, version and reason", () => {
    const payload = buildEventPayload({
      clientId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      version: "1.5.6",
      reason: "install",
    });

    expect(payload).toEqual({
      name: "extension_install",
      clientId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      version: "1.5.6",
      reason: "install",
    });
    // The payload carries no browsing data of any kind. If this list ever
    // grows, the privacy policy and the store listing have to change too.
    expect(Object.keys(payload).sort()).toEqual(["clientId", "name", "reason", "version"]);
  });

  it("labels a chrome update as an update rather than a fresh install", () => {
    expect(buildEventPayload({
      clientId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      version: "1.5.6",
      reason: "update",
    }).reason).toBe("update");
  });

  it("falls back to install for an unrecognised reason", () => {
    expect(buildEventPayload({
      clientId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      version: "1.5.6",
      reason: "chrome_update",
    }).reason).toBe("install");
  });

  it("returns null without a client id, so nothing is ever sent unidentified", () => {
    expect(buildEventPayload({ clientId: "", version: "1.5.6", reason: "install" })).toBe(null);
    expect(buildEventPayload({ clientId: "nope", version: "1.5.6", reason: "install" })).toBe(null);
  });
});

describe("event name allowlist", () => {
  it("accepts only the two events this extension sends", () => {
    expect(isAllowedEventName("extension_install")).toBe(true);
    expect(isAllowedEventName("extension_uninstall")).toBe(true);
    expect(isAllowedEventName("purchase")).toBe(false);
    expect(isAllowedEventName("")).toBe(false);
    expect(isAllowedEventName(null)).toBe(false);
  });
});

describe("uninstall url", () => {
  it("carries the client id and version so the exit page can match the install", () => {
    const url = new URL(buildUninstallUrl({
      enabled: true,
      clientId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      reportedVersion: "",
    }, "1.5.6"));

    expect(url.origin + url.pathname).toBe(UNINSTALL_URL);
    expect(url.searchParams.get("cid")).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    expect(url.searchParams.get("v")).toBe("1.5.6");
  });

  it("returns null for an opted-out user, so no exit tab is opened at all", () => {
    expect(buildUninstallUrl({ enabled: false, clientId: "", reportedVersion: "" }, "1.5.6")).toBe(null);
  });

  it("returns null when there is no client id yet", () => {
    expect(buildUninstallUrl({ enabled: true, clientId: "", reportedVersion: "" }, "1.5.6")).toBe(null);
  });
});
