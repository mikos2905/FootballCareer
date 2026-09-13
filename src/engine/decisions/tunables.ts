/**
 * Every magnitude a decision card can apply, in one place.
 *
 * No card writes a number. Cards reference these names, so retuning the whole
 * decision layer is editing this file, and each card stays readable as design
 * intent rather than a pile of magic constants.
 *
 * Units, so these stay meaningful when phase 2's scales move:
 *   - standing / morale / reputation: points on the 1-99 scale
 *   - wear: points on the 0-100 accumulated-mileage scale
 *   - factors: multipliers where 1 is neutral
 *   - money: multipliers on wage or market value
 *   - seasons: whole seasons
 */
export const TUNABLES = {
  // -- Squad standing, as points added by a live modifier --------------------
  standingCaptain: 2,
  standingManagersMan: 2,
  standingSupportersBacking: 4,
  standingBigFishSmallPond: 4,
  standingOneOfTheirOwn: 4,
  standingRoundedGame: 4,

  // -- Club standing --------------------------------------------------------
  clubStandingLoyaltyBonus: 8,
  clubStandingLoyaltyLarge: 15,
  clubStandingMercenaryPenalty: 22,
  clubStandingAgitationPenalty: 9,
  clubStandingDerbyHero: 28,
  clubStandingCaptaincy: 10,
  clubStandingTestimonial: 14,
  clubStandingSnub: 10,

  // -- Manager relationship -------------------------------------------------
  managerTrustGain: 18,
  managerTrustLarge: 40,
  managerTrustLoss: 26,
  managerTrustCollapse: 38,

  // -- Morale and form ------------------------------------------------------
  moraleBoostSmall: 5,
  moraleBoostLarge: 9,
  moraleHitSmall: 4,
  moraleHitLarge: 8,

  // -- Condition ------------------------------------------------------------
  wearFromPlayingInjured: 12,
  wearFromHardPreSeason: 5,
  wearRelievedByRest: 7,
  injuryPronenessFromPlayingInjured: 6,

  // -- Development ----------------------------------------------------------
  developmentPenaltyBenchSeason: 0.45,
  developmentPenaltyMild: 0.85,
  developmentBonusFocused: 1.32,
  developmentBonusEliteCoaching: 1.15,
  developmentBonusExtraHours: 1.3,

  // -- Playing time ---------------------------------------------------------
  minutesPenaltySlight: 0.7,
  minutesPenaltyReserves: 0.45,
  minutesPenaltyInjured: 0.35,
  minutesPenaltyVeteranRole: 0.75,
  minutesBonusShopWindow: 1.25,
  minutesBonusRegularFootball: 1.35,
  minutesBonusCleanSlate: 1.45,
  minutesBonusFirstChoiceGiant: 1.7,
  minutesPenaltyBenchSeason: 0.52,
  minutesPenaltyFrozenOut: 0.35,
  minutesBonusTrusted: 1.2,
  minutesBonusLoanRegular: 1.45,

  // -- Injury hazard --------------------------------------------------------
  injuryRiskPlayingHurt: 2.1,
  injuryRiskManagedLoad: 0.75,
  injuryRiskRoundedAthlete: 0.78,
  injuryRiskOvertrained: 1.45,
  injuryRiskCarryingWeight: 1.35,

  // -- Money ----------------------------------------------------------------
  wageUpliftModest: 1.15,
  wageUpliftLarge: 1.6,
  wageUpliftGulf: 3.6,
  wageCutLoyalty: 0.88,
  marketValueBumpShopWindow: 1.18,
  marketValueDropStagnation: 0.82,
  marketValueDropForgotten: 0.72,
  marketValueBumpTransferListed: 1.45,
  marketValueBumpBreakthrough: 1.4,

  // -- Reputation and visibility --------------------------------------------
  reputationGainShowcase: 6,
  reputationLossInvisibleLeague: 16,
  reputationGainCaptain: 4,

  // -- National team --------------------------------------------------------
  nationalStandingGain: 14,
  nationalStandingLoss: 18,

  // -- Contract -------------------------------------------------------------
  contractYearsShort: 2,
  contractYearsStandard: 4,
  contractYearsLong: 5,
  contractYearsFinal: 1,

  // -- Probabilities --------------------------------------------------------
  derbyInjuryChance: 0.33,
  derbyHeroChance: 0.45,
  managerSackedChance: 0.45,
  promiseKeptChance: 0.55,
  giantBreakthroughChance: 0.5,
  gulfCallUpSurvivalChance: 0.25,
  captaincyWeighsChance: 0.45,

  // -- Delays ---------------------------------------------------------------
  delayShort: 2,
  delayMedium: 3,
  delayLong: 4,
} as const;

export type TunableKey = keyof typeof TUNABLES;
