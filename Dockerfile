# CSIU District Insights — single container: builds the warehouse, builds Next.js, serves on $PORT.
# Chromium is included so the PDF reports work.
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
ENV CHROME_PATH=/usr/bin/chromium
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run seed && npm run build

FROM base AS run
ENV NODE_ENV=production PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000"]
