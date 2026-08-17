// Mirror-host redirects live in an inline <head> script in index.html so
// they run before the analytics snippet records a page_view.

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
  runBootStep("navigation setup", initializeNavigation);
  runBootStep("reveal setup", initializeReveals);
}

document.addEventListener("DOMContentLoaded", boot);
