#!/bin/bash
# The starter backup job (13.1; 24.3 step 7). Installed to /opt/aiplatform/bin/starter-backup.sh
# and run hourly by the root LaunchDaemon com.aiplatform.starter-backup until the Phase 8
# scheduler takes the job over. It backs up only when INTERVAL_HOURS have passed since the last
# success, unless run with --now.
#
# Modes, chosen on every run:
#   same-disk  no working drive (decision 96): the internal critical set into a repository on the
#              internal SSD. Protects against deleted and bad files, not against SSD failure.
#   two-drive  working drive mounted: each drive backs the other up (13.1). The same-disk
#              repository gets no new snapshots and is kept until its snapshots age out.
set -Eeuo pipefail
umask 077

RESTIC=/opt/aiplatform/bin/restic
DATA=/Volumes/Data
REPO_SAME_DISK=/var/backups/aiplatform/restic-same-disk
REPO_INTERNAL_OF_DATA=/var/backups/aiplatform/restic-of-working-drive
REPO_DATA_OF_INTERNAL="${DATA}/backups/restic-of-internal"
STATUS_DIR=/var/log/aiplatform/phase0
STATUS="${STATUS_DIR}/starter-backup-last.json"
INTERVAL_HOURS=24          # 13.1: nightly; set 4 in the conf file if the drive reports no health data
CRITICAL_SET_LIMIT_GB=100  # 13.1: repositories are included only while the set stays under this
# shellcheck source=/dev/null
[[ -f /etc/aiplatform/starter-backup.conf ]] && source /etc/aiplatform/starter-backup.conf

export RESTIC_PASSWORD_COMMAND="/usr/bin/security find-generic-password -s aiplatform.restic.starter -w /Library/Keychains/System.keychain"
export RESTIC_CACHE_DIR=/var/backups/aiplatform/cache

# Internal platform state (13.1, 13.2). metrics.db is rebuilt, so it is excluded.
# Phase 1 adds SQLite online copies (13.2) before these paths are read; Phase 0 has no databases.
INTERNAL_SET=(/etc/aiplatform /var/lib/aiplatform /var/log/aiplatform/audit)
EXCLUDES=(--exclude /var/lib/aiplatform/portal/metrics.db --exclude '*.db-wal' --exclude '*.db-shm')

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

data_mounted() { mount | grep -q " on ${DATA} "; }

due() {
  [[ "${1:-}" == "--now" || ! -f "${STATUS}" ]] && return 0
  grep -q '"result": "ok"' "${STATUS}" || return 0
  local last; last="$(stat -f %m "${STATUS}")"
  (( $(date +%s) - last >= INTERVAL_HOURS * 3600 ))
}

ensure_repo() {
  if ! "${RESTIC}" -r "$1" cat config >/dev/null 2>&1; then
    mkdir -p "$1"; chmod 700 "$1"
    "${RESTIC}" -r "$1" init
    log "initialized $1"
  fi
}

backup() {  # repo tag paths...
  local repo="$1" tag="$2"; shift 2
  ensure_repo "${repo}"
  local existing=()
  for p in "$@"; do [[ -e "${p}" ]] && existing+=("${p}"); done
  "${RESTIC}" -r "${repo}" backup --tag "${tag}" "${EXCLUDES[@]}" ${existing[@]+"${existing[@]}"}
  "${RESTIC}" -r "${repo}" forget --tag "${tag}" --keep-within 7d --keep-daily 30 --prune
}

write_status() {  # mode result
  mkdir -p "${STATUS_DIR}"
  printf '{"time": "%s", "mode": "%s", "result": "%s", "restic": "%s"}\n' \
    "$(date -u +%FT%TZ)" "$1" "$2" "$("${RESTIC}" version | awk '{print $2}')" > "${STATUS}.tmp"
  chmod 644 "${STATUS}.tmp"; mv "${STATUS}.tmp" "${STATUS}"
}

main() {
  due "${1:-}" || exit 0
  local mode=same-disk
  data_mounted && mode=two-drive
  trap 'write_status "${mode}" failed' ERR
  log "starter backup, mode ${mode}"

  if [[ "${mode}" == same-disk ]]; then
    backup "${REPO_SAME_DISK}" same-disk "${INTERNAL_SET[@]}"
  else
    local data_set=("${INTERNAL_SET[@]}" "${DATA}/personal" "${DATA}/inbox")
    local work_gb
    work_gb="$(du -sg "${DATA}/work" 2>/dev/null | awk '{print $1}')"; work_gb="${work_gb:-0}"
    if (( work_gb < CRITICAL_SET_LIMIT_GB )); then data_set+=("${DATA}/work"); else log "work/ is ${work_gb}GB: left out (13.1)"; fi
    (( work_gb * 100 >= CRITICAL_SET_LIMIT_GB * 80 )) && log "WARN critical set at 80% of ${CRITICAL_SET_LIMIT_GB}GB"
    backup "${REPO_INTERNAL_OF_DATA}" working-drive "${data_set[@]}"
    backup "${REPO_DATA_OF_INTERNAL}" internal "${INTERNAL_SET[@]}"
    # Age out the same-disk snapshots now that two drives exist (13.1): nothing older than 30
    # days is kept. Once it holds no snapshots, the repository can be deleted by hand.
    if [[ -d "${REPO_SAME_DISK}" ]]; then
      "${RESTIC}" -r "${REPO_SAME_DISK}" forget --tag same-disk --keep-within 30d --prune || log "WARN same-disk prune failed"
    fi
  fi
  write_status "${mode}" ok
  log "done"
}

main "$@"
