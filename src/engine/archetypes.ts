import type { AttributeKey, Attributes } from './types';

export interface Archetype {
  id: string;
  name: string;
  /** One line of flavour shown on the draft card. */
  blurb: string;
  /** The ceiling this archetype offers for each attribute. */
  offers: Attributes;
}

/**
 * "Draft your ceiling": eight archetypes, one at a time, take exactly one
 * attribute from each. Each attribute can only be taken once, so the eighth
 * pick is forced.
 *
 * The peaks deliberately overlap — two archetypes are strong at physical, three
 * at dribbling, none is uniquely best at everything — so taking the headline
 * number every time is not automatically right. You are choosing under
 * uncertainty about what is still to come.
 */
export const ARCHETYPES: readonly Archetype[] = [
  {
    id: 'poacher',
    name: 'The Poacher',
    blurb: 'Lives on the shoulder of the last defender. One touch, then the net.',
    offers: { pace: 84, shooting: 96, passing: 62, dribbling: 74, defending: 40, physical: 80, flair: 70, weakFoot: 82 },
  },
  {
    id: 'playmaker',
    name: 'The Playmaker',
    blurb: 'Sees the pass three seconds before anyone else does.',
    offers: { pace: 68, shooting: 76, passing: 95, dribbling: 84, defending: 62, physical: 66, flair: 88, weakFoot: 78 },
  },
  {
    id: 'flyer',
    name: 'The Flyer',
    blurb: 'Beats the full-back on the outside, every time, all afternoon.',
    offers: { pace: 97, shooting: 76, passing: 74, dribbling: 90, defending: 44, physical: 58, flair: 86, weakFoot: 70 },
  },
  {
    id: 'destroyer',
    name: 'The Destroyer',
    blurb: 'Reads the game a yard ahead and arrives a yard early.',
    offers: { pace: 74, shooting: 52, passing: 72, dribbling: 56, defending: 94, physical: 92, flair: 44, weakFoot: 62 },
  },
  {
    id: 'colossus',
    name: 'The Colossus',
    blurb: 'Wins everything in the air and most things on the ground.',
    offers: { pace: 66, shooting: 58, passing: 64, dribbling: 48, defending: 90, physical: 96, flair: 40, weakFoot: 58 },
  },
  {
    id: 'maverick',
    name: 'The Maverick',
    blurb: 'Tries the outrageous thing. Occasionally it comes off, and then you remember it forever.',
    offers: { pace: 80, shooting: 84, passing: 82, dribbling: 92, defending: 38, physical: 56, flair: 97, weakFoot: 88 },
  },
  {
    id: 'technician',
    name: 'The Technician',
    blurb: 'Genuinely two-footed. Defenders never know which way to show him.',
    offers: { pace: 72, shooting: 80, passing: 88, dribbling: 86, defending: 64, physical: 68, flair: 78, weakFoot: 96 },
  },
  {
    id: 'prodigy',
    name: 'The Prodigy',
    blurb: 'No obvious weakness and no obvious speciality. Coaches love him.',
    offers: { pace: 84, shooting: 84, passing: 84, dribbling: 84, defending: 82, physical: 84, flair: 82, weakFoot: 84 },
  },
] as const;

export function archetype(id: string): Archetype {
  const found = ARCHETYPES.find((a) => a.id === id);
  if (!found) throw new Error(`Unknown archetype: ${id}`);
  return found;
}

export function remainingAttributes(taken: readonly AttributeKey[], all: readonly AttributeKey[]): AttributeKey[] {
  const used = new Set(taken);
  return all.filter((k) => !used.has(k));
}
