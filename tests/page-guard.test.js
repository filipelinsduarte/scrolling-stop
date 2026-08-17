import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
  await import("../src/page-guard.js");
});

function createSettings(overrides = {}) {
  return {
    enabled: true,
    blockedDomains: ["linkedin.com", "x.com"],
    pausedUntil: 0,
    pausedDomain: null,
    ...overrides,
  };
}

describe("page guard", () => {
  it("allows a site-specific break only until its exact expiry", () => {
    const settings = createSettings({
      pausedUntil: 121_000,
      pausedDomain: "linkedin.com",
    });

    expect(
      globalThis.ScrollStopPageGuard.getPageGuardDecision(
        "www.linkedin.com",
        settings,
        1_000,
      ),
    ).toEqual({ blockedDomain: null, reevaluateAt: 121_000 });

    expect(
      globalThis.ScrollStopPageGuard.getPageGuardDecision(
        "www.linkedin.com",
        settings,
        121_000,
      ),
    ).toEqual({ blockedDomain: "linkedin.com", reevaluateAt: 0 });
  });

  it("keeps other blocked sites protected during a LinkedIn break", () => {
    const decision = globalThis.ScrollStopPageGuard.getPageGuardDecision(
      "x.com",
      createSettings({
        pausedUntil: 121_000,
        pausedDomain: "linkedin.com",
      }),
      1_000,
    );

    expect(decision).toEqual({ blockedDomain: "x.com", reevaluateAt: 0 });
  });

  it("waits out a global pause before blocking the open page", () => {
    const decision = globalThis.ScrollStopPageGuard.getPageGuardDecision(
      "linkedin.com",
      createSettings({ pausedUntil: 121_000, pausedDomain: null }),
      1_000,
    );

    expect(decision).toEqual({ blockedDomain: null, reevaluateAt: 121_000 });
  });

  it("does nothing while the extension is disabled", () => {
    const decision = globalThis.ScrollStopPageGuard.getPageGuardDecision(
      "linkedin.com",
      createSettings({ enabled: false }),
      1_000,
    );

    expect(decision).toEqual({ blockedDomain: null, reevaluateAt: 0 });
  });

  it("treats twitter.com subdomains as the blocked x.com service", () => {
    const decision = globalThis.ScrollStopPageGuard.getPageGuardDecision(
      "mobile.twitter.com",
      createSettings(),
      1_000,
    );

    expect(decision).toEqual({ blockedDomain: "x.com", reevaluateAt: 0 });
  });

  it("honours per-domain break windows from the pause map", () => {
    const settings = createSettings({
      pausedDomains: { "linkedin.com": 121_000, "x.com": 90_000 },
    });

    expect(
      globalThis.ScrollStopPageGuard.getPageGuardDecision(
        "www.linkedin.com",
        settings,
        1_000,
      ),
    ).toEqual({ blockedDomain: null, reevaluateAt: 121_000 });

    expect(
      globalThis.ScrollStopPageGuard.getPageGuardDecision(
        "x.com",
        settings,
        90_000,
      ),
    ).toEqual({ blockedDomain: "x.com", reevaluateAt: 0 });
  });

  it("keeps a second site's break running while another break is active", () => {
    const settings = createSettings({
      pausedDomains: { "linkedin.com": 121_000, "x.com": 90_000 },
    });

    expect(
      globalThis.ScrollStopPageGuard.getPageGuardDecision(
        "x.com",
        settings,
        1_000,
      ),
    ).toEqual({ blockedDomain: null, reevaluateAt: 90_000 });
  });
});
