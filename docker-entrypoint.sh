#!/bin/sh
# Zorgt dat de database bestaat en het schema klopt voordat de app start.
# `prisma db push` is hier veilig: het is idempotent, dus bij elke herstart
# gebeurt er niets als het schema al goed staat.
set -e

echo "Kasboek: schema controleren op ${DATABASE_URL}"
npx prisma db push --skip-generate

exec "$@"
