// ========================================
// SPORTS IQ – Data Structures & Config
// v2.2 - With Results Storage System
// ========================================

// ========================================
// GAME RESULTS STORAGE
// Stores resolved game outcomes separately from picks
// ========================================
let GAME_RESULTS = {};

function loadGameResults() {
  const saved = localStorage.getItem('sportsiq_results');
  if (saved) {
    GAME_RESULTS = JSON.parse(saved);
  }
  return GAME_RESULTS;
}

function saveGameResults() {
  localStorage.setItem('sportsiq_results', JSON.stringify(GAME_RESULTS));
}

function storeGameResult(dateStr, pickId, result) {
  if (!GAME_RESULTS[dateStr]) {
    GAME_RESULTS[dateStr] = {};
  }
  GAME_RESULTS[dateStr][pickId] = {
    result: result,
    resolvedAt: new Date().toISOString()
  };
  saveGameResults();
}

function getStoredResult(dateStr, pickId) {
  if (GAME_RESULTS[dateStr] && GAME_RESULTS[dateStr][pickId]) {
    return GAME_RESULTS[dateStr][pickId].result;
  }
  return null;
}

function clearResultsForDate(dateStr) {
  if (GAME_RESULTS[dateStr]) {
    delete GAME_RESULTS[dateStr];
    saveGameResults();
  }
}

// Initialize results on load
loadGameResults();

// ========================================
// SPORTS CONFIG (with themed colors)
// ========================================
const SPORTS = {
  NFL: {
    name: 'NFL',
    icon: '🏈',
    color: '#D50A0A',
    gradient: 'linear-gradient(135deg, #D50A0A 0%, #8B0000 100%)',
    bgTint: 'rgba(213, 10, 10, 0.1)'
  },
  NBA: {
    name: 'NBA',
    icon: '🏀',
    color: '#F58426',
    gradient: 'linear-gradient(135deg, #F58426 0%, #C9712C 100%)',
    bgTint: 'rgba(245, 132, 38, 0.1)'
  },
  MLB: {
    name: 'MLB',
    icon: '⚾',
    color: '#002D72',
    gradient: 'linear-gradient(135deg, #002D72 0%, #001F4D 100%)',
    bgTint: 'rgba(0, 45, 114, 0.15)'
  },
  NHL: {
    name: 'NHL',
    icon: '🏒',
    color: '#0D1B2A',
    gradient: 'linear-gradient(135deg, #1B3A5F 0%, #0D1B2A 100%)',
    bgTint: 'rgba(27, 58, 95, 0.15)'
  },
  CFB: {
    name: 'College FB',
    icon: '🏈',
    color: '#7B2D26',
    gradient: 'linear-gradient(135deg, #7B2D26 0%, #5A1F1A 100%)',
    bgTint: 'rgba(123, 45, 38, 0.1)'
  },
  CBB: {
    name: 'College BB',
    icon: '🏀',
    color: '#FF6B00',
    gradient: 'linear-gradient(135deg, #FF6B00 0%, #CC5500 100%)',
    bgTint: 'rgba(255, 107, 0, 0.1)'
  },
  PROP: {
    name: 'Props',
    icon: '📊',
    color: '#9333EA',
    gradient: 'linear-gradient(135deg, #9333EA 0%, #7928CA 100%)',
    bgTint: 'rgba(147, 51, 234, 0.1)'
  }
};

// ========================================
// TEAM LOGOS/EMOJIS
// ========================================
const TEAM_LOGOS = {
  // NBA Teams
  'Boston Celtics': '☘️',
  'Miami Heat': '🔥',
  'Lakers': '💜',
  'Warriors': '🌉',
  'Bucks': '🦌',
  'Cavaliers': '⚔️',

  // NFL Teams
  'Chiefs': '🔴',
  'Bills': '🦬',
  'Eagles': '🦅',
  '49ers': '⛏️',

  // NHL Teams
  'Oilers': '🛢️',
  'Avalanche': '❄️',

  // College
  'Duke': '😈',
  'North Carolina': '🐏',

  // Player Props
  'Giannis Antetokounmpo': '🦌'
};

// ========================================
// PICK STATUS TYPES
// ========================================
const PICK_STATUS = {
  UNSELECTED: 'unselected',
  SELECTED: 'selected',
  PENDING: 'pending',
  WON: 'won',
  LOST: 'lost',
  PUSH: 'push',
  PASSED: 'passed'  // User intentionally skipped this pick (0 points)
};

