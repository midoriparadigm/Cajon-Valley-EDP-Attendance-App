# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy source — .dockerignore should exclude .env, so secrets aren't baked into the image layer
COPY . .

# Accept all VITE_ build args as build-time env vars directly (no .env file write)
# These values are inlined into the JS bundle at build time by Vite — they are NOT
# secrets in the traditional sense (anon keys, not service keys). Never pass
# SUPABASE_SERVICE_ROLE_KEY or any server-side secret here.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_GEMINI_API_KEY=""
ARG VITE_GAS_WEBHOOK_URL=""
ARG VITE_GAS_AUTH_TOKEN=""

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY \
    VITE_GAS_WEBHOOK_URL=$VITE_GAS_WEBHOOK_URL \
    VITE_GAS_AUTH_TOKEN=$VITE_GAS_AUTH_TOKEN

RUN npm run build

# Production stage — minimal nginx:alpine, no Node, no build tools
FROM nginx:alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy hardened nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files only (builder stage never reaches production)
COPY --from=builder /app/dist /usr/share/nginx/html

# Drop to non-root nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
