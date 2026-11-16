#!/usr/bin/env bash
# Phase 0, step 0: read-only inventory of the Mac before anything changes.
# Safe to run as any user; changes nothing. Paste its output into the thread.
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_macos

step "Machine"
sw_vers
sysctl -n machdep.cpu.brand_string
printf 'memory: %s GB\n' "$(( $(sysctl -n hw.memsize) / 1073741824 ))"
system_profiler SPHardwareDataType | grep -E 'Model Identifier|Chip|Total Number of Cores|Memory' || true

step "Internal disk"
df -h / | tail -1
diskutil apfs list | grep -E 'FileVault|Name:' | head -20 || true

step "FileVault"
fdesetup status || true
fdesetup list 2>/dev/null || echo "  (fdesetup list needs sudo; skipped)"

step "Human accounts"
for user in deskadmin owner; do
  if id "${user}" >/dev/null 2>&1; then
    if dseditgroup -o checkmember -m "${user}" admin >/dev/null 2>&1; then role=administrator; else role=standard; fi
    printf '  %-10s %s, uid %s\n' "${user}" "${role}" "$(id -u "${user}")"
  else
    printf '  %-10s missing\n' "${user}"
  fi
done

step "External disks"
diskutil list external || true
if data_volume_present; then
  diskutil info "${DATA_VOLUME}" | grep -E 'File System Personality|FileVault|Owners|Protocol|Solid State|Volume Free Space' || true
else
  echo "  ${DATA_VOLUME} not mounted (day one without the working drive, decision 96)"
fi

step "Power"
pmset -g | grep -E ' sleep |disksleep|autorestart|womp' || true
pmset -g batt | head -3 || true

step "Already installed"
for tool in brew tailscale tailscaled restic smartctl; do
  printf '  %-11s %s\n' "${tool}" "$(command -v "${tool}" || echo none)"
done
[[ -x "${RESTIC_BIN}" ]] && echo "  ${RESTIC_BIN}: $("${RESTIC_BIN}" version)"
found=0
for plist in /Library/LaunchDaemons/*aiplatform* /Library/LaunchDaemons/*tailscale*; do
  [[ -e "${plist}" ]] && { echo "  ${plist}"; found=1; }
done
[[ "${found}" -eq 1 ]] || echo "  no platform LaunchDaemons yet"
