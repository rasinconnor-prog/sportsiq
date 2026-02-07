// ========================================
// SPORTS IQ – Real Data API Layer v2.0
// 100% Free: ESPN (scores) + TheOddsAPI (lines)
// ========================================

// ========================================
// CONFIGURATION
// ========================================
const API_CONFIG = {
  // TheOddsAPI - Free tier (500 requests/month)
  // Get your free key at: https://the-odds-api.com/
  // Leave as empty string to use ESPN-only mode
  ODDS_API_KEY: '',
  ODDS_API_BASE: 'https://api.the-odds-api.com/v4',

  // ESPN public endpoints (unlimited, no key needed)
  ESPN_BASE: 'https://site.api.espn.com/apis/site/v2/sports',

  // Cache durations (milliseconds)
  CACHE_DURATION: 10 * 60 * 1000,      // 10 minutes for odds
  SCORES_CACHE_DURATION: 60 * 1000,     // 1 minute for live scores
  COMPLETED_CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours for final games

  // Polling intervals
  LIVE_POLL_INTERVAL: 60 * 1000,        // 60 seconds during live games
  IDLE_POLL_INTERVAL: 5 * 60 * 1000,    // 5 minutes when no live games

  // Mode flags (auto-detected)
  DEMO_MODE: false,
  API_AVAILABLE: true,
  USING_CACHED_DATA: false
};

// Sport mappings
const SPORT_API_MAP = {
  'NBA': {
    odds: 'basketball_nba',
    espn: 'basketball/nba',
    name: 'NBA Basketball'
  },
  'NFL': {
    odds: 'americanfootball_nfl',
    espn: 'football/nfl',
    name: 'NFL Football'
  },
  'NHL': {
    odds: 'icehockey_nhl',
    espn: 'hockey/nhl',
    name: 'NHL Hockey'
  },
  'MLB': {
    odds: 'baseball_mlb',
    espn: 'baseball/mlb',
    name: 'MLB Baseball'
  },
  'NCAAB': {
    odds: 'basketball_ncaab',
    espn: 'basketball/mens-college-basketball',
    name: 'College Basketball'
  }
};

// ========================================
// SMART CACHING LAYER
// ========================================

const CacheManager = {
  prefix: 'sportsiq_cache_',

  set(key, data, duration = API_CONFIG.CACHE_DURATION) {
    const cacheEntry = {
      data,
      timestamp: Date.now(),
      expires: Date.now() + duration
    };
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(cacheEntry));
    } catch (e) {
      console.warn('Cache write failed:', e);
      this.clearOldEntries();
    }
  },

  get(key) {
    try {
      const entry = localStorage.getItem(this.prefix + key);
      if (!entry) return null;

      const parsed = JSON.parse(entry);
      if (Date.now() > parsed.expires) {
        localStorage.removeItem(this.prefix + key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  },

  getStale(key) {
    // Returns data even if expired (for fallback)
    try {
      const entry = localStorage.getItem(this.prefix + key);
      if (!entry) return null;
      return JSON.parse(entry).data;
    } catch (e) {
      return null;
    }
  },

  clearOldEntries() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(key => {
      try {
        const entry = JSON.parse(localStorage.getItem(key));
        if (Date.now() > entry.expires + 86400000) { // +24h grace
          localStorage.removeItem(key);
        }
      } catch (e) {
        localStorage.removeItem(key);
      }
    });
  },

  markGameComplete(gameId) {
    const completed = this.get('completed_games') || {};
    completed[gameId] = Date.now();
    this.set('completed_games', completed, API_CONFIG.COMPLETED_CACHE_DURATION);
  },

  isGameComplete(gameId) {
    const completed = this.get('completed_games') || {};
    return !!completed[gameId];
  }
};

// ========================================
// ESPN API (FREE - Primary Data Source)
// ========================================

async function fetchESPNScoreboard(sport, dateStr = null) {
  const config = SPORT_API_MAP[sport];
  if (!config) {
    console.error(`Unknown sport: ${sport}`);
    return [];
  }

  const dateSuffix = dateStr ? `_${dateStr}` : '';
  const cacheKey = `espn_${sport}_scoreboard${dateSuffix}`;

  // Check cache first
  const cached = CacheManager.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    let url = `${API_CONFIG.ESPN_BASE}/${config.espn}/scoreboard`;
    if (dateStr) {
      url += `?dates=${formatDateForESPN(dateStr)}`;
    }
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    const games = parseESPNGames(data, sport);

    // Cache with appropriate duration
    const hasLiveGames = games.some(g => g.status === 'live' || g.status === 'halftime');
    const cacheDuration = hasLiveGames ? API_CONFIG.SCORES_CACHE_DURATION : API_CONFIG.CACHE_DURATION;
    CacheManager.set(cacheKey, games, cacheDuration);

    API_CONFIG.API_AVAILABLE = true;
    return games;

  } catch (error) {
    console.error(`ESPN fetch failed for ${sport}:`, error);

    // Try stale cache
    const stale = CacheManager.getStale(cacheKey);
    if (stale) {
      API_CONFIG.USING_CACHED_DATA = true;
      return stale;
    }

    API_CONFIG.API_AVAILABLE = false;
    return [];
  }
}

