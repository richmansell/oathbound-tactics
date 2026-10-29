/**
 * Hand-authored pixel sprites for facial features, per expression.
 * Eyes/brows are authored for the NEAR eye (viewer's left; outer corner on the left);
 * the far eye is mirrored and foreshortened by the renderer unless a far sprite is given.
 *
 * Legend
 *   K line (darkest)   k soft line       W sclera          w sclera shadow
 *   i iris dark        I iris            L iris light      P pupil      H highlight
 *   S skin shadow      D skin deep       s skin light      x skin base (over skin only)
 *   B brow dark        b brow mid        T tear            t tear shade
 *   M mouth dark       m mouth           G tongue          E teeth      e teeth shadow
 *   R lip              r lip shadow
 */
import type { Expression } from '../content/schema';

export interface ExpressionDef {
  eye: string[];
  eyeFar?: string[];
  brow: string[];
  browFar?: string[];
  /** Vertical brow offset (negative = raised). */
  browDy: number;
  browFarDy?: number;
  mouth: string[];
  /** Horizontal mouth shift (positive toward the far side). */
  mouthDx?: number;
  blush?: boolean;
  sweat?: boolean;
  tear?: boolean;
  /** Vertical crease between brows. */
  knit?: boolean;
  /** Female/young variant of the mouth (fuller lips). */
  mouthSoft?: string[];
}

export const EXPRESSION_DEFS: Record<Expression, ExpressionDef> = {
  neutral: {
    eye: [
      '..kKKKKKk.',
      '.KKwiiiwKK',
      'kWWHPIIWWk',
      '..kWILIWk.',
      '...SSSSS..',
    ],
    brow: [
      '...bBBBBb.',
      '.bBBb...BB',
    ],
    browDy: 0,
    mouth: [
      '.kKKKKKKk.',
      '...ssss...',
      '...SSSS...',
    ],
    mouthSoft: [
      '..kKKKKk..',
      '..rRRRRr..',
      '...SSSS...',
    ],
  },
  happy: {
    eye: [
      '...kKKKk..',
      '..KKiiiKK.',
      '.KwHPIIwKk',
      '.kkSSSSkk.',
      '...ssss...',
    ],
    brow: [
      '...bBBBb..',
      '.bBb....Bb',
    ],
    browDy: -1,
    mouth: [
      'k........k',
      '.KKKKKKKK.',
      '..KEEEEK..',
      '...KmmK...',
      '....SS....',
    ],
    blush: true,
  },
  angry: {
    eye: [
      'kKKk......',
      '.KWKKKKk..',
      'kWWHPiKKKk',
      '..kWILIWk.',
      '...SSSSS..',
    ],
    brow: [
      'bbB.......',
      '..bBBBb...',
      '.....BBBBB',
    ],
    browDy: 0,
    mouth: [
      '.kKKKKKKk.',
      'kKEEEEEEKk',
      '.KMMMMMMK.',
      '..KKKKKK..',
      '...SSSS...',
    ],
    knit: true,
  },
  sad: {
    eye: [
      '.....kKKk.',
      '..kKKKiwKk',
      'kKwHPIIWk.',
      '..kWILIk..',
      '...SSSS...',
    ],
    brow: [
      '......bBBB',
      '...bBBb...',
      'bbB.......',
    ],
    browDy: -1,
    mouth: [
      '..kKKKKKk.',
      '.K.......K',
      '....sss...',
    ],
    mouthSoft: [
      '..kKKKKk..',
      '.K.rRRr.K.',
      '....SS....',
    ],
    tear: true,
  },
  surprised: {
    eye: [
      '..kKKKKk..',
      '.KWWWWWWK.',
      'kWWWHPWWWk',
      'kWWWILWWWk',
      '.kWWWWWWk.',
      '..kSSSSk..',
    ],
    brow: [
      '...bBBBb..',
      '.bB.....Bb',
    ],
    browDy: -3,
    mouth: [
      '..kKKk..',
      '.KMmmMK.',
      '.KMGGMK.',
      '..kKKk..',
      '...SS...',
    ],
  },
  determined: {
    eye: [
      '..........',
      '.kKKKKKKKk',
      'kKwiHPiwKk',
      '..kWILIWk.',
      '...SSSSS..',
    ],
    brow: [
      '.bbBBBb...',
      '......BBBB',
    ],
    browDy: 1,
    mouth: [
      'kKKKKKKKKk',
      '...SSSS...',
      '...ssss...',
    ],
    knit: true,
  },
  hurt: {
    eye: [
      '..kKk.....',
      '....kKKk..',
      '......kKK.',
      '....kKKk..',
      '..kKk.....',
    ],
    eyeFar: [
      '..........',
      '.kKKKKKKk.',
      'kKKwiiPKKk',
      '..kkSSkk..',
      '..........',
    ],
    brow: [
      '......BBBb',
      '..bBBBb...',
      'bb........',
    ],
    browDy: 0,
    mouth: [
      'kKKKKKKKKk',
      'KEeEeEeEeK',
      '.KKKKKKKK.',
      '...SSSS...',
    ],
    sweat: true,
    knit: true,
  },
  smirk: {
    eye: [
      '..........',
      '..kKKKKKk.',
      '.KKwiHPiKk',
      'kkWWILIWk.',
      '...SSSSS..',
    ],
    brow: [
      '.bbBBBb...',
      '......BBBB',
    ],
    browFar: [
      '...bBBBb..',
      '.bBb....BB',
    ],
    browDy: 1,
    browFarDy: -2,
    mouth: [
      '........kK',
      '.kKKKKKKK.',
      '...sSS....',
    ],
    mouthDx: 1,
  },
};

// ---------------------------------------------------------------------------
// Noses (authored facing right: bridge highlight left, shadow right)
// ---------------------------------------------------------------------------

export const NOSES: Record<'small' | 'medium' | 'large' | 'hooked' | 'button', string[]> = {
  small: [
    '.s..',
    '.sS.',
    '.sS.',
    'ssSS',
    'SkkS',
    '.SS.',
  ],
  medium: [
    '.s...',
    '.sS..',
    '.sS..',
    '.sS..',
    '.ssS.',
    'sssSS',
    'SxkkS',
    '.SSS.',
  ],
  large: [
    '.s....',
    '.sS...',
    '.sS...',
    '.ssS..',
    '.ssSS.',
    'ssssSS',
    'SxkkkS',
    '.SSSS.',
  ],
  hooked: [
    '.s...',
    '.sS..',
    '.ssS.',
    '.ssS.',
    '..sSS',
    '.ssSS',
    'SxkkS',
    '.SSS.',
  ],
  button: [
    '.s..',
    '.s..',
    '.sS.',
    'ssSS',
    'SkkS',
    '.SS.',
  ],
};
