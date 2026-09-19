const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const revealElements = document.querySelectorAll(".reveal");
const logoReplay = document.querySelector(".logo-replay");
const siteHeader = document.querySelector(".site-header");
const navigationToggle = document.querySelector(".nav-toggle");
const primaryNavigation = document.querySelector("#primary-navigation");
const staticLayers = document.querySelectorAll(".hero-walls, .hero-roof, .hero-ground");
const shovel = document.querySelector(".hero-shovel");
const clearance = document.querySelector(".hero-shovel-clearance");
const particles = document.querySelectorAll(".hero-particle");

if (logoReplay && staticLayers.length === 3 && shovel && clearance && particles.length) {
  const animations = [];
  let animationRun = 0;
  const logoWidth = 2048;
  const logoHeight = 2124;
  const radius = 20.625;
  const clearanceRadius = radius + 25;
  const launches = [
    { x: 1490, velocityX: -440, upwardSpeed: 1780, extraGroundOverlap: 20 }, { x: 1490, velocityX: -300, upwardSpeed: 1930, extraGroundOverlap: 20 },
    { x: 1490, velocityX: -200, upwardSpeed: 1650, extraGroundOverlap: 20 }, { x: 1870, velocityX: 102, upwardSpeed: 1850, extraGroundOverlap: 0 },
    { x: 1870, velocityX: 122, upwardSpeed: 1620, extraGroundOverlap: 0 }
  ];
  const fadeDelay = 250;
  const fadeDuration = 800;
  const dropDelay = fadeDelay + fadeDuration;
  const dropDuration = 1400;
  const impactTime = dropDelay + dropDuration;
  const groundOverlap = 22.25;
  const cubic = (t, start, first, second, end) => {
    const inverse = 1 - t;
    return inverse ** 3 * start + 3 * inverse ** 2 * t * first + 3 * inverse * t ** 2 * second + t ** 3 * end;
  };
  const groundY = (x) => {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      if (cubic(middle, 39, 448, 1536, 2014) < x) low = middle;
      else high = middle;
    }
    return cubic((low + high) / 2, 2066, 1918, 1918, 2065);
  };
  const play = (element, frames, options) => {
    const animation = element.animate(frames, options);
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  };
  const prepare = () => {
    const bounds = logoReplay.getBoundingClientRect();
    const scaleX = bounds.width / logoWidth;
    const scaleY = bounds.height / logoHeight;
    const dropDistance = bounds.height + Math.max(0, bounds.top) + 100 * scaleY;
    const shovelFrames = [{ transform: `translateY(-${dropDistance}px) rotate(75deg)` }, { transform: "translateY(0) rotate(0deg)" }];
    staticLayers.forEach((layer) => play(layer, [{ opacity: 0 }, { opacity: 1 }], { delay: fadeDelay, duration: fadeDuration, easing: "ease-out", fill: "backwards" }));
    [clearance, shovel].forEach((layer) => play(layer, shovelFrames, { delay: dropDelay, duration: dropDuration, easing: "cubic-bezier(.55, 0, 1, .45)", fill: "backwards" }));
    particles.forEach((particle, index) => {
      const { x, velocityX, upwardSpeed, extraGroundOverlap } = launches[index];
      const landingOverlap = groundOverlap + extraGroundOverlap;
      const originY = groundY(x) - radius;
      particle.style.left = `${((x - clearanceRadius) / logoWidth) * 100}%`;
      particle.style.top = `${((originY - clearanceRadius) / logoHeight) * 100}%`;
      const displacementY = (time) => -upwardSpeed * time + 0.5 * 3000 * time ** 2;
      let low = 0;
      let high = 1 / 120;
      while (originY + displacementY(high) < groundY(x + velocityX * high) + landingOverlap) { low = high; high += 1 / 120; }
      for (let step = 0; step < 24; step += 1) {
        const middle = (low + high) / 2;
        if (originY + displacementY(middle) < groundY(x + velocityX * middle) + landingOverlap) low = middle;
        else high = middle;
      }
      const flightTime = (low + high) / 2;
      const distance = velocityX * flightTime;
      const landingY = displacementY(flightTime);
      const duration = flightTime + 0.3;
      const frames = Array.from({ length: 61 }, (_, step) => {
        const progress = step / 60;
        const time = progress * flightTime;
        return { transform: `translate(${distance * progress * scaleX}px, ${displacementY(time) * scaleY}px)`, opacity: 1, offset: time / duration };
      });
      const landing = `translate(${distance * scaleX}px, ${landingY * scaleY}px)`;
      frames.push({ transform: landing, opacity: 1, offset: 1 });
      play(particle, frames, { delay: impactTime, duration: duration * 1000, easing: "linear" });
    });
  };
  const start = (replay = false) => {
    const layers = replay ? animations.slice(staticLayers.length) : animations;
    const run = ++animationRun;
    logoReplay.classList.remove("is-complete");
    layers.forEach((animation) => { animation.pause(); animation.currentTime = replay ? dropDelay : 0; animation.play(); });
    Promise.all(layers.map((animation) => animation.finished)).then(() => {
      if (run === animationRun && !reducedMotion.matches) logoReplay.classList.add("is-complete");
    });
  };
  const updateMotion = () => {
    logoReplay.disabled = reducedMotion.matches;
    if (reducedMotion.matches) {
      animationRun += 1;
      animations.forEach((animation) => animation.cancel());
      logoReplay.classList.add("is-complete");
    }
  };
  logoReplay.addEventListener("click", () => { if (!reducedMotion.matches) start(true); });
  reducedMotion.addEventListener("change", updateMotion);
  prepare();
  updateMotion();
  if (!reducedMotion.matches) start();
}

document.documentElement.classList.add("has-scroll-animations");
const showAll = () => revealElements.forEach((element) => element.classList.add("is-visible"));
if (reducedMotion.matches || !("IntersectionObserver" in window)) showAll();
else {
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); currentObserver.unobserve(entry.target); } });
  }, { threshold: 0.15 });
  revealElements.forEach((element) => observer.observe(element));
}

if (siteHeader && navigationToggle && primaryNavigation) {
  const narrowNavigation = window.matchMedia("(max-width: 36rem)");
  const closeNavigation = () => {
    siteHeader.classList.remove("is-menu-open");
    navigationToggle.setAttribute("aria-expanded", "false");
  };
  siteHeader.classList.add("navigation-ready");
  navigationToggle.addEventListener("click", () => {
    const isOpen = siteHeader.classList.toggle("is-menu-open");
    navigationToggle.setAttribute("aria-expanded", String(isOpen));
  });
  primaryNavigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeNavigation();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNavigation();
  });
  narrowNavigation.addEventListener("change", (event) => {
    if (!event.matches) closeNavigation();
  });
}
