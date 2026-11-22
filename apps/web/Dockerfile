# ─── workBYLiNE Docker Image ─────────────────────────────────────────
# Single-stage production build for monorepo Next.js app
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install dependencies first (cache layer)
COPY apps/web/package.json apps/web/package-lock.json ./

RUN npm ci 2>/dev/null || npm install

# Copy internal packages (transpiled at build time)
COPY packages/ /app/packages/

# Copy app source
COPY apps/web/ ./

# Build the Next.js app
RUN npm run build

# Expose port
EXPOSE 3000

# Start production server
CMD ["npm", "start"]
