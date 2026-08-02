import { describe, expect, it } from "vitest";

import {
  buildBlockingRules,
  getBlockedDomainForUrl,
  getEffectiveSettings,
  normalizeDomain,
  normalizeDomainList,
  normalizeFocusGoals,
} from "../src/blocker.js";

describe("normalizeDomain", () => {
  it("reduces a full URL to a lowercase registrable host", () => {
    expect(normalizeDomain("HTTPS://WWW.LinkedIn.com/feed/?trk=home")).toBe(
      "linkedin.com",
    );
  });

  it("keeps intentional subdomains", () => {
    expect(normalizeDomain("news.ycombinator.com/item?id=1")).toBe(
      "news.ycombinator.com",
    );
  });

  it("accepts the X brand name as x.com", () => {
    expect(normalizeDomain("x")).toBe("x.com");
  });

  it("rejects unsupported browser and local URLs", () => {
    expect(normalizeDomain("chrome://extensions")).toBeNull();
    expect(normalizeDomain("localhost:3000")).toBeNull();
    expect(normalizeDomain("not a website")).toBeNull();
  });
});

describe("normalizeDomainList", () => {
  it("deduplicates domains without changing their first-seen order", () => {
    expect(
      normalizeDomainList([
        "x.com",
        "https://www.x.com/home",
        "linkedin.com",
        "X.COM",
      ]),
    ).toEqual(["x.com", "linkedin.com"]);
  });
});

describe("normalizeFocusGoals", () => {
  it("turns newline input into clean, deduplicated goals", () => {
    expect(
      normalizeFocusGoals(
        " Finish the client proposal  \nReview outreach pipeline\nfinish the CLIENT proposal ",
      ),
    ).toEqual(["Finish the client proposal", "Review outreach pipeline"]);
  });

  it("keeps more than five goals while limiting each goal to 120 characters", () => {
    const longGoal = "a".repeat(140);
    expect(
      normalizeFocusGoals([longGoal, "Two", "Three", "Four", "Five", "Six"]),
    ).toEqual(["a".repeat(120), "Two", "Three", "Four", "Five", "Six"]);
  });

  it("drops empty and non-string values", () => {
    expect(normalizeFocusGoals(["  ", null, 42, "Write the brief"])).toEqual([
      "Write the brief",
    ]);
  });
});

describe("getEffectiveSettings", () => {
  const defaults = {
    enabled: true,
    blockedDomains: ["linkedin.com", "x.com", "twitter.com"],
    focusGoals: [],
    pausedUntil: 0,
    pausedDomain: null,
    analytics: {
      totalBlockedAttempts: 0,
      focusReturns: 0,
      estimatedMinutesSaved: 0,
      blockedByDomain: {},
    },
  };

  it("uses safe defaults when storage is empty", () => {
    expect(getEffectiveSettings({}, defaults, 1_000)).toEqual(defaults);
  });

  it("expires an old pause without disabling blocking", () => {
    expect(
      getEffectiveSettings(
        { enabled: true, blockedDomains: ["x.com"], pausedUntil: 999 },
        defaults,
        1_000,
      ),
    ).toEqual({
      enabled: true,
      blockedDomains: ["x.com"],
      focusGoals: [],
      pausedUntil: 0,
      pausedDomain: null,
      analytics: {
        totalBlockedAttempts: 0,
        focusReturns: 0,
        estimatedMinutesSaved: 0,
        blockedByDomain: {},
      },
    });
  });
});

describe("buildBlockingRules", () => {
  it("builds exact domain-anchored main-frame redirects", () => {
    const rules = buildBlockingRules({
      enabled: true,
      blockedDomains: ["linkedin.com", "x.com"],
      pausedUntil: 0,
      pausedDomain: null,
    });

    expect(rules).toEqual([
      {
        id: 1,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { extensionPath: "/blocked.html?domain=linkedin.com" },
        },
        condition: {
          urlFilter: "||linkedin.com",
          resourceTypes: ["main_frame"],
        },
      },
      {
        id: 2,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { extensionPath: "/blocked.html?domain=x.com" },
        },
        condition: {
          urlFilter: "||x.com",
          resourceTypes: ["main_frame"],
        },
      },
    ]);
  });

  it("does not build rules while blocking is disabled or paused", () => {
    expect(
      buildBlockingRules({
        enabled: false,
        blockedDomains: ["x.com"],
        pausedUntil: 0,
        pausedDomain: null,
      }),
    ).toEqual([]);

    expect(
      buildBlockingRules({
        enabled: true,
        blockedDomains: ["x.com"],
        pausedUntil: Date.now() + 60_000,
        pausedDomain: null,
      }),
    ).toEqual([]);
  });

  it("keeps X blocked during a site-specific LinkedIn break", () => {
    const rules = buildBlockingRules({
      enabled: true,
      blockedDomains: ["linkedin.com", "x.com", "reddit.com"],
      pausedUntil: Date.now() + 60_000,
      pausedDomain: "linkedin.com",
    });

    expect(rules.map((rule) => rule.condition.urlFilter)).toEqual([
      "||x.com",
      "||reddit.com",
    ]);
    expect(rules.map((rule) => rule.action.redirect.extensionPath)).toEqual([
      "/blocked.html?domain=x.com",
      "/blocked.html?domain=reddit.com",
    ]);
  });
});

describe("getBlockedDomainForUrl", () => {
  const settings = {
    enabled: true,
    blockedDomains: ["linkedin.com", "x.com", "reddit.com"],
    pausedUntil: 0,
    pausedDomain: null,
  };

  it("identifies already-open X pages and subdomains", () => {
    expect(getBlockedDomainForUrl("https://x.com/home", settings, 1_000)).toBe(
      "x.com",
    );
    expect(
      getBlockedDomainForUrl("https://mobile.x.com/explore", settings, 1_000),
    ).toBe("x.com");
    expect(
      getBlockedDomainForUrl("https://example.com/redirect?next=x.com", settings, 1_000),
    ).toBeNull();
  });

  it("respects global and site-specific pauses", () => {
    expect(
      getBlockedDomainForUrl("https://x.com/home", {
        ...settings,
        pausedUntil: 2_000,
        pausedDomain: null,
      }, 1_000),
    ).toBeNull();

    const linkedInPause = {
      ...settings,
      pausedUntil: 2_000,
      pausedDomain: "linkedin.com",
    };
    expect(
      getBlockedDomainForUrl("https://linkedin.com/feed", linkedInPause, 1_000),
    ).toBeNull();
    expect(
      getBlockedDomainForUrl("https://x.com/home", linkedInPause, 1_000),
    ).toBe("x.com");
  });
});
