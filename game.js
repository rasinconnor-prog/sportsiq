// ========================================
// SPORTS IQ – Game Engine v3.0
// Real-Time Odds, Live Scores, H2H Mode
// ========================================

class SportsIQ {
  constructor() {
    this.state = this.loadState();
    this.slate = null;
    this.currentView = 'play';
    this.currentTab = 'daily';
    this.h2hMode = false;
    this.player2State = null;
    this.liveScores = {};
    this.testingModeEnabled = false;
    this.testingDay = 'today';
    this.tomorrowSlate = null;
    this.testingState = this.loadTestingState();
    this.init();
  }

  // ========================================
  // STATE MANAGEMENT
  // ========================================

  loadState() {
    const saved = localStorage.getItem('sportsiq_state');
    if (saved) {
      const state = JSON.parse(saved);
      return this.migrateState(state);
    }
    return getDefaultUserState();
  }

  migrateState(state) {
    const defaults = getDefaultUserState();

    // Ensure all fields exist
    if (!state.level) state.level = 1;
    if (!state.xp) state.xp = 0;
    if (!state.coins) state.coins = 0;
    if (!state.stats) state.stats = defaults.stats;
    if (!state.badges) state.badges = [];
    if (!state.history) state.history = [];
    if (!state.friends) state.friends = [];
    if (!state.h2h) state.h2h = defaults.h2h;
    if (!state.leagues) state.leagues = [];

    // Onboarding: existing users (with history or submitted cards) skip onboarding
    if (state.onboarding_completed === undefined) {
      const hasPlayedBefore = state.history?.length > 0 || state.today?.submitted;
      state.onboarding_completed = hasPlayedBefore;
    }

    // Check for day rollover
    const today = getTodayString();
    if (!state.today || state.today.date !== today) {
      // Archive previous day
      if (state.today && state.today.submitted && state.today.picks.length > 0) {
        state.history.unshift({
          date: state.today.date,
          picks: [...state.today.picks],
          submitted: state.today.submitted,
          graded: state.today.graded || false,
          score: state.today.score || null
        });
      }
      // Reset for new day
      state.today = {
        date: today,
        picks: [],
        lockOfDayIndex: null,
        submitted: false,
        submittedAt: null,
        graded: false,
        gradedAt: null,
        score: null,
        challenges: []
      };
    }

    if (!Array.isArray(state.today.picks) || state.today.picks.length === 0) {
      state.today.picks = [];
    }

    if (state.today.lockOfDayIndex === undefined) {
      state.today.lockOfDayIndex = null;
    }

    // Stats migrations
    const weekStart = getWeekStart();
    if (!state.stats.weekly || state.stats.weekly.weekStart !== weekStart) {
      state.stats.weekly = { weekStart, picks: 0, correct: 0, perfectDays: 0 };
    }

    const month = getCurrentMonth();
    if (!state.stats.monthly || state.stats.monthly.month !== month) {
      state.stats.monthly = { month, picks: 0, correct: 0, perfectDays: 0 };
    }

    if (!state.stats.allTime.currentDayStreak) state.stats.allTime.currentDayStreak = 0;
    if (!state.stats.allTime.bestDayStreak) state.stats.allTime.bestDayStreak = 0;
    if (!state.stats.allTime.lockOfDayWins) state.stats.allTime.lockOfDayWins = 0;
    if (!state.stats.allTime.bySport) state.stats.allTime.bySport = {};
    if (!state.stats.allTime.byMarket) state.stats.allTime.byMarket = {};
    if (state.stats.allTime.challengesCompleted === undefined) state.stats.allTime.challengesCompleted = 0;

    if (!state.today.challenges || !Array.isArray(state.today.challenges)) {
      state.today.challenges = [];
    }
    if (!state.stats.allTime.bestDailyScore) state.stats.allTime.bestDailyScore = 0;

    // Scoring mode preference (default to classic)
    if (!state.scoringMode) state.scoringMode = SCORING_MODE.CLASSIC;

    return state;
  }

  saveState() {
    if (this.isTestingMode()) {
      this.saveTestingState();
      return;
    }
    localStorage.setItem('sportsiq_state', JSON.stringify(this.state));
  }

  isTestingMode() {
    return this.testingModeEnabled;
  }

