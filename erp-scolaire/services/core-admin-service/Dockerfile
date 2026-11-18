# ─── Build stage ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

# ─── Production stage ─────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Seules les dépendances de production
COPY package*.json ./
RUN npm ci --frozen-lockfile --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Utilisateur non-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3001/health/ready || exit 1

CMD ["node", "dist/server.js"]
