#!/bin/sh
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}
CONFIG_DIR=${CONFIG_DIR:-/app/config}
MEDIA_AUTOMATION_CONFIG_DIR=${MEDIA_AUTOMATION_CONFIG_DIR:-$CONFIG_DIR/media-automation}
MEDIA_AUTOMATION_WORK_DIR=${MEDIA_AUTOMATION_WORK_DIR:-$MEDIA_AUTOMATION_CONFIG_DIR/work}
POSTER_SETS_CONFIG_DIR=${POSTER_SETS_CONFIG_DIR:-$CONFIG_DIR/poster-sets}

# Unraid appdata mounts are often root-owned; fix permissions before dropping privileges.
mkdir -p \
  "$CONFIG_DIR" \
  /app/backup \
  "$CONFIG_DIR/collexions/config" \
  "$CONFIG_DIR/collexions/logs" \
  "$MEDIA_AUTOMATION_CONFIG_DIR" \
  "$MEDIA_AUTOMATION_WORK_DIR" \
  "$POSTER_SETS_CONFIG_DIR"
chown -R "$PUID:$PGID" \
  "$CONFIG_DIR" \
  /app/backup \
  "$MEDIA_AUTOMATION_CONFIG_DIR" \
  "$MEDIA_AUTOMATION_WORK_DIR" \
  "$POSTER_SETS_CONFIG_DIR"

# Collect GIDs from /dev/dri so QSV/VAAPI work after dropping to PUID:PGID.
# renderD* is commonly root:render mode 660 — gosu alone does not keep those groups.
collect_dri_gids() {
  if [ ! -d /dev/dri ]; then
    return 0
  fi
  for device in /dev/dri/*; do
    [ -e "$device" ] || continue
    gid=$(stat -c '%g' "$device" 2>/dev/null) || continue
    case " $gids " in
      *" $gid "*) ;;
      *) gids="${gids:+$gids }$gid" ;;
    esac
  done
}

gids="$PGID"
collect_dri_gids

# Prefer setpriv so we can attach /dev/dri GIDs as supplementary groups.
# Do not combine --clear-groups with --groups (mutually exclusive on util-linux).
if command -v setpriv >/dev/null 2>&1; then
  groups_csv=$(echo "$gids" | tr ' ' ',')
  exec setpriv --reuid="$PUID" --regid="$PGID" --groups="$groups_csv" -- "$@"
fi

if command -v gosu >/dev/null 2>&1; then
  exec gosu "$PUID:$PGID" "$@"
fi
if command -v su-exec >/dev/null 2>&1; then
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
