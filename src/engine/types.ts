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

/** Fixed iteration order. Draw order depends on it — never reorder. */
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

/** Attributes are 1-99 integers. OVR is derived from them and never stored as truth. */
export type Attributes = Record<AttributeKey, number>;

export type PositionId =
  | 'GK'
  | 'RB'
  | 'LB'
  | 'CB'
  | 'DM'
  | 'CM'
  | 'AM'
  | 'ENG'
  | 'RW'
  | 'LW'
  | 'SS'
  | 'ST';

export type Foot = 'left' | 'right';

export type Cadence = 'full' | 'standard' | 'express';

export const MIN_AGE = 16;
export const MAX_AGE = 40;

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
  /**
   * A multiplier, roughly 0.55 for a fourth tier up to 1.0 for the strongest
   * league. Scales both difficulty (output is suppressed) and visibility
   * (market value, national-team notice).
   */
  strength: number;
  /** 1-99. Visibility and pull. */
  prestige: number;
  continental: ContinentalTier;
  confederation: string;
  domesticCups: string[];
  /** Clubs promoted into the league above, if there is one. */
  promotionSpots: number;
  /** Clubs relegated into the league below, if there is one. */
  relegationSpots: number;
}

export interface Club {
  id: string;
  name: string;
  /** Starting league. Live league membership lives in WorldState, not here. */
  leagueId: string;
  country: string;
  /** 1-99. How good the squad is. Drifts over a career. */
  strength: number;
  /**
   * 1-99. How attractive the club is, which is not the same thing. A fallen
   * giant has high prestige and mediocre strength, and that gap is exploitable.
   */
  prestige: number;
  wageBudget: number;
  rivalId: string | null;
}

export type CompetitionKind = 'league' | 'domestic-cup' | 'continental' | 'international';

export interface Competition {
  id: string;
  name: string;
  kind: CompetitionKind;
  prestige: number;
  confederation?: string;
}

export interface Nation {
  id: string;
  name: string;
  /** 1-99 national-team strength. */
  strength: number;
  confederation: string;
  homeLeagueIds: string[];
  alternativeNationIds?: string[];
}

export interface WorldData {
  leagues: League[];
  clubs: Club[];
  competitions: Competition[];
  nations: Nation[];
}

// ---------------------------------------------------------------------------
// Live world state — clubs drift and move between divisions over a career
// ---------------------------------------------------------------------------

export interface ClubState {
  clubId: string;
  /** Current division. Changes with promotion and relegation. */
  leagueId: string;
  /** Current squad strength, 1-99. Drifts season to season around prestige. */
  strength: number;
  /** Where they finished last season, for continental qualification. */
  lastPosition: number;
  /** Set when they won their confederation's elite cup last season. */
  continentalHolder: boolean;
}

export interface WorldState {
  season: number;
  clubs: Record<string, ClubState>;
}

// ---------------------------------------------------------------------------
// Career state
// ---------------------------------------------------------------------------

export interface ClubStanding {
  clubId: string;
  /** 1-99. Rises with service, trophies and loyalty; falls hard on a move for money. */
  standing: number;
  seasonsServed: number;
  appearances: number;
  goals: number;
  assists: number;
  trophiesWon: number;
  leftForMoney: boolean;
}

export interface NationalRecord {
  nationId: string | null;
  caps: number;
  goals: number;
  standing: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  bestFinish: string | null;
  committed: boolean;
}

export type InjurySeverity = 'knock' | 'minor' | 'moderate' | 'serious' | 'severe';

export interface Injury {
  season: number;
  age: number;
  severity: InjurySeverity;
  label: string;
  matchesMissed: number;
  /** Attribute points temporarily suppressed for the season. */
  suppression: number;
  /** Permanent damage, if any. Rare, and only from the worst injuries. */
  permanent: Partial<Attributes> | null;
  /** Set when this injury ended the career outright. */
  careerEnding: boolean;
}

export interface Condition {
  /** 1-99. Innate fragility. */
  injuryProneness: number;
  /** 0-100 accumulated mileage. Never fully comes off. */
  wear: number;
  /** -20..+20 short-term form carried between seasons. */
  form: number;
  /** -100..100. How the manager rates him. Moves minutes directly. */
  managerRelationship: number;
}

