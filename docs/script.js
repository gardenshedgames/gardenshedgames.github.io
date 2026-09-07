const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const revealElements = document.querySelectorAll(".reveal");

document.documentElement.classList.add("has-scroll-animations");

const showAll = () => {
  revealElements.forEach((element) => element.classList.add("is-visible"));
};

if (reducedMotion.matches || !("IntersectionObserver" in window)) {
  showAll();
} else {
  const observer = new IntersectionObserver(
    (entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealElements.forEach((element) => observer.observe(element));
}
