import { useEffect } from 'preact/hooks';
import { music } from '../../game/sound';

/** Chapter title card: fades in, holds, fades out. Tap to skip. */
export function TitleCard({ text, subtitle, onDone }: { text: string; subtitle?: string; onDone: () => void }) {
  useEffect(() => {
    music('title', 1200);
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, []);
  return (
    <div class="screen" onClick={onDone} style={{ background: 'radial-gradient(ellipse at center, #141c34, #000 70%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', animation: 'fadeIn 1.2s ease both' }}>
      <div style={{ color: 'var(--gold-dim)', letterSpacing: '0.5em', fontFamily: 'var(--font-title)', fontSize: '15px' }}>✦ ✦ ✦</div>
      <div class="title-font" style={{ fontSize: 'clamp(20px, 3vw, 28px)', letterSpacing: '0.3em', color: 'var(--parch-dim)', textTransform: 'uppercase' }}>{text}</div>
      {subtitle && <div class="title-font" style={{ fontSize: 'clamp(36px, 7vw, 72px)', color: '#f6e2a8', letterSpacing: '0.06em', textShadow: '0 0 24px rgba(255,180,80,0.3)' }}>{subtitle}</div>}
    </div>
  );
}
