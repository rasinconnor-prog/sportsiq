// ========================================
// SPORTS IQ – Scoring Engine v2.0
// Centralized, Unbreakable Scoring Rules
// Supports Classic & Competitive Modes
// ========================================

/**
 * SCORING MODES
 * Enum for available scoring modes
 */
const SCORING_MODE = {
  CLASSIC: 'classic',
  COMPETITIVE: 'competitive'
};

/**
 * SCORING CONSTANTS
 * These values define all point awards in the game.
 * Change these to adjust scoring across the entire app.
 */
const SCORING_RULES = {
  // Base scoring per pick (same for both modes)
  CORRECT_PICK: 10,
  INCORRECT_PICK: 0,
  PUSH: 0,
  PASS: 0,
  CANCELED: 0,  // Treated same as PUSH

  // Bonus scoring (same for both modes)
  PERFECT_CARD_BONUS: 15,      // All picks correct (excluding PASS/PUSH)
  NEAR_PERFECT_BONUS: 5,       // Exactly one miss
  LOCK_OF_DAY_BONUS: 5,        // Lock pick was correct

  // Competitive Mode Only: Lock penalty
  LOCK_OF_DAY_PENALTY: -5,     // Lock pick was wrong (competitive mode only)

  // Minimum picks required for bonuses
  MIN_PICKS_FOR_PERFECT: 1,    // Must have at least 1 graded pick for perfect bonus
  MIN_PICKS_FOR_NEAR_PERFECT: 2 // Must have at least 2 graded picks for near-perfect
};

/**
 * Get lock points based on result and scoring mode
 * @param {string} lockResult - 'won', 'lost', 'push', 'pass', or null
 * @param {string} scoringMode - SCORING_MODE.CLASSIC or SCORING_MODE.COMPETITIVE
 * @returns {number} Points for lock
 */
function getLockPoints(lockResult, scoringMode = SCORING_MODE.CLASSIC) {
  if (lockResult === 'won') {
    return SCORING_RULES.LOCK_OF_DAY_BONUS;
  }
  if (lockResult === 'lost' && scoringMode === SCORING_MODE.COMPETITIVE) {
    return SCORING_RULES.LOCK_OF_DAY_PENALTY;
  }
  return 0; // push, pass, null, or lost in classic mode
}

/**
 * RESULT TYPES
 * Enum for possible pick outcomes
 */
const RESULT_TYPE = {
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  PUSH: 'push',
  PASS: 'pass',
  CANCELED: 'canceled',
  PENDING: 'pending'
};

/**
 * Calculate the daily score for a user's submitted picks.
 *
 * @param {Array} userPicks - Array of user pick objects
 *   Each pick: { choice: 'A'|'B'|'PASS', isLockOfDay: boolean }
 *
 * @param {Array} actualResults - Array of game result objects
 *   Each result: {
 *     correctAnswer: 'A'|'B'|null,  // null = push/canceled
 *     status: 'final'|'canceled'|'push'|'pending',
 *     originalLine: string  // The line at time of submission
 *   }
 *
 * @param {string} scoringMode - SCORING_MODE.CLASSIC or SCORING_MODE.COMPETITIVE
 *   Default: SCORING_MODE.CLASSIC
 *
 * @returns {Object} Score breakdown
 *   {
 *     totalPoints: number,
 *     correctCount: number,
 *     incorrectCount: number,
 *     pushCount: number,
 *     passCount: number,
 *     canceledCount: number,
 *     gradedCount: number,       // Total picks that were graded (not pass/push/canceled)
 *     bonusesApplied: string[],  // List of bonus names applied
 *     bonusPoints: number,       // Total bonus points (can be negative in competitive)
 *     basePoints: number,        // Points before bonuses
 *     isPerfect: boolean,
 *     isNearPerfect: boolean,
 *     lockResult: 'won'|'lost'|'push'|'pass'|null,
 *     lockPoints: number,        // Points from lock (can be negative in competitive)
 *     scoringMode: string,       // Mode used for calculation
 *     pickResults: Array         // Detailed result for each pick
 *   }
 */
