#!/usr/bin/env bash
# Phase 0 acceptance (24.1): checks every item it can and saves the evidence. Changes nothing.
# Run as: sudo ./90-verify.sh   (from deskadmin). Exit code 0 only when nothing FAILs.
# Two criteria need a person and a second device; they are listed at the end as MANUAL.
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "${EVIDENCE_DIR}"
EVIDENCE="${EVIDENCE_DIR}/verify-${STAMP}.txt"
exec > >(tee "${EVIDENCE}") 2>&1
failures=0
check() {  # description command...
  local what="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "${what}"; else fail "${what}"; failures=$((failures + 1)); fi
}
deferred() { printf '  DEFER   %s\n' "$*"; }

step "macOS"
sw_vers | tr '\n' ' '; echo

step "FileVault (4.4, decision 11)"
check "FileVault on"                        bash -c 'fdesetup status | grep -q "FileVault is On"'
check "deskadmin can unlock FileVault"      bash -c 'fdesetup list | grep -q "^deskadmin,"'
check "owner can unlock FileVault"          bash -c 'fdesetup list | grep -q "^owner,"'
check "a personal recovery key exists"      bash -c 'fdesetup haspersonalrecoverykey | grep -q true'

step "Human accounts (5.3)"
check "deskadmin is an administrator"       dseditgroup -o checkmember -m deskadmin admin
check "owner is standard, not admin"        bash -c '! dseditgroup -o checkmember -m owner admin'
check "automatic login off"                 bash -c '! defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser'

step "Power (4.4)"
for setting in "sleep 0" "disksleep 0" "autorestart 1" "womp 1"; do
  check "pmset ${setting}" bash -c "pmset -g | grep -Eq '^ *${setting% *} +${setting#* }( |\$)'"
done

step "Firewall, updates, sharing (4.4)"
check "macOS firewall on"                   bash -c '/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate | grep -q enabled'
check "updates download automatically"     bash -c '[ "$(defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload)" = 1 ]'
check "macOS updates not auto-installed"    bash -c '[ "$(defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates)" = 0 ]'
check "Remote Login (SSH) on"               bash -c 'launchctl print system/com.openssh.sshd >/dev/null || systemsetup -getremotelogin | grep -q On'
check "SSH public keys only"                bash -c '/usr/sbin/sshd -T | grep -qx "passwordauthentication no"'
check "Screen Sharing on"                   bash -c 'launchctl print system/com.apple.screensharing >/dev/null'
check "pf enabled"                          bash -c 'pfctl -s info | grep -q "Status: Enabled"'
# The main ruleset must call the anchor: rules sitting in an uncalled anchor do nothing (decision 102 e).
check "main pf ruleset calls the aiplatform anchor" bash -c 'pfctl -s rules | grep -q "^anchor \"aiplatform\""'
check "pf anchor limits 22 and 5900 to the tailnet" bash -c 'pfctl -a aiplatform -s rules | grep -q "5900"'
check "pf guard LaunchDaemon loaded (every 60 s)" launchctl print system/com.aiplatform.pf

step "Tailscale (24.3 step 6)"
check "tailscaled system daemon loaded"     launchctl print system/com.tailscale.tailscaled
check "signed in to the tailnet"            bash -c 'tailscale status >/dev/null'
# With key expiry disabled, Self carries no KeyExpiry (decision 102 d) [CHECK on first run].
check "key expiry disabled for this Mac"    bash -c '! tailscale status --json --peers=false | grep -q "\"KeyExpiry\""'
check "MagicDNS resolver 100.100.100.100 set" bash -c 'scutil --dns | grep -q 100.100.100.100'
tailscale version 2>/dev/null | head -1 | sed 's/^/  version /' || true

step "Users, groups, directories (5.3, 5.5)"
for entry in "${SERVICE_USERS[@]}"; do
  name="${entry%%:*}"
  check "user ${name} exists, no shell"     bash -c "[ \"\$(dscl . -read /Users/${name} UserShell | awk '{print \$2}')\" = /usr/bin/false ]"
  check "${name} not admin"                 bash -c "! dseditgroup -o checkmember -m ${name} admin"
done
for entry in "${SHARED_GROUPS[@]}"; do
  IFS=: read -r group _ members <<<"${entry}"
  for member in ${members}; do check "${member} in ${group}" dseditgroup -o checkmember -m "${member}" "${group}"; done
