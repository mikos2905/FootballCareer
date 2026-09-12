import { clubLeagueId, clubStrength, leagueAverageStrength } from './league';
import { ROLE_LABELS, ageStandingAdjustment, selectionRating, shareForStanding } from './minutes';
import { ovrForStrength } from './output';
import { clamp, Rng } from './rng';
import type { CareerState, SquadRole, TransferOffer } from './types';
import type { World } from './world';

/**
 * The transfer market.
 *
 * Candidate clubs are filtered to those whose prestige band is plausible for
 * the player, who can afford the wages and who have a use for the position.
 * Two to four of them actually bid.
 *
 * The awkward offers are the point: a giant offering a bench seat, a small club
 * offering to build the side around you, and money from a league nobody watches
 * that will quietly cost you your international career.
 */

const MILLION = 1_000_000;

/**
 * Market value. Exponential in OVR, then discounted steeply by age past 30 and
 * by a contract running down.
 */
export function computeMarketValue(params: {
  ovr: number;
  age: number;
  reputation: number;
  leaguePrestige: number;
  leagueStrength: number;
  contractYearsRemaining: number;
  /** Goals plus assists per 90 last season, as a share of the position baseline. */
  recentOutput: number;
}): number {
  const { ovr, age, reputation, leaguePrestige, leagueStrength, contractYearsRemaining, recentOutput } = params;
  const base = Math.exp((ovr - 50) / 9.2) * MILLION;

  const ageFactor =
    age <= 26
      ? 1 - Math.max(0, 21 - age) * 0.025
      : age <= 30
        ? 1 - (age - 26) * 0.06
        : // Steep after 30.
          clamp(0.76 * Math.pow(0.72, age - 30), 0.03, 0.76);

  const visibility = 0.62 + (leaguePrestige / 100) * 0.3 + leagueStrength * 0.22;
  const repFactor = 0.85 + (reputation / 100) * 0.32;
  const outputFactor = clamp(0.82 + recentOutput * 0.28, 0.72, 1.35);
  const contractFactor =
    contractYearsRemaining <= 0 ? 0.42 : contractYearsRemaining === 1 ? 0.66 : contractYearsRemaining === 2 ? 0.87 : 1;

  // Nobody has ever been worth a third of a billion, whatever the model says.
  const value = Math.min(base * ageFactor * visibility * repFactor * outputFactor * contractFactor, 260_000_000);
  return Math.max(0, Math.round(value / 100_000) * 100_000);
}

export function computeWage(params: {
  ovr: number;
  wageBudget: number;
  reputation: number;
  age: number;
  role: SquadRole;
}): number {
  const { ovr, wageBudget, reputation, age, role } = params;
  const base = Math.exp((ovr - 46) / 10.2) * 240_000;
  const budgetFactor = 0.32 + (wageBudget / 100) * 1.2;
  const repFactor = 0.8 + (reputation / 100) * 0.55;
  const ageFactor = age < 20 ? 0.42 : age < 23 ? 0.72 : age > 33 ? 0.82 : 1;
  const roleFactor = { star: 1.25, starter: 1, rotation: 0.82, squad: 0.66, fringe: 0.55 }[role];
  return Math.max(20_000, Math.round((base * budgetFactor * repFactor * ageFactor * roleFactor) / 10_000) * 10_000);
}

/** What role a club of this strength would realistically offer this player. */
function projectedRole(playerRating: number, squadStrength: number, age: number): SquadRole {
  const standing = playerRating - squadStrength + ageStandingAdjustment(age);
  if (standing >= 6) return 'star';
  if (standing >= 1) return 'starter';
  if (standing >= -4) return 'rotation';
  if (standing >= -9) return 'squad';
  return 'fringe';
}

export interface OfferInputs {
  state: CareerState;
  world: World;
  /** Goals plus assists per 90 last season as a share of the position baseline. */
  recentOutput: number;
  /** Set when the player is out of contract and must find a club. */
  mustMove: boolean;
}

/**
 * Generates the clubs that actually bid. Returns an empty list when nobody
 * wants the player — which, for a player out of contract, is how a career ends.
 */