// ========================================
// XP & LEVEL CONFIG
// ========================================
const XP_CONFIG = {
  correctPick: 10,
  perfectDay: 50,
  streakBonus: 5,
  h2hWin: 25,
  lockOfDayBonus: 15, // Extra XP if Lock of Day wins
  maxLevel: 25,
  levelThresholds: [
    0,      // Level 1
    100,    // Level 2
    250,    // Level 3
    500,    // Level 4
    850,    // Level 5
    1300,   // Level 6
    1850,   // Level 7
    2500,   // Level 8
    3250,   // Level 9
    4100,   // Level 10
    5100,   // Level 11
    6200,   // Level 12
    7500,   // Level 13
    9000,   // Level 14
    10700,  // Level 15
    12600,  // Level 16
    14700,  // Level 17
    17000,  // Level 18
    19500,  // Level 19
    22200,  // Level 20
    25100,  // Level 21
    28200,  // Level 22
    31500,  // Level 23
    35000,  // Level 24
    40000   // Level 25 (max)
  ]
};

// Level milestone rewards
const LEVEL_REWARDS = {
  1:  { name: "Rookie", icon: "🌱", type: "title" },
  5:  { name: "Bronze Border", icon: "🥉", type: "border" },
  10: { name: "Silver Border", icon: "🥈", type: "border" },
  12: { name: "Hot Streak Badge", icon: "🔥", type: "badge" },
  15: { name: "Gold Border", icon: "🥇", type: "border" },
  18: { name: "Sharp Eye Badge", icon: "🎯", type: "badge" },
  20: { name: "Platinum Border", icon: "💎", type: "border" },
  22: { name: "Elite Title", icon: "⚡", type: "title" },
  25: { name: "Champion Border", icon: "👑", type: "border" }
};

