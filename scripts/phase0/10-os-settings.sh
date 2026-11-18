#!/usr/bin/env bash
# Phase 0, OS settings (4.4; 24.3 steps 9 and 11, without pf, which is 20-pf-anchor.sh).
# Run as: sudo ./10-os-settings.sh   (from deskadmin)
#
# Changes: power settings, the macOS firewall, update policy, and an sshd drop-in that allows
# public keys only. Screen Sharing and Remote Login are switched on in System Settings by hand
# (runbook step 5), because macOS no longer lets a script turn Screen Sharing on.
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

step "Power (4.4): never sleep, disks never sleep, restart after power failure, wake on network"
pmset -a sleep 0 disksleep 0 autorestart 1 womp 1
pmset -g | grep -E ' sleep |disksleep|autorestart|womp'
if pmset -g batt | grep -qi 'UPS'; then
  pmset -u haltlevel 30
  did "UPS found: shut down at 30% battery"
else
  skip "no UPS connected"
fi

step "macOS firewall (4.4)"
FW=/usr/libexec/ApplicationFirewall/socketfilterfw
if "${FW}" --getglobalstate | grep -q 'enabled'; then ok "firewall on"; else "${FW}" --setglobalstate on >/dev/null; did "firewall on"; fi

step "Updates (4.4, 12.6): download only, install by hand"
SU=/Library/Preferences/com.apple.SoftwareUpdate
defaults write "${SU}" AutomaticCheckEnabled -bool true
defaults write "${SU}" AutomaticDownload -bool true
defaults write "${SU}" AutomaticallyInstallMacOSUpdates -bool false
# Security responses can restart the Mac, which then waits at the FileVault screen, so they are
# installed by hand too. XProtect and other data files keep updating: they never restart.
defaults write "${SU}" CriticalUpdateInstall -bool false
defaults write "${SU}" ConfigDataInstall -bool true
defaults write /Library/Preferences/com.apple.commerce AutoUpdate -bool false
ok "updates download only"

step "SSH (4.4): public keys only, deskadmin and owner only"
KEYS="/Users/deskadmin/.ssh/authorized_keys"
DROPIN="/etc/ssh/sshd_config.d/100-aiplatform.conf"
if [[ ! -s "${KEYS}" ]]; then
  warn "${KEYS} is empty: add your MacBook's public key first (runbook step 5), then rerun"
  warn "password login stays on until then, so you cannot be locked out"
else
  cat > "${DROPIN}.new" <<'EOF'
# Installed by scripts/phase0/10-os-settings.sh (spec 4.4).
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AllowUsers deskadmin owner
EOF
  if cmp -s "${DROPIN}.new" "${DROPIN}" 2>/dev/null; then rm "${DROPIN}.new"; ok "${DROPIN} current"
  else mv "${DROPIN}.new" "${DROPIN}"; chmod 644 "${DROPIN}"; did "${DROPIN} installed"; fi
  /usr/sbin/sshd -t || die "sshd rejects the configuration; remove ${DROPIN} and report this"
  if /usr/sbin/sshd -T 2>/dev/null | grep -qx 'passwordauthentication no'; then ok "sshd reads the drop-in"
  else warn "sshd does not read ${DROPIN}; check the Include line in /etc/ssh/sshd_config"; fi
fi