function parseESPNGames(data, sport) {
  if (!data.events) return [];

  return data.events.map(event => {
    const competition = event.competitions?.[0];
    const homeTeam = competition?.competitors?.find(c => c.homeAway === 'home');
    const awayTeam = competition?.competitors?.find(c => c.homeAway === 'away');

    // Extract odds if available from ESPN
    const odds = competition?.odds?.[0];
    const spread = odds?.spread;
    const overUnder = odds?.overUnder;

    const status = parseGameStatus(event.status);
    const gameId = event.id;

    // Mark completed games
    if (status === 'final') {
      CacheManager.markGameComplete(gameId);
    }

    return {
      id: gameId,
      sport: sport,
      homeTeam: homeTeam?.team?.displayName || homeTeam?.team?.name || 'TBD',
      awayTeam: awayTeam?.team?.displayName || awayTeam?.team?.name || 'TBD',
      homeAbbrev: homeTeam?.team?.abbreviation || 'TBD',
      awayAbbrev: awayTeam?.team?.abbreviation || 'TBD',
      homeScore: parseInt(homeTeam?.score) || 0,
      awayScore: parseInt(awayTeam?.score) || 0,
      status: status,
      gameTime: event.date,
      period: event.status?.period,
      clock: event.status?.displayClock,
      venue: competition?.venue?.fullName,
      // Odds from ESPN (when available)
      spread: spread ? parseFloat(spread) : null,
      overUnder: overUnder ? parseFloat(overUnder) : null,
      // Additional metadata
      isComplete: status === 'final',
      isLive: status === 'live' || status === 'halftime'
    };
  });
}

function parseGameStatus(status) {
  if (!status) return 'scheduled';

  const type = status.type?.name?.toLowerCase();
  const state = status.type?.state?.toLowerCase();
  const completed = status.type?.completed;

  if (completed || type === 'status_final') {
    return 'final';
  } else if (state === 'in' || type === 'status_in_progress') {
    return 'live';
  } else if (type === 'status_halftime') {
    return 'halftime';
  } else if (type === 'status_postponed') {
    return 'postponed';
  } else if (type === 'status_delayed') {
    return 'delayed';
  }

  return 'scheduled';
}

// ========================================
// THE ODDS API (FREE TIER - Betting Lines)
// ========================================

async function fetchOddsAPI(sport) {
  // Skip if no API key configured
  if (!API_CONFIG.ODDS_API_KEY) {
    return [];
  }

  const config = SPORT_API_MAP[sport];
  if (!config) return [];

  const cacheKey = `odds_${sport}`;

  // Check cache first (important for rate limiting!)
  const cached = CacheManager.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `${API_CONFIG.ODDS_API_BASE}/sports/${config.odds}/odds/?apiKey=${API_CONFIG.ODDS_API_KEY}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`;

    const response = await fetch(url);

    if (response.status === 401) {
      console.warn('TheOddsAPI: Invalid API key');
      API_CONFIG.ODDS_API_KEY = ''; // Disable further attempts
      return [];
    }

    if (response.status === 429) {
      console.warn('TheOddsAPI: Rate limit exceeded');
      return CacheManager.getStale(cacheKey) || [];
    }

    if (!response.ok) {
      throw new Error(`Odds API error: ${response.status}`);
    }

    const data = await response.json();
    const odds = parseOddsAPIResponse(data, sport);

    // Cache for 10 minutes to preserve rate limit
    CacheManager.set(cacheKey, odds, API_CONFIG.CACHE_DURATION);

    // Log remaining requests (from headers)
    const remaining = response.headers.get('x-requests-remaining');
    if (remaining) {
      console.log(`TheOddsAPI requests remaining: ${remaining}`);
    }

    return odds;

  } catch (error) {
    console.error(`Odds API fetch failed for ${sport}:`, error);
    return CacheManager.getStale(cacheKey) || [];
  }
}

