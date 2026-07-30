import { describe, expect, it } from 'vitest'
import {
  baselineValue,
  capImprovementForCategory,
  deltaPct,
  levelMultiplier,
  scoreGoalWeek,
  type GoalWeekInput,
} from './growth'

/** Push-ups, the goal the worked example in section 3.3 is written against. */
const PUSHUPS = {
  basePoints: 24,
  // L1 is 15 reps/day, and the section 3.3 table works in weekly totals.
  level1Value: 105,
  metricDirection: 'up',
  goalAgeInWeeks: 8,
} satisfies Partial<GoalWeekInput>

/** Seven verified completions at full trust — "×1.0" in the section 3.3 table. */
const sevenCompletions = [1, 1, 1, 1, 1, 1, 1]

describe('section 3.3 — the example the whole engine exists to satisfy', () => {
  // Danny is strong and improving slowly; Yossi is weak and improving fast.
  // The engine has to pay Yossi more, or it is measuring strength.
  const danny = scoreGoalWeek({
    ...PUSHUPS,
    currentLevelValue: 50,
    personalRecordValue: 50,
    totalValue: 420,
    completionTrustMultipliers: sevenCompletions,
    priorWeekTotals: [350, 350, 280, 245],
  })

  const yossi = scoreGoalWeek({
    ...PUSHUPS,
    currentLevelValue: 10,
    personalRecordValue: 10,
    totalValue: 140,
    completionTrustMultipliers: sevenCompletions,
    priorWeekTotals: [70, 70, 65, 60],
  })

  it('floors the baseline at L1, softening the beginner’s delta', () => {
    expect(danny.baselineValue).toBe(350)
    // Yossi's real peak is 70, but L1 is 105 — without that floor his delta
    // would be 100% and a one-rep move would outscore everyone.
    expect(yossi.baselineValue).toBe(105)
  })

  it('computes the deltas from the document', () => {
    expect(danny.deltaPct).toBeCloseTo(0.2, 5)
    expect(yossi.deltaPct).toBeCloseTo(1 / 3, 5)
  })

  it('pays the improving beginner more improvement points than the improving veteran', () => {
    expect(danny.improvementPoints).toBe(14)
    expect(yossi.improvementPoints).toBe(24)
    expect(yossi.improvementPoints).toBeGreaterThan(danny.improvementPoints)
  })

  it('gives both the same execution points — neither is paid for being strong', () => {
    expect(danny.executionPoints).toBe(168)
    expect(yossi.executionPoints).toBe(168)
  })

  it('totals 182 and 192, and the beginner wins', () => {
    expect(danny.totalPoints).toBe(182)
    expect(yossi.totalPoints).toBe(192)
    expect(yossi.totalPoints).toBeGreaterThan(danny.totalPoints)
  })
})

describe('level multiplier — the "hard for me" penalty (section 4.1.1)', () => {
  it('reproduces the table in the document', () => {
    expect(levelMultiplier(20, 20)).toBeCloseTo(1.0)
    expect(levelMultiplier(18, 20)).toBeCloseTo(0.9)
    expect(levelMultiplier(16, 20)).toBeCloseTo(0.8)
    expect(levelMultiplier(14, 20)).toBeCloseTo(0.7)
  })

  it('floors at 0.6, so performing small always beats not performing', () => {
    expect(levelMultiplier(12, 20)).toBeCloseTo(0.6)
    expect(levelMultiplier(2, 20)).toBeCloseTo(0.6)
  })

  it('never exceeds 1.0 even if the level somehow passed the record', () => {
    expect(levelMultiplier(30, 20)).toBe(1.0)
  })

  it('shrinks execution points in proportion', () => {
    const atRecord = scoreGoalWeek({
      ...PUSHUPS,
      currentLevelValue: 20,
      personalRecordValue: 20,
      totalValue: 140,
      completionTrustMultipliers: [1],
      priorWeekTotals: [140],
    })
    const droppedTwice = scoreGoalWeek({
      ...PUSHUPS,
      currentLevelValue: 16,
      personalRecordValue: 20,
      totalValue: 140,
      completionTrustMultipliers: [1],
      priorWeekTotals: [140],
    })
    expect(atRecord.executionPoints).toBe(24)
    expect(droppedTwice.executionPoints).toBe(19) // 24 × 0.8 = 19.2
  })
})