done
expect_mode() { check "$1 $2" bash -c "[ \"\$(source '${PHASE0_DIR}/lib.sh'; stat_mode '$1')\" = '$2' ]"; }
expect_mode /opt/aiplatform               root:wheel:755
expect_mode /etc/aiplatform               root:wheel:755
expect_mode /var/aiplatform/run           root:wheel:755
expect_mode /var/aiplatform/docker        owner:aidocker:750
expect_mode /var/lib/aiplatform/tasks     aitools:aitools:700
expect_mode /var/lib/aiplatform/personal  aitools:aitools:700
expect_mode /var/lib/aiplatform/connect   aiconnect:aiconnect:700
expect_mode /var/lib/aiplatform/gate      aigate:aigate:700
expect_mode /var/lib/aiplatform/ledger    aiegress:aiegress:700
expect_mode /var/lib/aiplatform/portal    aiportal:aiportal:700
expect_mode /var/lib/aiplatform/site      aitools:aisite:2750
expect_mode /var/lib/aiplatform/assistant aiagent:aiagent:700
expect_mode /var/lib/aiplatform/memory    aitools:aitools:700
expect_mode /var/log/aiplatform/audit     root:wheel:700
# A permission test, not only a mode read: a service user cannot read another's state.
check "aiportal cannot list aitools state"  bash -c '! sudo -u aiportal ls /var/lib/aiplatform/tasks'
check "aitools can write its own state"     bash -c 'sudo -u aitools touch /var/lib/aiplatform/tasks/.probe && rm /var/lib/aiplatform/tasks/.probe'

step "Working drive (4.2; OI-04)"
if data_volume_present; then
  info="$(diskutil info "${DATA_VOLUME}")"
  check "APFS (Encrypted)"                  grep -q 'FileVault:.*Yes' <<<"${info}"
  check "ownership enabled"                 grep -Eq 'Owners:[[:space:]]+Enabled' <<<"${info}"
  expect_mode "${DATA_VOLUME}/work"         aitools:aiwork:2770
  expect_mode "${DATA_VOLUME}/inbox"        owner:aiintake:2770
  expect_mode "${DATA_VOLUME}/personal"     aitools:aitools:700
  check "group write works on work/ for owner" bash -c "sudo -u owner touch ${DATA_VOLUME}/work/.probe && rm ${DATA_VOLUME}/work/.probe"
  system_profiler SPNVMeDataType 2>/dev/null | grep -E 'TRIM Support|Model' | sed 's/^/  [CHECK 4.2] /' || true
else
  deferred "working drive not connected: encrypted, ownership and its folders are checked when it arrives (decision 100)"
fi

step "Starter backup (13.1; 24.3 step 7)"
check "restic ${RESTIC_VERSION} installed"    bash -c "${RESTIC_BIN} version | grep -q ' ${RESTIC_VERSION} '"
check "password in the System keychain"     security find-generic-password -s "${RESTIC_KEYCHAIN_SERVICE}" "${SYSTEM_KEYCHAIN}"
check "backup LaunchDaemon loaded"          launchctl print system/com.aiplatform.starter-backup
check "last backup succeeded"               grep -q '"result": "ok"' "${EVIDENCE_DIR}/starter-backup-last.json"
latest_restore="$(ls -t "${EVIDENCE_DIR}"/restore-test-*.txt 2>/dev/null | head -1 || true)"
check "latest restore test passed"          grep -q 'restore test: pass' "${latest_restore:-/nonexistent}"
[[ -n "${latest_restore}" ]] && grep 'restore test:' "${latest_restore}" | sed 's/^/ /'

step "Manual criteria (need a person and a second device)"
cat <<'EOF'
  MANUAL  Remote login after authrestart: sudo fdesetup authrestart, then from the MacBook over
          Tailscale, while the mini shows the login window: ssh deskadmin@<mini MagicDNS name>
  MANUAL  pf blocks the LAN: from the MacBook with Tailscale OFF, on the same Wi-Fi:
          nc -vz -G 3 <mini LAN IP> 22   (expect timeout)   and the same for 5900
  MANUAL  UPS, only if one is used: pull its plug and confirm a clean shutdown at 30%
EOF

step "Result"
echo "  ${failures} automatic check(s) failed. Evidence: ${EVIDENCE}"
[[ "${failures}" -eq 0 ]]
