function redirectGitHubPagesHost() {
  if (window.location.hostname !== "filipelinsduarte.github.io") {
    return true;
  }

  window.location.replace("https://github.com/filipelinsduarte/scrolling-stop");
  return false;
}

function runBootStep(label, task) {
  try {
    task();
  } catch (error) {
    console.error(`[Scrolling Stop] ${label} failed`, error);
  }
}

function initializeNavigation() {
  const navigation = document.querySelector("[data-site-nav]");
  if (!navigation) {
    return;
  }

  const updateNavigation = () => {
    navigation.classList.toggle("is-scrolled", window.scrollY > 8);
  };

  updateNavigation();
  window.addEventListener("scroll", updateNavigation, { passive: true });
}

function initializeReveals() {
  const revealElements = document.querySelectorAll(".reveal:not(.is-visible)");
  if (revealElements.length === 0) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {
    rootMargin: "0px 0px -8% 0px",
    threshold: 0.12,
  });

  revealElements.forEach((element) => observer.observe(element));
}

function boot() {
  if (!redirectGitHubPagesHost()) {
    return;
  }
  runBootStep("navigation setup", initializeNavigation);
  runBootStep("reveal setup", initializeReveals);
}

document.addEventListener("DOMContentLoaded", boot);
