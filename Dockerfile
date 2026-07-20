FROM node:22-bookworm-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma is initialized while Next.js collects route metadata. Use a non-secret,
# unreachable URL for the build only; Cloud Run supplies the real URL at runtime.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN find node_modules/@ffprobe-installer -type f -name ffprobe -exec chmod +x {} + \
    && chmod +x node_modules/ffmpeg-static/ffmpeg

USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "server.js"]