function calculateDailyScore(userPicks, actualResults, scoringMode = SCORING_MODE.CLASSIC) {
  // Validate inputs
  if (!Array.isArray(userPicks) || !Array.isArray(actualResults)) {
    return createEmptyScoreResult('Invalid input: picks and results must be arrays');
  }

  if (userPicks.length === 0) {
    return createEmptyScoreResult('No picks submitted');
  }

  if (userPicks.length !== actualResults.length) {
    return createEmptyScoreResult('Mismatch: picks and results arrays must have same length');
  }

  // Initialize counters
  let correctCount = 0;
  let incorrectCount = 0;
  let pushCount = 0;
  let passCount = 0;
  let canceledCount = 0;
  let basePoints = 0;
  let lockIndex = -1;
  let lockResult = null;

  const pickResults = [];

  // Process each pick
  for (let i = 0; i < userPicks.length; i++) {
    const pick = userPicks[i];
    const result = actualResults[i];

    // Find lock of day index
    if (pick.isLockOfDay) {
      lockIndex = i;
    }

    // Determine pick outcome
    const outcome = evaluatePick(pick, result);
    pickResults.push(outcome);

    // Update counters based on outcome
    switch (outcome.resultType) {
      case RESULT_TYPE.CORRECT:
        correctCount++;
        basePoints += SCORING_RULES.CORRECT_PICK;
        break;
      case RESULT_TYPE.INCORRECT:
        incorrectCount++;
        basePoints += SCORING_RULES.INCORRECT_PICK;
        break;
      case RESULT_TYPE.PUSH:
        pushCount++;
        basePoints += SCORING_RULES.PUSH;
        break;
      case RESULT_TYPE.PASS:
        passCount++;
        basePoints += SCORING_RULES.PASS;
        break;
      case RESULT_TYPE.CANCELED:
        canceledCount++;
        basePoints += SCORING_RULES.CANCELED;
        break;
      case RESULT_TYPE.PENDING:
        // Pending picks don't affect score yet
        break;
    }

    // Track lock result
    if (i === lockIndex) {
      if (outcome.resultType === RESULT_TYPE.CORRECT) {
        lockResult = 'won';
      } else if (outcome.resultType === RESULT_TYPE.INCORRECT) {
        lockResult = 'lost';
      } else if (outcome.resultType === RESULT_TYPE.PUSH || outcome.resultType === RESULT_TYPE.CANCELED) {
        lockResult = 'push';
      } else if (outcome.resultType === RESULT_TYPE.PASS) {
        lockResult = 'pass';
      }
    }
  }

  // Calculate graded picks (picks that count toward perfect/near-perfect)
  const gradedCount = correctCount + incorrectCount;
  const nonGradedCount = pushCount + passCount + canceledCount;

  // Determine bonus eligibility
  const bonusesApplied = [];
  let bonusPoints = 0;

  // Perfect Card Bonus: All graded picks correct, must have minimum picks
  const isPerfect = gradedCount >= SCORING_RULES.MIN_PICKS_FOR_PERFECT &&
                    incorrectCount === 0 &&
                    correctCount > 0;

  // Near Perfect Bonus: Exactly one miss, must have minimum picks
  const isNearPerfect = gradedCount >= SCORING_RULES.MIN_PICKS_FOR_NEAR_PERFECT &&
                        incorrectCount === 1 &&
                        correctCount >= 1;

  // Apply Perfect Card Bonus
  if (isPerfect) {
    bonusPoints += SCORING_RULES.PERFECT_CARD_BONUS;
    bonusesApplied.push(`Perfect Card (+${SCORING_RULES.PERFECT_CARD_BONUS})`);
  }
  // Apply Near Perfect Bonus (only if not perfect)
  else if (isNearPerfect) {
    bonusPoints += SCORING_RULES.NEAR_PERFECT_BONUS;
    bonusesApplied.push(`Near Perfect (+${SCORING_RULES.NEAR_PERFECT_BONUS})`);
  }

  // Apply Lock of Day Bonus/Penalty based on scoring mode
  const lockPoints = getLockPoints(lockResult, scoringMode);
  if (lockPoints > 0) {
    bonusPoints += lockPoints;
    bonusesApplied.push(`Lock of Day (+${lockPoints})`);
  } else if (lockPoints < 0) {
    bonusPoints += lockPoints; // Add negative value
    bonusesApplied.push(`Lock of Day (${lockPoints})`);
  }

  // Calculate total (can be negative in competitive mode with lock penalty)
  const totalPoints = Math.max(0, basePoints + bonusPoints); // Floor at 0

  return {
    totalPoints,
    correctCount,
    incorrectCount,
    pushCount,
    passCount,
    canceledCount,
    gradedCount,
    bonusesApplied,
    bonusPoints,
    basePoints,
    isPerfect,
    isNearPerfect,
    lockResult,
    lockPoints,
    lockIndex,
    pickResults,
    scoringMode,
    isValid: true,
    error: null
  };
}

