#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}
CONFIG_DIR=${CONFIG_DIR:-/app/config}
MEDIA_AUTOMATION_CONFIG_DIR=${MEDIA_AUTOMATION_CONFIG_DIR:-$CONFIG_DIR/media-automation}
MEDIA_AUTOMATION_WORK_DIR=${MEDIA_AUTOMATION_WORK_DIR:-$MEDIA_AUTOMATION_CONFIG_DIR/work}

# Unraid appdata mounts are often root-owned; fix permissions before dropping privileges.
mkdir -p \
  "$CONFIG_DIR" \
  /app/backup \
  "$CONFIG_DIR/collexions/config" \
  "$CONFIG_DIR/collexions/logs" \
  "$MEDIA_AUTOMATION_CONFIG_DIR" \
  "$MEDIA_AUTOMATION_WORK_DIR"
chown -R "$PUID:$PGID" \
  "$CONFIG_DIR" \
  /app/backup \
  "$MEDIA_AUTOMATION_CONFIG_DIR" \
  "$MEDIA_AUTOMATION_WORK_DIR"

if command -v gosu >/dev/null 2>&1; then
  exec gosu "$PUID:$PGID" "$@"
fi
if command -v su-exec >/dev/null 2>&1; then
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