// ========================================
// LEVEL SYSTEM UTILITIES
// Consolidated helper functions for XP/Level calculations
// ========================================
const LevelSystem = {
  /**
   * Get the XP threshold required to reach a specific level
   * @param {number} level - The level (1-25)
   * @returns {number} XP threshold for that level
   */
  getXpForLevel(level) {
    if (level < 1) return 0;
    if (level > XP_CONFIG.maxLevel) return XP_CONFIG.levelThresholds[XP_CONFIG.maxLevel - 1];
    return XP_CONFIG.levelThresholds[level - 1] || 0;
  },

  /**
   * Get the current level based on total XP
   * @param {number} xp - Total XP accumulated
   * @returns {number} Current level (1-25)
   */
  getLevelFromXp(xp) {
    if (xp < 0) return 1;
    for (let i = XP_CONFIG.levelThresholds.length - 1; i >= 0; i--) {
      if (xp >= XP_CONFIG.levelThresholds[i]) {
        return Math.min(i + 1, XP_CONFIG.maxLevel);
      }
    }
    return 1;
  },

  /**
   * Get comprehensive level data for a user
   * @param {number} totalXp - User's total XP
   * @returns {Object} Level data object
   */
  getUserLevelData(totalXp) {
    const level = this.getLevelFromXp(totalXp);
    const isMaxLevel = level >= XP_CONFIG.maxLevel;

    const currentLevelXp = this.getXpForLevel(level);
    const nextLevelXp = isMaxLevel ? currentLevelXp : this.getXpForLevel(level + 1);

    const xpIntoLevel = totalXp - currentLevelXp;
    const xpNeededForNext = nextLevelXp - currentLevelXp;
    const progress = isMaxLevel ? 100 : Math.min(100, (xpIntoLevel / xpNeededForNext) * 100);

    return {
      level,
      totalXp,
      isMaxLevel,
      currentLevelXp,
      nextLevelXp,
      xpIntoLevel,
      xpNeededForNext,
      xpToNextLevel: isMaxLevel ? 0 : nextLevelXp - totalXp,
      progress: Math.round(progress * 100) / 100, // Round to 2 decimal places
      progressPercent: `${Math.round(progress)}%`,
      reward: LEVEL_REWARDS[level] || null,
      nextReward: this.getNextReward(level)
    };
  },

  /**
   * Get the next milestone reward after current level
   * @param {number} currentLevel - Current level
   * @returns {Object|null} Next reward or null if none
   */
  getNextReward(currentLevel) {
    const rewardLevels = Object.keys(LEVEL_REWARDS).map(Number).sort((a, b) => a - b);
    const nextRewardLevel = rewardLevels.find(lvl => lvl > currentLevel);
    if (nextRewardLevel) {
      return {
        level: nextRewardLevel,
        ...LEVEL_REWARDS[nextRewardLevel]
      };
    }
    return null;
  },

  /**
   * Get reward for a specific level (if any)
   * @param {number} level - Level to check
   * @returns {Object|null} Reward object or null
   */
  getRewardForLevel(level) {
    return LEVEL_REWARDS[level] || null;
  },

  /**
   * Get all rewards up to and including current level
   * @param {number} currentLevel - Current level
   * @returns {Array} Array of unlocked rewards
   */
  getUnlockedRewards(currentLevel) {
    return Object.entries(LEVEL_REWARDS)
      .filter(([lvl]) => parseInt(lvl) <= currentLevel)
      .map(([lvl, reward]) => ({ level: parseInt(lvl), ...reward }))
      .sort((a, b) => a.level - b.level);
  },

  /**
   * Get all rewards not yet unlocked
   * @param {number} currentLevel - Current level
   * @returns {Array} Array of locked rewards with XP needed
   */
  getLockedRewards(currentLevel, totalXp) {
    return Object.entries(LEVEL_REWARDS)
      .filter(([lvl]) => parseInt(lvl) > currentLevel)
      .map(([lvl, reward]) => ({
        level: parseInt(lvl),
        ...reward,
        xpNeeded: this.getXpForLevel(parseInt(lvl)) - totalXp
      }))
      .sort((a, b) => a.level - b.level);
  },

  /**
   * Calculate XP earned from scoring results
   * @param {Object} scoreResult - Result from scoring engine
   * @param {boolean} lockWon - Whether lock of day won
   * @param {boolean} isPerfect - Whether it was a perfect day
   * @returns {number} Total XP earned
   */
  calculateXpEarned(scoreResult, lockWon = false, isPerfect = false) {
    let xp = scoreResult.basePoints || 0;

    if (lockWon) {
      xp += XP_CONFIG.lockOfDayBonus;
    }

    if (isPerfect) {
      xp += XP_CONFIG.perfectDay;
    }

    return xp;
  },

  /**
   * Check if user leveled up
   * @param {number} oldXp - XP before earning
   * @param {number} newXp - XP after earning
   * @returns {Object} Level up info
   */
  checkLevelUp(oldXp, newXp) {
    const oldLevel = this.getLevelFromXp(oldXp);
    const newLevel = this.getLevelFromXp(newXp);
    const leveledUp = newLevel > oldLevel;

    return {
      leveledUp,
      oldLevel,
      newLevel,
      levelsGained: newLevel - oldLevel,
      newReward: leveledUp ? LEVEL_REWARDS[newLevel] || null : null
    };
  },

  /**
   * Get level tier name
   * @param {number} level - Level to check
   * @returns {string} Tier name
   */
  getLevelTier(level) {
    if (level >= 25) return 'Champion';
    if (level >= 20) return 'Platinum';
    if (level >= 15) return 'Gold';
    if (level >= 10) return 'Silver';
    if (level >= 5) return 'Bronze';
    return 'Rookie';
  },

  /**
   * Get level tier color (for UI)
   * @param {number} level - Level to check
   * @returns {string} CSS color value
   */
  getLevelTierColor(level) {
    if (level >= 25) return '#ffd700'; // Gold/Champion
    if (level >= 20) return '#e5e4e2'; // Platinum
    if (level >= 15) return '#ffd700'; // Gold
    if (level >= 10) return '#c0c0c0'; // Silver
    if (level >= 5) return '#cd7f32';  // Bronze
    return '#22c55e'; // Green/Rookie
  },

  /**
   * Format XP for display
   * @param {number} xp - XP value
   * @returns {string} Formatted string
   */
  formatXp(xp) {
    if (xp >= 10000) {
      return `${(xp / 1000).toFixed(1)}K`;
    }
    return xp.toLocaleString();
  },

  // Config accessors
  get maxLevel() {
    return XP_CONFIG.maxLevel;
  },

  get xpConfig() {
    return XP_CONFIG;
  },

  get rewards() {
    return LEVEL_REWARDS;
  }
};