  loadTestingState() {
    const saved = localStorage.getItem('sportsiq_testing_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  saveTestingState() {
    const key = this.testingDay === 'tomorrow' ? 'tomorrow' : 'today';
    if (!this.testingState) this.testingState = {};
    this.testingState[key] = {
      today: JSON.parse(JSON.stringify(this.state.today)),
      slate: this.testingDay === 'tomorrow' ? this.tomorrowSlate : this.slate,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('sportsiq_testing_state', JSON.stringify(this.testingState));
  }

  restoreTestingState(day) {
    if (this.testingState && this.testingState[day]) {
      const saved = this.testingState[day];
      this.state.today = JSON.parse(JSON.stringify(saved.today));
    }
  }

  toggleTestingMode() {
    this.testingModeEnabled = !this.testingModeEnabled;
    const indicator = document.getElementById('testing-mode-indicator');
    const tabBar = document.getElementById('testing-day-tabs');

    if (this.testingModeEnabled) {
      this.productionState = JSON.parse(JSON.stringify(this.state));
      this.productionSlate = this.slate;
      indicator?.classList.remove('hidden');
      tabBar?.classList.remove('hidden');
      this.testingDay = 'today';
      this.updateTestingDayTabs();
      this.showToast('Testing Mode ON – stats will not be saved');
    } else {
      this.state = this.productionState || this.loadState();
      this.slate = this.productionSlate || this.slate;
      this.productionState = null;
      this.productionSlate = null;
      indicator?.classList.add('hidden');
      tabBar?.classList.add('hidden');
      this.showToast('Testing Mode OFF – back to live');
    }
    this.initPicksForSlate();
    this.render();
  }

  async switchTestingDay(day) {
    if (!this.testingModeEnabled) return;
    if (day === this.testingDay) return;

    this.saveTestingState();

    this.testingDay = day;
    this.updateTestingDayTabs();

    if (day === 'tomorrow') {
      this.showLoading(true);
      try {
        if (!this.tomorrowSlate) {
          const tomorrowStr = getTomorrowString();
          this.tomorrowSlate = await generateSlateForDate(tomorrowStr);
        }
        this.slate = this.tomorrowSlate;
      } catch (err) {
        console.error('Failed to load tomorrow slate:', err);
        this.showToast('Could not load tomorrow\'s games');
        this.testingDay = 'today';
        this.updateTestingDayTabs();
        this.showLoading(false);
        return;
      }
      this.showLoading(false);
    } else {
      this.slate = this.productionSlate || this.slate;
    }

    if (this.testingState && this.testingState[day]) {
      this.restoreTestingState(day);
    } else {
      this.state.today = {
        date: day === 'tomorrow' ? getTomorrowString() : getTodayString(),
        picks: [],
        lockOfDayIndex: null,
        submitted: false,
        submittedAt: null,
        graded: false,
        gradedAt: null,
        score: null
      };
    }

    this.initPicksForSlate();
    this.render();
  }

  updateTestingDayTabs() {
    const todayTab = document.getElementById('testing-tab-today');
    const tomorrowTab = document.getElementById('testing-tab-tomorrow');
    if (todayTab) todayTab.classList.toggle('active', this.testingDay === 'today');
    if (tomorrowTab) tomorrowTab.classList.toggle('active', this.testingDay === 'tomorrow');
  }

  resetState() {
    if (confirm('Reset all progress? This cannot be undone.')) {
      localStorage.removeItem('sportsiq_state');
      localStorage.removeItem('sportsiq_results');
      localStorage.removeItem('sportsiq_p2');
      location.reload();
    }
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async init() {
    // Show loading state
    this.showLoading(true);

    try {
      // Try to generate slate from live odds
      this.slate = await this.loadOrGenerateSlate();
    } catch (error) {
      console.error('Failed to load slate:', error);
      // Fallback to default slate
      this.slate = getDailySlate(getTodayString());
    }

    this.initPicksForSlate();
    this.initPlayer2();
    this.bindEvents();
    this.render();
    this.startAutoRefresh();
    this.showLoading(false);

    // Check for friend challenge in URL
    this.checkForChallengeInUrl();

    // Check if there's an active friend challenge
    this.checkActiveFriendChallenge();

    // Check if user needs onboarding
    this.checkOnboarding();
  }

  // ========================================
  // ONBOARDING SYSTEM
  // ========================================

  checkOnboarding() {
    // Check if user has completed onboarding
    if (!this.state.onboarding_completed) {
      this.showOnboarding();
    }
  }

  showOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');
    this.currentOnboardingStep = 1;
    this.updateOnboardingStep(1);
    this.bindOnboardingEvents();
  }

  bindOnboardingEvents() {
    const nextBtn = document.getElementById('onboarding-next');
    const skipBtn = document.getElementById('onboarding-skip');
    const dots = document.querySelectorAll('.onboarding-dots .dot');

    // Next/Start button
    nextBtn?.addEventListener('click', () => {
      if (this.currentOnboardingStep < 5) {
        this.currentOnboardingStep++;
        this.updateOnboardingStep(this.currentOnboardingStep);
      } else {
        this.completeOnboarding();
      }
    });

    // Skip button
    skipBtn?.addEventListener('click', () => {
      this.completeOnboarding();
    });

    // Dot navigation
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const step = parseInt(dot.dataset.step);
        if (step) {
          this.currentOnboardingStep = step;
          this.updateOnboardingStep(step);
        }
      });
    });

    // Swipe support for mobile
    const slidesContainer = document.getElementById('onboarding-slides');
    let startX = 0;
    let isDragging = false;

    slidesContainer?.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
    });

    slidesContainer?.addEventListener('touchend', (e) => {
      if (!isDragging) return;
      isDragging = false;

      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;

      if (Math.abs(diff) > 50) {
        if (diff > 0 && this.currentOnboardingStep < 5) {
          // Swiped left - next
          this.currentOnboardingStep++;
          this.updateOnboardingStep(this.currentOnboardingStep);
        } else if (diff < 0 && this.currentOnboardingStep > 1) {
          // Swiped right - previous
          this.currentOnboardingStep--;
          this.updateOnboardingStep(this.currentOnboardingStep);
        }
      }
    });
  }

  updateOnboardingStep(step) {
    // Update slides
    const slides = document.querySelectorAll('.onboarding-slide');
    slides.forEach(slide => {
      const slideStep = parseInt(slide.dataset.step);
      slide.classList.toggle('active', slideStep === step);
    });

    // Update dots
    const dots = document.querySelectorAll('.onboarding-dots .dot');
    dots.forEach(dot => {
      const dotStep = parseInt(dot.dataset.step);
      dot.classList.toggle('active', dotStep === step);
    });

    // Update button text
    const nextBtn = document.getElementById('onboarding-next');
    if (nextBtn) {
      nextBtn.textContent = step === 4 ? 'Start Playing' : 'Next';
    }
  }

  completeOnboarding() {
    // Hide overlay
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }

    // Mark onboarding as completed
    this.state.onboarding_completed = true;
    this.saveState();

    // Welcome toast
    this.showToast('Welcome to SportsIQ! Make your picks below.');
  }

  async loadOrGenerateSlate() {
    const today = getTodayString();
    const cached = localStorage.getItem(`sportsiq_slate_${today}`);

    if (cached) {
      const slate = JSON.parse(cached);
      // Check if slate is still valid (not too old)
      const generatedAt = new Date(slate.generatedAt);
      const now = new Date();
      const hoursSinceGenerated = (now - generatedAt) / (1000 * 60 * 60);

      if (hoursSinceGenerated < 12) {
        return slate;
      }
    }

    // Generate new slate
    try {
      const slate = await generateDailySlate();
      localStorage.setItem(`sportsiq_slate_${today}`, JSON.stringify(slate));
      return slate;
    } catch (error) {
      console.error('Failed to generate slate:', error);
      return getDailySlate(today);
    }
  }

  initPicksForSlate() {
    if (this.state.today.picks.length !== this.slate.picks.length) {
      this.state.today.picks = this.slate.picks.map(() => ({
        choice: null,
        status: PICK_STATUS.UNSELECTED,
        isLockOfDay: false
      }));
      this.saveState();
    }
    if (!this.state.today.challenges || this.state.today.challenges.length === 0) {
      const dailyChallenges = getDailyChallenges(this.state.today.date);
      this.state.today.challenges = dailyChallenges.map(c => ({ id: c.id, completed: false }));
      this.saveState();
    }
  }

  initPlayer2() {
    // Load or create Player 2 state for H2H
    const saved = localStorage.getItem('sportsiq_p2');
    if (saved) {
      this.player2State = JSON.parse(saved);
      // Reset if different day
      if (this.player2State.date !== getTodayString()) {
        this.player2State = null;
      }
    }
  }

  showLoading(show) {
    const loader = document.getElementById('loading-overlay');
    if (loader) {
      loader.classList.toggle('hidden', !show);
    }
  }

  // ========================================
  // AUTO-REFRESH SYSTEM
  // ========================================

  startAutoRefresh() {
    // Clear any existing intervals
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    if (this.scoreInterval) clearInterval(this.scoreInterval);

    // Check for results every 60 seconds
    this.refreshInterval = setInterval(() => {
      this.checkForPendingResults();
    }, 60000);

    // Update live scores every 30 seconds
    this.scoreInterval = setInterval(() => {
      this.refreshLiveScores();
    }, 30000);

    // Initial score fetch
    this.refreshLiveScores();
  }

  async refreshLiveScores() {
    try {
      for (const sport of ['NBA', 'NFL', 'NHL']) {
        const scores = await fetchLiveScores(sport);
        scores.forEach(game => {
          this.liveScores[game.id] = game;
        });
      }
      this.updateLiveScoreDisplay();
    } catch (error) {
      console.error('Failed to refresh scores:', error);
    }
  }

  updateLiveScoreDisplay() {
    // Update any live game indicators in the UI
    this.slate.picks.forEach((pick, idx) => {
      const card = document.querySelector(`.pick-card[data-pick-index="${idx}"]`);
      if (!card) return;

      const statusInfo = getGameStatusDisplay(pick.gameTime, pick.status);
      const statusBadge = card.querySelector('.game-status-badge');
      if (statusBadge) {
        statusBadge.textContent = statusInfo.text;
        statusBadge.className = `game-status-badge ${statusInfo.class}`;
      }
    });
  }

  // ========================================
  // EVENT BINDING
  // ========================================

  bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        this.switchView(view);
      });
    });

    // Submit button (shows confirmation modal)
    document.getElementById('submit-picks-btn')?.addEventListener('click', () => {
      this.showSubmitConfirmation();
    });

    // Confirm submission button
    document.getElementById('confirm-submit-btn')?.addEventListener('click', () => {
      this.confirmSubmission();
    });

    // Cancel submission button
    document.getElementById('cancel-submit-btn')?.addEventListener('click', () => {
      closeModal('submit-confirm-modal');
    });

    // Continue button
    document.getElementById('continue-btn')?.addEventListener('click', () => {
      document.getElementById('results-state').classList.add('hidden');
      this.showSubmittedState();
    });

    // Leaderboard tabs
    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.currentTab = e.target.dataset.tab;
        this.renderLeaderboard();
      });
    });

    // Leaderboard info button
    document.getElementById('leaderboard-info-btn')?.addEventListener('click', () => {
      this.showLeaderboardInfo();
    });

    // No entry card button
    document.getElementById('no-entry-btn')?.addEventListener('click', () => {
      this.switchView('play');
    });

    // H2H buttons
    document.getElementById('h2h-create-btn')?.addEventListener('click', () => {
      this.showH2HCreate();
    });

    document.getElementById('h2h-random-btn')?.addEventListener('click', () => {
      this.createRandomH2H();
    });

    document.getElementById('h2h-share-btn')?.addEventListener('click', () => {
      this.shareH2HChallenge();
    });

    // Friend Challenge Link
    document.getElementById('h2h-friend-link-btn')?.addEventListener('click', () => {
      this.createFriendChallenge();
    });

    document.getElementById('friend-challenge-close')?.addEventListener('click', () => {
      this.closeFriendChallengeModal();
    });

    document.getElementById('copy-challenge-link')?.addEventListener('click', () => {
      this.copyFriendChallengeLink();
    });

    document.getElementById('share-challenge-btn')?.addEventListener('click', () => {
      this.shareFriendChallenge();
    });

    document.getElementById('h2h-back-btn')?.addEventListener('click', () => {
      this.hideH2HCreate();
    });

    document.getElementById('h2h-invite-btn')?.addEventListener('click', () => {
      this.inviteFriendByUsername();
    });

    document.getElementById('h2h-username-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.inviteFriendByUsername();
      }
    });

    // H2H Local Mode
    document.getElementById('h2h-local-btn')?.addEventListener('click', () => {
      this.startLocalH2H();
    });

    document.getElementById('h2h-switch-player')?.addEventListener('click', () => {
      this.switchH2HPlayer();
    });

    // Settings
    document.getElementById('username-input')?.addEventListener('change', (e) => {
      this.state.username = e.target.value || 'Player';
      this.saveState();
      this.updateHeader();
    });

    // Scoring Mode Toggle
    document.querySelectorAll('#scoring-mode-toggle .mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.dataset.mode;
        this.setScoringMode(mode);
      });
    });

    // Scoring Mode Badge (click to go to settings)
    document.getElementById('scoring-mode-badge')?.addEventListener('click', () => {
      this.switchView('profile');
      // Scroll to settings section
      setTimeout(() => {
        document.querySelector('.scoring-mode-setting')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    document.getElementById('reset-btn')?.addEventListener('click', () => {
      this.resetState();
    });

    // Testing Mode controls
    document.getElementById('simulate-eod-btn')?.addEventListener('click', () => {
      this.simulateEndOfDay();
    });

    document.getElementById('resolve-all-btn')?.addEventListener('click', () => {
      this.resolveAllResults();
    });

    document.getElementById('resolve-random-btn')?.addEventListener('click', () => {
      this.resolveOneRandom();
    });

    document.getElementById('reset-today-btn')?.addEventListener('click', () => {
      this.resetTodaysCard();
    });

    document.getElementById('testing-toggle')?.addEventListener('click', () => {
      document.getElementById('testing-panel')?.classList.add('hidden');
    });

    document.getElementById('testing-mode-toggle-btn')?.addEventListener('click', () => {
      this.toggleTestingMode();
    });

    document.getElementById('testing-tab-today')?.addEventListener('click', () => {
      this.switchTestingDay('today');
    });

    document.getElementById('testing-tab-tomorrow')?.addEventListener('click', () => {
      this.switchTestingDay('tomorrow');
    });

    document.getElementById('show-debug-btn')?.addEventListener('click', () => {
      const panel = document.getElementById('testing-panel');
      if (panel) {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
          this.switchView('play');
        }
      }
    });

    // Refresh odds button
    document.getElementById('refresh-odds-btn')?.addEventListener('click', () => {
      this.refreshOdds();
    });

    // Today's Games tab
    document.getElementById('todays-games-tab')?.addEventListener('click', () => {
      this.showTodaysGames();
    });

    document.getElementById('my-picks-tab')?.addEventListener('click', () => {
      this.showMyPicks();
    });

    // How To Play buttons
    document.getElementById('how-to-play-btn')?.addEventListener('click', () => {
      this.switchView('howtoplay');
    });

    document.getElementById('howtoplay-link-btn')?.addEventListener('click', () => {
      this.switchView('howtoplay');
    });

    document.getElementById('howtoplay-back')?.addEventListener('click', () => {
      this.switchView('play');
    });

    document.getElementById('howtoplay-start-btn')?.addEventListener('click', () => {
      this.switchView('play');
    });

    // Level Progress Sheet
    this.bindLevelSheetEvents();
  }

  bindLevelSheetEvents() {
    // Tappable level elements
    const levelTriggers = [
      'level-badge',
      'profile-avatar',
      'level-progress-card'
    ];

    levelTriggers.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => this.openLevelSheet());
      }
    });

    // Close handlers
    document.querySelector('.level-sheet-backdrop')?.addEventListener('click', () => {
      this.closeLevelSheet();
    });

    document.getElementById('level-sheet-close')?.addEventListener('click', () => {
      this.closeLevelSheet();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('level-sheet')?.classList.contains('hidden')) {
        this.closeLevelSheet();
      }
    });
  }

  // ========================================
  // VIEW MANAGEMENT
  // ========================================

  switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(`${viewName}-view`)?.classList.add('active');
    document.querySelector(`.nav-item[data-view="${viewName}"]`)?.classList.add('active');

    this.currentView = viewName;

    if (viewName === 'profile') this.renderProfile();
    if (viewName === 'compete') this.renderCompete();
    if (viewName === 'games') this.renderTodaysGames();
  }

  // ========================================
  // RENDERING
  // ========================================

  render() {
    this.updateHeader();
    this.updateOddsBadge();
    this.updateStatusBanner();
    this.renderPickCards();
    this.updateProgress();
    this.updateSubmitButton();
    this.updateCardState();
    this.renderPendingPicks();
    this.renderChallenges();
    this.renderH2HScoreboard();
    this.updateScoringModeUI();
  }

  updateStatusBanner() {
    const banner = document.getElementById('status-banner-content');
    if (!banner) return;

    if (this.state.today.submitted) {
      banner.className = 'status-banner-content submitted';
      banner.innerHTML = `
        <span class="status-banner-icon">✅</span>
        <span class="status-banner-text">Picks locked in for today!</span>
      `;
    } else {
      banner.className = 'status-banner-content pending';
      banner.innerHTML = `
        <span class="status-banner-icon">📋</span>
        <span class="status-banner-text">Make your picks and submit before games begin</span>
      `;
    }
  }

  updateSubmitButton() {
    const submitSection = document.getElementById('submit-section');
    const submittedSection = document.getElementById('submitted-section');
    const submitBtn = document.getElementById('submit-picks-btn');
    const helperText = document.getElementById('submit-helper-text');

    if (!submitSection || !submittedSection) return;

    // If already submitted, show submitted section
    if (this.state.today.submitted) {
      submitSection.classList.add('hidden');
      submittedSection.classList.remove('hidden');
      this.renderSubmittedPicksSummary();
      return;
    }

    // Show submit section
    submitSection.classList.remove('hidden');
    submittedSection.classList.add('hidden');

    // Check if all picks are made
    const currentPicks = this.h2hMode && this.h2hCurrentPlayer === 2
      ? this.player2State?.picks || []
      : this.state.today.picks;

    const allPicked = currentPicks.every(p => p.choice !== null);
    const picksMade = currentPicks.filter(p => p.choice !== null).length;
    const remaining = 7 - picksMade;

    if (allPicked) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('disabled');
      submitSection.classList.add('ready');
      helperText.textContent = 'All picks made! Tap to submit your card';
    } else {
      submitBtn.disabled = true;
      submitBtn.classList.add('disabled');
      submitSection.classList.remove('ready');
      helperText.textContent = `${remaining} pick${remaining !== 1 ? 's' : ''} remaining`;
    }
  }

  renderSubmittedPicksSummary() {
    const container = document.getElementById('submitted-picks-summary');
    if (!container) return;

    container.innerHTML = this.state.today.picks.map((pick, idx) => {
      const slatePick = this.slate.picks[idx];
      const choice = pick.choice === 'PASS' ? 'PASS' : (pick.choice === 'A' ? slatePick.optionA.short : slatePick.optionB.short);
      const isLock = this.state.today.lockOfDayIndex === idx;
      const isPass = pick.choice === 'PASS';
      return `<span class="pick-chip ${isLock ? 'lock' : ''} ${isPass ? 'pass' : ''}">${isLock ? '🔒 ' : ''}${choice}</span>`;
    }).join('');
  }

  showSubmitConfirmation() {
    const currentPicks = this.h2hMode && this.h2hCurrentPlayer === 2
      ? this.player2State?.picks || []
      : this.state.today.picks;

    if (!currentPicks.every(p => p.choice !== null)) {
      this.showToast('Complete all picks first!');
      return;
    }

    document.getElementById('submit-confirm-modal')?.classList.remove('hidden');
  }

  confirmSubmission() {
    // Close the modal
    closeModal('submit-confirm-modal');

    // Show success animation
    this.showSubmitSuccessAnimation();

    // After animation, actually submit
    setTimeout(() => {
      this.submitCard();
    }, 1500);
  }

  showSubmitSuccessAnimation() {
    // Create success overlay
    const overlay = document.createElement('div');
    overlay.className = 'submit-success-overlay';
    overlay.id = 'submit-success-overlay';
    overlay.innerHTML = `
      <div class="submit-success-content">
        <div class="success-checkmark">✓</div>
        <h2>Card Submitted!</h2>
        <p>Good luck with your picks</p>
      </div>
    `;
    document.body.appendChild(overlay);

    // Show confetti
    this.showConfetti();

    // Remove overlay after animation
    setTimeout(() => {
      overlay.remove();
    }, 2000);
  }

  updateOddsBadge() {
    const badge = document.getElementById('odds-badge');
    if (badge) {
      const status = getOddsBadgeText();
      badge.textContent = status.text;
      badge.className = `odds-badge ${status.class}`;
    }
  }

  updateHeader() {
    document.querySelector('.level-badge .level-num').textContent = this.state.level;
    document.getElementById('coin-count').textContent = this.state.coins;

    const streak = this.state.stats.allTime.currentPickStreak;
    const streakEl = document.getElementById('streak-indicator');
    if (streak >= 3) {
      streakEl.classList.remove('hidden');
      document.getElementById('streak-count').textContent = streak;
    } else {
      streakEl.classList.add('hidden');
    }

    const currentLevelXp = getXpForLevel(this.state.level - 1);
    const nextLevelXp = getXpForLevel(this.state.level);
    const progress = ((this.state.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
    document.getElementById('xp-fill').style.width = `${Math.max(0, Math.min(100, progress))}%`;
    document.getElementById('xp-text').textContent = `${this.state.xp} / ${nextLevelXp} XP`;

    // Update H2H indicator if in H2H mode
    if (this.h2hMode) {
      document.getElementById('h2h-mode-indicator')?.classList.remove('hidden');
      document.getElementById('h2h-current-player').textContent =
        this.h2hCurrentPlayer === 1 ? this.state.username : 'Player 2';
    } else {
      document.getElementById('h2h-mode-indicator')?.classList.add('hidden');
    }
  }

  renderPickCards() {
    const container = document.getElementById('picks-container');
    if (!container) return;

    const dateEl = document.getElementById('daily-date');
    const date = new Date(this.slate.date);
    dateEl.textContent = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    const currentPicks = this.h2hMode && this.h2hCurrentPlayer === 2
      ? this.player2State?.picks || []
      : this.state.today.picks;

    container.innerHTML = this.slate.picks.map((pick, idx) => {
      const sport = SPORTS[pick.sport] || { icon: '🎯', name: pick.sport, color: '#6366f1', gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', bgTint: 'rgba(99, 102, 241, 0.1)' };
      const userPick = currentPicks[idx] || { choice: null, status: PICK_STATUS.UNSELECTED, isLockOfDay: false };
      const isSelected = userPick.choice !== null;
      const isSubmitted = this.h2hMode && this.h2hCurrentPlayer === 2
        ? this.player2State?.submitted
        : this.state.today.submitted;

      // Check if game is locked (started)
      const isLocked = isGameLocked(pick.gameTime) || isSubmitted;
      const gameStatus = getGameStatusDisplay(pick.gameTime, pick.status);

      const gameTime = formatGameTime(pick.gameTime);
      const isLockOfDay = this.state.today.lockOfDayIndex === idx;

      let statusClass = '';
      let statusIcon = '';
      if (userPick.status === PICK_STATUS.PENDING) {
        statusClass = 'pending';
        statusIcon = '<span class="status-icon">🕐</span>';
      } else if (userPick.status === PICK_STATUS.WON) {
        statusClass = 'won';
        statusIcon = '<span class="status-icon">✅</span>';
      } else if (userPick.status === PICK_STATUS.LOST) {
        statusClass = 'lost';
        statusIcon = '<span class="status-icon">❌</span>';
      } else if (userPick.status === PICK_STATUS.PUSH) {
        statusClass = 'push';
        statusIcon = '<span class="status-icon">🔄</span>';
      } else if (userPick.status === PICK_STATUS.PASSED) {
        statusClass = 'passed';
        statusIcon = '<span class="status-icon">⏭️</span>';
      }

      const lockBadge = isLockOfDay ? '<span class="lock-header-badge">🔒</span>' : '';

      return `
        <div class="pick-card ${isSelected ? 'selected' : ''} ${statusClass} ${isLocked ? 'locked' : ''} ${isLockOfDay ? 'is-lock' : ''}"
             data-pick-index="${idx}"
             data-sport="${pick.sport}"
             style="--sport-color: ${sport.color}; --sport-gradient: ${sport.gradient}; --sport-tint: ${sport.bgTint};">
          <div class="pick-header" style="background: ${sport.gradient};">
            <div class="pick-sport">
              <span class="sport-icon">${sport.icon}</span>
              <span class="sport-name">${sport.name}</span>
              ${lockBadge}
            </div>
            <div class="pick-meta">
              <span class="game-status-badge ${gameStatus.class}">${gameStatus.text}</span>
              <span class="pick-market">
                ${pick.market.toUpperCase()}
                <button class="market-help-btn" onclick="event.stopPropagation(); game.showMarketHelp('${pick.market}')" aria-label="What is ${pick.market}?">?</button>
              </span>
            </div>
          </div>
          <div class="pick-matchup">
            <div class="matchup-teams">
              <span class="team-logo">${pick.matchup.awayLogo || ''}</span>
              ${pick.matchup.away}
              <span class="matchup-vs">@</span>
              ${pick.matchup.home}
              <span class="team-logo">${pick.matchup.homeLogo || ''}</span>
            </div>
            <div class="matchup-detail">${pick.marketDetail}</div>
          </div>
          ${this.renderPickOptions(pick, userPick, idx)}
          ${!isLocked && !isSubmitted && !this.h2hMode && userPick.choice !== 'PASS' && userPick.choice !== null ? `
            <div class="lock-of-day-section">
              ${isLockOfDay ? `
                <div class="lock-active-badge">
                  <span class="lock-badge-icon">🔒</span>
                  <span class="lock-badge-text">LOCK OF THE DAY</span>
                </div>
              ` : ''}
              <button class="lock-toggle-btn ${isLockOfDay ? 'locked' : ''}" onclick="game.toggleLockOfDay(${idx})">
                <span class="lock-toggle-text">
                  ${isLockOfDay ? '✓ Locked In' : '🔒 Make this my Lock'}
                </span>
                <span class="lock-info-tooltip" onclick="event.stopPropagation(); game.showLockInfo()">
                  <span class="info-icon">ⓘ</span>
                </span>
              </button>
            </div>
          ` : ''}
          ${isLocked && !isSubmitted ? '<div class="locked-overlay"><span>🔒 Game Started</span></div>' : ''}
          ${statusIcon}
        </div>
      `;
    }).join('');
  }

  /**
   * Render pick options based on pick type (Prop Mode vs Spread Mode)
   * @param {Object} pick - The pick data from slate
   * @param {Object} userPick - The user's pick state
   * @param {number} idx - The pick index
   * @returns {string} HTML string for pick options
   */
  renderPickOptions(pick, userPick, idx) {
    // Determine pick mode based on market type
    const market = pick.market?.toLowerCase() || '';
    const isSpreadMode = market === 'spread' || market === 'moneyline';
    const isPropMode = market === 'player_prop' || market === 'total' || market.includes('prop');

    // Default to prop mode if unclear
    const mode = isSpreadMode ? 'spread' : 'prop';
    const modeClass = isSpreadMode ? 'spread-mode' : 'prop-mode';

    // Get option labels based on mode
    let optionALabel, optionAShort, optionBLabel, optionBShort;
    let optionAClass = '', optionBClass = '';

    if (isSpreadMode) {
      // Spread Mode: Team A / Team B
      optionALabel = pick.optionA?.label || 'TEAM A';
      optionAShort = pick.optionA?.short || pick.matchup?.away || 'Away';
      optionBLabel = pick.optionB?.label || 'TEAM B';
      optionBShort = pick.optionB?.short || pick.matchup?.home || 'Home';
      optionAClass = 'team-a';
      optionBClass = 'team-b';
    } else {
      // Prop Mode: Over / Under
      optionALabel = pick.optionA?.label || 'OVER';
      optionAShort = pick.optionA?.short || 'Over the line';
      optionBLabel = pick.optionB?.label || 'UNDER';
      optionBShort = pick.optionB?.short || 'Under the line';
      optionAClass = 'over';
      optionBClass = 'under';
    }

    // Determine winner/loser states
    const isAWinner = userPick.status === PICK_STATUS.WON && userPick.choice === 'A';
    const isALoser = userPick.status === PICK_STATUS.LOST && userPick.choice === 'A';
    const isBWinner = userPick.status === PICK_STATUS.WON && userPick.choice === 'B';
    const isBLoser = userPick.status === PICK_STATUS.LOST && userPick.choice === 'B';

    return `
      <div class="pick-options three-way ${modeClass}" data-mode="${mode}">
        <div class="pick-option ${optionAClass} ${userPick.choice === 'A' ? 'selected' : ''} ${isAWinner ? 'winner' : ''} ${isALoser ? 'loser' : ''}"
             onclick="game.selectPick(${idx}, 'A')">
          <span class="option-label">${optionALabel}</span>
          <span class="option-short">${optionAShort}</span>
        </div>
        <div class="pick-option ${optionBClass} ${userPick.choice === 'B' ? 'selected' : ''} ${isBWinner ? 'winner' : ''} ${isBLoser ? 'loser' : ''}"
             onclick="game.selectPick(${idx}, 'B')">
          <span class="option-label">${optionBLabel}</span>
          <span class="option-short">${optionBShort}</span>
        </div>
        <div class="pick-option pass ${userPick.choice === 'PASS' ? 'selected' : ''}"
             onclick="game.selectPick(${idx}, 'PASS')">
          <span class="option-label">PASS</span>
          <span class="option-short">Skip this pick</span>
        </div>
      </div>
    `;
  }

  updateProgress() {
    const currentPicks = this.h2hMode && this.h2hCurrentPlayer === 2
      ? this.player2State?.picks || []
      : this.state.today.picks;

    const made = currentPicks.filter(p => p.choice !== null).length;
    const total = 7;
    const progressEl = document.getElementById('picks-made');
    const oldValue = parseInt(progressEl.textContent) || 0;

    progressEl.textContent = made;
    document.getElementById('mini-fill').style.width = `${(made / total) * 100}%`;

    if (made > oldValue) {
      const progressContainer = document.querySelector('.daily-progress');
      progressContainer.classList.add('progress-bump');
      setTimeout(() => progressContainer.classList.remove('progress-bump'), 300);

      if (made === total && !this.state.today.submitted) {
        this.showMiniConfetti();
        this.showToast('All picks made! Ready to submit.');
      }
    }
  }

  checkSubmitButton() {
    // Delegate to new updateSubmitButton
    this.updateSubmitButton();
  }

  updateCardState() {
    const resultsState = document.getElementById('results-state');
    const pendingBanner = document.getElementById('pending-banner');

    resultsState?.classList.add('hidden');
    pendingBanner?.classList.add('hidden');

    if (this.state.today.submitted) {

      const allGraded = this.state.today.picks.every(p =>
        p.status === PICK_STATUS.WON || p.status === PICK_STATUS.LOST || p.status === PICK_STATUS.PUSH || p.status === PICK_STATUS.PASSED
      );

      if (allGraded && this.state.today.graded) {
        this.showResultsSummary();
      } else {
        pendingBanner?.classList.remove('hidden');
        this.updatePendingBanner();
      }
    }
  }

  updatePendingBanner() {
    const pendingCount = this.state.today.picks.filter(p => p.status === PICK_STATUS.PENDING).length;
    const gradedCount = this.state.today.picks.filter(p =>
      p.status === PICK_STATUS.WON || p.status === PICK_STATUS.LOST || p.status === PICK_STATUS.PUSH || p.status === PICK_STATUS.PASSED
    ).length;

    const pendingText = document.getElementById('pending-text');
    if (pendingText) {
      pendingText.textContent = `${gradedCount}/7 results in • ${pendingCount} pending`;
    }
  }

  renderPendingPicks() {
    const section = document.getElementById('pending-picks-section');
    const list = document.getElementById('pending-picks-list');
    const status = document.getElementById('pending-picks-status');
    const testingPanel = document.getElementById('testing-panel');

    if (!section || !list) return;

    // Always show testing panel for dev/testing
    // testingPanel stays visible

    if (!this.state.today.submitted || this.state.today.graded) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');

    const resolvedCount = this.state.today.picks.filter(p =>
      p.status === PICK_STATUS.WON || p.status === PICK_STATUS.LOST || p.status === PICK_STATUS.PUSH || p.status === PICK_STATUS.PASSED
    ).length;

    if (status) {
      status.textContent = `${resolvedCount}/7 resolved`;
    }

    list.innerHTML = this.state.today.picks.map((pick, idx) => {
      const slatePick = this.slate.picks[idx];
      const sport = SPORTS[slatePick.sport] || { icon: '🎯', name: slatePick.sport };
      const isLock = this.state.today.lockOfDayIndex === idx;
      const userChoice = pick.choice === 'PASS' ? { short: 'PASS' } : (pick.choice === 'A' ? slatePick.optionA : slatePick.optionB);

      let statusClass = 'pending';
      let statusIcon = '🕐';
      let statusText = 'Pending';

      if (pick.status === PICK_STATUS.WON) {
        statusClass = 'won';
        statusIcon = '✅';
        statusText = 'Won';
      } else if (pick.status === PICK_STATUS.LOST) {
        statusClass = 'lost';
        statusIcon = '❌';
        statusText = 'Lost';
      } else if (pick.status === PICK_STATUS.PUSH) {
        statusClass = 'push';
        statusIcon = '🔄';
        statusText = 'Push';
      } else if (pick.status === PICK_STATUS.PASSED) {
        statusClass = 'passed';
        statusIcon = '⏭️';
        statusText = 'Passed';
      }

      const gameStatus = getGameStatusDisplay(slatePick.gameTime, slatePick.status);

      return `
        <div class="pending-pick-item ${statusClass}">
          <div class="pending-pick-sport">
            <span class="pending-pick-icon">${sport.icon}</span>
            ${isLock ? '<span class="pending-lock-badge">🔒</span>' : ''}
          </div>
          <div class="pending-pick-info">
            <span class="pending-pick-matchup">${slatePick.matchup.away} @ ${slatePick.matchup.home}</span>
            <span class="pending-pick-choice">Your pick: <strong>${userChoice.short}</strong></span>
          </div>
          <div class="pending-pick-status">
            <span class="pending-status-icon">${statusIcon}</span>
            <span class="pending-status-text">${statusText}</span>
            <span class="pending-time">${gameStatus.text}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderChallenges() {
    const container = document.getElementById('challenges-list');
    const progressEl = document.getElementById('challenges-progress');
    if (!container) return;

    const challenges = this.state.today.challenges || [];
    if (challenges.length === 0) {
      container.innerHTML = '<p class="challenges-empty">No challenges today</p>';
      if (progressEl) progressEl.textContent = '0/0';
      return;
    }

    const completedCount = challenges.filter(c => c.completed).length;
    if (progressEl) progressEl.textContent = `${completedCount}/${challenges.length}`;

    container.innerHTML = challenges.map(ch => {
      const def = DAILY_CHALLENGES.find(d => d.id === ch.id);
      if (!def) return '';
      const done = ch.completed;
      return `
        <div class="challenge-item ${done ? 'completed' : ''}">
          <span class="challenge-icon">${def.icon}</span>
          <div class="challenge-info">
            <span class="challenge-name">${def.name}</span>
            <span class="challenge-desc">${def.desc}</span>
          </div>
          <span class="challenge-status">${done ? '✅' : '⬜'}</span>
          ${done ? `<span class="challenge-reward">+${def.xp}XP +${def.coins}C</span>` : ''}
        </div>
      `;
    }).join('');
  }

  showSubmittedState() {
    // Use new renderSubmittedPicksSummary and show submitted section
    this.renderSubmittedPicksSummary();
    document.getElementById('submit-section')?.classList.add('hidden');
    document.getElementById('submitted-section')?.classList.remove('hidden');
  }

  showResultsSummary() {
    const correct = this.state.today.picks.filter(p => p.status === PICK_STATUS.WON).length;
    const resultsSummary = document.getElementById('results-summary');
    if (resultsSummary) {
      resultsSummary.classList.remove('hidden');
      resultsSummary.innerHTML = `
        <div class="results-mini">
          <span class="results-score-mini">${correct}/7</span>
          <span class="results-label">Today's Score</span>
        </div>
      `;
    }
  }

  // ========================================
  // PICK HANDLING
  // ========================================

  selectPick(index, choice) {
    const slatePick = this.slate.picks[index];

    // Check if game has started (locked)
    if (isGameLocked(slatePick.gameTime)) {
      this.showToast('Game has started - pick is locked!');
      return;
    }

    // Handle H2H mode
    if (this.h2hMode && this.h2hCurrentPlayer === 2) {
      if (this.player2State?.submitted) return;

      this.player2State.picks[index] = {
        choice: choice,
        status: PICK_STATUS.SELECTED,
        isLockOfDay: false
      };
      localStorage.setItem('sportsiq_p2', JSON.stringify(this.player2State));
      this.render();
      return;
    }

    // Normal mode
    if (this.state.today.submitted) return;

    const isFirstPick = this.state.stats.allTime.totalPicks === 0 &&
                        !this.state.today.picks.some(p => p.choice !== null);

    const previousChoice = this.state.today.picks[index].choice;

    // If selecting PASS and this was the lock, clear the lock
    if (choice === 'PASS' && this.state.today.lockOfDayIndex === index) {
      this.state.today.lockOfDayIndex = null;
    }

    this.state.today.picks[index] = {
      choice: choice,
      status: PICK_STATUS.SELECTED,
      isLockOfDay: choice !== 'PASS' && this.state.today.lockOfDayIndex === index
    };
    this.saveState();

    if (isFirstPick) {
      this.awardBadge('first_pick');
    }

    // Animate selection
    const card = document.querySelector(`.pick-card[data-pick-index="${index}"]`);
    if (card) {
      card.classList.add('selected');
      card.querySelectorAll('.pick-option').forEach(opt => opt.classList.remove('selected'));
      // Find the correct option (A=first, B=second, PASS=third)
      const optionIndex = choice === 'A' ? 0 : (choice === 'B' ? 1 : 2);
      const selectedOpt = card.querySelectorAll('.pick-option')[optionIndex];
      selectedOpt?.classList.add('selected');
      selectedOpt?.classList.add('option-bounce');
      setTimeout(() => selectedOpt?.classList.remove('option-bounce'), 400);
      card.classList.add('card-pulse');
      setTimeout(() => card.classList.remove('card-pulse'), 500);
    }

    this.updateProgress();
    this.checkSubmitButton();

    if (previousChoice === null) {
      this.renderPickCards();
    }
  }

  toggleLockOfDay(index) {
    if (this.state.today.submitted) return;
    if (this.state.today.picks[index].choice === null) return;
    if (this.state.today.picks[index].choice === 'PASS') return; // Can't lock a PASS
    if (this.h2hMode) return; // No lock of day in H2H mode

    if (this.state.today.lockOfDayIndex === index) {
      this.state.today.lockOfDayIndex = null;
      this.showToast('Lock removed');
    } else {
      // Remove previous lock and set new one
      const previousLock = this.state.today.lockOfDayIndex;
      this.state.today.lockOfDayIndex = index;

      if (previousLock !== null) {
        this.showToast('🔒 Lock moved to this pick!');
      } else {
        this.showToast('🔒 Lock of the Day set!');
      }
    }

    this.saveState();
    this.renderPickCards();
  }

  showLockInfo() {
    const isCompetitive = this.getScoringMode() === SCORING_MODE.COMPETITIVE;
    if (isCompetitive) {
      this.showLockInfoModal();
    } else {
      this.showToast('💡 Correct Lock = +5 pts bonus!');
    }
  }

  showLockInfoModal() {
    const isCompetitive = this.getScoringMode() === SCORING_MODE.COMPETITIVE;

    // Remove existing modal if present
    document.getElementById('lock-info-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'lock-info-modal';
    modal.className = 'market-help-modal';
    modal.innerHTML = `
      <div class="market-help-backdrop" onclick="game.closeLockInfoModal()"></div>
      <div class="market-help-content">
        <div class="market-help-header">
          <span class="market-help-icon">🔒</span>
          <h3>Lock of the Day</h3>
        </div>
        <p class="market-help-text">Your most confident pick! Set ONE pick as your Lock for bonus points.</p>
        <div class="lock-info-rules">
          <div class="lock-info-rule success">
            <span>✅ Lock Correct</span>
            <strong>+5 pts</strong>
          </div>
          <div class="lock-info-rule ${isCompetitive ? 'danger' : ''}">
            <span>❌ Lock Wrong</span>
            <strong>${isCompetitive ? '-5 pts' : '0 pts'}</strong>
          </div>
        </div>
        ${isCompetitive ? '<p class="lock-info-warning">⚡ Competitive Mode active: Wrong locks cost points!</p>' : ''}
        <button class="market-help-close" onclick="game.closeLockInfoModal()">Got it</button>
      </div>
    `;
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
  }

  closeLockInfoModal() {
    const modal = document.getElementById('lock-info-modal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  showMarketHelp(market) {
    const helpContent = {
      spread: {
        title: 'Spread Pick',
        text: 'Choose which team will cover the point spread. Pick TEAM A or TEAM B based on who you think beats the spread.',
        example: 'Example: Lakers -5.5 means they must win by 6+ points to cover',
        choices: 'Your choices: TEAM A / TEAM B / PASS'
      },
      total: {
        title: 'Total (Over/Under)',
        text: 'Pick whether the combined score will go OVER or UNDER the posted number.',
        example: 'Example: Over 220.5 means both teams score 221+ combined',
        choices: 'Your choices: OVER / UNDER / PASS'
      },
      moneyline: {
        title: 'Moneyline Pick',
        text: 'Simply pick which team will win the game outright.',
        example: 'No point spread involved — just pick the winner',
        choices: 'Your choices: TEAM A / TEAM B / PASS'
      },
      player_prop: {
        title: 'Player Prop',
        text: 'Predict whether a player\'s stat will go OVER or UNDER the posted line.',
        example: 'Example: LeBron James Over 25.5 points',
        choices: 'Your choices: OVER / UNDER / PASS'
      }
    };

    const help = helpContent[market.toLowerCase()] || {
      title: market.toUpperCase(),
      text: 'Make your prediction for this matchup.',
      example: ''
    };

    this.showMarketHelpModal(help);
  }

  showMarketHelpModal(help) {
    // Remove existing modal if present
    document.getElementById('market-help-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'market-help-modal';
    modal.className = 'market-help-modal';
    modal.innerHTML = `
      <div class="market-help-backdrop" onclick="game.closeMarketHelp()"></div>
      <div class="market-help-content">
        <div class="market-help-header">
          <span class="market-help-icon">📊</span>
          <h3>${help.title}</h3>
        </div>
        <p class="market-help-text">${help.text}</p>
        ${help.example ? `<p class="market-help-example">${help.example}</p>` : ''}
        ${help.choices ? `<p class="market-help-choices">${help.choices}</p>` : ''}
        <button class="market-help-close" onclick="game.closeMarketHelp()">Got it</button>
      </div>
    `;
    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
  }

  closeMarketHelp() {
    const modal = document.getElementById('market-help-modal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  }

  // ========================================
  // CARD SUBMISSION
  // ========================================

  submitCard() {
    // Handle H2H Player 2
    if (this.h2hMode && this.h2hCurrentPlayer === 2) {
      this.submitPlayer2Card();
      return;
    }

    if (this.state.today.submitted) return;
    if (!this.state.today.picks.every(p => p.choice !== null)) return;

    // Mark picks as pending (or PASSED for PASS choices)
    this.state.today.picks = this.state.today.picks.map((pick, idx) => ({
      ...pick,
      status: pick.choice === 'PASS' ? PICK_STATUS.PASSED : PICK_STATUS.PENDING,
      isLockOfDay: this.state.today.lockOfDayIndex === idx
    }));

    this.state.today.submitted = true;
    this.state.today.submittedAt = new Date().toISOString();
    this.saveState();

    if (!this.state.badges.includes('first_card')) {
      this.awardBadge('first_card');
    }

    this.playSound('submit');
    this.render();

    // Immediately check for any completed games
    setTimeout(() => this.checkForPendingResults(), 1000);
  }

  submitPlayer2Card() {
    if (!this.player2State || this.player2State.submitted) return;
    if (!this.player2State.picks.every(p => p.choice !== null)) return;

    this.player2State.picks = this.player2State.picks.map(pick => ({
      ...pick,
      status: PICK_STATUS.PENDING
    }));

    this.player2State.submitted = true;
    this.player2State.submittedAt = new Date().toISOString();
    localStorage.setItem('sportsiq_p2', JSON.stringify(this.player2State));

    this.showConfetti();
    this.showToast('Player 2 picks submitted!');
    this.render();
    this.renderH2HScoreboard();
  }

  // ========================================
  // RESULT RESOLUTION
  // ========================================

  async checkForPendingResults() {
    if (!this.state.today.submitted) return;
    if (this.state.today.graded) return;

    let hasNewResults = false;
    let allResolved = true;

    // Use real result grading from ESPN
    try {
      const results = await checkAndGradeResults(this.state.today.picks, this.slate);

      for (const [idx, result] of Object.entries(results)) {
        const pick = this.state.today.picks[idx];
        if (pick.status === PICK_STATUS.PENDING) {
          // Handle WIN, LOSS, or PUSH
          if (result.status === 'PUSH') {
            pick.status = PICK_STATUS.PUSH;
            pick.finalScore = result.finalScore;
            hasNewResults = true;
          } else {
            const userWon = result.status === 'WON';
            pick.status = userWon ? PICK_STATUS.WON : PICK_STATUS.LOST;
            pick.finalScore = result.finalScore;
            hasNewResults = true;
            this.recordPickResult(parseInt(idx), userWon, this.slate.picks[idx]);
          }
        }
      }
    } catch (error) {
      console.error('Failed to check real results:', error);
    }

    // Check for any still pending
    this.state.today.picks.forEach((pick, idx) => {
      if (pick.status === PICK_STATUS.PENDING) {
        allResolved = false;
      }
    });

    if (hasNewResults) {
      this.saveState();
      this.render();
      this.playSound('result');

      // Also update H2H if active
      if (this.h2hMode && this.player2State?.submitted) {
        this.checkH2HResults();
      }
    }

    if (allResolved && !this.state.today.graded) {
      this.finalizeCard();
    }
  }

  getGameResult(slatePick) {
    if (slatePick.result !== null) {
      return slatePick.result;
    }
    const storedResult = getStoredResult(this.slate.date, slatePick.id);
    if (storedResult !== null) {
      return storedResult;
    }
    return null;
  }

  resolveResult(pickIndex, result) {
    if (!this.state.today.submitted) {
      this.showToast('Submit your picks first!');
      return;
    }

    const pick = this.state.today.picks[pickIndex];
    if (pick.status !== PICK_STATUS.PENDING) {
      return;
    }

    const slatePick = this.slate.picks[pickIndex];
    storeGameResult(this.slate.date, slatePick.id, result);

    const userWon = pick.choice === result;
    pick.status = userWon ? PICK_STATUS.WON : PICK_STATUS.LOST;
    this.recordPickResult(pickIndex, userWon, slatePick);

    this.saveState();
    this.render();
    this.playSound('result');

    const allResolved = this.state.today.picks.every(p =>
      p.status === PICK_STATUS.WON || p.status === PICK_STATUS.LOST || p.status === PICK_STATUS.PASSED || p.status === PICK_STATUS.PUSH
    );

    if (allResolved && !this.state.today.graded) {
      this.finalizeCard();
    }
  }

  resolveAllResults() {
    if (!this.state.today.submitted) {
      this.showToast('Submit your picks first!');
      return;
    }

    this.state.today.picks.forEach((pick, idx) => {
      if (pick.status === PICK_STATUS.PENDING) {
        const result = Math.random() > 0.45 ? 'A' : 'B';
        this.resolveResult(idx, result);
      }
    });
  }

  resolveOneRandom() {
    if (!this.state.today.submitted) {
      this.showToast('Submit your picks first!');
      return;
    }

    const pendingIndices = this.state.today.picks
      .map((pick, idx) => pick.status === PICK_STATUS.PENDING ? idx : -1)
      .filter(idx => idx !== -1);

    if (pendingIndices.length === 0) {
      this.showToast('All picks already resolved!');
      return;
    }

    const randomIdx = pendingIndices[Math.floor(Math.random() * pendingIndices.length)];
    const result = Math.random() > 0.45 ? 'A' : 'B';
    this.resolveResult(randomIdx, result);

    const slatePick = this.slate.picks[randomIdx];
    this.showToast(`Resolved: ${slatePick.matchup.away} @ ${slatePick.matchup.home}`);
  }

  // ========================================
  // SIMULATE END OF DAY (Testing Mode)
  // ========================================

  simulateEndOfDay() {
    // If not submitted, auto-fill and submit first
    if (!this.state.today.submitted) {
      // Auto-fill any missing picks
      this.state.today.picks.forEach((pick, idx) => {
        if (pick.choice === null) {
          pick.choice = Math.random() > 0.5 ? 'A' : 'B';
          pick.status = PICK_STATUS.SELECTED;
        }
      });

      // Set lock of day if not set
      if (this.state.today.lockOfDayIndex === null) {
        this.state.today.lockOfDayIndex = Math.floor(Math.random() * this.state.today.picks.length);
        this.state.today.picks[this.state.today.lockOfDayIndex].isLockOfDay = true;
      }

      // Submit the card
      this.state.today.picks = this.state.today.picks.map((pick, idx) => ({
        ...pick,
        status: pick.choice === 'PASS' ? PICK_STATUS.PASSED : PICK_STATUS.PENDING,
        isLockOfDay: this.state.today.lockOfDayIndex === idx
      }));
      this.state.today.submitted = true;
      this.state.today.submittedAt = new Date().toISOString();
      this.saveState();
    }

    // Randomly resolve all pending picks (WIN/LOSS/PUSH) - PASSED picks are skipped
    this.state.today.picks.forEach((pick, idx) => {
      if (pick.status === PICK_STATUS.PENDING) {
        const rand = Math.random();
        let newStatus;

        if (rand < 0.05) {
          // 5% chance of PUSH
          newStatus = PICK_STATUS.PUSH;
        } else if (rand < 0.55) {
          // 50% chance of WIN
          newStatus = PICK_STATUS.WON;
          this.recordPickResult(idx, true, this.slate.picks[idx]);
        } else {
          // 45% chance of LOSS
          newStatus = PICK_STATUS.LOST;
          this.recordPickResult(idx, false, this.slate.picks[idx]);
        }

        pick.status = newStatus;
        pick.finalScore = `${Math.floor(Math.random() * 50) + 80}-${Math.floor(Math.random() * 50) + 80}`;
      }
    });

    this.saveState();
    this.showToast('Simulating end of day...');

    // Short delay then finalize
    setTimeout(() => {
      this.finalizeCard();
      this.render();
      this.showConfetti();
    }, 500);
  }

  resetTodaysCard() {
    if (!confirm('Reset today\'s card? This will clear all picks.')) return;

    this.state.today = {
      date: getTodayString(),
      picks: this.slate.picks.map(() => ({
        choice: null,
        status: PICK_STATUS.UNSELECTED,
        isLockOfDay: false
      })),
      lockOfDayIndex: null,
      submitted: false,
      submittedAt: null,
      graded: false,
      gradedAt: null,
      score: null
    };

    this.saveState();
    this.render();
    this.showToast('Today\'s card reset!');
  }

  recordPickResult(idx, won, slatePick) {
    if (this.isTestingMode()) return;

    const sport = slatePick.sport;
    if (!this.state.stats.allTime.bySport[sport]) {
      this.state.stats.allTime.bySport[sport] = { total: 0, correct: 0 };
    }
    this.state.stats.allTime.bySport[sport].total++;
    if (won) {
      this.state.stats.allTime.bySport[sport].correct++;
    }

    const market = slatePick.market;
    if (!this.state.stats.allTime.byMarket[market]) {
      this.state.stats.allTime.byMarket[market] = { total: 0, correct: 0 };
    }
    this.state.stats.allTime.byMarket[market].total++;
    if (won) {
      this.state.stats.allTime.byMarket[market].correct++;
    }

    if (won) {
      this.state.stats.allTime.currentPickStreak++;
      this.state.stats.allTime.bestPickStreak = Math.max(
        this.state.stats.allTime.bestPickStreak,
        this.state.stats.allTime.currentPickStreak
      );

      if (this.state.stats.allTime.currentPickStreak >= 3) this.awardBadge('three_streak');
      if (this.state.stats.allTime.currentPickStreak >= 5) this.awardBadge('five_streak');
      if (this.state.stats.allTime.currentPickStreak >= 10) this.awardBadge('ten_streak');

      if (!this.state.badges.includes('first_win')) {
        this.awardBadge('first_win');
      }
    } else {
      this.state.stats.allTime.currentPickStreak = 0;
    }
  }

  finalizeCard() {
    if (this.isTestingMode()) {
      this.showToast('Card finalized (testing – no stats saved)');
      this.state.today.graded = true;
      this.state.today.gradedAt = new Date().toISOString();
      this.saveTestingState();
      this.render();
      return;
    }

    // Prepare picks for the scoring engine
    const picksForScoring = this.state.today.picks.map((pick, idx) => ({
      choice: pick.choice,
      isLockOfDay: idx === this.state.today.lockOfDayIndex
    }));

    // Build results from pick statuses
    const resultsForScoring = this.state.today.picks.map(pick => {
      let correctAnswer = null;
      let status = 'pending';

      if (pick.status === PICK_STATUS.WON) {
        correctAnswer = pick.choice;
        status = 'final';
      } else if (pick.status === PICK_STATUS.LOST) {
        correctAnswer = pick.choice === 'A' ? 'B' : 'A';
        status = 'final';
      } else if (pick.status === PICK_STATUS.PUSH) {
        status = 'push';
      } else if (pick.status === PICK_STATUS.PASSED) {
        status = 'final';
      }

      return { correctAnswer, status };
    });

    // Use the centralized scoring engine with user's selected mode
    const scoringMode = this.getScoringMode();
    const scoreResult = calculateDailyScore(picksForScoring, resultsForScoring, scoringMode);

    // Store the full score result for reference (includes scoring mode used)
    this.state.today.scoreResult = scoreResult;
    this.state.today.scoringMode = scoringMode; // Record which mode was used

    const correct = scoreResult.correctCount;
    const total = scoreResult.gradedCount;
    const isPerfect = scoreResult.isPerfect;
    const isNearPerfect = scoreResult.isNearPerfect;
    const lockWon = scoreResult.lockResult === 'won';

    // Update lock stats
    if (lockWon) {
      this.state.stats.allTime.lockOfDayWins++;
      if (this.state.stats.allTime.lockOfDayWins >= 10) {
        this.awardBadge('lock_master');
      }
    }

    this.state.today.graded = true;
    this.state.today.gradedAt = new Date().toISOString();
    this.state.today.score = correct;
    this.state.today.totalPoints = scoreResult.totalPoints;

    // Calculate XP and coins based on scoring engine results
    let xpEarned = scoreResult.basePoints; // Base XP = base points
    let coinsEarned = correct * COIN_CONFIG.correctPick;

    // Add bonus XP/coins
    if (lockWon) {
      xpEarned += XP_CONFIG.lockOfDayBonus;
      coinsEarned += COIN_CONFIG.lockOfDayBonus;
    }

    const streak = this.state.stats.allTime.currentPickStreak;
    if (streak >= 3) coinsEarned += COIN_CONFIG.threePlusStreak;
    if (streak >= 5) coinsEarned += COIN_CONFIG.fivePlusStreak;
    if (streak >= 7) coinsEarned += COIN_CONFIG.sevenPlusStreak;

    if (isPerfect) {
      xpEarned += XP_CONFIG.perfectDay;
      coinsEarned += COIN_CONFIG.perfectDay;
      this.state.stats.allTime.perfectDays++;
      this.state.stats.weekly.perfectDays++;
      this.state.stats.monthly.perfectDays++;
      this.awardBadge('perfect_day');

      if (this.state.stats.allTime.perfectDays >= 3) this.awardBadge('perfect_three');
      if (this.state.stats.allTime.perfectDays >= 10) this.awardBadge('perfect_ten');
    } else if (isNearPerfect) {
      // Near perfect bonus (XP only, coins handled by streak)
      xpEarned += SCORING_RULES.NEAR_PERFECT_BONUS;
    }

    this.state.stats.allTime.totalPicks += total;
    this.state.stats.allTime.correctPicks += correct;
    this.state.stats.allTime.daysPlayed++;

    if (scoreResult.totalPoints > (this.state.stats.allTime.bestDailyScore || 0)) {
      this.state.stats.allTime.bestDailyScore = scoreResult.totalPoints;
    }

    this.state.stats.weekly.picks += total;
    this.state.stats.weekly.correct += correct;
    this.state.stats.monthly.picks += total;
    this.state.stats.monthly.correct += correct;

    this.state.stats.allTime.currentDayStreak++;
    this.state.stats.allTime.bestDayStreak = Math.max(
      this.state.stats.allTime.bestDayStreak,
      this.state.stats.allTime.currentDayStreak
    );

    if (this.state.stats.allTime.currentDayStreak >= 7) this.awardBadge('week_warrior');
    if (this.state.stats.allTime.daysPlayed >= 30) this.awardBadge('daily_grinder');
    if (this.state.stats.allTime.correctPicks >= 100) this.awardBadge('century');

    this.checkSpecialistBadges();

    const oldLevel = this.state.level;
    this.state.xp += xpEarned;
    this.state.coins += coinsEarned;

    const newLevel = getLevelFromXp(this.state.xp);
    const leveledUp = newLevel > oldLevel;
    this.state.level = newLevel;

    if (this.state.level >= 5) this.awardBadge('level_5');
    if (this.state.level >= 10) this.awardBadge('level_10');
    if (this.state.level >= 15) this.awardBadge('level_15');

    const challengeResult = this.checkDailyChallenges(scoreResult);
    xpEarned += challengeResult.xp;
    coinsEarned += challengeResult.coins;
    this.state.xp += challengeResult.xp;
    this.state.coins += challengeResult.coins;

    const postChallengeLevel = getLevelFromXp(this.state.xp);
    if (postChallengeLevel > this.state.level) {
      this.state.level = postChallengeLevel;
    }

    this.state.history.unshift({
      date: this.state.today.date,
      picks: [...this.state.today.picks],
      score: correct,
      isPerfect: isPerfect,
      lockWon: lockWon,
      xpEarned: xpEarned,
      coinsEarned: coinsEarned,
      challengesCompleted: challengeResult.completed.map(c => c.id)
    });

    this.saveState();
    this.showResults(scoreResult, xpEarned, coinsEarned, leveledUp);

    // Check H2H results
    if (this.h2hMode) {
      setTimeout(() => this.checkH2HResults(), 1000);
    }

    // Update friend challenge with results
    this.updateFriendChallengeWithPicks();
  }

  checkSpecialistBadges() {
    const bySport = this.state.stats.allTime.bySport;
    const byMarket = this.state.stats.allTime.byMarket;

    if (bySport.NBA?.correct >= 50) this.awardBadge('nba_specialist');
    if (bySport.NFL?.correct >= 50) this.awardBadge('nfl_specialist');
    if (bySport.NHL?.correct >= 50) this.awardBadge('nhl_specialist');
    if (bySport.MLB?.correct >= 50) this.awardBadge('mlb_specialist');
    if (bySport.PROP?.correct >= 25) this.awardBadge('prop_master');
    if (byMarket.spread?.correct >= 50) this.awardBadge('spread_king');
  }

  checkDailyChallenges(scoreResult) {
    if (!this.state.today.challenges || this.state.today.challenges.length === 0) return { xp: 0, coins: 0, completed: [] };

    const picks = this.state.today.picks;
    const slatePicks = this.slate?.picks || [];
    let bonusXp = 0;
    let bonusCoins = 0;
    const completed = [];

    for (const challenge of this.state.today.challenges) {
      if (challenge.completed) continue;

      const def = DAILY_CHALLENGES.find(d => d.id === challenge.id);
      if (!def) continue;

      let passed = false;

      switch (challenge.id) {
        case 'sweep':
          passed = scoreResult.isPerfect === true;
          break;
        case 'lock_win':
          passed = scoreResult.lockResult === 'won';
          break;
        case 'no_pass':
          passed = picks.every(p => p.choice !== 'PASS' && p.status !== PICK_STATUS.PASSED);
          break;
        case 'streak_3':
          passed = this.state.stats.allTime.currentPickStreak >= 3;
          break;
        case 'five_correct':
          passed = scoreResult.correctCount >= 5;
          break;
        case 'underdog': {
          let spreadWins = 0;
          picks.forEach((p, i) => {
            if (p.status === PICK_STATUS.WON && slatePicks[i] && slatePicks[i].market === 'spread') {
              spreadWins++;
            }
          });
          passed = spreadWins >= 3;
          break;
        }
        case 'multi_sport': {
          const winningSports = new Set();
          picks.forEach((p, i) => {
            if (p.status === PICK_STATUS.WON && slatePicks[i]) {
              winningSports.add(slatePicks[i].sport);
            }
          });
          passed = winningSports.size >= 2;
          break;
        }
      }

      if (passed) {
        challenge.completed = true;
        bonusXp += def.xp;
        bonusCoins += def.coins;
        completed.push(def);
        if (!this.state.stats.allTime.challengesCompleted) {
          this.state.stats.allTime.challengesCompleted = 0;
        }
        this.state.stats.allTime.challengesCompleted++;
      }
    }

    return { xp: bonusXp, coins: bonusCoins, completed };
  }

  showResults(scoreResult, xp, coins, leveledUp) {
    const resultsState = document.getElementById('results-state');
    resultsState?.classList.remove('hidden');

    // Show total points instead of just correct count
    const scoreNumEl = document.querySelector('.score-num');
    const scoreLabelEl = document.querySelector('.score-label');
    if (scoreNumEl) scoreNumEl.textContent = scoreResult.totalPoints;
    if (scoreLabelEl) scoreLabelEl.textContent = 'Points';

    // Build rewards display with score breakdown
    let rewardsHtml = `
      <div class="reward-item">
        <span class="reward-icon">✅</span>
        <span class="reward-value">${scoreResult.correctCount}/${scoreResult.gradedCount} Correct</span>
      </div>
    `;

    // Show bonuses applied
    if (scoreResult.bonusesApplied.length > 0) {
      scoreResult.bonusesApplied.forEach(bonus => {
        rewardsHtml += `
          <div class="reward-item bonus">
            <span class="reward-icon">🎁</span>
            <span class="reward-value">${bonus}</span>
          </div>
        `;
      });
    }

    rewardsHtml += `
      <div class="reward-item xp">
        <span class="reward-icon">⭐</span>
        <span class="reward-value">+${xp} XP</span>
      </div>
      <div class="reward-item coins">
        <span class="reward-icon">🪙</span>
        <span class="reward-value">+${coins} Coins</span>
      </div>
    `;

    document.getElementById('results-rewards').innerHTML = rewardsHtml;

    this.updateHeader();
    this.renderPickCards();
    this.renderChallenges();

    this.showXPPopup(xp);
    if (coins > 0) {
      setTimeout(() => this.showCoinPopup(coins), 300);
    }

    if (scoreResult.isPerfect) {
      this.showConfetti();
      this.playSound('perfect');
    } else if (scoreResult.correctCount >= 4) {
      this.showConfetti();
      this.playSound('win');
    }

    if (leveledUp) {
      setTimeout(() => {
        document.getElementById('new-level').textContent = this.state.level;
        document.getElementById('levelup-modal')?.classList.remove('hidden');
        this.playSound('levelup');
      }, 800);
    }
  }

  // ========================================
  // HEAD-TO-HEAD MODE
  // ========================================

  startLocalH2H() {
    this.h2hMode = true;
    this.h2hCurrentPlayer = 1;

    // Initialize Player 2 state
    this.player2State = {
      date: getTodayString(),
      picks: this.slate.picks.map(() => ({
        choice: null,
        status: PICK_STATUS.UNSELECTED,
        isLockOfDay: false
      })),
      submitted: false,
      submittedAt: null,
      score: null
    };
    localStorage.setItem('sportsiq_p2', JSON.stringify(this.player2State));

    this.showToast('H2H Mode Started! Player 1, make your picks.');
    this.hideH2HCreate();
    this.switchView('play');
    this.render();
    this.renderH2HScoreboard();
  }

  switchH2HPlayer() {
    if (!this.h2hMode) return;

    if (this.h2hCurrentPlayer === 1) {
      // Check if Player 1 submitted
      if (!this.state.today.submitted) {
        this.showToast('Player 1 must submit picks first!');
        return;
      }
      this.h2hCurrentPlayer = 2;
      this.showToast('Player 2, make your picks!');
    } else {
      this.h2hCurrentPlayer = 1;
      this.showToast('Viewing Player 1 picks');
    }

    this.render();
    this.renderH2HScoreboard();
  }

  renderH2HScoreboard() {
    const scoreboard = document.getElementById('h2h-scoreboard');
    if (!scoreboard) return;

    if (!this.h2hMode) {
      scoreboard.classList.add('hidden');
      return;
    }

    scoreboard.classList.remove('hidden');

    const p1Score = this.state.today.picks.filter(p => p.status === PICK_STATUS.WON).length;
    const p1Pending = this.state.today.picks.filter(p => p.status === PICK_STATUS.PENDING).length;
    const p1Submitted = this.state.today.submitted;

    const p2Score = this.player2State?.picks.filter(p => p.status === PICK_STATUS.WON).length || 0;
    const p2Pending = this.player2State?.picks.filter(p => p.status === PICK_STATUS.PENDING).length || 0;
    const p2Submitted = this.player2State?.submitted || false;

    const bothSubmitted = p1Submitted && p2Submitted;
    const bothGraded = this.state.today.graded && p2Pending === 0;

    let winnerText = '';
    if (bothGraded) {
      if (p1Score > p2Score) {
        winnerText = `${this.state.username} Wins! 🏆`;
      } else if (p2Score > p1Score) {
        winnerText = 'Player 2 Wins! 🏆';
      } else {
        winnerText = "It's a Tie! 🤝";
      }
    }

    scoreboard.innerHTML = `
      <div class="h2h-scoreboard-header">
        <span>⚔️ Head-to-Head</span>
        ${!bothGraded ? `<button class="h2h-switch-btn" id="h2h-switch-player">
          Switch to ${this.h2hCurrentPlayer === 1 ? 'P2' : 'P1'}
        </button>` : ''}
      </div>
      <div class="h2h-scoreboard-body">
        <div class="h2h-player ${this.h2hCurrentPlayer === 1 ? 'active' : ''}">
          <span class="h2h-player-name">${this.state.username}</span>
          <span class="h2h-player-score">${p1Score}</span>
          <span class="h2h-player-status">${p1Submitted ? (p1Pending > 0 ? `${p1Pending} pending` : 'Final') : 'Picking...'}</span>
        </div>
        <div class="h2h-vs">VS</div>
        <div class="h2h-player ${this.h2hCurrentPlayer === 2 ? 'active' : ''}">
          <span class="h2h-player-name">Player 2</span>
          <span class="h2h-player-score">${p2Score}</span>
          <span class="h2h-player-status">${p2Submitted ? (p2Pending > 0 ? `${p2Pending} pending` : 'Final') : 'Picking...'}</span>
        </div>
      </div>
      ${winnerText ? `<div class="h2h-winner">${winnerText}</div>` : ''}
    `;

    // Rebind switch button
    document.getElementById('h2h-switch-player')?.addEventListener('click', () => {
      this.switchH2HPlayer();
    });
  }

  checkH2HResults() {
    if (!this.h2hMode || !this.player2State) return;

    // Apply same results to Player 2
    this.state.today.picks.forEach((pick, idx) => {
      if (pick.status === PICK_STATUS.WON || pick.status === PICK_STATUS.LOST) {
        const p2Pick = this.player2State.picks[idx];
        if (p2Pick && p2Pick.status === PICK_STATUS.PENDING) {
          const slatePick = this.slate.picks[idx];
          const result = this.getGameResult(slatePick);
          if (result) {
            p2Pick.status = p2Pick.choice === result ? PICK_STATUS.WON : PICK_STATUS.LOST;
          }
        }
      }
    });

    localStorage.setItem('sportsiq_p2', JSON.stringify(this.player2State));
    this.renderH2HScoreboard();
  }

  showH2HCreate() {
    document.getElementById('h2h-main')?.classList.add('hidden');
    document.getElementById('h2h-create')?.classList.remove('hidden');
  }

  hideH2HCreate() {
    document.getElementById('h2h-create')?.classList.add('hidden');
    document.getElementById('h2h-main')?.classList.remove('hidden');
    const input = document.getElementById('h2h-username-input');
    if (input) input.value = '';
  }

  createRandomH2H() {
    const opponents = Object.values(MOCK_USERS);
    const opponent = opponents[Math.floor(Math.random() * opponents.length)];
    this.createH2HWithOpponent(opponent);
  }

  createH2HWithOpponent(opponent) {
    const existingChallenge = this.state.h2h.active.find(c =>
      c.opponentId === opponent.id && c.slateDate === this.slate.date
    );

    if (existingChallenge) {
      this.showToast(`Already have a challenge with ${opponent.username} today!`);
      return;
    }

    const challenge = createH2HChallenge(
      this.state.userId,
      opponent.id,
      this.slate
    );

    challenge.status = 'in_progress';
    challenge.opponentPicks = this.slate.picks.map(() => ({
      choice: Math.random() > 0.5 ? 'A' : 'B',
      status: PICK_STATUS.PENDING
    }));
    challenge.opponentSubmitted = true;

    this.state.h2h.active.push(challenge);
    this.saveState();

    this.showToast(`Challenge started with ${opponent.username}!`);
    this.hideH2HCreate();
    this.renderH2H();
  }

  inviteFriendByUsername() {
    const input = document.getElementById('h2h-username-input');
    const username = input?.value?.trim();

    if (!username) {
      this.showToast('Enter a username');
      return;
    }

    if (username.toLowerCase() === this.state.username.toLowerCase()) {
      this.showToast("Can't challenge yourself!");
      return;
    }

    let opponent = Object.values(MOCK_USERS).find(u =>
      u.username.toLowerCase() === username.toLowerCase()
    );

    if (!opponent) {
      opponent = {
        id: 'user_' + username.toLowerCase().replace(/\s/g, '_'),
        username: username,
        level: Math.floor(Math.random() * 10) + 1,
        avatar: ['🎯', '🏀', '🏈', '⚡', '🔥'][Math.floor(Math.random() * 5)]
      };
    }

    this.createH2HWithOpponent(opponent);
  }

  shareH2HChallenge() {
    const code = generateShareCode();
    navigator.clipboard?.writeText(`Join my Sports IQ challenge! Code: ${code}`);
    this.showToast('Challenge link copied!');
  }

  // ========================================
  // FRIEND CHALLENGE SYSTEM
  // ========================================

  createFriendChallenge() {
    // Generate unique challenge code
    const challengeCode = this.generateChallengeCode();
    const today = getTodayString();

    // Create challenge object
    const challenge = {
      id: challengeCode,
      date: today,
      creatorId: this.state.odubId || 'user_' + Date.now(),
      creatorName: this.state.username,
      creatorPicks: null,
      creatorScore: null,
      opponentId: null,
      opponentName: null,
      opponentPicks: null,
      opponentScore: null,
      status: 'pending', // pending, active, completed
      winner: null,
      createdAt: new Date().toISOString()
    };

    // Store challenge
    this.saveFriendChallenge(challenge);

    // Store as active challenge for this user
    this.state.activeFriendChallenge = challengeCode;
    this.saveState();

    // Generate and display link
    const baseUrl = window.location.origin + window.location.pathname;
    const challengeLink = `${baseUrl}?challenge=${challengeCode}`;

    document.getElementById('friend-challenge-link').value = challengeLink;
    document.getElementById('friend-challenge-modal')?.classList.remove('hidden');

    this.hideH2HCreate();
  }

  generateChallengeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  saveFriendChallenge(challenge) {
    const challenges = this.loadFriendChallenges();
    challenges[challenge.id] = challenge;
    localStorage.setItem('sportsiq_friend_challenges', JSON.stringify(challenges));
  }

  loadFriendChallenges() {
    const saved = localStorage.getItem('sportsiq_friend_challenges');
    return saved ? JSON.parse(saved) : {};
  }

  getFriendChallenge(code) {
    const challenges = this.loadFriendChallenges();
    return challenges[code] || null;
  }

  closeFriendChallengeModal() {
    document.getElementById('friend-challenge-modal')?.classList.add('hidden');
  }

  copyFriendChallengeLink() {
    const linkInput = document.getElementById('friend-challenge-link');
    if (linkInput) {
      linkInput.select();
      navigator.clipboard?.writeText(linkInput.value);
      this.showToast('Link copied!');
    }
  }

  shareFriendChallenge() {
    const linkInput = document.getElementById('friend-challenge-link');
    const link = linkInput?.value;

    if (navigator.share) {
      navigator.share({
        title: 'Sports IQ Challenge',
        text: `${this.state.username} challenged you to Sports IQ! Make your picks and see who wins.`,
        url: link
      }).catch(() => {
        // User cancelled or share failed
        this.copyFriendChallengeLink();
      });
    } else {
      this.copyFriendChallengeLink();
    }
  }

  checkForChallengeInUrl() {
    const params = new URLSearchParams(window.location.search);
    const challengeCode = params.get('challenge');

    if (challengeCode) {
      this.joinFriendChallenge(challengeCode);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  joinFriendChallenge(code) {
    const challenge = this.getFriendChallenge(code);

    if (!challenge) {
      // Challenge not found locally - create a new entry as opponent
      const today = getTodayString();
      const newChallenge = {
        id: code,
        date: today,
        creatorId: null,
        creatorName: 'Challenger',
        creatorPicks: null,
        creatorScore: null,
        opponentId: this.state.odubId || 'user_' + Date.now(),
        opponentName: this.state.username,
        opponentPicks: null,
        opponentScore: null,
        status: 'active',
        winner: null,
        createdAt: new Date().toISOString(),
        joinedAt: new Date().toISOString()
      };

      this.saveFriendChallenge(newChallenge);
      this.state.activeFriendChallenge = code;
      this.saveState();

      this.showToast('🎮 Challenge joined! Make your picks to compete.');
      this.showFriendChallengeBanner(newChallenge);
      this.switchView('play');
      return;
    }

    // Check if challenge is from today
    if (challenge.date !== getTodayString()) {
      this.showToast('This challenge has expired');
      return;
    }

    // Check if user is the creator
    if (challenge.creatorId === (this.state.odubId || 'user_' + Date.now())) {
      this.showToast('This is your own challenge!');
      this.state.activeFriendChallenge = code;
      this.saveState();
      this.showFriendChallengeBanner(challenge);
      return;
    }

    // Join as opponent
    challenge.opponentId = this.state.odubId || 'user_' + Date.now();
    challenge.opponentName = this.state.username;
    challenge.status = 'active';
    challenge.joinedAt = new Date().toISOString();

    this.saveFriendChallenge(challenge);
    this.state.activeFriendChallenge = code;
    this.saveState();

    this.showToast(`🎮 Challenge accepted! vs ${challenge.creatorName}`);
    this.showFriendChallengeBanner(challenge);
    this.switchView('play');
  }

  showFriendChallengeBanner(challenge) {
    const banner = document.getElementById('friend-challenge-banner');
    const opponentName = document.getElementById('challenge-opponent-name');
    const status = document.getElementById('challenge-banner-status');

    if (!banner) return;

    // Determine opponent name
    const isCreator = challenge.creatorName === this.state.username;
    const vsName = isCreator ? (challenge.opponentName || 'Waiting...') : challenge.creatorName;

    opponentName.textContent = vsName;

    // Update status
    if (challenge.status === 'pending') {
      status.textContent = 'Waiting for opponent...';
    } else if (challenge.status === 'active') {
      if (this.state.today.submitted) {
        status.textContent = 'Picks submitted ✓';
      } else {
        status.textContent = 'Make your picks!';
      }
    } else if (challenge.status === 'completed') {
      if (challenge.winner === this.state.username) {
        status.innerHTML = '<span class="winner">You won! 🏆</span>';
      } else if (challenge.winner === 'tie') {
        status.textContent = 'Tie game!';
      } else {
        status.textContent = `${challenge.winner} won`;
      }
    }

    banner.classList.remove('hidden');
  }

  hideFriendChallengeBanner() {
    document.getElementById('friend-challenge-banner')?.classList.add('hidden');
  }

  updateFriendChallengeWithPicks() {
    if (!this.state.activeFriendChallenge) return;

    const challenge = this.getFriendChallenge(this.state.activeFriendChallenge);
    if (!challenge) return;

    const isCreator = challenge.creatorName === this.state.username;

    // Store picks and score
    if (isCreator) {
      challenge.creatorPicks = [...this.state.today.picks];
      challenge.creatorScore = this.state.today.totalPoints || this.state.today.score || 0;
    } else {
      challenge.opponentPicks = [...this.state.today.picks];
      challenge.opponentScore = this.state.today.totalPoints || this.state.today.score || 0;
    }

    // Check if both have submitted and graded
    if (challenge.creatorScore !== null && challenge.opponentScore !== null) {
      // Determine winner
      if (challenge.creatorScore > challenge.opponentScore) {
        challenge.winner = challenge.creatorName;
      } else if (challenge.opponentScore > challenge.creatorScore) {
        challenge.winner = challenge.opponentName;
      } else {
        challenge.winner = 'tie';
      }
      challenge.status = 'completed';
    }

    this.saveFriendChallenge(challenge);
    this.showFriendChallengeBanner(challenge);
  }

  checkActiveFriendChallenge() {
    if (!this.state.activeFriendChallenge) return;

    const challenge = this.getFriendChallenge(this.state.activeFriendChallenge);
    if (!challenge) {
      this.state.activeFriendChallenge = null;
      this.saveState();
      return;
    }

    // Check if challenge is from today
    if (challenge.date !== getTodayString()) {
      // Challenge expired
      this.state.activeFriendChallenge = null;
      this.saveState();
      this.hideFriendChallengeBanner();
      return;
    }

    this.showFriendChallengeBanner(challenge);
  }

  renderH2H() {
    const container = document.getElementById('h2h-active');
    if (!container) return;

    const recordEl = document.getElementById('h2h-record');
    if (recordEl) {
      recordEl.textContent = `${this.state.h2h.wins}W - ${this.state.h2h.losses}L`;
    }

    const todaysChallenges = this.state.h2h.active.filter(c =>
      c.slateDate === this.slate.date
    );

    if (todaysChallenges.length === 0) {
      container.innerHTML = '<p class="empty-h2h">No active challenges</p>';
    } else {
      container.innerHTML = todaysChallenges.map(challenge => {
        const opponent = MOCK_USERS[challenge.opponentId] || {
          username: challenge.opponentId.replace('user_', ''),
          avatar: '👤'
        };

        let statusClass = '';
        let statusText = challenge.status.replace('_', ' ');

        if (challenge.status === 'won') {
          statusClass = 'won';
          statusText = `Won ${challenge.challengerScore}-${challenge.opponentScore}`;
        } else if (challenge.status === 'lost') {
          statusClass = 'lost';
          statusText = `Lost ${challenge.challengerScore}-${challenge.opponentScore}`;
        }

        return `
          <div class="h2h-card ${statusClass}">
            <div class="h2h-opponent">
              <span class="h2h-avatar">${opponent.avatar || '👤'}</span>
              <span class="h2h-name">vs ${opponent.username}</span>
            </div>
            <div class="h2h-status ${statusClass}">${statusText}</div>
          </div>
        `;
      }).join('');
    }
  }

  // ========================================
  // COMPETE VIEW
  // ========================================

  renderCompete() {
    this.renderLeaderboard();
    this.renderH2H();
  }

  renderLeaderboard() {
    const lb = document.getElementById('leaderboard');
    if (!lb) return;

    const MIN_PICKS_FOR_LEADERBOARD = 5;
    const data = MOCK_LEADERBOARD[this.currentTab] || MOCK_LEADERBOARD.daily;

    const yourStatsCard = document.getElementById('your-stats-card');
    const noEntryCard = document.getElementById('no-entry-card');

    // Check if user has an active entry for the current tab
    let hasEntry = false;
    if (this.currentTab === 'daily') {
      hasEntry = this.state.today.submitted;
    } else if (this.currentTab === 'weekly') {
      hasEntry = this.state.stats.weekly.picks > 0;
    } else if (this.currentTab === 'monthly') {
      hasEntry = this.state.stats.monthly.picks > 0;
    } else {
      hasEntry = this.state.stats.allTime.totalPicks > 0;
    }

    // Show/hide appropriate card
    if (!hasEntry && this.currentTab === 'daily') {
      // Only show no-entry card for daily tab when user hasn't submitted
      yourStatsCard?.classList.add('hidden');
      noEntryCard?.classList.remove('hidden');
    } else {
      yourStatsCard?.classList.remove('hidden');
      noEntryCard?.classList.add('hidden');
    }

    // Get user stats for current tab
    let userCorrect, userTotal;
    if (this.currentTab === 'daily') {
      userCorrect = this.state.today.score || 0;
      userTotal = this.state.today.submitted ?
        this.state.today.picks.filter(p => p.status !== PICK_STATUS.PASSED && p.status !== PICK_STATUS.PUSH).length : 0;
    } else if (this.currentTab === 'weekly') {
      userCorrect = this.state.stats.weekly.correct;
      userTotal = this.state.stats.weekly.picks;
    } else if (this.currentTab === 'monthly') {
      userCorrect = this.state.stats.monthly.correct;
      userTotal = this.state.stats.monthly.picks;
    } else {
      userCorrect = this.state.stats.allTime.correctPicks;
      userTotal = this.state.stats.allTime.totalPicks;
    }

    // Calculate user accuracy
    const userAccuracy = userTotal > 0
      ? ((userCorrect / userTotal) * 100).toFixed(1)
      : 0;

    // Check if user qualifies for leaderboard
    const userQualifies = userTotal >= MIN_PICKS_FOR_LEADERBOARD;

    // Build player list with proper accuracy calculation
    const allPlayers = [
      ...data.map(p => ({
        ...p,
        correct: p.correct || p.score || 0,
        total: p.total || Math.ceil((p.correct || p.score || 0) / ((p.accuracy || 50) / 100)),
        accuracy: parseFloat(p.accuracy) || 0
      })),
      {
        name: this.state.username,
        correct: userCorrect,
        total: userTotal,
        accuracy: parseFloat(userAccuracy) || 0,
        isYou: true
      }
    ];

    // Filter to only players with minimum picks
    const qualifiedPlayers = allPlayers.filter(p => p.total >= MIN_PICKS_FOR_LEADERBOARD);

    // Sort by accuracy (highest first)
    qualifiedPlayers.sort((a, b) => b.accuracy - a.accuracy);

    // Find user's rank (even if not qualified, show where they would be)
    const yourRankInQualified = qualifiedPlayers.findIndex(p => p.isYou);
    const yourRank = yourRankInQualified >= 0 ? yourRankInQualified + 1 : '--';

    // Update your stats card
    document.getElementById('your-rank-num').textContent = yourRank;
    document.getElementById('your-lb-name').textContent = this.state.username;
    document.getElementById('your-lb-score').textContent = `${userCorrect}/${userTotal}`;
    document.getElementById('your-lb-accuracy').textContent = userTotal > 0 ? `${userAccuracy}%` : '--%';

    // Show qualification status
    const statsCard = document.querySelector('.your-stats-card');
    if (statsCard) {
      if (!userQualifies && userTotal > 0) {
        statsCard.classList.add('not-qualified');
        const picksNeeded = MIN_PICKS_FOR_LEADERBOARD - userTotal;
        statsCard.setAttribute('data-status', `${picksNeeded} more pick${picksNeeded !== 1 ? 's' : ''} to qualify`);
      } else {
        statsCard.classList.remove('not-qualified');
        statsCard.removeAttribute('data-status');
      }
    }

    // Render leaderboard rows
    if (qualifiedPlayers.length === 0) {
      lb.innerHTML = `
        <div class="lb-empty">
          <span class="lb-empty-icon">📊</span>
          <p>No players have qualified yet</p>
          <p class="lb-empty-hint">Need ${MIN_PICKS_FOR_LEADERBOARD}+ picks to appear</p>
        </div>
      `;
      return;
    }

    lb.innerHTML = qualifiedPlayers.slice(0, 10).map((p, idx) => {
      const rank = idx + 1;
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

      return `
        <div class="lb-row ${p.isYou ? 'highlight' : ''} ${rankClass}">
          <span class="lb-rank">${rankIcon}</span>
          <span class="lb-player">
            <span class="lb-player-name">${p.name}${p.isYou ? ' (You)' : ''}</span>
          </span>
          <span class="lb-picks">${p.correct}/${p.total}</span>
          <span class="lb-accuracy">${p.accuracy.toFixed(1)}%</span>
        </div>
      `;
    }).join('');
  }

  showLeaderboardInfo() {
    this.showToast('📊 Ranked by Accuracy % — Minimum 5 picks required to qualify');
  }

  // ========================================
  // LEVEL PROGRESS SHEET
  // ========================================

  openLevelSheet() {
    const sheet = document.getElementById('level-sheet');
    if (!sheet) return;

    sheet.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this.renderLevelSheet();

    // Scroll to current level after a short delay
    setTimeout(() => {
      const currentCard = document.querySelector('.level-card.current');
      currentCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  }

  closeLevelSheet() {
    const sheet = document.getElementById('level-sheet');
    if (!sheet) return;

    sheet.classList.add('hidden');
    document.body.style.overflow = '';
    this.hideLevelTooltip();
  }

  renderLevelSheet() {
    // Use LevelSystem for clean data access
    const levelData = LevelSystem.getUserLevelData(this.state.xp);

    // Update level number
    document.getElementById('modal-level-num').textContent = levelData.level;

    // Update XP display
    const heroEl = document.querySelector('.level-hero');
    if (levelData.isMaxLevel) {
      heroEl?.classList.add('max-level');
      document.getElementById('modal-xp-current').textContent = 'MAX';
      document.getElementById('modal-xp-target').textContent = '';
      document.querySelector('.xp-separator').style.display = 'none';
      document.querySelector('.xp-unit').style.display = 'none';
      document.querySelector('.xp-label').textContent = 'Maximum level reached!';
    } else {
      heroEl?.classList.remove('max-level');
      document.getElementById('modal-xp-current').textContent = LevelSystem.formatXp(levelData.xpIntoLevel);
      document.getElementById('modal-xp-target').textContent = LevelSystem.formatXp(levelData.xpNeededForNext);
      document.querySelector('.xp-separator').style.display = '';
      document.querySelector('.xp-unit').style.display = '';
      document.getElementById('modal-next-level').textContent = levelData.level + 1;
    }

    // Animate progress ring
    const ring = document.getElementById('level-ring-progress');
    if (ring) {
      const circumference = 2 * Math.PI * 52; // r=52
      const offset = circumference * (1 - levelData.progress / 100);
      // Reset first for animation
      ring.style.strokeDashoffset = circumference;
      requestAnimationFrame(() => {
        ring.style.strokeDashoffset = offset;
      });
    }

    // Render level grid
    this.renderLevelGrid(levelData);
  }

  renderLevelGrid(levelData) {
    const grid = document.getElementById('level-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const currentLevel = levelData.level;
    const totalXp = levelData.totalXp;

    for (let i = 1; i <= LevelSystem.maxLevel; i++) {
      const isPast = i < currentLevel;
      const isCurrent = i === currentLevel;
      const isFuture = i > currentLevel;
      const reward = LevelSystem.getRewardForLevel(i);
      const xpThreshold = LevelSystem.getXpForLevel(i);

      const card = document.createElement('div');
      card.className = 'level-card';
      if (isPast) card.classList.add('past');
      if (isCurrent) card.classList.add('current');
      if (isFuture) card.classList.add('future');
      if (reward) card.classList.add('milestone');

      card.innerHTML = `
        <span class="level-card-num">${i}</span>
        ${isPast ? '<span class="level-card-check">✓</span>' : ''}
        ${isFuture ? '<span class="level-card-lock">🔒</span>' : ''}
        ${reward ? `<span class="level-card-reward">${reward.icon}</span>` : ''}
      `;

      // Add tooltip for future levels
      if (isFuture) {
        const xpNeeded = xpThreshold - totalXp;
        card.addEventListener('mouseenter', (e) => {
          this.showLevelTooltip(e, i, xpNeeded, reward);
        });
        card.addEventListener('mouseleave', () => {
          this.hideLevelTooltip();
        });
        // Touch support
        card.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.showLevelTooltip(e, i, xpNeeded, reward);
        });
        card.addEventListener('touchend', () => {
          setTimeout(() => this.hideLevelTooltip(), 1500);
        });
      }

      grid.appendChild(card);
    }
  }

  showLevelTooltip(event, level, xpNeeded, reward) {
    const tooltip = document.getElementById('level-tooltip');
    if (!tooltip) return;

    tooltip.querySelector('.tooltip-level').textContent = `Level ${level}`;
    tooltip.querySelector('.tooltip-xp').textContent = `${LevelSystem.formatXp(xpNeeded)} XP needed`;

    const rewardEl = tooltip.querySelector('.tooltip-reward');
    if (reward) {
      rewardEl.textContent = `Unlocks: ${reward.name} ${reward.icon}`;
      rewardEl.style.display = '';
    } else {
      rewardEl.style.display = 'none';
    }

    // Position tooltip
    const rect = event.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - 80;
    let top = rect.top - 10;

    // Keep within viewport
    if (left < 10) left = 10;
    if (left + 160 > window.innerWidth) left = window.innerWidth - 170;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.transform = 'translateY(-100%)';

    tooltip.classList.remove('hidden');
  }

  hideLevelTooltip() {
    const tooltip = document.getElementById('level-tooltip');
    tooltip?.classList.add('hidden');
  }

  // ========================================
  // PROFILE
  // ========================================

  renderProfile() {
    const stats = this.state.stats.allTime;

    document.getElementById('profile-name').textContent = this.state.username;
    document.getElementById('avatar-level').textContent = this.state.level;
    document.getElementById('profile-level').textContent = this.state.level;

    const currentLevelXp = getXpForLevel(this.state.level - 1);
    const nextLevelXp = getXpForLevel(this.state.level);
    const progress = ((this.state.xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
    document.getElementById('level-fill').style.width = `${progress}%`;
    document.getElementById('profile-xp').textContent = `${this.state.xp} / ${nextLevelXp} XP`;

    const accuracy = stats.totalPicks > 0
      ? ((stats.correctPicks / stats.totalPicks) * 100).toFixed(0)
      : '--';
    document.getElementById('stat-accuracy').textContent = `${accuracy}%`;
    document.getElementById('stat-correct').textContent = stats.correctPicks;
    document.getElementById('stat-streak').textContent = stats.bestPickStreak;
    document.getElementById('stat-perfect').textContent = stats.perfectDays;

    this.renderBadges();
    this.renderHistory();
    this.renderEnhancedStats();
    this.renderProfileChallenges();

    document.getElementById('username-input').value = this.state.username;

    // Update scoring mode UI
    this.updateScoringModeUI();
  }

  // ========================================
  // PROFILE CHALLENGES
  // ========================================

  renderProfileChallenges() {
    const listEl = document.getElementById('profile-challenges-list');
    const todayEl = document.getElementById('profile-challenges-today');
    const alltimeEl = document.getElementById('challenge-alltime-count');

    const challenges = this.state.today.challenges || [];
    const completedCount = challenges.filter(c => c.completed).length;
    const allTimeCount = this.state.stats.allTime.challengesCompleted || 0;

    if (todayEl) todayEl.textContent = `${completedCount}/${challenges.length}`;
    if (alltimeEl) alltimeEl.textContent = allTimeCount;

    if (listEl) {
      if (challenges.length === 0) {
        listEl.innerHTML = '<p class="challenges-empty">No challenges today</p>';
      } else {
        listEl.innerHTML = challenges.map(ch => {
          const def = DAILY_CHALLENGES.find(d => d.id === ch.id);
          if (!def) return '';
          const done = ch.completed;
          return `
            <div class="profile-challenge-row ${done ? 'completed' : ''}">
              <span class="profile-challenge-icon">${def.icon}</span>
              <span class="profile-challenge-name">${def.name}</span>
              <span class="profile-challenge-status">${done ? '✅' : '⬜'}</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  // ========================================
  // SCORING MODE MANAGEMENT
  // ========================================

  /**
   * Set the scoring mode and update UI
   * @param {string} mode - 'classic' or 'competitive'
   */
  setScoringMode(mode) {
    const validMode = mode === SCORING_MODE.COMPETITIVE ? SCORING_MODE.COMPETITIVE : SCORING_MODE.CLASSIC;
    this.state.scoringMode = validMode;
    this.saveState();
    this.updateScoringModeUI();
    this.showToast(`Scoring mode changed to ${validMode === SCORING_MODE.COMPETITIVE ? 'Competitive' : 'Classic'}`);
  }

  /**
   * Get current scoring mode
   * @returns {string} Current scoring mode
   */
  getScoringMode() {
    return this.state.scoringMode || SCORING_MODE.CLASSIC;
  }

  /**
   * Update all scoring mode UI elements
   */
  updateScoringModeUI() {
    const mode = this.getScoringMode();
    const isCompetitive = mode === SCORING_MODE.COMPETITIVE;
    const rulesDesc = getScoringRulesDescription(mode);

    // Update toggle buttons
    document.querySelectorAll('#scoring-mode-toggle .mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Update hint text
    const hint = document.getElementById('scoring-mode-hint');
    if (hint) {
      hint.textContent = isCompetitive ? 'Wrong locks cost -5 pts' : 'Standard scoring';
    }

    // Update info card
    const infoIcon = document.getElementById('mode-info-icon');
    const infoTitle = document.getElementById('mode-info-title');
    const infoDesc = document.getElementById('mode-info-desc');

    if (infoIcon) infoIcon.textContent = isCompetitive ? '⚡' : '📊';
    if (infoTitle) infoTitle.textContent = rulesDesc.modeName + ' Mode';
    if (infoDesc) infoDesc.textContent = rulesDesc.modeDescription;

    // Update lock wrong rule
    const lockWrongRule = document.getElementById('lock-wrong-rule');
    if (lockWrongRule) {
      const ruleValue = lockWrongRule.querySelector('.rule-value');
      if (ruleValue) {
        ruleValue.textContent = isCompetitive ? '-5' : '0';
        ruleValue.className = 'rule-value ' + (isCompetitive ? 'negative' : 'neutral');
      }
      lockWrongRule.classList.toggle('highlight', isCompetitive);
    }

    // Update header badge
    const badge = document.getElementById('scoring-mode-badge');
    if (badge) {
      badge.classList.toggle('competitive', isCompetitive);
      const badgeText = badge.querySelector('.mode-badge-text');
      if (badgeText) {
        badgeText.textContent = isCompetitive ? 'Competitive' : 'Classic';
      }
    }

    // Update How to Play modal lock wrong rule
    const modalLockWrongRule = document.getElementById('modal-lock-wrong-rule');
    const modalLockWrongValue = document.getElementById('modal-lock-wrong-value');
    if (modalLockWrongRule && modalLockWrongValue) {
      modalLockWrongValue.textContent = isCompetitive ? '-5 points' : '0 points';
      modalLockWrongRule.classList.toggle('muted', !isCompetitive);
      modalLockWrongRule.classList.toggle('competitive-rule', isCompetitive);
    }

    // Update How to Play page elements
    const htpLockWrongRow = document.getElementById('htp-lock-wrong-row');
    const htpLockWrongValue = document.getElementById('htp-lock-wrong-value');
    if (htpLockWrongRow && htpLockWrongValue) {
      htpLockWrongValue.textContent = isCompetitive ? '-5 pts' : '0 pts';
      htpLockWrongValue.className = 'scoring-value ' + (isCompetitive ? 'negative' : 'neutral');
    }

    // Update How to Play current mode display
    const htpCurrentMode = document.getElementById('htp-current-mode');
    if (htpCurrentMode) {
      htpCurrentMode.textContent = isCompetitive ? 'Competitive' : 'Classic';
      htpCurrentMode.style.color = isCompetitive ? '#fb923c' : '#818cf8';
    }

    // Update Lock of Day section on How to Play page
    const htpLockPenaltyRule = document.getElementById('htp-lock-penalty-rule');
    const htpLockPenaltyValue = document.getElementById('htp-lock-penalty-value');
    const htpLockWarning = document.getElementById('htp-lock-warning');

    if (htpLockPenaltyRule && htpLockPenaltyValue) {
      htpLockPenaltyValue.textContent = isCompetitive ? '-5 pts' : '0 pts';
      htpLockPenaltyRule.classList.toggle('danger', isCompetitive);
    }

    if (htpLockWarning) {
      htpLockWarning.classList.toggle('hidden', !isCompetitive);
    }
  }

  renderEnhancedStats() {
    const stats = this.state.stats.allTime;

    this.renderLast7Days();

    const currentStreak = stats.currentPickStreak || 0;
    const bestStreak = stats.bestPickStreak || 0;
    document.getElementById('current-streak').textContent = currentStreak;
    document.getElementById('best-streak-val').textContent = bestStreak;
    document.getElementById('day-streak-val').textContent = stats.currentDayStreak || 0;

    const streakPercent = Math.min((currentStreak / 10) * 100, 100);
    document.getElementById('streak-bar').style.width = `${streakPercent}%`;

    const bestScore = this.getBestDailyScore();
    document.getElementById('best-daily-score').textContent = `${bestScore}/7`;

    this.renderSportAccuracy();
    this.renderMarketAccuracy();

    const last7Stats = this.getLast7DaysStats();
    const last7Accuracy = last7Stats.total > 0
      ? ((last7Stats.correct / last7Stats.total) * 100).toFixed(0)
      : '--';
    document.getElementById('last-7-accuracy').textContent = `${last7Accuracy}%`;
  }

  renderLast7Days() {
    const container = document.getElementById('last-7-days');
    if (!container) return;

    const last7 = this.state.history.slice(0, 7);
    while (last7.length < 7) {
      last7.push(null);
    }

    const days = last7.reverse();

    container.innerHTML = days.map((day) => {
      if (!day) {
        return `<div class="day-dot empty" title="No data"></div>`;
      }

      const score = day.score || 0;
      let colorClass = 'low';
      if (score >= 5) colorClass = 'medium';
      if (score >= 6) colorClass = 'high';
      if (score === 7) colorClass = 'perfect';

      const date = new Date(day.date);
      const dateStr = date.toLocaleDateString('en-US', { weekday: 'short' });

      return `
        <div class="day-dot ${colorClass}" title="${dateStr}: ${score}/7">
          <span class="day-score">${score}</span>
        </div>
      `;
    }).join('');
  }

  getLast7DaysStats() {
    const last7 = this.state.history.slice(0, 7);
    let total = 0;
    let correct = 0;

    last7.forEach(day => {
      if (day && day.picks) {
        total += day.picks.length;
        correct += day.score || 0;
      }
    });

    return { total, correct };
  }

  getBestDailyScore() {
    if (this.state.stats.allTime.bestDailyScore) {
      return this.state.stats.allTime.bestDailyScore;
    }
    if (this.state.history.length === 0) return 0;
    return Math.max(...this.state.history.map(h => h.score || 0));
  }

  renderSportAccuracy() {
    const container = document.getElementById('sport-accuracy-list');
    if (!container) return;

    const bySport = this.state.stats.allTime.bySport || {};
    const sportEntries = Object.entries(bySport)
      .filter(([_, data]) => data.total > 0)
      .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total));

    if (sportEntries.length === 0) {
      container.innerHTML = '<p class="empty-stats">Play more to see sport breakdown</p>';
      return;
    }

    container.innerHTML = sportEntries.map(([sport, data]) => {
      const sportConfig = SPORTS[sport] || { icon: '🎯', name: sport };
      const accuracy = ((data.correct / data.total) * 100).toFixed(0);
      const barWidth = (data.correct / data.total) * 100;

      return `
        <div class="accuracy-row">
          <div class="accuracy-sport">
            <span class="accuracy-icon">${sportConfig.icon}</span>
            <span class="accuracy-name">${sportConfig.name}</span>
          </div>
          <div class="accuracy-bar-wrap">
            <div class="accuracy-bar" style="width: ${barWidth}%"></div>
          </div>
          <div class="accuracy-stats">
            <span class="accuracy-pct">${accuracy}%</span>
            <span class="accuracy-record">${data.correct}/${data.total}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderMarketAccuracy() {
    const container = document.getElementById('market-accuracy-list');
    if (!container) return;

    const byMarket = this.state.stats.allTime.byMarket || {};
    const marketEntries = Object.entries(byMarket)
      .filter(([_, data]) => data.total > 0)
      .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total));

    if (marketEntries.length === 0) {
      container.innerHTML = '<p class="empty-stats">Play more to see market breakdown</p>';
      return;
    }

    const marketLabels = {
      'spread': '📊 Spread',
      'total': '📈 Total',
      'moneyline': '💰 Moneyline',
      'player_prop': '👤 Props'
    };

    container.innerHTML = marketEntries.map(([market, data]) => {
      const label = marketLabels[market] || market;
      const accuracy = ((data.correct / data.total) * 100).toFixed(0);
      const barWidth = (data.correct / data.total) * 100;

      return `
        <div class="accuracy-row">
          <div class="accuracy-sport">
            <span class="accuracy-name">${label}</span>
          </div>
          <div class="accuracy-bar-wrap">
            <div class="accuracy-bar market" style="width: ${barWidth}%"></div>
          </div>
          <div class="accuracy-stats">
            <span class="accuracy-pct">${accuracy}%</span>
            <span class="accuracy-record">${data.correct}/${data.total}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderBadges() {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;

    const allBadges = Object.values(BADGES);

    grid.innerHTML = allBadges.slice(0, 12).map(badge => {
      const earned = this.state.badges.includes(badge.id);
      return `
        <div class="badge ${earned ? 'earned' : 'locked'}" title="${badge.name}: ${badge.desc}">
          ${earned ? badge.icon : '🔒'}
        </div>
      `;
    }).join('');
  }

  renderHistory() {
    const historyEl = document.getElementById('profile-history');
    if (!historyEl) return;

    if (this.state.history.length === 0) {
      historyEl.innerHTML = '<p class="empty-history">No history yet. Play today\'s card!</p>';
      return;
    }

    historyEl.innerHTML = this.state.history.slice(0, 10).map(h => {
      const date = new Date(h.date);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `
        <div class="history-item">
          <span class="history-date">${dateStr}</span>
          <span class="history-score ${h.isPerfect ? 'perfect' : ''}">${h.score}/7</span>
        </div>
      `;
    }).join('');
  }

  // ========================================
  // BADGES
  // ========================================

  awardBadge(badgeId) {
    if (this.isTestingMode()) return;
    if (this.state.badges.includes(badgeId)) return;

    const badge = BADGES[badgeId];
    if (!badge) return;

    this.state.badges.push(badgeId);
    this.saveState();

    setTimeout(() => {
      document.getElementById('earned-badge-icon').textContent = badge.icon;
      document.getElementById('earned-badge-name').textContent = badge.name;
      document.getElementById('badge-modal')?.classList.remove('hidden');
      this.playSound('badge');
    }, 600);
  }

  // ========================================
  // EFFECTS
  // ========================================

  showConfetti() {
    const container = document.getElementById('confetti-container');
    container.classList.remove('hidden');
    container.innerHTML = '';

    const colors = ['#fbbf24', '#22c55e', '#6366f1', '#ef4444', '#8b5cf6', '#f97316'];

    for (let i = 0; i < 60; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = `${Math.random() * 100}%`;
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = `${Math.random() * 0.5}s`;
      confetti.style.animationDuration = `${2 + Math.random() * 2}s`;
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      container.appendChild(confetti);
    }

    setTimeout(() => {
      container.classList.add('hidden');
    }, 4000);
  }

  showMiniConfetti() {
    const container = document.getElementById('confetti-container');
    container.classList.remove('hidden');
    container.innerHTML = '';

    const colors = ['#22c55e', '#6366f1'];

    for (let i = 0; i < 20; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti mini';
      confetti.style.left = `${Math.random() * 100}%`;
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = `${Math.random() * 0.3}s`;
      container.appendChild(confetti);
    }

    setTimeout(() => {
      container.classList.add('hidden');
    }, 2000);
  }

  showXPPopup(amount) {
    const popup = document.createElement('div');
    popup.className = 'xp-popup';
    popup.innerHTML = `<span class="xp-amount">+${amount} XP</span>`;
    document.body.appendChild(popup);

    setTimeout(() => popup.classList.add('show'), 10);
    setTimeout(() => {
      popup.classList.remove('show');
      setTimeout(() => popup.remove(), 300);
    }, 2000);
  }

  showCoinPopup(amount) {
    const popup = document.createElement('div');
    popup.className = 'coin-popup';
    popup.innerHTML = `<span class="coin-amount">+${amount} 🪙</span>`;
    document.body.appendChild(popup);

    setTimeout(() => popup.classList.add('show'), 10);
    setTimeout(() => {
      popup.classList.remove('show');
      setTimeout(() => popup.remove(), 300);
    }, 2000);
  }

  showToast(message) {
    document.querySelector('.toast')?.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  playSound(type) {
    if (!this.state.settings?.sound) return;
    // Sound implementation placeholder
  }

  // ========================================
  // UTILITY
  // ========================================

  async refreshOdds() {
    this.showToast('Refreshing odds...');
    try {
      const slate = await generateDailySlate();
      const today = getTodayString();
      localStorage.setItem(`sportsiq_slate_${today}`, JSON.stringify(slate));
      this.slate = slate;
      this.initPicksForSlate();
      this.render();
      this.showToast('Odds updated!');
    } catch (error) {
      console.error('Failed to refresh odds:', error);
      this.showToast('Failed to refresh odds');
    }
  }
}

// ========================================
// MODAL HELPERS
// ========================================

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.add('hidden');
}

// ========================================
// INITIALIZE
// ========================================

let game;
document.addEventListener('DOMContentLoaded', () => {
  game = new SportsIQ();
});
