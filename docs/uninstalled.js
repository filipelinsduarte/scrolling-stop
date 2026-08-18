// Records the uninstall, then an optional one-click reason. Both go to the
// site's own analytics tag, so no secret and no custom endpoint is involved.
(function () {
  "use strict";

  var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var MAX_VERSION_LENGTH = 20;

  function track(name, params) {
    if (typeof window.gtag !== "function") {
      return;
    }
    window.gtag("event", name, params);
  }

  // Chrome appends these when it opens this page on removal. Both are
  // validated rather than trusted, because anyone can visit this URL directly
  // with whatever query string they like.
  function readInstallContext() {
    var params = new URLSearchParams(window.location.search);
    var clientId = params.get("cid") || "";
    var version = params.get("v") || "";

    return {
      clientId: UUID_PATTERN.test(clientId) ? clientId : "",
      version: version.slice(0, MAX_VERSION_LENGTH),
    };
  }

  function boot() {
    var context = readInstallContext();

    track("extension_uninstall", {
      extension_version: context.version,
      // Present only when the user had usage stats switched on. An opted-out
      // user never reaches this page, since no uninstall URL is registered.
      anonymous_id: context.clientId,
    });

    var reasons = document.getElementById("exit-reasons");
    var thanks = document.getElementById("exit-thanks");
    if (!reasons || !thanks) {
      return;
    }

    reasons.addEventListener("click", function (event) {
      var button = event.target.closest(".exit-reason");
      if (!button || reasons.dataset.answered === "true") {
        return;
      }

      reasons.dataset.answered = "true";
      button.classList.add("is-chosen");
      Array.prototype.forEach.call(
        reasons.querySelectorAll(".exit-reason"),
        function (item) { item.disabled = true; },
      );

      track("extension_uninstall_reason", {
        exit_reason: button.dataset.reason,
        extension_version: context.version,
      });

      thanks.hidden = false;
    });
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  } catch (error) {
    console.error("[Scrolling Stop] Exit page failed", error);
  }
})();
