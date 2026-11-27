# ========================================================
# AliExpress Coins Auto-Collector & Dashboard (Docker)
# Compatible with Linux VPS, AWS, Synology NAS, Unraid, etc.
# ========================================================

FROM node:20-bookworm-slim

# Install latest Chromium and required fonts & system libraries for Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    ca-certificates \
    dumb-init \
    curl \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Set Environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    DOCKER=true \
    PORT=3333

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Expose web dashboard port
EXPOSE 3333

# Use dumb-init for proper signal handling and zombie reaping
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start full-stack Node server (includes web UI & 3-hour smart auto-collector)
CMD ["node", "server.js"]
