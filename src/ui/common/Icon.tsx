/** Inline SVG icons (no font glyph dependencies — renders identically on every platform). */
const PATHS: Record<string, string> = {
  rotl: 'M7 4v4h4 M7.6 8A7 7 0 1 1 5 13',
  rotr: 'M17 4v4h-4 M16.4 8A7 7 0 1 0 19 13',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  sword: 'M14 4h6v6L9 21l-3-3L17 7 M5 15l4 4 M3 21l3-3',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
  party: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6 M17 11a2.5 2.5 0 1 0 0-5 M21 19c0-2.5-1.6-4.5-4-5',
  bag: 'M5 8h14l-1 12H6z M9 8V6a3 3 0 0 1 6 0v2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12l2-1-1-3-2 .2-1.4-1.4L17 5l-3-1-1 2h-2l-1-2-3 1 .4 2L6 8.4 4 8.2 3 11l2 1v0l-2 1 1 3 2-.2 1.4 1.4L7 19l3 1 1-2h2l1 2 3-1-.4-2 1.4-1.4 2 .2 1-3z',
  save: 'M5 4h11l3 3v13H5z M8 4v5h8V4 M8 20v-6h8v6',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  chat: 'M4 5h16v11H9l-5 4z',
  speed: 'M5 6l7 6-7 6z M12 6l7 6-7 6z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  flag: 'M5 21V4 M5 4h12l-2 4 2 4H5',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15.5 8.5l-2 5-5 2 2-5z',
  skull: 'M12 3a7 7 0 0 0-7 7c0 2.6 1.4 4.4 3 5.4V19h8v-3.6c1.6-1 3-2.8 3-5.4a7 7 0 0 0-7-7z M9 11h.01 M15 11h.01 M10 19v2 M14 19v2',
  music: 'M9 18V6l11-2v12 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
};

export function Icon({ name, size = 18, stroke = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style={{ display: 'block' }}>
      <path d={PATHS[name] ?? PATHS.star} />
    </svg>
  );
}
