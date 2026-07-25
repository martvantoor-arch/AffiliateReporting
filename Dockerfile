# Kasboek — affiliate-inkomsten
#
# Bouwen en draaien:
#   docker build -t kasboek .
#   docker run -d --name kasboek -p 3000:3000 \
#     -v kasboek-data:/data \
#     -e DATABASE_URL="file:/data/kasboek.db" \
#     -e ENCRYPTION_KEY="$(openssl rand -hex 32)" \
#     -e SESSION_SECRET="$(openssl rand -hex 32)" \
#     kasboek
#
# Let op: bewaar ENCRYPTION_KEY buiten de container. Raak je die kwijt, dan zijn
# de opgeslagen API-sleutels onleesbaar. Het volume /data houdt de database.

FROM node:22-slim AS base
# better-sqlite3 heeft libstdc++ nodig; openssl voor TLS naar de netwerken.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------- afhankelijkheden ----------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Ook devDependencies: de build heeft TypeScript en de Prisma-CLI nodig.
RUN npm ci

# ---------- bouwen ----------
FROM deps AS build
WORKDIR /app
COPY . .
# Tijdens de build is er nog geen database; deze waarden worden op runtime
# overschreven en zijn hier alleen nodig omdat de build ze inleest.
ENV DATABASE_URL="file:/tmp/build.db"
ENV NODE_ENV=production
RUN npm run build

# ---------- draaien ----------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="file:/data/kasboek.db"

# Niet als root draaien.
RUN useradd --system --create-home --uid 10001 kasboek \
  && mkdir -p /data \
  && chown -R kasboek:kasboek /data

COPY --from=build --chown=kasboek:kasboek /app/node_modules ./node_modules
COPY --from=build --chown=kasboek:kasboek /app/.next ./.next
COPY --from=build --chown=kasboek:kasboek /app/public ./public
COPY --from=build --chown=kasboek:kasboek /app/lib ./lib
COPY --from=build --chown=kasboek:kasboek /app/prisma ./prisma
COPY --from=build --chown=kasboek:kasboek /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=kasboek:kasboek /app/scripts ./scripts
COPY --from=build --chown=kasboek:kasboek /app/package.json ./package.json
COPY --from=build --chown=kasboek:kasboek /app/next.config.ts ./next.config.ts
COPY --chown=kasboek:kasboek docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER kasboek
VOLUME ["/data"]
EXPOSE 3000

# De entrypoint zet bij de eerste start de tabellen klaar.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
