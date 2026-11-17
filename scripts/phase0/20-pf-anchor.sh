#!/usr/bin/env bash
# Phase 0, pf rules (4.4, 5.6; 24.3 step 11): SSH (22) and Screen Sharing (5900) accept only
# tailnet source addresses. Matched by address, because the Tailscale utun number changes.
# Run as: sudo ./20-pf-anchor.sh   (from deskadmin)
#
# macOS updates can reset /etc/pf.conf, so this never edits it. It installs a complete ruleset
# of its own (Apple's default anchors plus ours) and a root LaunchDaemon that loads it at boot.
# Undo: sudo launchctl bootout system/com.aiplatform.pf && sudo pfctl -f /etc/pf.conf
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

PF_DIR=/etc/aiplatform/pf
PLIST=/Library/LaunchDaemons/com.aiplatform.pf.plist
ensure_dir /etc/aiplatform root wheel 755
ensure_dir "${PF_DIR}" root wheel 755
ensure_dir /opt/aiplatform root wheel 755
ensure_dir /opt/aiplatform/bin root wheel 755

install_file() {  # path mode < content
  local path="$1" mode="$2" tmp
  tmp="$(mktemp)"; cat > "${tmp}"
  if cmp -s "${tmp}" "${path}" 2>/dev/null; then rm "${tmp}"; ok "${path} current"
  else install -o root -g wheel -m "${mode}" "${tmp}" "${path}"; rm "${tmp}"; did "${path} installed"; fi
}

install_file "${PF_DIR}/aiplatform.anchor" 644 <<'EOF'
# Installed by scripts/phase0/20-pf-anchor.sh (spec 4.4).
table <tailnet> const { 100.64.0.0/10, fd7a:115c:a1e0::/48 }
block drop in quick proto { tcp udp } from ! <tailnet> to any port { 22 5900 }
EOF

install_file "${PF_DIR}/pf.conf" 644 <<EOF
# Installed by scripts/phase0/20-pf-anchor.sh (spec 4.4). Apple's default ruleset plus ours.
set skip on lo0
scrub-anchor "com.apple/*"
nat-anchor "com.apple/*"
rdr-anchor "com.apple/*"
dummynet-anchor "com.apple/*"
anchor "com.apple/*"
load anchor "com.apple" from "/etc/pf.anchors/com.apple"
anchor "aiplatform"
load anchor "aiplatform" from "${PF_DIR}/aiplatform.anchor"
EOF

pfctl -nf "${PF_DIR}/pf.conf" || die "pf rejects ${PF_DIR}/pf.conf; nothing was loaded"
ok "ruleset parses"

# The guard runs at boot and every 60 seconds (decision 102 e): Apple's own boot job reloads
# /etc/pf.conf, which drops the call to our anchor while the anchor keeps its rules, so the
# guard checks the main ruleset itself and reloads ours whenever the call is missing.
install_file /opt/aiplatform/bin/pf-guard.sh 755 <<EOF
#!/bin/bash
# Installed by scripts/phase0/20-pf-anchor.sh (spec 4.4, decision 102 e).
set -u
if ! /sbin/pfctl -s info 2>/dev/null | grep -q 'Status: Enabled'; then
  /sbin/pfctl -E >/dev/null 2>&1
  echo "\$(date -u +%FT%TZ) pf was disabled; enabled"
fi
if ! /sbin/pfctl -s rules 2>/dev/null | grep -q '^anchor "aiplatform"'; then
  /sbin/pfctl -f ${PF_DIR}/pf.conf 2>&1
  echo "\$(date -u +%FT%TZ) main ruleset lacked the aiplatform anchor; reloaded"
fi
EOF

install_file "${PLIST}" 644 <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.aiplatform.pf</string>
  <key>ProgramArguments</key>
  <array><string>/opt/aiplatform/bin/pf-guard.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>60</integer>
  <key>StandardOutPath</key><string>/var/log/aiplatform-pf.log</string>
  <key>StandardErrorPath</key><string>/var/log/aiplatform-pf.log</string>
</dict>
</plist>
EOF
plutil -lint "${PLIST}" >/dev/null

launchctl bootout system/com.aiplatform.pf 2>/dev/null || true
launchctl bootstrap system "${PLIST}"
sleep 1
if pfctl -s info 2>/dev/null | grep -q 'Status: Enabled'; then ok "pf enabled"; else fail "pf not enabled"; fi
if pfctl -s rules 2>/dev/null | grep -q '^anchor "aiplatform"' && pfctl -a aiplatform -s rules 2>/dev/null | grep -q '5900'
then ok "main ruleset calls the aiplatform anchor, and the anchor holds its rules"
else fail "aiplatform anchor not loaded; see /var/log/aiplatform-pf.log"; fi
