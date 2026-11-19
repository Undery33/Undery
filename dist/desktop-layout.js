(() => {
  const root = document.documentElement;
  const desktop = matchMedia("(any-pointer: fine)");
  const steps = [.5, .67, .75, .8, .9, 1, 1.1, 1.2, 1.25, 4 / 3, 1.5, 1.67, 1.75, 2, 2.5, 3, 4, 5];
  let displayScale;
  let lastDpr;
  let lastOuterWidth;
  let lastOuterHeight;

  function update() {
    if (!desktop.matches || !window.outerWidth || !window.innerWidth) {
      root.style.removeProperty("--vrchat-window-vh");
      root.style.removeProperty("--vrchat-window-vw");
      root.removeAttribute("data-wide-archive");
      root.removeAttribute("data-peek-below");
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    // The browser frame stays in display pixels during Ctrl+/−. Use it once to
    // recognize a saved zoom on entry, then track the DPR ratio as zoom changes.
    if (displayScale === undefined || (dpr !== lastDpr &&
        (window.outerWidth !== lastOuterWidth || window.outerHeight !== lastOuterHeight))) {
      const ratio = window.outerWidth / window.innerWidth;
      const zoom = steps.reduce((a, b) => Math.abs(ratio - a) < Math.abs(ratio - b) ? a : b);
      displayScale = dpr / zoom;
    }
    lastDpr = dpr;
    lastOuterWidth = window.outerWidth;
    lastOuterHeight = window.outerHeight;
    const zoom = dpr / displayScale;
    const height = window.innerHeight * zoom;
    const width = window.innerWidth * zoom;
    root.style.setProperty("--vrchat-window-vh", height / 100 + "px");
    root.style.setProperty("--vrchat-window-vw", width / 100 + "px");
    const peekWidth = Math.max(80, Math.min(144, width * .09));
    root.toggleAttribute("data-peek-below", (window.innerWidth - height * 1.007463) / 2 < peekWidth);
    root.toggleAttribute("data-wide-archive", width >= 760 && window.innerWidth > window.innerHeight);
  }

  update();
  window.addEventListener("resize", update);
  window.addEventListener("pageshow", update);
  desktop.addEventListener("change", update);
})();