export interface TrophyWin {
  competitionId: string;
  competitionName: string;
  season: number;
  year: number;
  clubId: string | null;
  clubName: string | null;
}

export type SquadRole = 'star' | 'starter' | 'rotation' | 'squad' | 'fringe';

/** Goalkeeper output. Kept separate because goals and assists are meaningless here. */
export interface KeeperRecord {
  cleanSheets: number;
  goalsConceded: number;
  saves: number;
  shotsFaced: number;
  savePercentage: number;
}

export interface SeasonRecord {
  season: number;
  year: number;
  age: number;
  clubId: string;
  clubName: string;
  leagueId: string;
  leagueName: string;
  leagueTier: number;
  onLoanFrom: string | null;
  squadRole: SquadRole;
  starts: number;
  substituteAppearances: number;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  averageRating: number;
  leaguePosition: number;
  ovrStart: number;
  ovrEnd: number;
  marketValue: number;
  injuries: Injury[];
  matchesMissed: number;
  caps: number;
  internationalGoals: number;
  keeper: KeeperRecord | null;
  trophies: TrophyWin[];
}

export interface PlayerState {
  surname: string;
  shirtNumber: number;
  foot: Foot;
  nationId: string;
  position: PositionId;
  age: number;
  /** Working values, kept as floats between seasons and rounded for display. */
  attributes: Attributes;
  /** Hidden for the whole run. Revealed only on the end screen. */
  ceiling: Attributes;
  /** Hidden. Position base jittered by seed, so two strikers age differently. */
  peakAge: number;
  ovr: number;
  marketValue: number;
  /** 1-99 global fame, distinct from standing at any one club. */
  reputation: number;
}

export type CareerEndReason = 'retired' | 'forced-age' | 'attrition' | 'injury';

export interface CareerState {
  seed: number;
  seedLabel: string;
  cadence: Cadence;
  season: number;
  year: number;
  player: PlayerState;
  world: WorldState;
  clubId: string;
  parentClubId: string | null;
  contractYearsRemaining: number;
  wage: number;
  condition: Condition;
  /** Attribute suppression carried into the coming season from injury. */
  suppression: number;
  clubStandings: ClubStanding[];
  national: NationalRecord;
  trophies: TrophyWin[];
  injuries: Injury[];
  seasons: SeasonRecord[];
  decisions: DecisionRecord[];
  /** Consecutive seasons of almost no football. Three and he is drifting out. */
  barrenSeasons: number;
  peakOvr: number;
  peakMarketValue: number;
  retired: boolean;
  endReason: CareerEndReason | null;
  firedBeats: string[];
  pending: PendingEffect[];
}

export interface PendingEffect {
  id: string;
  dueSeason: number;
  source: string;
  label: string;
  effect: StateDelta;
}

/** A declarative change to career state. Decisions and beats emit these rather
 *  than mutating state, which keeps consequences inspectable and testable. */
export interface StateDelta {
  /** Additive, clamped to the hidden ceiling. */
  attributes?: Partial<Attributes>;
  ceiling?: Partial<Attributes>;
  /** Additive, 1-99. */
  reputation?: number;
  /** Multiplicative. */
  marketValue?: number;
  wage?: number;
  /** Additive. */
  form?: number;
  wear?: number;
  injuryProneness?: number;
  clubStanding?: number;
  nationalStanding?: number;
  managerRelationship?: number;
  /** Absolute. */
  contractYears?: number;
  /** Multipliers applied to the coming season only. */
  minutesFactor?: number;
  developmentFactor?: number;
  injuryRiskFactor?: number;
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
  draftPicks?: DraftPick[];
}

export interface DraftPick {
  archetypeId: string;
  attribute: AttributeKey;
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export interface TransferOffer {
  clubId: string;
  clubName: string;
  leagueId: string;
  leagueName: string;
  leagueTier: number;
  fee: number;
  wage: number;
  contractYears: number;
  loan: boolean;
  role: SquadRole;
  /**
   * What the club says the player will play. Honest but uncertain — clubs
   * change their minds, and the realised figure is drawn separately.
   */
  projectedMinutes: number;
  /** How reliable that projection has proven for clubs like this. */
  projectionConfidence: 'firm' | 'likely' | 'vague';
}
