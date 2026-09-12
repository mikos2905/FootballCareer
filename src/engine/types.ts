/** Core state model. Every dimension in the brief is tracked separately — none of
 *  this collapses into a single score until the ending is computed. */

export type AttributeKey =
  | 'pace'
  | 'shooting'
  | 'passing'
  | 'dribbling'
  | 'defending'
  | 'physical'
  | 'flair'
  | 'weakFoot';

/** Fixed iteration order. The RNG stream depends on it — never reorder. */
export const ATTRIBUTE_KEYS: readonly AttributeKey[] = [
  'pace',
  'shooting',
  'passing',
  'dribbling',
  'defending',
  'physical',
  'flair',
  'weakFoot',
] as const;

export type Attributes = Record<AttributeKey, number>;

export type PositionId =
  | 'GK'
  | 'LB'
  | 'CB'
  | 'RB'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LM'
  | 'RM'
  | 'LW'
  | 'RW'
  | 'ST';

export type Foot = 'left' | 'right';

export type Cadence = 'full' | 'standard' | 'express';

// ---------------------------------------------------------------------------
// World data (shape only — the values live in src/data as JSON)
// ---------------------------------------------------------------------------

export type ContinentalTier = 'elite' | 'secondary' | 'none';

export interface League {
  id: string;
  name: string;
  country: string;
  /** 1 = top flight of its country. */
  tier: number;
  /** 0-100. How hard it is to perform in. Suppresses output, raises development. */
  strength: number;
  /** 0-100. Visibility. Drives market value, national-team notice and wages. */
  prestige: number;
  /** Which continental competition the top of this league qualifies for. */
  continental: ContinentalTier;
  /** Confederation key, used to route clubs into the right continental cups. */
  confederation: string;
  /** Domestic cup competition ids this league's clubs enter. */
  domesticCups: string[];
}

export interface Club {
  id: string;
  name: string;
  leagueId: string;
  country: string;
  /** 0-100 playing strength. Drives league finish and therefore trophies. */
  strength: number;
  /** 0-100. Drives wages offered, transfer pull and market value uplift. */
  prestige: number;
  /** Relative wage budget, 0-100. */
  wageBudget: number;
  /** Club id of the derby opponent, if any. */
  rivalId: string | null;
}

export type CompetitionKind = 'league' | 'domestic-cup' | 'continental' | 'international';

export interface Competition {
  id: string;
  name: string;
  kind: CompetitionKind;
  /** 0-100. Weight in the trophy cabinet and the career score. */
  prestige: number;
  confederation?: string;
}

export interface WorldData {
  leagues: League[];
  clubs: Club[];
  competitions: Competition[];
  nations: Nation[];
}

export interface Nation {
  id: string;
  name: string;
  /** 0-100 national-team strength; drives tournament outcomes. */
  strength: number;
  confederation: string;
  /** League ids that consider this nationality "home" when making first offers. */
  homeLeagueIds: string[];
  /** Nations a player of this nationality may also be eligible for. */
  alternativeNationIds?: string[];
}

// ---------------------------------------------------------------------------
// Career state
// ---------------------------------------------------------------------------

export interface ClubStanding {
  clubId: string;
  /** 0-100. Rises with service, trophies and loyalty; falls hard when you leave for money. */
  standing: number;
  seasonsServed: number;
  appearances: number;
  goals: number;
  assists: number;
  trophiesWon: number;
  /** Set when the player left this club in a way the fans resented. */
  leftForMoney: boolean;
}

export interface NationalRecord {
  nationId: string | null;
  caps: number;
  goals: number;
  /** 0-100. Standing with the national setup; gates call-ups and captaincy. */
  standing: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  /** Set once the player has committed; switching later is not possible. */
  committed: boolean;
}

export interface Condition {
  /** 0-100. Baseline likelihood of picking up an injury. Partly innate. */
  injuryProneness: number;
  /** 0-100. Accumulated mileage. Never fully recovers; drags the age curve down. */
  wear: number;
  /** -20..+20. Short-term form carried between seasons. */
  form: number;
  /** Weeks lost to injury this season. */
  injuryWeeks: number;
}

export interface TrophyWin {
  competitionId: string;
  competitionName: string;
  season: number;
  year: number;
  clubId: string | null;
  clubName: string | null;
}

export interface SeasonRecord {
  /** 0-based index into the career. */
  season: number;
  year: number;
  age: number;
  clubId: string;
  clubName: string;
  leagueId: string;
  leagueName: string;
  onLoanFrom: string | null;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  averageRating: number;
  leaguePosition: number;
  ovrStart: number;
  ovrEnd: number;
  marketValue: number;
  injuryWeeks: number;
  caps: number;
  internationalGoals: number;
  trophies: TrophyWin[];
}

export interface PlayerState {
  surname: string;
  shirtNumber: number;
  foot: Foot;
  nationId: string;
  position: PositionId;
  age: number;
  attributes: Attributes;
  /** Hidden for the whole run. Revealed only on the end screen. */
  ceiling: Attributes;
  ovr: number;
  marketValue: number;
  /** 0-100. Global fame, distinct from standing at any one club. */
  reputation: number;
}

export interface CareerState {
  seed: number;
  seedLabel: string;
  cadence: Cadence;
  season: number;
  year: number;
  player: PlayerState;
  clubId: string;
  parentClubId: string | null;
  contractYearsRemaining: number;
  wage: number;
  condition: Condition;
  clubStandings: ClubStanding[];
  national: NationalRecord;
  trophies: TrophyWin[];
  seasons: SeasonRecord[];
  decisions: DecisionRecord[];
  /** Consecutive seasons the RNG has been allowed to go badly. Bounded. */
  poorSeasonStreak: number;
  peakOvr: number;
  peakMarketValue: number;
  retired: boolean;
  /** Beats already fired, by beat id, so each scripted beat fires once. */
  firedBeats: string[];
  /** Effects queued to land in a future season — the delayed-consequence machinery. */
  pending: PendingEffect[];
}

export interface PendingEffect {
  id: string;
  /** Career season index at which this lands. */
  dueSeason: number;
  source: string;
  label: string;
  effect: StateDelta;
}

/** A declarative change to career state. Decisions and beats emit these rather
 *  than mutating state directly, which keeps consequences inspectable and
 *  testable — and lets the dominance test read an option's full footprint. */
export interface StateDelta {
  attributes?: Partial<Attributes>;
  ceiling?: Partial<Attributes>;
  reputation?: number;
  marketValue?: number;
  wage?: number;
  form?: number;
  wear?: number;
  injuryProneness?: number;
  clubStanding?: number;
  nationalStanding?: number;
  contractYears?: number;
  /** Multiplier on minutes played next season. 1 = unchanged. */
  minutesFactor?: number;
  /** Multiplier on development rate next season. */
  developmentFactor?: number;
}

export interface DecisionRecord {
  season: number;
  cardId: string;
  optionId: string;
  optionIndex: number;
}

export interface CareerConfig {
  seed: number;
  seedLabel: string;
  cadence: Cadence;
  surname: string;
  shirtNumber: number;
  foot: Foot;
  nationId: string;
  position: PositionId;
  /** Present when the player used "draft your ceiling". Order matters. */
  draftPicks?: DraftPick[];
}

export interface DraftPick {
  archetypeId: string;
  attribute: AttributeKey;
}
