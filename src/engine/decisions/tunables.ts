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
  clubStandingLoyaltyBonus: 11,
  clubStandingLoyaltyLarge: 20,
  clubStandingMercenaryPenalty: 22,
  clubStandingAgitationPenalty: 13,
  clubStandingDerbyHero: 28,
  clubStandingCaptaincy: 10,
  clubStandingTestimonial: 14,
  clubStandingSnub: 13,

  // -- Manager relationship -------------------------------------------------
  managerTrustGain: 18,
  managerTrustLarge: 40,
  managerTrustLoss: 26,
  managerTrustCollapse: 38,

  // -- Morale and form ------------------------------------------------------
  moraleBoostSmall: 5,
  moraleBoostLarge: 12,
  moraleHitSmall: 4,
  moraleHitLarge: 11,

  // -- Condition ------------------------------------------------------------
  wearFromPlayingInjured: 16,
  wearFromHardPreSeason: 5,
  wearRelievedByRest: 7,
  injuryPronenessFromPlayingInjured: 9,

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
  /** Paid for what you play rather than for turning up. */
  wageAppearanceDeal: 1.35,
  wageSecurityDeal: 0.78,
  /** Paying for something out of your own pocket. */
  wageCutSmall: 0.92,
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
  /**
   * Larger moves, for the decisions an international manager actually
   * remembers. Standing gates selection now, not just how many caps follow it,
   * so these are worth caps rather than flavour.
   */
  nationalStandingGainLarge: 24,
  nationalStandingLossLarge: 22,

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

  // -- Ceiling ---------------------------------------------------------------
  ceilingGainCoaching: 6,
  ceilingGainSpecialist: 9,
  ceilingLossNeglect: 6,

  /**
   * Ceiling moves written in OVR rather than in attribute points.
   *
   * `ceiling: { passing: 6 }` on a striker moves his rating by four tenths of a
   * point, because passing is seven per cent of a striker's OVR. These go
   * through ceilingBy(), which spreads them across the attributes the player's
   * position is actually rated on, so the same card means the same thing for a
   * goalkeeper and a winger.
   */
  ceilingOvrSmall: 1.2,
  ceilingOvrLarge: 2.3,
  ceilingOvrLoss: 2.2,
  attributeOvrSmall: 1.2,
  attributeOvrLarge: 2.4,

  // -- Lasting physical cost -------------------------------------------------
  /** Looking after the body while it is still growing, and the reverse. */
  pronenessRelief: 14,
  pronenessLasting: 16,

  // -- Attributes ------------------------------------------------------------
  attributeGainSmall: 3,
  attributeGainLarge: 6,
  attributeLossSmall: 3,
  attributeLossLarge: 6,

  // -- More probabilities ----------------------------------------------------
  breakthroughChance: 0.4,
  gambleLandsChance: 0.5,
  longShotChance: 0.25,
  likelyChance: 0.68,

  // -- Delays ---------------------------------------------------------------
  delayShort: 2,
  delayMedium: 3,
  delayLong: 4,
} as const;

export type TunableKey = keyof typeof TUNABLES;
