FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build && npm prune --omit=dev

# Default command (can be overridden)
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/run/startWorkers.js"]
