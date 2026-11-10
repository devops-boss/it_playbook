# syntax=docker/dockerfile:1
# ==============================================================================
# BOS Playbook - Frontend
#
# Multi-stage build producing a minimal runtime image with a Next.js
# standalone server. No external CDN or SaaS is contacted at runtime: fonts,
# icons and libraries are all bundled into the image.
# ==============================================================================

# --- Stage 1: dependencies ---------------------------------------------------
FROM node:20.18-alpine AS deps
WORKDIR /app

# Copy the manifests first so the dependency layer is cached.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# --- Stage 2: build ----------------------------------------------------------
FROM node:20.18-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time. They are public by design
# (the anon key is safe to expose; the service-role key never is).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_NAME=IT\ Operations\ Playbook
ARG NEXT_PUBLIC_APP_LOGO=/logo.png
ARG NEXT_PUBLIC_ACCENT_COLOR=#0066CC

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_LOGO=$NEXT_PUBLIC_APP_LOGO \
    NEXT_PUBLIC_ACCENT_COLOR=$NEXT_PUBLIC_ACCENT_COLOR \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage 3: runtime --------------------------------------------------------
FROM node:20.18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# The standalone output includes only the modules actually used.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
