# Sports IQ – Daily Challenge

A real-time sports picks game using live ESPN data. No backend required.

## Features

- **Real Games** – Pulls today's actual NBA, NFL, NHL, MLB matchups from ESPN
- **Real Odds** – Live betting lines (ESPN built-in, or add TheOddsAPI key)
- **Auto-Grading** – Results graded automatically from final scores
- **Game Locking** – Picks lock at real tipoff time
- **Offline Support** – Caches data for offline play
- **PWA Ready** – Install as mobile app

## Deploy

### Netlify (Recommended)
1. Drag & drop this folder to [netlify.com/drop](https://app.netlify.com/drop)
2. Done! Get your public URL instantly

### Vercel
1. `npx vercel --prod`
2. Or connect GitHub repo at [vercel.com](https://vercel.com)

### GitHub Pages
1. Push to GitHub
2. Settings → Pages → Source: main branch
3. Your site: `https://username.github.io/repo-name`

### Local Testing
```bash
# Any static server works:
python3 -m http.server 8080
# or
npx serve .
# or
php -S localhost:8080
```

## Optional: Add TheOddsAPI

For premium betting lines (500 free requests/month):

1. Get free key at https://the-odds-api.com/
2. Edit `api.js` line 13:
```javascript
ODDS_API_KEY: 'your-key-here',
```

## Files

```
├── index.html      # Main app
├── style.css       # Styles
├── game.js         # Game logic
├── api.js          # ESPN + Odds API integration
├── data.js         # Config & state
├── manifest.json   # PWA manifest
├── netlify.toml    # Netlify config
├── vercel.json     # Vercel config
└── README.md       # This file
```

## Tech

- Vanilla JavaScript (no framework)
- ESPN Public API (free, unlimited)
- TheOddsAPI (optional, 500 free/month)
- LocalStorage for persistence
- Service Worker ready

## License

MIT
