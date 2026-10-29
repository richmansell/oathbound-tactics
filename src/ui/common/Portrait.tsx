import { useMemo } from 'preact/hooks';
import { ITEMS } from '../../content/items';
import type { Appearance, Expression } from '../../content/schema';
import type { UnitBuild } from '../../engine/types';
import { portraitDataUrl } from '../../portraits/browser';

/** Portrait options derived from a build's visible equipment. */
export function portraitGear(build: Pick<UnitBuild, 'equipment'>): { headgear?: string; outfit?: string } {
  const head = build.equipment.head ? ITEMS[build.equipment.head] : undefined;
  const body = build.equipment.body ? ITEMS[build.equipment.body] : undefined;
  return {
    headgear: head?.visual?.[0]?.key,
    outfit: body?.visual?.[0]?.key,
  };
}

export function Portrait(props: {
  build?: Pick<UnitBuild, 'appearance' | 'equipment' | 'name'>;
  appearance?: Appearance;
  size: number;
  expression?: Expression;
  flip?: boolean;
  class?: string;
  headgear?: string;
  outfit?: string;
}) {
  const appearance = props.appearance ?? props.build?.appearance;
  const gear = props.build ? portraitGear(props.build) : {};
  const headgear = props.headgear ?? gear.headgear;
  const outfit = props.outfit ?? gear.outfit;
  const url = useMemo(() => {
    if (!appearance) return null;
    try {
      return portraitDataUrl(appearance, props.expression ?? 'neutral', { headgear, outfit, flip: props.flip });
    } catch (e) {
      console.warn('portrait failed', e);
      return null;
    }
  }, [appearance, props.expression, headgear, outfit, props.flip]);
  const s = { width: `${props.size}px`, height: `${props.size}px` };
  if (!url) {
    const initial = (props.build?.name ?? '?').slice(0, 1);
    return <div class={`portrait-fallback ${props.class ?? ''}`} style={{ ...s, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a2647', fontFamily: 'var(--font-title)', fontSize: `${props.size * 0.5}px`, color: 'var(--gold-2)' }}>{initial}</div>;
  }
  return <img class={props.class} src={url} width={props.size} height={props.size} style={{ ...s, imageRendering: 'pixelated', display: 'block' }} draggable={false} alt="" />;
}