// ========================================
// COIN REWARDS
// ========================================
const COIN_CONFIG = {
  correctPick: 5,
  perfectDay: 100,
  threePlusStreak: 25,
  fivePlusStreak: 50,
  sevenPlusStreak: 100,
  h2hWin: 50,
  lockOfDayBonus: 25 // Extra coins if Lock of Day wins
};

// ========================================
// DAILY CHALLENGES
// ========================================
const DAILY_CHALLENGES = [
  { id: 'sweep',        name: 'Clean Sweep',  desc: 'Get 7/7 correct',                icon: '🧹', xp: 75,  coins: 50 },
  { id: 'lock_win',     name: 'Lock It In',   desc: 'Win your Lock of the Day',       icon: '🔐', xp: 30,  coins: 25 },
  { id: 'no_pass',      name: 'All In',       desc: 'Submit without using PASS',       icon: '🎰', xp: 25,  coins: 20 },
  { id: 'streak_3',     name: 'Hot Hand',     desc: 'Hit 3+ picks in a row',           icon: '✋', xp: 20,  coins: 15 },
  { id: 'five_correct', name: 'High Five',    desc: 'Get at least 5/7 correct',        icon: '🖐️', xp: 20,  coins: 15 },
  { id: 'underdog',     name: 'Underdog Day', desc: 'Win 3+ spread picks',             icon: '🐕', xp: 30,  coins: 25 },
  { id: 'multi_sport',  name: 'Well Rounded', desc: 'Get correct picks in 2+ sports',  icon: '🌐', xp: 25,  coins: 20 }
];

function getDailyChallenges(dateStr) {
  const seed = dateStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const shuffled = [...DAILY_CHALLENGES].sort((a, b) => {
    const valA = (seed * 31 + a.id.charCodeAt(0) * 17) % 97;
    const valB = (seed * 31 + b.id.charCodeAt(0) * 17) % 97;
    return valA - valB;
  });
  return shuffled.slice(0, 3);
}

// ========================================
// BADGES (Expanded)
// ========================================
const BADGES = {
  // Getting Started
  first_pick: { id: 'first_pick', name: 'First Pick', desc: 'Make your first pick', icon: '🎯', category: 'starter' },
  first_card: { id: 'first_card', name: 'Card Submitted', desc: 'Submit your first daily card', icon: '📝', category: 'starter' },
  first_win: { id: 'first_win', name: 'Winner!', desc: 'Get your first correct pick', icon: '✅', category: 'starter' },

  // Perfect Days
  perfect_day: { id: 'perfect_day', name: 'Perfect Card', desc: 'Go 7/7 on a daily card', icon: '💯', category: 'achievement' },
  perfect_three: { id: 'perfect_three', name: 'Hat Trick', desc: '3 perfect cards', icon: '🎩', category: 'achievement' },
  perfect_ten: { id: 'perfect_ten', name: 'Perfectionist', desc: '10 perfect cards', icon: '🏆', category: 'achievement' },

  // Streaks
  three_streak: { id: 'three_streak', name: 'Hot Streak', desc: '3 correct picks in a row', icon: '🔥', category: 'streak' },
  five_streak: { id: 'five_streak', name: 'On Fire', desc: '5 correct picks in a row', icon: '🔥🔥', category: 'streak' },
  ten_streak: { id: 'ten_streak', name: 'Unstoppable', desc: '10 correct picks in a row', icon: '🔥🔥🔥', category: 'streak' },

  // Lock of Day
  lock_master: { id: 'lock_master', name: 'Lock Master', desc: 'Win 10 Lock of the Day picks', icon: '🔒', category: 'achievement' },

  // Dedication
  week_warrior: { id: 'week_warrior', name: 'Week Warrior', desc: 'Play 7 days in a row', icon: '📅', category: 'dedication' },
  daily_grinder: { id: 'daily_grinder', name: 'Daily Grinder', desc: 'Play 30 days total', icon: '💪', category: 'dedication' },
  century: { id: 'century', name: 'Century Club', desc: '100 correct picks', icon: '💯', category: 'dedication' },

  // Sport Specialists
  nba_specialist: { id: 'nba_specialist', name: 'NBA Specialist', desc: '50 correct NBA picks', icon: '🏀', category: 'specialist' },
  nfl_specialist: { id: 'nfl_specialist', name: 'NFL Specialist', desc: '50 correct NFL picks', icon: '🏈', category: 'specialist' },
  nhl_specialist: { id: 'nhl_specialist', name: 'NHL Specialist', desc: '50 correct NHL picks', icon: '🏒', category: 'specialist' },
  mlb_specialist: { id: 'mlb_specialist', name: 'MLB Specialist', desc: '50 correct MLB picks', icon: '⚾', category: 'specialist' },
  prop_master: { id: 'prop_master', name: 'Prop Master', desc: '25 correct prop picks', icon: '📊', category: 'specialist' },
  spread_king: { id: 'spread_king', name: 'Spread King', desc: '50 spread wins', icon: '👑', category: 'specialist' },

  // Levels
  level_5: { id: 'level_5', name: 'Rising Star', desc: 'Reach Level 5', icon: '⭐', category: 'level' },
  level_10: { id: 'level_10', name: 'All-Star', desc: 'Reach Level 10', icon: '🌟', category: 'level' },
  level_15: { id: 'level_15', name: 'Legend', desc: 'Reach Level 15', icon: '🏅', category: 'level' },

  // Head-to-Head
  h2h_first: { id: 'h2h_first', name: 'Challenger', desc: 'Win your first H2H', icon: '⚔️', category: 'h2h' },
  h2h_five: { id: 'h2h_five', name: 'Duelist', desc: 'Win 5 H2H matches', icon: '🗡️', category: 'h2h' },
  h2h_twenty: { id: 'h2h_twenty', name: 'Champion', desc: 'Win 20 H2H matches', icon: '🏆', category: 'h2h' }
};

