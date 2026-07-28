#!/bin/sh
# Start de app op. Twee dingen worden hier geregeld:
#
# 1. Rechten op het datavolume. Een gemount volume is eigendom van root, dus een
#    app die als gewone gebruiker draait kan er niets in schrijven. Dat is een
#    bekend punt bij Railway (en bij `docker run -v` net zo). We zetten de
#    eigenaar goed en zakken daarna terug naar de onbevoorrechte gebruiker, zodat
#    de app zelf niet als root loopt.
# 2. Het databaseschema. `prisma db push` is idempotent, dus bij elke herstart
#    gebeurt er niets als het schema al klopt.
set -e

APP_UID=10001
APP_GID=10001
DATA_DIR="$(dirname "$(printf '%s' "${DATABASE_URL:-file:/data/kasboek.db}" | sed 's/^file://')")"

if [ "$(id -u)" = "0" ] && [ "${KASBOEK_DROPPED_PRIVILEGES:-}" != "1" ]; then
  if [ -d "$DATA_DIR" ] && [ "$(stat -c %u "$DATA_DIR")" != "$APP_UID" ]; then
    echo "Kasboek: rechten op ${DATA_DIR} goedzetten"
    chown -R "$APP_UID:$APP_GID" "$DATA_DIR"
  elif [ ! -d "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
    chown -R "$APP_UID:$APP_GID" "$DATA_DIR"
  fi

  # Verder als gewone gebruiker. setpriv zit in util-linux; su is de terugval.
  export KASBOEK_DROPPED_PRIVILEGES=1
  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid="$APP_UID" --regid="$APP_GID" --clear-groups -- "$0" "$@"
  else
    exec su kasboek -s /bin/sh -c 'exec "$0" "$@"' -- "$0" "$@"
  fi
fi

echo "Kasboek: draait als uid $(id -u); schema controleren op ${DATABASE_URL}"
# Geen --skip-generate: die optie bestaat niet in Prisma 7, en `db push`
# genereert daar ook niets meer. De client zit al in het image.
#
# Rechtstreeks aanroepen in plaats van via npx: npx wil naar de npm-cache van
# root schrijven, en dat mag deze gebruiker niet — dat gaf een foutregel in de
# logs terwijl er niets aan de hand was.
./node_modules/.bin/prisma db push

exec "$@"
