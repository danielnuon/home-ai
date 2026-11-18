#!/bin/bash
# SUDO_ASKPASS helper for the quick start: macOS shows a password dialog and the answer goes
# straight to sudo on stdout. Nothing is logged or stored. Cancel makes sudo fail.
exec /usr/bin/osascript \
  -e 'display dialog "Phase 0 setup needs the deskadmin password for an administrator step." with title "sudo" default answer "" with hidden answer buttons {"Cancel", "OK"} default button "OK"' \
  -e 'text returned of result'