// ========================================
// DEFAULT USER STATE
// ========================================
function getDefaultUserState() {
  return {
    // Identity
    userId: 'user_' + Math.random().toString(36).substr(2, 9),
    username: 'Player',
    joinDate: new Date().toISOString(),

    // Progression
    level: 1,
    xp: 0,
    coins: 0,

    // Stats
    stats: {
      allTime: {
        totalPicks: 0,
        correctPicks: 0,
        daysPlayed: 0,
        perfectDays: 0,
        currentPickStreak: 0,
        bestPickStreak: 0,
        currentDayStreak: 0,
        bestDayStreak: 0,
        lockOfDayWins: 0,
        bestDailyScore: 0,
        challengesCompleted: 0,
        bySport: {},
        byMarket: {}
      },
      weekly: {
        weekStart: getWeekStart(),
        picks: 0,
        correct: 0,
        perfectDays: 0
      },
      monthly: {
        month: getCurrentMonth(),
        picks: 0,
        correct: 0,
        perfectDays: 0
      }
    },

    // Today's Card
    today: {
      date: getTodayString(),
      picks: [], // Array of { choice: 'A'|'B'|null, status: PICK_STATUS, isLockOfDay: boolean }
      lockOfDayIndex: null, // Index of the Lock of the Day pick
      submitted: false,
      submittedAt: null,
      graded: false,
      gradedAt: null,
      score: null,
      challenges: [] // Array of { id, completed }
    },

    // History
    history: [],

    // Badges
    badges: [],

    // Friends
    friends: [],
    friendRequests: [],

    // Head-to-Head
    h2h: {
      wins: 0,
      losses: 0,
      active: [],
      history: []
    },

    // Leagues
    leagues: [],

    // Settings
    settings: {
      notifications: true,
      sound: true
    }
  };
}