function parseOddsAPIResponse(data, sport) {
  return data.map(game => {
    // Use first available bookmaker (usually DraftKings or FanDuel)
    const bookmaker = game.bookmakers?.[0];
    const spreads = bookmaker?.markets?.find(m => m.key === 'spreads');
    const totals = bookmaker?.markets?.find(m => m.key === 'totals');
    const h2h = bookmaker?.markets?.find(m => m.key === 'h2h');

    return {
      id: game.id,
      sport: sport,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      gameTime: game.commence_time,
      spread: spreads ? {
        home: spreads.outcomes.find(o => o.name === game.home_team)?.point,
        away: spreads.outcomes.find(o => o.name === game.away_team)?.point,
        homeOdds: spreads.outcomes.find(o => o.name === game.home_team)?.price,
        awayOdds: spreads.outcomes.find(o => o.name === game.away_team)?.price
      } : null,
      total: totals ? {
        line: totals.outcomes.find(o => o.name === 'Over')?.point,
        overOdds: totals.outcomes.find(o => o.name === 'Over')?.price,
        underOdds: totals.outcomes.find(o => o.name === 'Under')?.price
      } : null,
      moneyline: h2h ? {
        home: h2h.outcomes.find(o => o.name === game.home_team)?.price,
        away: h2h.outcomes.find(o => o.name === game.away_team)?.price
      } : null
    };
  });
}

// ========================================
// COMBINED DATA FETCHING
// ========================================

async function fetchTodaysGames(sports = ['NBA', 'NFL', 'NHL', 'MLB']) {
  return fetchGamesForDate(sports);
}

async function fetchGamesForDate(sports = ['NBA', 'NFL', 'NHL', 'MLB'], dateStr = null) {
  const allGames = [];

  for (const sport of sports) {
    try {
      const espnGames = await fetchESPNScoreboard(sport, dateStr);

      const oddsData = dateStr ? [] : await fetchOddsAPI(sport);

      espnGames.forEach(game => {
        const matchingOdds = oddsData.find(o =>
          matchTeamNames(o.homeTeam, game.homeTeam) ||
          matchTeamNames(o.awayTeam, game.awayTeam)
        );

        if (matchingOdds) {
          game.spread = matchingOdds.spread?.away || game.spread;
          game.overUnder = matchingOdds.total?.line || game.overUnder;
          game.moneyline = matchingOdds.moneyline;
          game.oddsSource = 'theOddsAPI';
        } else if (game.spread || game.overUnder) {
          game.oddsSource = 'espn';
        }

        allGames.push(game);
      });

    } catch (error) {
      console.error(`Failed to fetch ${sport} games:`, error);
    }
  }

  return allGames;
}

function matchTeamNames(name1, name2) {
  if (!name1 || !name2) return false;

  // Normalize and compare last word (team name)
  const normalize = (s) => s.toLowerCase().split(' ').pop();
  return normalize(name1) === normalize(name2);
}

// ========================================
// DAILY SLATE GENERATOR (REAL DATA)
// ========================================

