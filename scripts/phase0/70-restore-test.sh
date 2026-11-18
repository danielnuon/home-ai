#!/usr/bin/env bash
# Phase 0 exit criterion (24.1): "a restore from whichever backup is in use works".
# Run as: sudo ./70-restore-test.sh   (from deskadmin), after 60-starter-backup.sh.
#
# Seeds a small canary set with known hashes, owners and modes, takes a backup now, checks every
# repository in use, restores the latest snapshot into a scratch folder and compares it byte for
# byte and owner for owner. The result is saved as evidence; no secret is written anywhere.
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root
[[ -x /opt/aiplatform/bin/starter-backup.sh ]] || die "run 60-starter-backup.sh first"
export RESTIC_PASSWORD_COMMAND="/usr/bin/security find-generic-password -s ${RESTIC_KEYCHAIN_SERVICE} -w ${SYSTEM_KEYCHAIN}"
export RESTIC_CACHE_DIR=/var/backups/aiplatform/cache

CANARY=/var/lib/aiplatform/phase0-canary
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="${EVIDENCE_DIR}/restore-test-${STAMP}.txt"
exec > >(tee "${EVIDENCE}") 2>&1

manifest() {  # dir -> sorted "relative-path owner:group:mode sha256" lines
  (cd "$1" && find . -print | LC_ALL=C sort | while read -r f; do
    if [[ -f "${f}" && ! -L "${f}" ]]; then sum="$(shasum -a 256 "${f}" | cut -d' ' -f1)"
    elif [[ -L "${f}" ]]; then sum="link:$(readlink "${f}")"
    else sum=dir; fi
    printf '%s %s %s\n' "${f}" "$(stat_mode "${f}")" "${sum}"
  done)
}

step "Canary set ${CANARY}"
if [[ ! -d "${CANARY}" ]]; then
  ensure_dir "${CANARY}" aitools aitools 700
  mkdir -p "${CANARY}/nested/deeper"
  head -c 1048576 /dev/urandom > "${CANARY}/random-1mb.bin"
  head -c 4096 /dev/urandom > "${CANARY}/nested/deeper/small.bin"
  printf 'name with spaces\n' > "${CANARY}/nested/a file with spaces.txt"
  ln -s nested/deeper/small.bin "${CANARY}/link-to-small"
  if command -v sqlite3 >/dev/null; then
    sqlite3 "${CANARY}/sample.db" 'create table t(x); insert into t values (1),(2),(3);'
  fi
  chown -R -h aitools:aitools "${CANARY}"
  chmod 600 "${CANARY}/random-1mb.bin"
  did "seeded"
fi
# A file that changes every run proves this run's snapshot is the one restored.
printf '%s\n' "${STAMP}" > "${CANARY}/run-stamp.txt"; chown aitools:aitools "${CANARY}/run-stamp.txt"
expected="$(manifest "${CANARY}")"
ok "$(wc -l <<<"${expected}" | tr -d ' ') entries"

step "Backup now"
/opt/aiplatform/bin/starter-backup.sh --now

if data_volume_present; then repos=("${REPO_INTERNAL_OF_DATA}" "${REPO_DATA_OF_INTERNAL}"); mode=two-drive
else repos=("${REPO_SAME_DISK}"); mode=same-disk; fi

result=pass
for repo in "${repos[@]}"; do
  step "Repository ${repo}"
  "${RESTIC_BIN}" -r "${repo}" check --read-data || { fail "restic check"; result=fail; continue; }
  ok "restic check --read-data"
  scratch="/var/backups/aiplatform/restore-test-${STAMP}"
  "${RESTIC_BIN}" -r "${repo}" restore latest --target "${scratch}" --include "${CANARY}"
  restored="$(manifest "${scratch}${CANARY}")"
  if [[ "${restored}" == "${expected}" ]]; then
    ok "restored canary matches: contents, owners, modes and links"
  else
    fail "restored canary differs:"; diff <(echo "${expected}") <(echo "${restored}") || true
    result=fail
  fi
  if grep -q "${STAMP}" "${scratch}${CANARY}/run-stamp.txt"; then ok "snapshot is from this run"
  else fail "stale snapshot"; result=fail; fi
  rm -rf "${scratch}"
done

step "Result"
echo "  restore test: ${result}  mode: ${mode}  restic: $("${RESTIC_BIN}" version | awk '{print $2}')  at: ${STAMP}"
[[ "${mode}" == same-disk ]] && warn "same-disk repository: protects against deleted and bad files, not SSD failure (decision 96)"
echo "  evidence: ${EVIDENCE}"
[[ "${result}" == pass ]]