describe('maintenance points (section 3.2c)', () => {
  const holding = {
    ...PUSHUPS,
    currentLevelValue: 20,
    personalRecordValue: 20,
    completionTrustMultipliers: sevenCompletions,
    priorWeekTotals: [400],
  } satisfies Partial<GoalWeekInput>

  it('pays someone who holds their ceiling instead of letting them earn nothing', () => {
    const result = scoreGoalWeek({ ...holding, totalValue: 400 })
    expect(result.deltaPct).toBe(0)
    expect(result.maintenancePoints).toBe(7) // 24 × 0.3 = 7.2
  })

  it('still pays inside the 5% tolerance band', () => {
    const result = scoreGoalWeek({ ...holding, totalValue: 385 })
    expect(result.maintenancePoints).toBe(7)
  })

  it('stops below the tolerance band', () => {
    const result = scoreGoalWeek({ ...holding, totalValue: 300 })
    expect(result.maintenancePoints).toBe(0)
  })

  it('is withheld from anyone who dropped a level — the second half of the penalty', () => {
    const result = scoreGoalWeek({
      ...holding,
      currentLevelValue: 16,
      personalRecordValue: 20,
      totalValue: 400,
    })
    expect(result.levelMultiplier).toBeCloseTo(0.8)
    expect(result.maintenancePoints).toBe(0)
  })
})

describe('protections (section 10)', () => {
  const base = {
    ...PUSHUPS,
    currentLevelValue: 20,
    personalRecordValue: 20,
    completionTrustMultipliers: [1],
    priorWeekTotals: [200],
  } satisfies Partial<GoalWeekInput>

  it('caps delta at 100% — a ×5 week is an error, not growth', () => {
    const result = scoreGoalWeek({ ...base, totalValue: 2000 })
    expect(result.deltaPct).toBe(1.0)
    expect(result.improvementPoints).toBe(72) // 24 × 3 × 1.0, not × 9
  })

  it('never returns negative points, however badly the week went', () => {
    const result = scoreGoalWeek({ ...base, totalValue: 10, completionTrustMultipliers: [] })
    expect(result.deltaPct).toBeLessThan(0)
    expect(result.improvementPoints).toBe(0)
    expect(result.executionPoints).toBe(0)
    expect(result.totalPoints).toBe(0)
  })

  it('withholds improvement for the first two weeks of a goal', () => {
    const brandNew = scoreGoalWeek({ ...base, totalValue: 400, goalAgeInWeeks: 1 })
    expect(brandNew.deltaPct).toBeGreaterThan(0)
    expect(brandNew.improvementPoints).toBe(0)
    // Execution and the level-up bonus still pay during the warm-up.
    expect(brandNew.executionPoints).toBe(24)

    const settled = scoreGoalWeek({ ...base, totalValue: 400, goalAgeInWeeks: 2 })
    expect(settled.improvementPoints).toBeGreaterThan(0)
  })

  it('takes the baseline from the 4-week peak, not last week, so sandbagging fails', () => {
    // A deliberately weak week does not lower the bar the following week.
    expect(baselineValue([50, 400, 380, 360], 105)).toBe(400)
    // And the window really is four weeks — a fifth is out of scope.
    expect(baselineValue([50, 60, 70, 80, 9999], 105)).toBe(105)
  })

  it('scales a category down proportionally when improvement exceeds 100', () => {
    const capped = capImprovementForCategory([60, 40, 40])
    expect(capped.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100)
    // Ordering is preserved; nothing is zeroed just for being read last.
    expect(capped[0]).toBeGreaterThan(capped[1])
    expect(capped[2]).toBeGreaterThan(0)
  })

  it('leaves a category under the cap untouched', () => {
    expect(capImprovementForCategory([20, 30])).toEqual([20, 30])
  })
})

