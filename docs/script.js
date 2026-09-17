const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const revealElements = document.querySelectorAll(".reveal");

const LOGO_FADE_DELAY_MS = 250; // Wait before the shed begins fading in.
const SHOVEL_START_ANGLE_DEG = 75; // Relative to its final pose; negative tilts the other way.
const SOUND_PRELOAD_TIMEOUT_MS = 3000; // Start silently if loading/decoding takes longer.

// Particle tuning, in SVG viewBox units (the logo is 2048 units wide).
const PARTICLE_LAUNCH_X = { left: 1490, right: 1870 };
const PARTICLE_GRAVITY = 3000; // Units per second squared.
// Initial velocities in units per second: negative vx = left, positive = right.
// Increase upwardSpeed for a higher arc; increase |vx| for more sideways travel.
const PARTICLE_INITIAL_VELOCITIES = [
  { side: "left", vx: -440, upwardSpeed: 1780 },
  { side: "left", vx: -300, upwardSpeed: 1930 },
  { side: "left", vx: -200, upwardSpeed: 1650 },
  { side: "right", vx: 140, upwardSpeed: 1850 },
  { side: "right", vx: 170, upwardSpeed: 1620 }
];

// Move the shovel and its wall-clearance mask together, so the complete wall
// remains visible until the shovel passes in front of it.
const logo = document.querySelector(".hero-mark");
const logoReplay = document.querySelector(".logo-replay");
if (logo && logoReplay && typeof logo.animate === "function") {
  const animations = [];
  let audioContext;
  let soundBuffer;
  let soundReady;
  let impactSound;
  let runId = 0;
  let startFrame;
  const preloadSound = () => {
    // Local file URLs cannot be fetched. Use an HTTP preview to test sound.
    if (window.location.protocol === "file:") return Promise.resolve(false);
    if (soundBuffer) return Promise.resolve(true);
    if (soundReady) return soundReady;
    soundReady = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), SOUND_PRELOAD_TIMEOUT_MS);
      const finish = (ready) => { clearTimeout(timeout); resolve(ready); };
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
            soundBuffer = buffer; // A late load can still be used on a future click.
            finish(true);
          })
          .catch(() => finish(false));
      } catch {
        finish(false);
      }
    });
    return soundReady;
  };
  const unlockAudio = (fromGesture) => {
    // Decoding does not require playback. Only resume a suspended context in
    // the replay click handler; an allowed, already-running context can autoplay.
    if (!audioContext || audioContext.state === "running" || !fromGesture) return Promise.resolve();
    return audioContext.resume().catch(() => {});
  };
  const stopSound = () => {
    if (impactSound) {
      impactSound.stop();
      impactSound.disconnect();
      impactSound = undefined;
    }
  };
  // Start the request before preparing the particle paths.
  if (!reducedMotion.matches) preloadSound();
  const fadeDuration = 800;
  const dropDelay = LOGO_FADE_DELAY_MS + fadeDuration;
  const dropDuration = 1400;
  const impactTime = dropDelay + dropDuration;
  const bounds = logo.getBoundingClientRect();
  const scale = bounds.height / 2124;
  // SVG transforms use viewBox units: put even the blade above the viewport.
  const dropDistance = 2124 + Math.max(0, bounds.top) / scale + 100;
  const shovelDropFrames = (distance) => [
    { transform: `translateY(-${distance}px) rotate(${SHOVEL_START_ANGLE_DEG}deg)` },
    { transform: "translateY(0) rotate(0deg)" }
  ];
  const play = (element, keyframes, options) => {
    const animation = element.animate(keyframes, options);
    // Hold the initial frame while the particle trajectories are prepared.
    // Otherwise that setup work can consume the fade before the first paint.
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  };

  play(logo.querySelector(".logo-shed"), [{ opacity: 0 }, { opacity: 1 }], {
    delay: LOGO_FADE_DELAY_MS,
    duration: fadeDuration, easing: "ease-out", fill: "backwards"
  });
  logo.querySelectorAll(".logo-shovel, .logo-shovel-clearance").forEach((layer) => {
    play(layer, shovelDropFrames(dropDistance), {
      delay: dropDelay, duration: dropDuration,
      easing: "cubic-bezier(.55, 0, 1, .45)", fill: "backwards"
    });
  });

  // Sample the ground's upper edge so each circle lands on the curved surface.
  const ground = logo.querySelector("#hero-ground");
  const groundY = (x) => {
    let low = 0;
    // The first half of this closed path lies on its upper edge.
    let high = ground.getTotalLength() / 2;
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      if (ground.getPointAtLength(middle).x < x) low = middle;
      else high = middle;
    }
    return ground.getPointAtLength((low + high) / 2).y;
  };
  logo.querySelectorAll(".logo-particle").forEach((particle, index) => {
    const { side, vx, upwardSpeed } = PARTICLE_INITIAL_VELOCITIES[index];
    const originX = PARTICLE_LAUNCH_X[side];
    const radius = particle.r.baseVal.value;
    const originY = groundY(originX) - radius;
    particle.setAttribute("cx", originX);
    particle.setAttribute("cy", originY);
    const displacementY = (time) => -upwardSpeed * time + .5 * PARTICLE_GRAVITY * time ** 2;
    const groundClearance = (time) => originY + displacementY(time) + radius - groundY(originX + vx * time);
    // Find the first ground contact after launch, using the configured velocity
    // and the surface under the moving particle, rather than a fixed destination.
    let low = 0;
    let high = 1 / 120;
    while (groundClearance(high) < 0) {
      low = high;
      high += 1 / 120;
    }
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      if (groundClearance(middle) < 0) low = middle;
      else high = middle;
    }
    const flightTime = (low + high) / 2;
    const distance = vx * flightTime;
    const landingY = displacementY(flightTime);
    const duration = flightTime + .3;
    // Constant horizontal speed and gravitational acceleration form a parabola.
    const frames = Array.from({ length: 61 }, (_, step) => {
      const progress = step / 60;
      const time = progress * flightTime;
      const y = displacementY(time);
      return {
        transform: `translate(${distance * progress}px, ${y}px)`,
        opacity: 1, offset: time / duration
      };
    });
    // Stop on contact, then fade at rest to restore the clean logo.
    const landingTransform = `translate(${distance}px, ${landingY}px)`;
    frames.push(
      { transform: landingTransform, opacity: 1, offset: (flightTime + .12) / duration },
      { transform: landingTransform, opacity: 0, offset: 1 }
    );
    play(particle, frames, {
      delay: impactTime, duration: duration * 1000, easing: "linear"
    });
  });

  const startSequence = (replay = false) => {
    const thisRun = ++runId;
    cancelAnimationFrame(startFrame);
    stopSound();
    if (reducedMotion.matches) return;
    const ready = preloadSound();
    const unlocked = unlockAudio(replay);
    const layers = replay ? animations.slice(1) : animations;
    layers.forEach((animation) => {
      animation.pause();
      animation.currentTime = replay ? dropDelay : 0;
    });
    ready.then((soundLoaded) => {
      if (thisRun !== runId || reducedMotion.matches) return;
      startFrame = requestAnimationFrame(() => {
        if (thisRun !== runId || reducedMotion.matches) return;
        layers.forEach((animation) => animation.play());
        if (!soundLoaded) return;
        // Use the drop's actual start time rather than a separate JS timer.
        Promise.all([animations[1].ready, unlocked]).then(() => {
          if (thisRun !== runId || reducedMotion.matches || audioContext.state !== "running") return;
          const remaining = (impactTime - animations[1].currentTime) / 1000;
          if (remaining <= 0) return; // Never play a delayed impact after landing.
          const source = audioContext.createBufferSource();
          source.buffer = soundBuffer;
          source.connect(audioContext.destination);
          source.onended = () => {
            source.disconnect();
            if (impactSound === source) impactSound = undefined;
          };
          impactSound = source;
          source.start(audioContext.currentTime + remaining);
        }).catch(() => {});
      });
    });
  };

  logoReplay.addEventListener("click", () => {
    if (reducedMotion.matches) return;
    // Keep the shed fully visible, even if clicked during the opening fade.
    animations[0].cancel();
    const bounds = logo.getBoundingClientRect();
    const scale = bounds.height / 2124;
    const distance = 2124 + Math.max(0, bounds.top) / scale + 100;
    animations.slice(1, 3).forEach((animation) => {
      animation.effect.setKeyframes(shovelDropFrames(distance));
    });
    // Reuse the prepared trajectories and skip directly to the drop. Seeking
    // every layer also clears any particles left over from an earlier replay.
    startSequence(true);
  });

  // Cancelling restores the completed static logo, including hidden particles.
  const stopMotion = () => {
    logoReplay.disabled = reducedMotion.matches;
    if (reducedMotion.matches) {
      runId += 1;
      cancelAnimationFrame(startFrame);
      stopSound();
      animations.forEach((animation) => animation.cancel());
    }
  };
  reducedMotion.addEventListener("change", stopMotion);
  stopMotion();
  startSequence();
}

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