async function generateDailySlate() {
  const today = getTodayString();
  const cacheKey = `slate_${today}`;

  const cached = CacheManager.get(cacheKey);
  if (cached && cached.picks?.length > 0) {
    return cached;
  }

  console.log('Generating real daily slate...');

  const games = await fetchTodaysGames(['NBA', 'NFL', 'NHL', 'MLB']);
  const picks = [];

  const availableGames = games.filter(g => {
    const gameTime = new Date(g.gameTime);
    const now = new Date();
    return gameTime > new Date(now.getTime() - 30 * 60 * 1000);
  });

  availableGames.sort((a, b) => new Date(a.gameTime) - new Date(b.gameTime));

  for (const game of availableGames) {
    if (game.spread !== null) {
      picks.push(createRealPick(game, 'spread', picks.length + 1));
    }
    if (game.overUnder !== null) {
      picks.push(createRealPick(game, 'total', picks.length + 1));
    }
  }

  for (const game of availableGames) {
    if (game.moneyline && !picks.find(p => p.gameId === game.id && p.market === 'moneyline')) {
      picks.push(createRealPick(game, 'moneyline', picks.length + 1));
    }
  }

  if (picks.length === 0) {
    console.warn('No games available for today');
    API_CONFIG.USING_CACHED_DATA = true;
    const staleCached = CacheManager.getStale(cacheKey);
    if (staleCached) return staleCached;
  }

  const slate = {
    id: `slate_${today.replace(/-/g, '')}`,
    date: today,
    picks: picks,
    generatedAt: new Date().toISOString(),
    source: API_CONFIG.ODDS_API_KEY ? 'theOddsAPI+ESPN' : 'ESPN'
  };

  CacheManager.set(cacheKey, slate, API_CONFIG.CACHE_DURATION);

  return slate;
}

async function generateSlateForDate(dateStr) {
  const cacheKey = `slate_${dateStr}`;

  const cached = CacheManager.get(cacheKey);
  if (cached && cached.picks?.length > 0) {
    return cached;
  }

  console.log(`Generating slate for ${dateStr}...`);

  const games = await fetchGamesForDate(['NBA', 'NFL', 'NHL', 'MLB'], dateStr);
  const picks = [];

  const availableGames = [...games];
  availableGames.sort((a, b) => new Date(a.gameTime) - new Date(b.gameTime));

  for (const game of availableGames) {
    if (game.spread !== null) {
      picks.push(createRealPick(game, 'spread', picks.length + 1));
    }
    if (game.overUnder !== null) {
      picks.push(createRealPick(game, 'total', picks.length + 1));
    }
  }

  for (const game of availableGames) {
    if (game.moneyline && !picks.find(p => p.gameId === game.id && p.market === 'moneyline')) {
      picks.push(createRealPick(game, 'moneyline', picks.length + 1));
    }
  }

  const slate = {
    id: `slate_${dateStr.replace(/-/g, '')}`,
    date: dateStr,
    picks: picks,
    generatedAt: new Date().toISOString(),
    source: 'ESPN'
  };

  CacheManager.set(cacheKey, slate, API_CONFIG.CACHE_DURATION);
  return slate;
}

function createRealPick(game, market, id) {
  const sport = game.sport;
  const sportConfig = SPORTS[sport] || { icon: '🏆', name: sport };

  const homeShort = game.homeAbbrev || game.homeTeam.split(' ').pop().substring(0, 3).toUpperCase();
  const awayShort = game.awayAbbrev || game.awayTeam.split(' ').pop().substring(0, 3).toUpperCase();

  const basePick = {
    id: id,
    gameId: game.id,
    sport: sport,
    matchup: {
      away: game.awayTeam,
      home: game.homeTeam,
      awayLogo: getTeamEmoji(game.awayTeam),
      homeLogo: getTeamEmoji(game.homeTeam)
    },
    gameTime: game.gameTime,
    result: null,
    status: game.status
  };

  if (market === 'spread') {
    const spreadValue = game.spread || -3.5;
    const awaySpread = typeof spreadValue === 'object' ? spreadValue.away : spreadValue;
    const homeSpread = typeof spreadValue === 'object' ? spreadValue.home : -spreadValue;

    return {
      ...basePick,
      market: 'spread',
      marketDetail: `${game.awayTeam.split(' ').pop()} ${awaySpread > 0 ? '+' : ''}${awaySpread}`,
      line: awaySpread,
      optionA: {
        label: `${game.awayTeam.split(' ').pop()} ${awaySpread > 0 ? '+' : ''}${awaySpread}`,
        short: awayShort,
        logo: getTeamEmoji(game.awayTeam),
        value: 'away'
      },
      optionB: {
        label: `${game.homeTeam.split(' ').pop()} ${homeSpread > 0 ? '+' : ''}${homeSpread}`,
        short: homeShort,
        logo: getTeamEmoji(game.homeTeam),
        value: 'home'
      }
    };

  } else if (market === 'total') {
    const total = game.overUnder || 220;

    return {
      ...basePick,
      market: 'total',
      marketDetail: `O/U ${total}`,
      line: total,
      optionA: { label: `Over ${total}`, short: 'OVER', logo: '📈', value: 'over' },
      optionB: { label: `Under ${total}`, short: 'UNDER', logo: '📉', value: 'under' }
    };

  } else if (market === 'moneyline') {
    return {
      ...basePick,
      market: 'moneyline',
      marketDetail: 'Moneyline',
      optionA: {
        label: game.awayTeam.split(' ').pop(),
        short: awayShort,
        logo: getTeamEmoji(game.awayTeam),
        value: 'away'
      },
      optionB: {
        label: game.homeTeam.split(' ').pop(),
        short: homeShort,
        logo: getTeamEmoji(game.homeTeam),
        value: 'home'
      }
    };
  }

  return basePick;
}

