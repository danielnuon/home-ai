#!/usr/bin/env bash
# Phase 0, service users and groups (5.3; 24.3 step 2).
# Run as: sudo ./30-users-groups.sh   (from deskadmin)
#
# Creates hidden service users with no password and no login shell, each with a private primary
# group and a 700 home under /var/aiplatform/home, then the shared groups and their members.
# The human accounts deskadmin and owner are made by hand at first boot (runbook steps 1-2).
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_root

id owner >/dev/null 2>&1 || die "create the owner account first (runbook step 2)"
if dseditgroup -o checkmember -m owner admin >/dev/null 2>&1; then
  die "owner is an administrator; make it a standard account first (5.3)"
fi

# Refuse an ID already taken by a different name, rather than share it.
id_free_or_ours() {  # kind(Users|Groups) name id attribute
  local holder
  holder="$(dscl . -search "/$1" "$4" "$3" 2>/dev/null | awk 'NR==1{print $1}')"
  [[ -z "${holder}" || "${holder}" == "$2" ]] || die "$4 $3 is already used by ${holder}; edit lib.sh"
}

ensure_group() {  # name gid
  id_free_or_ours Groups "$1" "$2" PrimaryGroupID
  if dscl . -read "/Groups/$1" >/dev/null 2>&1; then ok "group $1"; return; fi
  dscl . -create "/Groups/$1"
  dscl . -create "/Groups/$1" PrimaryGroupID "$2"
  dscl . -create "/Groups/$1" Password '*'
  did "group $1 ($2)"
}

ensure_dir /var/aiplatform root wheel 755
ensure_dir /var/aiplatform/home root wheel 755

step "Service users (5.3)"
for entry in "${SERVICE_USERS[@]}"; do
  name="${entry%%:*}"; uid="${entry##*:}"; home="/var/aiplatform/home/${name}"
  ensure_group "${name}" "${uid}"
  id_free_or_ours Users "${name}" "${uid}" UniqueID
  if ! dscl . -read "/Users/${name}" >/dev/null 2>&1; then
    dscl . -create "/Users/${name}"
    dscl . -create "/Users/${name}" UniqueID "${uid}"
    dscl . -create "/Users/${name}" PrimaryGroupID "${uid}"
    dscl . -create "/Users/${name}" RealName "AI platform ${name}"
    did "user ${name} (${uid})"
  else
    ok "user ${name}"
  fi
  # Enforced on every run, so a hand edit is put back.
  dscl . -create "/Users/${name}" UserShell /usr/bin/false
  dscl . -create "/Users/${name}" NFSHomeDirectory "${home}"
  dscl . -create "/Users/${name}" Password '*'
  dscl . -create "/Users/${name}" IsHidden 1
  ensure_dir "${home}" "${name}" "${name}" 700
done

step "Shared groups (5.3)"
for entry in "${SHARED_GROUPS[@]}"; do
  IFS=: read -r name gid members <<<"${entry}"
  ensure_group "${name}" "${gid}"
  for member in ${members}; do
    if dseditgroup -o checkmember -m "${member}" "${name}" >/dev/null 2>&1; then
      ok "${member} in ${name}"
    else
      dseditgroup -o edit -a "${member}" -t user "${name}"
      did "${member} added to ${name}"
    fi
  done
done

step "No service user is an administrator (5.3)"
for entry in "${SERVICE_USERS[@]}"; do
  name="${entry%%:*}"
  if dseditgroup -o checkmember -m "${name}" admin >/dev/null 2>&1; then fail "${name} is in admin"; else ok "${name} not admin"; fi
done