// ========================================
// DAILY SLATE STRUCTURE
// ========================================
const DAILY_SLATES = {
  '2026-02-02': {
    id: 'slate_20260202',
    date: '2026-02-02',
    picks: [
      {
        id: 1,
        sport: 'NBA',
        matchup: {
          away: 'Boston Celtics',
          home: 'Miami Heat',
          awayLogo: '☘️',
          homeLogo: '🔥'
        },
        gameTime: '2026-02-02T19:30:00-05:00',
        market: 'spread',
        marketDetail: 'Celtics -6.5',
        optionA: { label: 'Celtics -6.5', short: 'BOS', logo: '☘️' },
        optionB: { label: 'Heat +6.5', short: 'MIA', logo: '🔥' },
        result: null
      },
      {
        id: 2,
        sport: 'NBA',
        matchup: {
          away: 'Lakers',
          home: 'Warriors',
          awayLogo: '💜',
          homeLogo: '🌉'
        },
        gameTime: '2026-02-02T22:00:00-05:00',
        market: 'total',
        marketDetail: 'O/U 228.5',
        optionA: { label: 'Over 228.5', short: 'OVER', logo: '📈' },
        optionB: { label: 'Under 228.5', short: 'UNDER', logo: '📉' },
        result: null
      },
      {
        id: 3,
        sport: 'NFL',
        matchup: {
          away: 'Chiefs',
          home: 'Bills',
          awayLogo: '🔴',
          homeLogo: '🦬'
        },
        gameTime: '2026-02-02T18:30:00-05:00',
        market: 'spread',
        marketDetail: 'Chiefs -2.5',
        optionA: { label: 'Chiefs -2.5', short: 'KC', logo: '🔴' },
        optionB: { label: 'Bills +2.5', short: 'BUF', logo: '🦬' },
        result: null
      },
      {
        id: 4,
        sport: 'NFL',
        matchup: {
          away: 'Eagles',
          home: '49ers',
          awayLogo: '🦅',
          homeLogo: '⛏️'
        },
        gameTime: '2026-02-02T15:00:00-05:00',
        market: 'moneyline',
        marketDetail: 'Winner',
        optionA: { label: 'Eagles ML', short: 'PHI', logo: '🦅' },
        optionB: { label: '49ers ML', short: 'SF', logo: '⛏️' },
        result: null
      },
      {
        id: 5,
        sport: 'PROP',
        matchup: {
          away: 'Giannis Antetokounmpo',
          home: 'vs Cavaliers',
          awayLogo: '🦌',
          homeLogo: '⚔️'
        },
        gameTime: '2026-02-02T19:00:00-05:00',
        market: 'player_prop',
        marketDetail: 'Points O/U 32.5',
        optionA: { label: 'Over 32.5 pts', short: 'OVER', logo: '📈' },
        optionB: { label: 'Under 32.5 pts', short: 'UNDER', logo: '📉' },
        result: null
      },
      {
        id: 6,
        sport: 'NHL',
        matchup: {
          away: 'Oilers',
          home: 'Avalanche',
          awayLogo: '🛢️',
          homeLogo: '❄️'
        },
        gameTime: '2026-02-02T21:00:00-05:00',
        market: 'total',
        marketDetail: 'O/U 6.5 goals',
        optionA: { label: 'Over 6.5', short: 'OVER', logo: '📈' },
        optionB: { label: 'Under 6.5', short: 'UNDER', logo: '📉' },
        result: null
      },
      {
        id: 7,
        sport: 'CBB',
        matchup: {
          away: 'Duke',
          home: 'North Carolina',
          awayLogo: '😈',
          homeLogo: '🐏'
        },
        gameTime: '2026-02-02T21:00:00-05:00',
        market: 'spread',
        marketDetail: 'Duke +3.5',
        optionA: { label: 'Duke +3.5', short: 'DUKE', logo: '😈' },
        optionB: { label: 'UNC -3.5', short: 'UNC', logo: '🐏' },
        result: null
      }
    ]
  }
};

// ========================================
// HEAD-TO-HEAD CHALLENGE STRUCTURE
// ========================================
function createH2HChallenge(challengerId, opponentId, slate) {
  return {
    id: 'h2h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    createdAt: new Date().toISOString(),
    status: 'pending_accept',
    challengerId: challengerId,
    opponentId: opponentId,
    slateId: slate.id,
    slateDate: slate.date,
    picks: slate.picks.map(p => ({
      pickId: p.id,
      gameTime: p.gameTime,
      result: null
    })),
    challengerPicks: [],
    opponentPicks: [],
    challengerSubmitted: false,
    opponentSubmitted: false,
    winner: null,
    challengerScore: null,
    opponentScore: null
  };
}

// ========================================
// MOCK DATA - FRIENDS & LEADERBOARD
// ========================================
const MOCK_USERS = {
  'user_sharp': { id: 'user_sharp', username: 'SharpShooter', level: 12, avatar: '🎯' },
  'user_lock': { id: 'user_lock', username: 'LockKing', level: 10, avatar: '🔒' },
  'user_prop': { id: 'user_prop', username: 'PropMaster', level: 9, avatar: '📊' },
  'user_grid': { id: 'user_grid', username: 'GridironGuru', level: 8, avatar: '🏈' },
  'user_court': { id: 'user_court', username: 'CourtVision', level: 7, avatar: '🏀' }
};

