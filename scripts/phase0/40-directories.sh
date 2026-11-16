#!/usr/bin/env bash
# Phase 0, directories (5.5; 24.3 step 3) with their owners, groups and modes.
# Run as: sudo ./40-directories.sh   (from deskadmin), after 30-users-groups.sh.
# The working drive's folders are made only when /Volumes/Data is mounted; rerun when it arrives.
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root
id aitools >/dev/null 2>&1 || die "run 30-users-groups.sh first"

step "Internal SSD (5.5)"
ensure_dir /opt/aiplatform                root     wheel    755
ensure_dir /opt/aiplatform/bin            root     wheel    755
ensure_dir /etc/aiplatform                root     wheel    755
ensure_dir /var/aiplatform/run            root     wheel    755
ensure_dir /var/aiplatform/docker         owner    aidocker 750
ensure_dir /var/lib/aiplatform            root     wheel    755
ensure_dir /var/lib/aiplatform/tasks      aitools  aitools  700
ensure_dir /var/lib/aiplatform/personal   aitools  aitools  700
ensure_dir /var/lib/aiplatform/connect    aiconnect aiconnect 700
ensure_dir /var/lib/aiplatform/gate       aigate   aigate   700
ensure_dir /var/lib/aiplatform/gate/voices aigate  aigate   700
ensure_dir /var/lib/aiplatform/ledger     aiegress aiegress 700
ensure_dir /var/lib/aiplatform/portal     aiportal aiportal 700
ensure_dir /var/lib/aiplatform/site       aitools  aisite   2750
ensure_dir /var/lib/aiplatform/openclaw   aiagent  aiagent  700
ensure_dir /var/log/aiplatform            root     wheel    755
ensure_dir /var/log/aiplatform/audit      root     wheel    700
ensure_dir "${EVIDENCE_DIR}"              root     wheel    755
ensure_dir /var/backups/aiplatform        root     wheel    700
ensure_dir /Users/owner/fallback-model    owner    staff    755

step "Working drive (5.5)"
if ! data_volume_present; then
  skip "${DATA_VOLUME} not mounted; rerun this script once the working drive is set up (decision 96)"
  exit 0
fi
info="$(diskutil info "${DATA_VOLUME}")"
grep -q 'FileVault:.*Yes' <<<"${info}" || die "${DATA_VOLUME} is not APFS (Encrypted); see runbook step 9"
if grep -Eq 'Owners:[[:space:]]+Enabled' <<<"${info}"; then ok "ownership enabled on ${DATA_VOLUME}"
else diskutil enableOwnership "${DATA_VOLUME}"; did "ownership enabled on ${DATA_VOLUME}"; fi

ensure_dir "${DATA_VOLUME}/work"        aitools aiwork   2770
ensure_dir "${DATA_VOLUME}/cache"       aitools aiwork   2770
ensure_dir "${DATA_VOLUME}/personal"    aitools aitools  700
ensure_dir "${DATA_VOLUME}/inbox"       owner   aiintake 2770
ensure_dir "${DATA_VOLUME}/models"      owner   staff    755
ensure_dir "${DATA_VOLUME}/promptcache" owner   staff    700
ensure_dir "${DATA_VOLUME}/media"       aitools aitools  750
ensure_dir "${DATA_VOLUME}/backups"     root    wheel    700
