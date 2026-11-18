#!/usr/bin/env bash
# Phase 0, starter backup (13.1; 24.3 step 7): pinned restic, the repository password in the
# System keychain and on paper, the backup job and its root LaunchDaemon.
# Run as: sudo ./60-starter-backup.sh   (from deskadmin), after 40-directories.sh.
# Then run 70-restore-test.sh for the Phase 0 exit criterion.
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

step "restic ${RESTIC_VERSION} (pinned, checksum-verified)"
if [[ -x "${RESTIC_BIN}" ]] && "${RESTIC_BIN}" version | grep -q "restic ${RESTIC_VERSION} "; then
  ok "$("${RESTIC_BIN}" version)"
else
  [[ "$(uname -m)" == "arm64" ]] || die "expected an Apple silicon Mac"
  tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' EXIT
  url="https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_darwin_arm64.bz2"
  curl -fsSL -o "${tmp}/restic.bz2" "${url}"
  echo "${RESTIC_SHA256_DARWIN_ARM64}  ${tmp}/restic.bz2" | shasum -a 256 -c - >/dev/null \
    || die "restic download does not match the pinned checksum; nothing installed"
  bunzip2 "${tmp}/restic.bz2"
  install -o root -g wheel -m 755 "${tmp}/restic" "${RESTIC_BIN}"
  did "installed $("${RESTIC_BIN}" version)"
fi

step "Repository password (System keychain, and on paper with the FileVault recovery key)"
if security find-generic-password -s "${RESTIC_KEYCHAIN_SERVICE}" "${SYSTEM_KEYCHAIN}" >/dev/null 2>&1; then
  ok "password already in the System keychain (not shown)"
else
  # The password is shown on screen once. Refuse to show it anywhere but a person's own
  # terminal, so it never lands in an AI session's transcript or a log (quick start step 6).
  [[ -t 0 && -t 1 ]] || die "run this step yourself in a Terminal window, not through Claude or a pipe"
  password="$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)"
  clear
  cat <<EOF

  Write this restic password on paper and keep it with the FileVault recovery key.
  It is shown once, is never saved to a file, and is needed to restore after a lost Mac.

      ${password}

EOF
  read -r -p "  Type 'written' once it is on paper: " answer
  [[ "${answer}" == "written" ]] || die "stopped; the password was not stored, rerun to get a new one"
  # Sent through security's interactive mode on stdin, so the password never appears in a
  # process's arguments (printf is a shell builtin, not a process) [CHECK on first run].
  printf 'add-generic-password -a root -s %s -T /usr/bin/security -w "%s" %s\n' \
    "${RESTIC_KEYCHAIN_SERVICE}" "${password}" "${SYSTEM_KEYCHAIN}" | security -i >/dev/null
  unset password
  clear
  did "password stored in the System keychain"
fi
security find-generic-password -s "${RESTIC_KEYCHAIN_SERVICE}" -w "${SYSTEM_KEYCHAIN}" >/dev/null \
  || die "root cannot read the password back from the System keychain [CHECK]"
ok "root can read it without a prompt"

step "Backup job and LaunchDaemon"
install -o root -g wheel -m 755 "${PHASE0_DIR}/starter-backup.sh" /opt/aiplatform/bin/starter-backup.sh
ok "/opt/aiplatform/bin/starter-backup.sh"
ensure_dir /var/backups/aiplatform/cache root wheel 700
if [[ ! -f /etc/aiplatform/starter-backup.conf ]]; then
  printf '# Hours between starter backups (13.1): 24 nightly, 4 if the working drive reports no health data.\nINTERVAL_HOURS=24\n' \
    > /etc/aiplatform/starter-backup.conf
  chmod 644 /etc/aiplatform/starter-backup.conf
  did "/etc/aiplatform/starter-backup.conf (nightly)"
fi
PLIST=/Library/LaunchDaemons/com.aiplatform.starter-backup.plist
cat > "${PLIST}" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.aiplatform.starter-backup</string>
  <key>ProgramArguments</key><array><string>/opt/aiplatform/bin/starter-backup.sh</string></array>
  <key>StartInterval</key><integer>3600</integer>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>/var/log/aiplatform/phase0/starter-backup.log</string>
  <key>StandardErrorPath</key><string>/var/log/aiplatform/phase0/starter-backup.log</string>
</dict>
</plist>
EOF
chown root:wheel "${PLIST}"; chmod 644 "${PLIST}"
plutil -lint "${PLIST}" >/dev/null
launchctl bootout system/com.aiplatform.starter-backup 2>/dev/null || true
launchctl bootstrap system "${PLIST}"
ok "com.aiplatform.starter-backup loaded (checks hourly, backs up every INTERVAL_HOURS)"

if data_volume_present; then ok "working drive mounted: two-drive mode"
else warn "no working drive: same-disk mode, reduced protection (decision 96)"; fi
echo
echo "  Next: sudo ./70-restore-test.sh"