export function generateOffers(rng: Rng, inputs: OfferInputs): TransferOffer[] {
  const { state, world } = inputs;
  const { player } = state;
  const currentLeague = world.league(clubLeagueId(state.world, state.clubId));
  const rating = selectionRating(player.attributes, player.position);

  // Concrete offers do not arrive every summer. A player under contract who had
  // an unremarkable season mostly gets left alone, which is what stops careers
  // turning into a club a year.
  if (!inputs.mustMove) {
    const interest = clamp(
      0.14 + (player.reputation / 100) * 0.42 + (inputs.recentOutput - 0.8) * 0.2 +
        (state.contractYearsRemaining <= 1 ? 0.26 : 0),
      0.06,
      0.78,
    );
    if (!rng.chance(interest)) return [];
  }

  const value = player.marketValue;
  const candidates = world.data.clubs.filter((club) => {
    if (club.id === state.clubId) return false;
    const strength = clubStrength(state.world, club.id);
    const league = world.league(clubLeagueId(state.world, club.id));
    const clubLevel = ovrForStrength(strength);

    // A club signs players around its own level. It will not take someone well
    // below it, and someone well above it will not come. Clubs take a punt on
    // the young, which is what keeps a slow developer in the game.
    const below = clubLevel - player.ovr;
    const above = player.ovr - clubLevel;
    const tolerance = player.age <= 21 ? 10 : player.age <= 24 ? 5 : 2;
    const level = below <= tolerance && above <= 11;

    // Nobody signs a player they have never heard of. A glamorous club needs
    // the player to be visible, which is what makes a lucrative move to a quiet
    // league cost something — but being genuinely outstanding gets you noticed
    // wherever you are playing. Scouts do watch Major League Soccer.
    const known =
      player.reputation + player.ovr * 0.5 + currentLeague.prestige * 0.2 >= club.prestige * 0.72 + 6;

    // Money can always reach above a club's sporting level.
    const moneyTalks = club.wageBudget >= 78 && above <= 20 && player.reputation >= 40;

    // And a club has to actually be able to pay him.
    const affordable = club.wageBudget + club.prestige * 0.35 >= player.ovr * 0.92 - 12;

    // The strongest leagues shop from a shortlist. A good player nobody has
    // heard of does not get a call from one, however capable he is.
    const eliteBar =
      league.strength >= 0.85 ? player.reputation + player.ovr * 0.35 >= 38 + club.prestige * 0.25 : true;

    return affordable && known && eliteBar && (level || moneyTalks) && league.tier <= (player.ovr >= 68 ? 2 : 3);
  });

  if (candidates.length === 0) return [];

  const count = clamp(rng.int(2, 4), 1, candidates.length);
  const chosen: typeof candidates = [];
  const pool = candidates.slice();
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const club = rng.weighted(pool, (c) => {
      const strength = clubStrength(state.world, c.id);
      const fit = 1 / (1 + Math.abs(ovrForStrength(strength) - player.ovr) / 7);
      const pull = 0.4 + (c.prestige / 100) * 1.2;
      return fit * pull;
    });
    chosen.push(club);
    pool.splice(pool.indexOf(club), 1);
  }

  return chosen.map((club) => {
    const strength = clubStrength(state.world, club.id);
    const league = world.league(clubLeagueId(state.world, club.id));
    const role = projectedRole(rating, strength, player.age);
    const wage = computeWage({ ovr: player.ovr, wageBudget: club.wageBudget, reputation: player.reputation, age: player.age, role });

    // Fee is the market talking, not the value tag: a desperate rich club pays over.
    const feeMultiplier = clamp(0.7 + (club.wageBudget / 100) * 0.8 + rng.around(0, 0.18, -0.4, 0.5), 0.35, 2.2);
    const fee = inputs.mustMove ? 0 : Math.round((value * feeMultiplier) / 100_000) * 100_000;

    const standing =
      rating - strength + ageStandingAdjustment(player.age);
    const honestShare = shareForStanding(standing);
    // The club states an intention. It is honest, but clubs change their minds,
    // and bigger clubs overpromise more.
    const optimism = 1 + (club.prestige / 100) * 0.22;
    const projectedMinutes = Math.round(clamp(honestShare * optimism, 0, 1) * 3420);

    const confidence: TransferOffer['projectionConfidence'] =
      role === 'star' || role === 'starter' ? (club.prestige > 82 ? 'likely' : 'firm') : club.prestige > 82 ? 'vague' : 'likely';

    return {
      clubId: club.id,
      clubName: club.name,
      leagueId: league.id,
      leagueName: league.name,
      leagueTier: league.tier,
      fee,
      wage,
      contractYears: player.age >= 33 ? 1 : player.age >= 30 ? rng.int(1, 3) : rng.int(2, 5),
      loan: false,
      role,
      projectedMinutes,
      projectionConfidence: confidence,
    };
  });
}

