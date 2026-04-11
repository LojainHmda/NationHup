# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Build client and server
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/dist ./dist

# Create directories for uploads (ephemeral on Cloud Run; use Cloud Storage for persistence)
RUN mkdir -p uploads uploads/stock uploads/preorder uploads/temp public/product-images

# Cloud Run uses PORT 8080 by default
ENV PORT=8080
EXPOSE 8080

CMD ["node", "-r", "dotenv/config", "dist/index.js"]
