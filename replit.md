# SportsIQ - Daily Sports Prediction Game

## Overview
SportsIQ is a free daily sports prediction game built as a static frontend application. Players make picks on player props and game spreads, competing for points with daily challenges.

## Project Architecture
- **Type**: Static frontend (HTML/CSS/vanilla JS)
- **No build system** required
- **No backend** - uses ESPN API directly from the browser
- **Served via**: `server.js` (Node.js HTTP server on port 5000)

## Key Files
- `index.html` - Main application page
- `style.css` - Styles
- `game.js` - Core game logic and UI
- `api.js` - API layer for fetching sports data (ESPN)
- `data.js` - Data management
- `scoring.js` - Scoring system (Classic/Competitive modes)
- `manifest.json` - PWA manifest
- `server.js` - Static file server for Replit

## Features
### Daily Challenges (Feb 2026)
- 7 challenge types defined in `DAILY_CHALLENGES` array in `data.js`: sweep, lock_win, no_pass, streak_3, five_correct, underdog, multi_sport
- `getDailyChallenges(dateStr)` deterministically selects 3 challenges per day using date as seed
- Challenges initialized in `initPicksForSlate()` as `state.today.challenges` array of `{ id, completed }`
- Checked in `checkDailyChallenges(scoreResult)` called from `finalizeCard()` after scoring
- Bonus XP/coins awarded per completed challenge, added to totals before save
- `stats.allTime.challengesCompleted` tracks lifetime count
- Play view: "Daily Challenges" card appears below pending banner, above picks
- Profile view: "Challenges" section between Performance and Badges shows today's status + all-time count
- Testing mode guard in `finalizeCard()` returns early, so challenges never complete in testing

### Testing Mode (Feb 2026)
- Toggle via Debug Panel > "Toggle Testing Mode" button
- Isolates all picks/stats to separate localStorage key (`sportsiq_testing_state`)
- Guards on `recordPickResult`, `finalizeCard`, `awardBadge` prevent stat contamination
- Today/Tomorrow tab bar appears when testing mode is active
- Tomorrow's card fetches ESPN data with `?dates=` query parameter
- Production state is snapshotted on toggle-on and restored on toggle-off

## Running Locally
The app is served by `server.js` on port 5000. The workflow "Start application" handles this automatically.

## Deployment
Configured as a static site deployment with the root directory as the public directory.