function getTeamEmoji(teamName) {
  const emojis = {
    // NBA
    'heat': '🔥', 'celtics': '☘️', 'lakers': '💜', 'warriors': '🌉',
    'bulls': '🐂', 'knicks': '🗽', 'nets': '🌐', '76ers': '🔔',
    'bucks': '🦌', 'suns': '☀️', 'nuggets': '⛏️', 'cavaliers': '⚔️',
    'mavericks': '🐴', 'thunder': '⚡', 'grizzlies': '🐻', 'pelicans': '🦅',
    'timberwolves': '🐺', 'clippers': '⛵', 'rockets': '🚀', 'spurs': '🤠',
    'jazz': '🎵', 'kings': '👑', 'trail blazers': '🔥', 'blazers': '🔥',
    'pistons': '🔧', 'pacers': '🏎️', 'hawks': '🦅', 'hornets': '🐝',
    'magic': '✨', 'wizards': '🧙', 'raptors': '🦖',
    // NFL
    'chiefs': '🔴', 'bills': '🦬', 'eagles': '🦅', '49ers': '⛏️',
    'cowboys': '⭐', 'ravens': '🐦', 'lions': '🦁', 'packers': '🧀',
    'dolphins': '🐬', 'jets': '✈️', 'patriots': '🇺🇸', 'steelers': '⚙️',
    'bengals': '🐅', 'browns': '🐶', 'texans': '🤠', 'colts': '🐴',
    'jaguars': '🐆', 'titans': '⚔️', 'broncos': '🐴', 'chargers': '⚡',
    'raiders': '☠️', 'seahawks': '🦅', 'cardinals': '🐦', 'rams': '🐏',
    'bears': '🐻', 'vikings': '⚔️', 'commanders': '🎖️', 'giants': '🗽',
    'saints': '⚜️', 'buccaneers': '🏴‍☠️', 'falcons': '🦅', 'panthers': '🐆',
    // NHL
    'oilers': '🛢️', 'avalanche': '❄️', 'bruins': '🐻', 'rangers': '🗽',
    'lightning': '⚡', 'maple leafs': '🍁', 'canadiens': '🔵', 'flames': '🔥',
    'canucks': '🐋', 'jets': '✈️', 'wild': '🌲', 'stars': '⭐',
    'predators': '🐆', 'blues': '🎵', 'blackhawks': '🪶', 'red wings': '🐙',
    'penguins': '🐧', 'capitals': '🦅', 'flyers': '🟠', 'devils': '😈',
    'islanders': '🏝️', 'hurricanes': '🌀', 'blue jackets': '⭐', 'senators': '🏛️',
    'sabres': '⚔️', 'kraken': '🦑', 'golden knights': '⚔️', 'coyotes': '🐺',
    'sharks': '🦈', 'ducks': '🦆', 'kings': '👑',
    // MLB
    'yankees': '🗽', 'red sox': '🧦', 'dodgers': '🔵', 'giants': '🟠',
    'cubs': '🐻', 'white sox': '⚫', 'mets': '🟠', 'phillies': '🔔',
    'braves': '🪶', 'marlins': '🐟', 'nationals': '🏛️', 'cardinals': '🐦',
    'brewers': '🍺', 'reds': '🔴', 'pirates': '☠️', 'astros': '⭐',
    'rangers': '⚾', 'athletics': '🐘', 'angels': '😇', 'mariners': '⚓',
    'twins': '👯', 'guardians': '⚾', 'tigers': '🐯', 'royals': '👑',
    'rays': '☀️', 'blue jays': '🐦', 'orioles': '🐦', 'rockies': '🏔️',
    'padres': '🟤', 'diamondbacks': '🐍', 'd-backs': '🐍'
  };

  const key = teamName.toLowerCase().split(' ').pop();
  return emojis[key] || '🏆';
}