/**
 * A loan offer for a young player who is not playing. Separate from the bidding
 * above because the intent is completely different.
 */
export function generateLoanOffers(rng: Rng, inputs: OfferInputs): TransferOffer[] {
  const { state, world } = inputs;
  const { player } = state;
  if (player.age > 23) return [];

  const rating = selectionRating(player.attributes, player.position);
  const candidates = world.data.clubs.filter((club) => {
    if (club.id === state.clubId) return false;
    const strength = clubStrength(state.world, club.id);
    // Somewhere he would actually play.
    return rating - strength + ageStandingAdjustment(player.age) >= -1 && strength < clubStrength(state.world, state.clubId);
  });
  if (candidates.length === 0) return [];

  const count = clamp(rng.int(1, 2), 1, candidates.length);
  const pool = candidates.slice();
  const out: TransferOffer[] = [];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const club = rng.weighted(pool, (c) => 0.5 + (c.prestige / 100) * 1.5);
    pool.splice(pool.indexOf(club), 1);
    const strength = clubStrength(state.world, club.id);
    const league = world.league(clubLeagueId(state.world, club.id));
    const role = projectedRole(rating, strength, player.age);
    const standing = rating - strength + ageStandingAdjustment(player.age);
    out.push({
      clubId: club.id,
      clubName: club.name,
      leagueId: league.id,
      leagueName: league.name,
      leagueTier: league.tier,
      fee: 0,
      wage: Math.round(state.wage * 0.9),
      contractYears: 1,
      loan: true,
      role,
      projectedMinutes: Math.round(clamp(shareForStanding(standing), 0, 1) * 3420),
      projectionConfidence: 'firm',
    });
  }
  return out;
}

/**
 * Would the current club offer a new deal, and for how long?
 *
 * Contract length is drawn rather than fixed. Fixed lengths synchronise every
 * player's expiry onto the same seasons, which makes careers end in clusters
 * instead of spread across a career.
 */
export function wouldRenew(state: CareerState): boolean {
  const strength = clubStrength(state.world, state.clubId);
  const rating = selectionRating(state.player.attributes, state.player.position);
  const standing = rating - strength + ageStandingAdjustment(state.player.age);
  const affection = state.clubStandings.find((c) => c.clubId === state.clubId)?.standing ?? 20;
  if (state.barrenSeasons >= 3) return false;
  const patience = state.player.age <= 21 ? 6 : state.player.age <= 24 ? 3 : 0;
  return !(standing < -8 - patience && affection < 65);
}

export function renewalOffer(rng: Rng, state: CareerState, world: World): TransferOffer | null {
  if (!wouldRenew(state)) return null;
  const club = world.club(state.clubId);
  const strength = clubStrength(state.world, state.clubId);
  const league = world.league(clubLeagueId(state.world, state.clubId));
  const rating = selectionRating(state.player.attributes, state.player.position);
  const standing = rating - strength + ageStandingAdjustment(state.player.age);
  const role = projectedRole(rating, strength, state.player.age);
  return {
    clubId: club.id,
    clubName: club.name,
    leagueId: league.id,
    leagueName: league.name,
    leagueTier: league.tier,
    fee: 0,
    wage: computeWage({
      ovr: state.player.ovr,
      wageBudget: club.wageBudget,
      reputation: state.player.reputation,
      age: state.player.age,
      role,
    }),
    contractYears:
      state.player.age >= 33
        ? 1
        : state.player.age >= 30
          ? rng.int(1, 2)
          : state.player.age >= 26
            ? rng.int(2, 4)
            : rng.int(2, 5),
    loan: false,
    role,
    projectedMinutes: Math.round(clamp(shareForStanding(standing), 0, 1) * 3420),
    projectionConfidence: 'firm',
  };
}

export function describeOffer(offer: TransferOffer): string {
  const money = offer.wage >= 1_000_000 ? `${(offer.wage / MILLION).toFixed(1)}m` : `${Math.round(offer.wage / 1000)}k`;
  return `${offer.clubName} (${offer.leagueName}) — ${ROLE_LABELS[offer.role]}, ${money}/yr`;
}

/** Average squad strength of a club's current division. */
export function currentLeagueAverage(world: World, state: CareerState, clubId: string): number {
  return leagueAverageStrength(world, state.world, clubLeagueId(state.world, clubId));
}
