#!/bin/bash
set -e

# On first deploy: copy the bundled .db to the persistent volume if not already there
DATA_DIR=/data
DB_PATH=$DATA_DIR/sports_card.db

mkdir -p $DATA_DIR

if [ ! -f "$DB_PATH" ] && [ -f "/app/sports_card.db" ]; then
  echo "First deploy detected — migrating database to persistent volume..."
  cp /app/sports_card.db $DB_PATH
  echo "Done."
fi

exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