/**
 * Evaluate a single pick against its result
 *
 * @param {Object} pick - User's pick { choice: 'A'|'B'|'PASS', isLockOfDay: boolean }
 * @param {Object} result - Game result { correctAnswer: 'A'|'B'|null, status: string }
 * @returns {Object} Pick evaluation result
 */
function evaluatePick(pick, result) {
  const evaluation = {
    userChoice: pick.choice,
    correctAnswer: result.correctAnswer,
    status: result.status,
    resultType: null,
    points: 0,
    isLockOfDay: pick.isLockOfDay || false
  };

  // Handle PASS
  if (pick.choice === 'PASS' || pick.choice === null) {
    evaluation.resultType = RESULT_TYPE.PASS;
    evaluation.points = SCORING_RULES.PASS;
    return evaluation;
  }

  // Handle canceled games
  if (result.status === 'canceled') {
    evaluation.resultType = RESULT_TYPE.CANCELED;
    evaluation.points = SCORING_RULES.CANCELED;
    return evaluation;
  }

  // Handle push (no winner)
  if (result.status === 'push' || result.correctAnswer === null) {
    evaluation.resultType = RESULT_TYPE.PUSH;
    evaluation.points = SCORING_RULES.PUSH;
    return evaluation;
  }

  // Handle pending games
  if (result.status === 'pending' || result.correctAnswer === undefined) {
    evaluation.resultType = RESULT_TYPE.PENDING;
    evaluation.points = 0;
    return evaluation;
  }

  // Evaluate correct/incorrect
  if (pick.choice === result.correctAnswer) {
    evaluation.resultType = RESULT_TYPE.CORRECT;
    evaluation.points = SCORING_RULES.CORRECT_PICK;
  } else {
    evaluation.resultType = RESULT_TYPE.INCORRECT;
    evaluation.points = SCORING_RULES.INCORRECT_PICK;
  }

  return evaluation;
}

/**
 * Create an empty/error score result
 */
function createEmptyScoreResult(errorMessage = null, scoringMode = SCORING_MODE.CLASSIC) {
  return {
    totalPoints: 0,
    correctCount: 0,
    incorrectCount: 0,
    pushCount: 0,
    passCount: 0,
    canceledCount: 0,
    gradedCount: 0,
    bonusesApplied: [],
    bonusPoints: 0,
    basePoints: 0,
    isPerfect: false,
    isNearPerfect: false,
    lockResult: null,
    lockPoints: 0,
    lockIndex: -1,
    pickResults: [],
    scoringMode,
    isValid: errorMessage === null,
    error: errorMessage
  };
}

/**
 * Convert internal pick status to result format for scoring
 * Helper to bridge game.js pick format to scoring engine format
 *
 * @param {Array} picks - Array from state.today.picks
 * @param {Array} slatePicks - Array from slate.picks (for result info)
 * @returns {Object} { userPicks, actualResults } ready for calculateDailyScore
 */
function preparePicksForScoring(picks, slatePicks) {
  const userPicks = [];
  const actualResults = [];

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    const slatePick = slatePicks[i];

    // Build user pick object
    userPicks.push({
      choice: pick.choice,
      isLockOfDay: pick.isLockOfDay || false
    });

    // Build result object based on pick status
    let correctAnswer = null;
    let status = 'pending';

    if (pick.status === 'won') {
      // User won, so their choice was correct
      correctAnswer = pick.choice;
      status = 'final';
    } else if (pick.status === 'lost') {
      // User lost, so opposite choice was correct
      correctAnswer = pick.choice === 'A' ? 'B' : 'A';
      status = 'final';
    } else if (pick.status === 'push') {
      correctAnswer = null;
      status = 'push';
    } else if (pick.status === 'passed') {
      correctAnswer = null;
      status = 'final';  // PASS is already handled by choice
    } else if (pick.status === 'pending') {
      status = 'pending';
    }

    actualResults.push({
      correctAnswer,
      status,
      originalLine: slatePick?.marketDetail || null
    });
  }

  return { userPicks, actualResults };
}

/**
 * Quick score calculation for display purposes
 * Returns just the total points without full breakdown
 *
 * @param {Array} picks - User picks with status already set
 * @param {number} lockIndex - Index of lock pick (or null)
 * @param {string} scoringMode - SCORING_MODE.CLASSIC or SCORING_MODE.COMPETITIVE
 * @returns {number} Total points
 */