const MOCK_LEADERBOARD = {
  daily: [
    { rank: 1, id: 'user_sharp', name: 'SharpShooter', score: 7, accuracy: 100, streak: 7 },
    { rank: 2, id: 'user_lock', name: 'LockKing', score: 6, accuracy: 86, streak: 4 },
    { rank: 3, id: 'user_prop', name: 'PropMaster', score: 6, accuracy: 86, streak: 3 },
    { rank: 4, id: 'user_grid', name: 'GridironGuru', score: 5, accuracy: 71, streak: 2 },
    { rank: 5, id: 'user_court', name: 'CourtVision', score: 5, accuracy: 71, streak: 1 }
  ],
  weekly: [
    { rank: 1, id: 'user_sharp', name: 'SharpShooter', score: 47, accuracy: 96, streak: 12 },
    { rank: 2, id: 'user_lock', name: 'LockKing', score: 45, accuracy: 92, streak: 8 },
    { rank: 3, id: 'user_prop', name: 'PropMaster', score: 44, accuracy: 90, streak: 5 },
    { rank: 4, id: 'user_grid', name: 'GridironGuru', score: 42, accuracy: 88, streak: 4 },
    { rank: 5, id: 'user_court', name: 'CourtVision', score: 41, accuracy: 85, streak: 3 }
  ],
  monthly: [
    { rank: 1, id: 'user_sharp', name: 'SharpShooter', score: 185, accuracy: 95, streak: 15 },
    { rank: 2, id: 'user_lock', name: 'LockKing', score: 178, accuracy: 91, streak: 12 },
    { rank: 3, id: 'user_prop', name: 'PropMaster', score: 172, accuracy: 88, streak: 10 },
    { rank: 4, id: 'user_grid', name: 'GridironGuru', score: 165, accuracy: 85, streak: 8 },
    { rank: 5, id: 'user_court', name: 'CourtVision', score: 160, accuracy: 82, streak: 6 }
  ],
  allTime: [
    { rank: 1, id: 'user_sharp', name: 'SharpShooter', score: 1250, accuracy: 94, streak: 23 },
    { rank: 2, id: 'user_lock', name: 'LockKing', score: 1180, accuracy: 91, streak: 18 },
    { rank: 3, id: 'user_prop', name: 'PropMaster', score: 1120, accuracy: 89, streak: 15 },
    { rank: 4, id: 'user_grid', name: 'GridironGuru', score: 980, accuracy: 86, streak: 12 },
    { rank: 5, id: 'user_court', name: 'CourtVision', score: 920, accuracy: 84, streak: 10 }
  ]
};

// ========================================
// HELPER FUNCTIONS
// ========================================
function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function getTomorrowString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

function formatDateForESPN(dateStr) {
  return dateStr.replace(/-/g, '');
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff)).toISOString().split('T')[0];
}

// Legacy function aliases (for backward compatibility)
// Prefer using LevelSystem.getXpForLevel() and LevelSystem.getLevelFromXp()
function getXpForLevel(level) {
  return LevelSystem.getXpForLevel(level);
}

function getLevelFromXp(xp) {
  return LevelSystem.getLevelFromXp(xp);
}

// Convenience function to get full level data
function getUserLevelData(totalXp) {
  return LevelSystem.getUserLevelData(totalXp);
}

function getDailySlate(dateStr) {
  return DAILY_SLATES[dateStr] || generateDefaultSlate(dateStr);
}

function generateDefaultSlate(dateStr) {
  const base = JSON.parse(JSON.stringify(DAILY_SLATES['2026-02-02']));
  base.id = 'slate_' + dateStr.replace(/-/g, '');
  base.date = dateStr;
  return base;
}

function isGameFinished(gameTime) {
  const gameDate = new Date(gameTime);
  const now = new Date();
  const gameEndEstimate = new Date(gameDate.getTime() + 3 * 60 * 60 * 1000);
  return now >= gameEndEstimate;
}

function formatGameTime(gameTime) {
  const date = new Date(gameTime);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function generateShareCode() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

function getTeamLogo(teamName) {
  return TEAM_LOGOS[teamName] || '🏆';
}
