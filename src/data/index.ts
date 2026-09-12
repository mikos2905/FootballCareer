import type { Club, Competition, League, Nation, WorldData } from '../engine/types';
import clubs from './clubs.json';
import competitions from './competitions.json';
import leagues from './leagues.json';
import nations from './nations.json';

/**
 * The default data set. Real league and club names as plain text only — no
 * crests, kits, competition marks or player likenesses anywhere in the app.
 *
 * Nothing in src/engine imports this file. To ship a fictional world, replace
 * the four JSON files and change nothing else.
 */
export const WORLD_DATA: WorldData = {
  leagues: leagues as League[],
  clubs: clubs as Club[],
  competitions: competitions as Competition[],
  nations: nations as Nation[],
};
