/**
 * Next-frame scheduling that keeps running when requestAnimationFrame is
 * throttled (background tabs, hidden webviews on mobile). Whichever of rAF or
 * a timer fires first wins.
 */
export function nextFrame(cb: (now: number) => void, fallbackMs = 50): void {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb(performance.now());
  };
  requestAnimationFrame(run);
  setTimeout(run, fallbackMs);
}
