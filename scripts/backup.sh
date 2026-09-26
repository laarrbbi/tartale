#!/usr/bin/env bash
# Nightly backup of the Tartale database, encrypted before it leaves the
# runner (.github/workflows/backup.yml). The repository is public, so the
# artifact must be useless without BACKUP_PASSPHRASE.
#
# Restore: see docs/operations.md.
set -euo pipefail

: "${DATABASE_URL:?Missing DATABASE_URL: add it in GitHub → Settings → Secrets and variables → Actions}"
: "${BACKUP_PASSPHRASE:?Missing BACKUP_PASSPHRASE: add a long random passphrase in the same place, and keep a copy offline}"
if [ "${#BACKUP_PASSPHRASE}" -lt 24 ]; then
  echo "::error::BACKUP_PASSPHRASE is shorter than 24 characters"
  exit 1
fi

PG_BIN="${PG_BIN:-/usr/lib/postgresql/17/bin}"
OUT_DIR="${OUT_DIR:-backups}"
MIN_TABLES="${MIN_TABLES:-14}"
mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y-%m-%dT%H%MZ)"

# Supabase signs its certificates with its own root: verify against it, from
# the one copy in the code.
ca="$(mktemp)"
trap 'rm -f "$ca"' EXIT
sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' src/server/db/supabase-ca.ts > "$ca"

# pg_dump needs a session; Supabase's pooler serves sessions on 5432 and
# transactions on 6543 (which is what the app uses).
url="${DATABASE_URL/:6543\//:5432/}"
if [[ "$url" == *\?* ]]; then url="${url}&"; else url="${url}?"; fi
# (BACKUP_SSL_PARAMS only exists to try the script against a local database.)
url="${url}${BACKUP_SSL_PARAMS:-sslmode=verify-full&sslrootcert=${ca}}"

dump="$OUT_DIR/tartale-$stamp.dump"
"$PG_BIN/pg_dump" --format=custom --no-owner --no-privileges --schema=public --file="$dump" "$url"

# A dump that is missing tables is not a backup: fail loudly.
tables="$("$PG_BIN/pg_restore" --list "$dump" | grep -c ' TABLE DATA public ' || true)"
if [ "$tables" -lt "$MIN_TABLES" ]; then
  echo "::error::The dump has $tables tables, expected at least $MIN_TABLES"
  exit 1
fi

gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 \
  --passphrase-fd 3 --output "$dump.gpg" "$dump" 3<<<"$BACKUP_PASSPHRASE"
shred -u "$dump" 2>/dev/null || rm -f "$dump"

echo "Encrypted backup: $dump.gpg ($tables tables, $(du -h "$dump.gpg" | cut -f1))"
