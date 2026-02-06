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

## Running Locally
The app is served by `server.js` on port 5000. The workflow "Start application" handles this automatically.

## Deployment
Configured as a static site deployment with the root directory as the public directory.