describe('down-direction goals (screen time, social media)', () => {
  const screenTime = {
    basePoints: 24,
    level1Value: 180,
    metricDirection: 'down',
    currentLevelValue: 180,
    personalRecordValue: 180,
    completionTrustMultipliers: [1],
    goalAgeInWeeks: 8,
  } satisfies Partial<GoalWeekInput>

  it('treats a smaller number as an improvement', () => {
    const result = scoreGoalWeek({ ...screenTime, totalValue: 150, priorWeekTotals: [200] })
    expect(result.deltaPct).toBeCloseTo(0.25, 5) // (200 − 150) / 200
    expect(result.improvementPoints).toBe(18)
  })

  it('treats a larger number as a regression', () => {
    const result = scoreGoalWeek({ ...screenTime, totalValue: 260, priorWeekTotals: [200] })
    expect(result.deltaPct).toBeLessThan(0)
    expect(result.improvementPoints).toBe(0)
  })

  // Regression guard. For a down goal a better level is a smaller number, so
  // the naive current ÷ record reads a regression as > 1 and clamps to a full
  // ×1.0 — exempting exactly the two goals in the library that measure
  // downward from the penalty every other goal carries.
  it('applies the level penalty when the target is loosened back upward', () => {
    expect(levelMultiplier(180, 120, 'down')).toBeCloseTo(2 / 3, 5)
    expect(levelMultiplier(120, 120, 'down')).toBe(1.0)
    // And it still floors at 0.6 rather than collapsing.
    expect(levelMultiplier(600, 120, 'down')).toBeCloseTo(0.6)

    const loosened = scoreGoalWeek({
      ...screenTime,
      currentLevelValue: 180,
      personalRecordValue: 120,
      totalValue: 200,
      priorWeekTotals: [200],
    })
    expect(loosened.levelMultiplier).toBeCloseTo(2 / 3, 5)
    expect(loosened.executionPoints).toBe(16) // 24 × 0.667
    expect(loosened.maintenancePoints).toBe(0) // penalty's second half
  })
})

describe('trust multipliers feed straight into execution (section 5)', () => {
  it('pays a sensor-verified completion 1.2× a self-timed one', () => {
    const sensor = scoreGoalWeek({
      ...PUSHUPS,
      currentLevelValue: 20,
      personalRecordValue: 20,
      totalValue: 100,
      completionTrustMultipliers: [1.2],
      priorWeekTotals: [100],
    })
    const timer = scoreGoalWeek({
      ...PUSHUPS,
      currentLevelValue: 20,
      personalRecordValue: 20,
      totalValue: 100,
      completionTrustMultipliers: [1.0],
      priorWeekTotals: [100],
    })
    expect(sensor.executionPoints).toBe(29) // 24 × 1.2 = 28.8
    expect(timer.executionPoints).toBe(24)
  })
})

describe('level-up bonus (section 3.2d)', () => {
  it('pays only on a new personal record', () => {
    const withRecord = scoreGoalWeek({
      ...PUSHUPS,
      currentLevelValue: 22,
      personalRecordValue: 22,
      totalValue: 100,
      completionTrustMultipliers: [],
      priorWeekTotals: [100],
      setNewPersonalRecord: true,
    })
    expect(withRecord.levelBonusPoints).toBe(12) // 24 × 0.5

    const withoutRecord = scoreGoalWeek({
      ...PUSHUPS,
      currentLevelValue: 20,
      personalRecordValue: 22,
      totalValue: 100,
      completionTrustMultipliers: [],
      priorWeekTotals: [100],
    })
    expect(withoutRecord.levelBonusPoints).toBe(0)
  })
})

describe('delta helpers in isolation', () => {
  it('returns 0 rather than dividing by zero on an empty baseline', () => {
    expect(deltaPct(50, 0, 'up')).toBe(0)
  })
})
