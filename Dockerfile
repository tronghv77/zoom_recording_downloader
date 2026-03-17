FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files (build on host before docker build)
COPY dist/server ./dist/server
COPY dist/renderer ./dist/renderer

# Create data directory for SQLite
RUN mkdir -p /data

# Environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV ADMIN_USERNAME=admin
ENV ADMIN_PASSWORD=changeme
ENV SESSION_SECRET=change-this-to-random-string
ENV AGENT_SECRET=change-this-to-random-string

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3000/api/auth/status || exit 1

CMD ["node", "dist/server/server/index.js"]
