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
