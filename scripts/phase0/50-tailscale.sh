#!/usr/bin/env bash
# Phase 0, Tailscale (24.3 step 6; OI-05): the open-source tailscaled as a system daemon, so the
# Mac is on the tailnet at the login window, before anyone logs in.
# Run as: ./50-tailscale.sh [--serve-check]   (as deskadmin, NOT with sudo: Homebrew refuses root;
# the script calls sudo itself for the daemon and DNS steps)
#
# Tailscale says this variant is "only recommended for unattended installs managed by experienced
# macOS system administrators" (checked 2026-11-16); the spec accepts that (24.3 step 6).
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
require_macos
[[ "${EUID}" -ne 0 ]] || die "run as deskadmin without sudo (Homebrew refuses root)"
[[ "$(id -un)" == "deskadmin" ]] || die "run as deskadmin (Homebrew is owned by deskadmin, 24.3 step 6)"
export PATH="/opt/homebrew/bin:${PATH}"
command -v brew >/dev/null || die "install Homebrew first (runbook step 6)"

step "Install and pin tailscale"
if brew list --versions tailscale >/dev/null 2>&1; then ok "tailscale $(brew list --versions tailscale)"
else brew install tailscale; did "installed $(brew list --versions tailscale)"; fi
brew pin tailscale 2>/dev/null || true
ok "pinned; record this version in INFRASTRUCTURE.md: $(brew list --versions tailscale)"

step "System daemon (runs before login)"
if asroot launchctl print system/com.tailscale.tailscaled >/dev/null 2>&1; then ok "com.tailscale.tailscaled loaded"
else asroot "$(brew --prefix)/bin/tailscaled" install-system-daemon; did "tailscaled installed as a LaunchDaemon"; fi

step "Join the tailnet"
if tailscale status >/dev/null 2>&1; then ok "already signed in as $(tailscale status --json --peers=false 2>/dev/null | grep -m1 '"DNSName"' | cut -d'"' -f4)"
else
  echo "  Open the link below on your phone or MacBook and sign in with your Tailscale account."
  asroot tailscale up
fi

step "DNS (24.3 step 6): this variant does not set the Mac's DNS, so add MagicDNS by hand"
port="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
[[ -n "${port}" ]] || die "no default route; is Ethernet connected?"
service="$(networksetup -listallhardwareports | awk -v dev="${port}" '/^Hardware Port:/{sub(/^Hardware Port: /,""); hp=$0} $0=="Device: "dev{print hp}')"
[[ -n "${service}" ]] || die "no network service for ${port}"
current="$(networksetup -getdnsservers "${service}")"
if grep -qx '100.100.100.100' <<<"${current}"; then ok "${service} already uses 100.100.100.100 first"
else
  # Keep the router's DNS second, so the Mac still resolves public names if tailscaled stops.
  router_dns="$(ipconfig getoption "${port}" domain_name_server 2>/dev/null || true)"
  # shellcheck disable=SC2086  # router_dns is empty or one address
  asroot networksetup -setdnsservers "${service}" 100.100.100.100 ${router_dns}
  did "${service} DNS: $(networksetup -getdnsservers "${service}" | tr '\n' ' ')"
fi

if [[ "${1:-}" == "--serve-check" ]]; then
  step "tailscale serve with HTTPS on this variant (24.3 step 6 [CHECK])"
  command -v python3 >/dev/null || die "python3 is needed for the serve check (xcode-select --install)"
  python3 -m http.server 8406 --bind 127.0.0.1 >/dev/null 2>&1 & server=$!
  trap 'kill ${server} 2>/dev/null; asroot tailscale serve reset 2>/dev/null || true' EXIT
  sleep 1
  asroot tailscale serve --bg 8406
  name="$(tailscale status --json --peers=false | grep -m1 '"DNSName"' | cut -d'"' -f4)"; name="${name%.}"
  if curl -fsS --max-time 30 "https://${name}/" >/dev/null; then ok "https://${name}/ served with a trusted certificate"
  else fail "serve over HTTPS did not answer; check that HTTPS certificates are on in the admin console"; fi
fi

step "Status"
tailscale status | head -5
