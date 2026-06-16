# Stage 1: build the Vue frontend
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: production server
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY db/ ./db/
COPY --from=builder /app/dist ./dist
EXPOSE 3737
CMD ["node", "server/index.js"]
