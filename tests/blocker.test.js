import { describe, expect, it } from "vitest";

import {
  buildBlockingRules,
  getActiveBlockedDomains,
  getBlockedDomainForUrl,
  getEffectiveSettings,
  getNextPauseExpiry,
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

  it("treats Twitter and X as the same blocked service", () => {
    expect(normalizeDomain("twitter.com")).toBe("x.com");
    expect(normalizeDomain("www.twitter.com")).toBe("x.com");
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
    blockedDomains: ["linkedin.com", "x.com"],
    focusGoals: [],
    pausedUntil: 0,
    pausedDomain: null,
    pausedDomains: {},
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
      pausedDomains: {},
      analytics: {
        totalBlockedAttempts: 0,
        focusReturns: 0,
        estimatedMinutesSaved: 0,
        blockedByDomain: {},
      },
    });
  });

  it("migrates a legacy single-slot site pause into the pause map", () => {
    const settings = getEffectiveSettings(
      { pausedUntil: 121_000, pausedDomain: "linkedin.com" },
      defaults,
      1_000,
    );

    expect(settings.pausedUntil).toBe(0);
    expect(settings.pausedDomain).toBeNull();
    expect(settings.pausedDomains).toEqual({ "linkedin.com": 121_000 });
  });

  it("keeps a legacy global pause global after migration", () => {
    const settings = getEffectiveSettings(
      { pausedUntil: 121_000, pausedDomain: null },
      defaults,
      1_000,
    );

    expect(settings.pausedUntil).toBe(121_000);
    expect(settings.pausedDomains).toEqual({});
  });

  it("prunes expired entries from the pause map and keeps active ones", () => {
    const settings = getEffectiveSettings(
      {
        pausedDomains: {
          "linkedin.com": 999,
          "x.com": 121_000,
          "not a domain": 121_000,
        },
      },
      defaults,
      1_000,
    );

    expect(settings.pausedDomains).toEqual({ "x.com": 121_000 });
  });
});

describe("getActiveBlockedDomains", () => {
  it("lets two site breaks run at the same time without cancelling each other", () => {
    const settings = {
      enabled: true,
      blockedDomains: ["linkedin.com", "x.com", "reddit.com"],
      pausedUntil: 0,
      pausedDomain: null,
      pausedDomains: { "linkedin.com": 121_000, "x.com": 90_000 },
    };

    expect(getActiveBlockedDomains(settings, 1_000)).toEqual(["reddit.com"]);
    expect(getActiveBlockedDomains(settings, 90_000)).toEqual([
      "x.com",
      "reddit.com",
    ]);
    expect(getActiveBlockedDomains(settings, 121_000)).toEqual([
      "linkedin.com",
      "x.com",
      "reddit.com",
    ]);
  });
});

describe("getNextPauseExpiry", () => {
  it("returns the earliest expiry across site and global pauses", () => {
    expect(
      getNextPauseExpiry(
        {
          pausedUntil: 200_000,
          pausedDomain: null,
          pausedDomains: { "linkedin.com": 121_000, "x.com": 90_000 },
        },
        1_000,
      ),
    ).toBe(90_000);
  });

  it("returns zero when no pause is active", () => {
    expect(
      getNextPauseExpiry(
        { pausedUntil: 0, pausedDomain: null, pausedDomains: {} },
        1_000,
      ),
    ).toBe(0);
  });
});

describe("buildBlockingRules", () => {
  it("builds separator-terminated main-frame redirects with alias coverage", () => {
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
          urlFilter: "||linkedin.com^",
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
          urlFilter: "||x.com^",
          resourceTypes: ["main_frame"],
        },
      },
      {
        id: 3,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { extensionPath: "/blocked.html?domain=x.com" },
        },
        condition: {
          urlFilter: "||twitter.com^",
          resourceTypes: ["main_frame"],
        },
      },
    ]);
  });

  it("terminates every filter so a prefix-sharing hostname is not over-blocked", () => {
    const rules = buildBlockingRules({
      enabled: true,
      blockedDomains: ["example.co"],
      pausedUntil: 0,
      pausedDomain: null,
    });

    // "||example.co^" matches example.co and sub.example.co/path but not
    // example.com - without the "^" DNR would match any prefix continuation.
    expect(rules.map((rule) => rule.condition.urlFilter)).toEqual([
      "||example.co^",
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
      "||x.com^",
      "||twitter.com^",
      "||reddit.com^",
    ]);
    expect(rules.map((rule) => rule.action.redirect.extensionPath)).toEqual([
      "/blocked.html?domain=x.com",
      "/blocked.html?domain=x.com",
      "/blocked.html?domain=reddit.com",
    ]);
  });

  it("covers both x.com and twitter.com when the user entered twitter.com", () => {
    const rules = buildBlockingRules({
      enabled: true,
      blockedDomains: ["twitter.com"],
      pausedUntil: 0,
      pausedDomain: null,
    });

    expect(rules.map((rule) => rule.condition.urlFilter)).toEqual([
      "||x.com^",
      "||twitter.com^",
    ]);
    expect(rules[0].action.redirect.extensionPath).toBe(
      "/blocked.html?domain=x.com",
    );
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

  it("identifies twitter.com and its subdomains as blocked X pages", () => {
    expect(
      getBlockedDomainForUrl("https://twitter.com/home", settings, 1_000),
    ).toBe("x.com");
    expect(
      getBlockedDomainForUrl("https://mobile.twitter.com/explore", settings, 1_000),
    ).toBe("x.com");
  });

  it("respects per-domain break windows from the pause map", () => {
    const pausedSettings = {
      ...settings,
      pausedDomains: { "linkedin.com": 2_000 },
    };

    expect(
      getBlockedDomainForUrl("https://linkedin.com/feed", pausedSettings, 1_000),
    ).toBeNull();
    expect(
      getBlockedDomainForUrl("https://x.com/home", pausedSettings, 1_000),
    ).toBe("x.com");
    expect(
      getBlockedDomainForUrl("https://linkedin.com/feed", pausedSettings, 2_000),
    ).toBe("linkedin.com");
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
