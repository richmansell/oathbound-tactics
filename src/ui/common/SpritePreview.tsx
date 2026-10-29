import { useEffect, useRef } from 'preact/hooks';
import type { Dir, UnitBuild } from '../../engine/types';
import { spriteForBuild } from '../../render/unitSprites';
import type { GameAnimName } from '../../render/scene';

/** Animated LPC preview of a unit (walks, turns, shows equipment changes live). */
export function SpritePreview({ build, size = 96, anim = 'walk', spin = true }: { build: UnitBuild; size?: number; anim?: GameAnimName; spin?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify([build.appearance, build.equipment, build.job]);
  useEffect(() => {
    const cv = ref.current!;
    const scale = Math.max(1, Math.floor(size / 48));
    cv.width = 64;
    cv.height = 64;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const sprite = spriteForBuild(build);
    let stop = false;
    const dirs: Dir[] = ['s', 'e', 'n', 'w'];
    const t0 = performance.now();
    const frame = () => {
      if (stop) return;
      const t = performance.now() - t0;
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(32, 58, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      const dir = spin ? dirs[Math.floor(t / 2200) % 4] : 's';
      sprite?.draw(ctx, anim, dir, t, 32, 60);
      requestAnimationFrame(frame);
    };
    frame();
    void scale;
    return () => { stop = true; };
  }, [key, size, anim]);
  return <canvas ref={ref} style={{ width: `${size}px`, height: `${size}px`, imageRendering: 'pixelated', display: 'block' }} />;
}
