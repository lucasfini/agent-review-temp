# AudioRepurpose Dockerfile
# Multi-stage build for Next.js + Python (PyAnnote)

# Stage 1: Python Dependencies
FROM python:3.12-slim AS python-builder

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set up Python environment
WORKDIR /python-deps

# Copy Python requirements
COPY scripts/requirements.txt ./

# Install PyTorch (CPU version) first
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install other Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Node.js Dependencies and Build
FROM node:20-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy application code
COPY . .

# Build Next.js application
RUN npm run build

# Stage 3: Production Runtime
FROM python:3.12-slim AS production

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 (replace default)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python dependencies from builder
COPY --from=python-builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=python-builder /usr/local/bin /usr/local/bin

# Copy Node.js build and dependencies
COPY --from=node-builder /app/package*.json ./
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/.next ./.next
COPY --from=node-builder /app/public ./public

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p /app/logs/conversations

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]