// ========================================
// GAME STATUS & LOCKING
// ========================================

function isGameLocked(gameTime) {
  const gameDate = new Date(gameTime);
  const now = new Date();
  return now >= gameDate;
}

function isGameComplete(gameTime) {
  const gameDate = new Date(gameTime);
  const now = new Date();
  // Estimate: 3 hours for most games
  const estimatedEnd = new Date(gameDate.getTime() + 3 * 60 * 60 * 1000);
  return now >= estimatedEnd;
}

function getGameStatusDisplay(gameTime, status) {
  // Priority: actual status from API
  if (status === 'final') return { text: 'FINAL', class: 'final' };
  if (status === 'live') return { text: 'LIVE', class: 'live' };
  if (status === 'halftime') return { text: 'HALF', class: 'live' };
  if (status === 'postponed') return { text: 'PPD', class: 'postponed' };
  if (status === 'delayed') return { text: 'DELAY', class: 'delayed' };

  const gameDate = new Date(gameTime);
  const now = new Date();

  if (now >= gameDate) {
    return { text: 'LOCKED', class: 'locked' };
  }

  const diff = gameDate - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    return { text: 'UPCOMING', class: 'upcoming' };
  } else if (hours > 0) {
    return { text: `${hours}h ${mins}m`, class: 'upcoming' };
  } else if (mins > 30) {
    return { text: `${mins}m`, class: 'upcoming' };
  } else if (mins > 0) {
    return { text: `${mins}m`, class: 'soon' };
  } else {
    return { text: 'STARTING', class: 'soon' };
  }
}

// ========================================
// AUTOMATIC RESULT GRADING
// ========================================

async function checkAndGradeResults(userPicks, slate) {
  const results = {};
  const sports = [...new Set(slate.picks.map(p => p.sport))];

  for (const sport of sports) {
    try {
      const games = await fetchESPNScoreboard(sport);

      slate.picks.forEach((slatePick, idx) => {
        if (slatePick.sport !== sport) return;

        // Skip if already graded
        if (userPicks[idx]?.status === 'WON' ||
            userPicks[idx]?.status === 'LOST' ||
            userPicks[idx]?.status === 'PUSH') return;

        // Find matching game
        const matchingGame = games.find(g =>
          g.id === slatePick.gameId ||
          matchTeamNames(g.homeTeam, slatePick.matchup.home) ||
          matchTeamNames(g.awayTeam, slatePick.matchup.away)
        );

        if (matchingGame && matchingGame.status === 'final') {
          const gradeResult = gradePick(slatePick, matchingGame, userPicks[idx]);
          if (gradeResult) {
            results[idx] = gradeResult;
          }
        }
      });

    } catch (error) {
      console.error(`Failed to check ${sport} results:`, error);
    }
  }

  return results;
}

