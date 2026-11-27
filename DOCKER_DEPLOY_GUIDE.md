# 🐳 Docker Deployment Guide: AliExpress Coins Auto-Collector

Run your automated AliExpress Coin Collector 24/7 on any cloud VPS, server, NAS (Synology/TrueNAS), or Raspberry Pi without keeping your personal computer on.

---

## 🚀 Quick Start (1 Command)

### 1. Copy Files to Your Server
Copy the project folder to your server (via `git clone`, `scp`, or `rsync`). Make sure these key files are included:
- `session_cookies.json` *(contains your authenticated login for `nirajtimilatube`)*
- `account.json`
- `docker-compose.yml`
- `Dockerfile`

### 2. Launch with Docker Compose
On your server, run:
```bash
docker compose up -d --build
```

That's it! 
- The container builds with headless Chromium pre-installed.
- It automatically loads your session for `nirajtimilatube`.
- The Web Dashboard is accessible at `http://YOUR-SERVER-IP:3333`.
- The internal scheduler runs every 3 hours automatically (daily collect + sponsored items + viewed items).

---

## 📊 Useful Docker Commands

| Action | Command |
| :--- | :--- |
| **View Live Logs** | `docker compose logs -f` |
| **Check Container Status** | `docker compose ps` |
| **Restart Container** | `docker compose restart` |
| **Stop Container** | `docker compose down` |
| **Trigger Immediate Run inside container** | `docker exec -it aliexpress-coins node smart_task_collector.js` |

---

## 🔒 Session & Data Persistence
The `docker-compose.yml` file volume-mounts:
- `session_cookies.json`
- `account.json`
- `activity_history.json`
- `collector_activity.log`

Whenever the collector runs or cookies refresh, they are saved directly to your host disk. If you rebuild or update the container, your login and coin balance will remain completely preserved.