function quickCalculateScore(picks, lockIndex = null, scoringMode = SCORING_MODE.CLASSIC) {
  let points = 0;
  let correct = 0;
  let incorrect = 0;
  let graded = 0;
  let lockResult = null;

  picks.forEach((pick, idx) => {
    if (pick.status === 'won') {
      points += SCORING_RULES.CORRECT_PICK;
      correct++;
      graded++;
      if (idx === lockIndex) lockResult = 'won';
    } else if (pick.status === 'lost') {
      incorrect++;
      graded++;
      if (idx === lockIndex) lockResult = 'lost';
    } else if (pick.status === 'push') {
      if (idx === lockIndex) lockResult = 'push';
    }
    // pass, pending = 0 points
  });

  // Apply bonuses
  if (graded >= SCORING_RULES.MIN_PICKS_FOR_PERFECT && incorrect === 0 && correct > 0) {
    points += SCORING_RULES.PERFECT_CARD_BONUS;
  } else if (graded >= SCORING_RULES.MIN_PICKS_FOR_NEAR_PERFECT && incorrect === 1 && correct >= 1) {
    points += SCORING_RULES.NEAR_PERFECT_BONUS;
  }

  // Apply lock points based on mode
  points += getLockPoints(lockResult, scoringMode);

  return Math.max(0, points); // Floor at 0
}

/**
 * Get maximum possible score for a card
 * Useful for displaying "X / MAX" format
 *
 * @param {number} pickCount - Number of picks on the card
 * @param {boolean} hasLock - Whether user set a lock
 * @returns {number} Maximum possible points
 */
function getMaxPossibleScore(pickCount, hasLock = true) {
  let max = pickCount * SCORING_RULES.CORRECT_PICK;
  max += SCORING_RULES.PERFECT_CARD_BONUS;
  if (hasLock) {
    max += SCORING_RULES.LOCK_OF_DAY_BONUS;
  }
  return max;
}

/**
 * Format score breakdown for display
 *
 * @param {Object} scoreResult - Result from calculateDailyScore
 * @returns {string} Formatted score string
 */
function formatScoreBreakdown(scoreResult) {
  const lines = [];

  lines.push(`Base: ${scoreResult.correctCount} x ${SCORING_RULES.CORRECT_PICK} = ${scoreResult.basePoints} pts`);

  if (scoreResult.bonusesApplied.length > 0) {
    lines.push('Bonuses:');
    scoreResult.bonusesApplied.forEach(bonus => {
      lines.push(`  ${bonus}`);
    });
  }

  lines.push(`Total: ${scoreResult.totalPoints} pts`);

  return lines.join('\n');
}

/**
 * Get scoring rules description for UI display
 * @param {string} scoringMode - SCORING_MODE.CLASSIC or SCORING_MODE.COMPETITIVE
 * @returns {Object} Rules description object
 */
function getScoringRulesDescription(scoringMode = SCORING_MODE.CLASSIC) {
  const isCompetitive = scoringMode === SCORING_MODE.COMPETITIVE;

  return {
    mode: scoringMode,
    modeName: isCompetitive ? 'Competitive' : 'Classic',
    modeDescription: isCompetitive
      ? 'Higher risk, higher reward. Wrong locks cost you points!'
      : 'Standard scoring. No penalties for wrong picks.',
    rules: {
      correctPick: { label: 'Correct Pick', value: `+${SCORING_RULES.CORRECT_PICK}` },
      wrongPick: { label: 'Wrong Pick', value: '0' },
      push: { label: 'Push', value: '0' },
      lockCorrect: { label: 'Lock Correct', value: `+${SCORING_RULES.LOCK_OF_DAY_BONUS}` },
      lockWrong: {
        label: 'Lock Wrong',
        value: isCompetitive ? `${SCORING_RULES.LOCK_OF_DAY_PENALTY}` : '0',
        highlight: isCompetitive
      },
      perfectCard: { label: 'Perfect Card', value: `+${SCORING_RULES.PERFECT_CARD_BONUS}` },
      nearPerfect: { label: 'Near Perfect (4/5)', value: `+${SCORING_RULES.NEAR_PERFECT_BONUS}` }
    }
  };
}

// Export for use in other files (browser global)
if (typeof window !== 'undefined') {
  window.SCORING_MODE = SCORING_MODE;
  window.SCORING_RULES = SCORING_RULES;
  window.RESULT_TYPE = RESULT_TYPE;
  window.calculateDailyScore = calculateDailyScore;
  window.evaluatePick = evaluatePick;
  window.preparePicksForScoring = preparePicksForScoring;
  window.quickCalculateScore = quickCalculateScore;
  window.getMaxPossibleScore = getMaxPossibleScore;
  window.formatScoreBreakdown = formatScoreBreakdown;
  window.getLockPoints = getLockPoints;
  window.getScoringRulesDescription = getScoringRulesDescription;
}