function gradePick(slatePick, game, userPick) {
  if (!userPick || !userPick.choice) return null;

  const homeScore = game.homeScore;
  const awayScore = game.awayScore;
  const totalScore = homeScore + awayScore;
  const scoreDiff = awayScore - homeScore; // Positive = away won outright

  let result = { status: null, winner: null };

  if (slatePick.market === 'spread') {
    const line = slatePick.line || parseFloat(slatePick.marketDetail.match(/-?\d+\.?\d*/)?.[0]) || 0;

    // Away team with the spread
    const awayCovered = scoreDiff + line;

    if (awayCovered === 0) {
      result.status = 'PUSH';
      result.winner = null;
    } else if (awayCovered > 0) {
      result.winner = 'A'; // Away covered
      result.status = userPick.choice === 'A' ? 'WON' : 'LOST';
    } else {
      result.winner = 'B'; // Home covered
      result.status = userPick.choice === 'B' ? 'WON' : 'LOST';
    }

  } else if (slatePick.market === 'total') {
    const line = slatePick.line || parseFloat(slatePick.marketDetail.match(/\d+\.?\d*/)?.[0]) || 0;

    if (totalScore === line) {
      result.status = 'PUSH';
      result.winner = null;
    } else if (totalScore > line) {
      result.winner = 'A'; // Over
      result.status = userPick.choice === 'A' ? 'WON' : 'LOST';
    } else {
      result.winner = 'B'; // Under
      result.status = userPick.choice === 'B' ? 'WON' : 'LOST';
    }

  } else if (slatePick.market === 'moneyline') {
    if (awayScore === homeScore) {
      result.status = 'PUSH';
      result.winner = null;
    } else if (awayScore > homeScore) {
      result.winner = 'A'; // Away won
      result.status = userPick.choice === 'A' ? 'WON' : 'LOST';
    } else {
      result.winner = 'B'; // Home won
      result.status = userPick.choice === 'B' ? 'WON' : 'LOST';
    }
  }

  result.homeScore = homeScore;
  result.awayScore = awayScore;
  result.finalScore = `${awayScore}-${homeScore}`;

  return result;
}

// ========================================
// LIVE SCORE UPDATES
// ========================================

async function fetchLiveScores(sport = 'NBA') {
  return await fetchESPNScoreboard(sport);
}

// ========================================
// API STATUS HELPERS
// ========================================

function getAPIStatus() {
  return {
    available: API_CONFIG.API_AVAILABLE,
    usingCache: API_CONFIG.USING_CACHED_DATA,
    hasOddsKey: !!API_CONFIG.ODDS_API_KEY,
    source: API_CONFIG.ODDS_API_KEY ? 'TheOddsAPI + ESPN' : 'ESPN (Free)'
  };
}

function getOddsBadgeText() {
  const status = getAPIStatus();

  if (!status.available) {
    return { text: 'Using Cached Odds - No Live Updates', class: 'cached' };
  }

  if (status.usingCache) {
    return { text: 'Using Last Known Odds', class: 'cached' };
  }

  if (status.hasOddsKey) {
    return { text: 'Lines Powered By TheOddsAPI - Real-Time Odds', class: 'live' };
  }

  return { text: 'Lines Powered By ESPN - Real-Time Odds', class: 'live' };
}

// ========================================
// AUTO-REFRESH SYSTEM
// ========================================

let refreshIntervals = [];
let isPolling = false;

function startAutoRefresh(callbacks = {}) {
  stopAutoRefresh();
  isPolling = true;

  // Main polling loop
  const poll = async () => {
    if (!isPolling) return;

    try {
      // Fetch current games
      const games = await fetchTodaysGames();
      const hasLiveGames = games.some(g => g.status === 'live' || g.status === 'halftime');

      // Notify callbacks
      if (callbacks.onScoresUpdate) {
        callbacks.onScoresUpdate(games);
      }

      if (callbacks.onResultsCheck) {
        callbacks.onResultsCheck();
      }

      // Adjust polling interval based on live games
      const interval = hasLiveGames ?
        API_CONFIG.LIVE_POLL_INTERVAL :
        API_CONFIG.IDLE_POLL_INTERVAL;

      if (isPolling) {
        setTimeout(poll, interval);
      }

    } catch (error) {
      console.error('Polling error:', error);
      // Retry after idle interval on error
      if (isPolling) {
        setTimeout(poll, API_CONFIG.IDLE_POLL_INTERVAL);
      }
    }
  };

  // Start polling
  poll();
}

function stopAutoRefresh() {
  isPolling = false;
  refreshIntervals.forEach(interval => clearInterval(interval));
  refreshIntervals = [];
}

// ========================================
// INITIALIZATION
// ========================================

// Clear old cache entries on load
CacheManager.clearOldEntries();

console.log('Sports IQ API Layer v2.0 loaded');
console.log('Data sources:', API_CONFIG.ODDS_API_KEY ? 'TheOddsAPI + ESPN' : 'ESPN (100% Free)');
