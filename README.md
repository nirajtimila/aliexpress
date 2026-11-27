# aliexpress

AliExpress Autonomous Coins Auto-Collector & Live Dashboard (React 18 + Node.js Engine).

## Features
- **Daily Check-In & Streak Auto-Claim:** Collects daily coins and logs execution.
- **Explore Sponsored Items (+5):** Up to 6x/day with active scroll telemetry (65 seconds).
- **Browse Recently Viewed Items (+5):** With active scroll telemetry (65 seconds).
- **Zero Console / Extension-Free:** Operates standalone via Puppeteer with iPhone 16 Pro Max emulation.
- **Docker Ready:** Deploy on any Linux VPS, NAS, or server with 1 command.

## 🐳 Quick Docker Deployment
```bash
git clone https://github.com/nirajtimila/aliexpress.git
cd aliexpress
docker compose up -d --build
```
Access dashboard at `http://localhost:3333` (or your server's IP).
