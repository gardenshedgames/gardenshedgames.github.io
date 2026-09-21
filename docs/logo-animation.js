// Respects the visitor's operating-system motion preference.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
// Elements that fade and slide in as their section enters the viewport.
const revealElements = document.querySelectorAll(".reveal");
// Interactive container for the layered hero logo.
const logoReplay = document.querySelector(".logo-replay");
// Header elements used by the compact navigation menu.
const siteHeader = document.querySelector(".site-header");
const navigationToggle = document.querySelector(".nav-toggle");
const primaryNavigation = document.querySelector("#primary-navigation");
// Individual SVG layers used while the logo animation is playing.
const staticLayers = document.querySelectorAll(".hero-walls, .hero-roof, .hero-ground");
const shovel = document.querySelector(".hero-shovel");
const clearance = document.querySelector(".hero-shovel-clearance");
const particles = document.querySelectorAll(".hero-particle");

if (logoReplay && staticLayers.length === 3 && shovel && clearance && particles.length) {
  // Retained Web Animations instances make a replay possible without rebuilding the DOM.
  const animations = [];
  // The impact sound is decoded once and scheduled against the shovel animation.
  let audioContext;
  let soundBuffer;
  let soundReady;
  let impactSound;
  // Prevents an earlier animation's completion callback replacing a newer replay.
  let animationRun = 0;
  // The layered animation is built only once, when the hero first becomes visible.
  let isPrepared = false;
  // The SVG artwork's coordinate system, used to translate artwork values into CSS pixels.
  const logoWidth = 2048;
  const logoHeight = 2124;
  // The visible particle radius and its black clearance border, in artwork units.
  const radius = 20.625;
  const clearanceRadius = radius + 25;
  // Launch positions and velocities define the five soil-particle trajectories.
  const launches = [
    { x: 1490, velocityX: -440, upwardSpeed: 1780, extraGroundOverlap: 20 }, { x: 1490, velocityX: -300, upwardSpeed: 1930, extraGroundOverlap: 20 },
    { x: 1490, velocityX: -200, upwardSpeed: 1650, extraGroundOverlap: 20 }, { x: 1870, velocityX: 102, upwardSpeed: 1850, extraGroundOverlap: 0 },
    { x: 1870, velocityX: 122, upwardSpeed: 1620, extraGroundOverlap: 0 }
  ];
  // Timings coordinate the logo build-up before particles leave the shovel.
  const fadeDelay = 250;
  const fadeDuration = 800;
  const dropDelay = fadeDelay + fadeDuration;
  const dropDuration = 1400;
  const impactTime = dropDelay + dropDuration;
  // Particles land slightly behind the foreground ground so they disappear cleanly.
  const groundOverlap = 22.25;
  // Evaluates a cubic Bézier curve; used to match particle landings to the ground curve.
  const cubic = (t, start, first, second, end) => {
    const inverse = 1 - t;
    return inverse ** 3 * start + 3 * inverse ** 2 * t * first + 3 * inverse * t ** 2 * second + t ** 3 * end;
  };
  // Finds the foreground ground's y-coordinate for an artwork x-coordinate.
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
  const preloadSound = () => {
    // Chrome does not permit fetching audio from a file:// preview.
    if (window.location.protocol === "file:") return Promise.resolve(false);
    if (soundBuffer) return Promise.resolve(true);
    if (soundReady) return soundReady;
    soundReady = new Promise((resolve) => {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContextClass();
        fetch("assets/shovel-sfx.mp3")
          .then((response) => {
            if (!response.ok) throw new Error("Sound could not be loaded");
            return response.arrayBuffer();
          })
          .then((data) => audioContext.decodeAudioData(data))
          .then((buffer) => {
            soundBuffer = buffer;
            resolve(true);
          })
          .catch(() => resolve(false));
      } catch {
        resolve(false);
      }
    });
    return soundReady;
  };
  const stopSound = () => {
    if (impactSound) {
      impactSound.stop();
      impactSound.disconnect();
      impactSound = undefined;
    }
  };
  const unlockSound = () => {
    preloadSound();
    if (audioContext?.state === "suspended") audioContext.resume().catch(() => {});
  };
  const scheduleImpactSound = (run, fromGesture) => {
    preloadSound().then((soundLoaded) => {
      if (!soundLoaded || run !== animationRun || reducedMotion.matches) return;
      const startSound = () => {
        if (run !== animationRun || audioContext.state !== "running") return;
        const shovelAnimation = animations[staticLayers.length];
        const elapsed = Number(shovelAnimation.currentTime) || 0;
        const remaining = (impactTime - elapsed) / 1000;
        if (remaining <= 0) return;
        const source = audioContext.createBufferSource();
        source.buffer = soundBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          source.disconnect();
          if (impactSound === source) impactSound = undefined;
        };
        impactSound = source;
        source.start(audioContext.currentTime + remaining);
      };
      if (audioContext.state === "running") startSound();
      else if (fromGesture) audioContext.resume().then(startSound).catch(() => {});
    });
  };
  // Builds the Web Animations once, using the logo's rendered size for scaling.
  const prepare = () => {
    const bounds = logoReplay.getBoundingClientRect();
    const scaleX = bounds.width / logoWidth;
    const scaleY = bounds.height / logoHeight;
    // Use the logo's document position so restored anchor scrolling cannot shorten the drop.
    const logoDocumentTop = bounds.top + window.scrollY;
    const dropDistance = bounds.height + Math.max(0, logoDocumentTop) + 100 * scaleY;
    // Align the animated shovel's final frame with the assembled logo artwork.
    const restingShovelOffset = 12 * scaleY;
    const shovelFrames = [{ transform: `translateY(-${dropDistance}px) rotate(75deg)` }, { transform: `translateY(${restingShovelOffset}px) rotate(0deg)` }];
    staticLayers.forEach((layer) => play(layer, [{ opacity: 0 }, { opacity: 1 }], { delay: fadeDelay, duration: fadeDuration, easing: "ease-out", fill: "backwards" }));
    [clearance, shovel].forEach((layer) => play(layer, shovelFrames, { delay: dropDelay, duration: dropDuration, easing: "cubic-bezier(.55, 0, 1, .45)", fill: "backwards" }));
    particles.forEach((particle, index) => {
      const { x, velocityX, upwardSpeed, extraGroundOverlap } = launches[index];
      const landingOverlap = groundOverlap + extraGroundOverlap;
      const originY = groundY(x) - radius;
      particle.style.left = `${((x - clearanceRadius) / logoWidth) * 100}%`;
      particle.style.top = `${((originY - clearanceRadius) / logoHeight) * 100}%`;
      // A simple ballistic curve determines each particle's vertical path.
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
  // On replay, the shed remains in place and only the shovel and particles run again.
  const start = (replay = false) => {
    const layers = replay ? animations.slice(staticLayers.length) : animations;
    const run = ++animationRun;
    stopSound();
    logoReplay.classList.remove("is-complete");
    layers.forEach((animation) => { animation.pause(); animation.currentTime = replay ? dropDelay : 0; animation.play(); });
    scheduleImpactSound(run, replay);
    Promise.all(layers.map((animation) => animation.finished)).then(() => {
      if (run === animationRun && !reducedMotion.matches) logoReplay.classList.add("is-complete");
    });
  };
  const updateMotion = () => {
    logoReplay.disabled = !isPrepared || reducedMotion.matches;
    if (reducedMotion.matches) {
      animationRun += 1;
      animations.forEach((animation) => animation.cancel());
      logoReplay.classList.add("is-complete");
    }
  };
  logoReplay.addEventListener("click", () => {
    unlockSound();
    if (!reducedMotion.matches) start(true);
  });
  // A visitor's first interaction permits sound when the animation later enters view.
  document.addEventListener("pointerdown", unlockSound, { once: true });
  reducedMotion.addEventListener("change", updateMotion);
  const beginLogoAnimation = () => {
    if (isPrepared) return;
    isPrepared = true;
    prepare();
    updateMotion();
    if (!reducedMotion.matches) start();
  };
  // Wait for hash navigation to settle, then measure only once the hero is on screen.
  const initialiseLogoAnimation = () => window.requestAnimationFrame(() => {
    if (!("IntersectionObserver" in window)) {
      beginLogoAnimation();
      return;
    }
    // A restored non-home hash can briefly report the hero as visible before its scroll restores.
    let hasLeftInitialView = !window.location.hash || window.location.hash === "#top";
    const logoObserver = new IntersectionObserver((entries, currentObserver) => {
      const isVisible = entries.some((entry) => entry.isIntersecting);
      if (!isVisible) {
        hasLeftInitialView = true;
        return;
      }
      if (hasLeftInitialView) {
        currentObserver.disconnect();
        beginLogoAnimation();
      }
    }, { threshold: 0.15 });
    logoObserver.observe(logoReplay);
  });
  if (document.readyState === "complete") initialiseLogoAnimation();
  else window.addEventListener("load", initialiseLogoAnimation, { once: true });
}

// Enable section reveals only when JavaScript is available.
document.documentElement.classList.add("has-scroll-animations");
const showAll = () => revealElements.forEach((element) => element.classList.add("is-visible"));
if (reducedMotion.matches || !("IntersectionObserver" in window)) showAll();
else {
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); currentObserver.unobserve(entry.target); } });
  }, { threshold: 0.15 });
  revealElements.forEach((element) => observer.observe(element));
}

// Enhance the mobile navigation without hiding links when JavaScript is unavailable.
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
