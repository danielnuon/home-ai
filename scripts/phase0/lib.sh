# shellcheck shell=bash disable=SC2034
# Shared helpers for the Phase 0 scripts (spec 24.3). Sourced, never run.
#
# Every script is idempotent: it checks the current state, changes only what differs, and prints
# one line per item. No script prints, logs or stores a password or recovery key.

set -euo pipefail
umask 022

PHASE0_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVIDENCE_DIR="/var/log/aiplatform/phase0"
DATA_VOLUME="/Volumes/Data"

# Service users (5.3) with fixed IDs so a rebuilt Mac gets the same numbers as its backups.
# Each user has a private primary group with the same name and number.
SERVICE_USERS=(aiagent:461 aitools:462 aiconnect:463 aigate:464 aiegress:465 aiportal:466)
# Shared groups (5.3): name:gid:members
SHARED_GROUPS=(
  "aiwork:471:owner aitools"
  "aiintake:472:owner aiconnect aitools"
  "aidocker:473:aitools"
  "aisite:474:aitools aiportal"
)

# restic, pinned (24.3 step 7). Checked 2026-11-16: 0.19.1 (2026-07-05) is the latest release.
RESTIC_VERSION="0.19.1"
RESTIC_SHA256_DARWIN_ARM64="7be0a144ccc377880f294204aa271d76e4b79554b42a751151d425ce6ebac143"
RESTIC_BIN="/opt/aiplatform/bin/restic"
RESTIC_KEYCHAIN_SERVICE="aiplatform.restic.starter"
SYSTEM_KEYCHAIN="/Library/Keychains/System.keychain"

# Starter repositories (13.1, decision 101).
REPO_SAME_DISK="/var/backups/aiplatform/restic-same-disk"
REPO_INTERNAL_OF_DATA="/var/backups/aiplatform/restic-of-working-drive"
REPO_DATA_OF_INTERNAL="${DATA_VOLUME}/backups/restic-of-internal"

ok()   { printf '  ok      %s\n' "$*"; }
did()  { printf '  changed %s\n' "$*"; }
skip() { printf '  skipped %s\n' "$*"; }
warn() { printf '  WARN    %s\n' "$*" >&2; }
fail() { printf '  FAIL    %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }

require_macos() {
  [[ "$(uname -s)" == "Darwin" ]] || die "run this on the Mac mini, not $(uname -s)"
}

require_root() {
  require_macos
  [[ "${EUID}" -eq 0 ]] || die "run with sudo from the deskadmin account"
  local invoker="${SUDO_USER:-root}"
  [[ "${invoker}" == "deskadmin" ]] || die "run from deskadmin (24.3), not ${invoker}"
}

# Ask before a step that is hard to undo. ASSUME_YES=1 skips the prompt for reruns.
confirm() {
  [[ "${ASSUME_YES:-0}" == "1" ]] && return 0
  local answer
  read -r -p "  $* Type yes to continue: " answer
  [[ "${answer}" == "yes" ]] || die "stopped; nothing after this point was changed"
}

data_volume_present() {
  [[ -d "${DATA_VOLUME}" ]] && mount | grep -q " on ${DATA_VOLUME} "
}

# owner:group:mode of a path, with the mode in octal and no leading zero (2770, 755, 700).
# BSD stat splits the mode: %Mp is the setuid/setgid/sticky digit, %Lp the rwx digits.
stat_mode() {
  local raw
  raw="$(stat -f '%Mp%Lp' "$1")"
  printf '%s:%o' "$(stat -f '%Su:%Sg' "$1")" "$((8#${raw}))"
}

# Create a directory and set owner, group and mode, reporting only what changed.
ensure_dir() {
  local path="$1" owner="$2" group="$3" mode="$4"
  if [[ ! -d "${path}" ]]; then
    mkdir -p "${path}"
    did "created ${path}"
  fi
  local current
  current="$(stat_mode "${path}")"
  if [[ "${current}" != "${owner}:${group}:${mode}" ]]; then
    chown "${owner}:${group}" "${path}"
    chmod "${mode}" "${path}"
    did "${path} ${current} -> ${owner}:${group}:${mode}"
  else
    ok "${path} ${owner}:${group} ${mode}"
  fi
}
