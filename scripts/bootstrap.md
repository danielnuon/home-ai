# Day 0 desk checklist (24.5, part 1)

Print this. Each line points to its step in `owner_privileged_steps.md`. Tick it when done.
Secrets go only on the paper sheet, never in a file or chat.

| Done | ID | What | Step |
| --- | --- | --- | --- |
| ☐ | OI-01 | Mac on power and Ethernet; working drive connected if it is here (decision 96) | Before you start |
| ☐ | OI-02 | `deskadmin` (administrator) at first boot, then `owner` (standard); macOS updated | 1, 2 |
| ☐ | — | Scripts copied to the mini; `00-preflight.sh` output saved | 3 |
| ☐ | OI-03 | FileVault on for both accounts; **recovery key on paper** | 4 |
| ☐ | — | Screen Sharing and Remote Login on for deskadmin and owner; MacBook key copied | 5 |
| ☐ | OI-06 | Homebrew; `10-os-settings`, `30-users-groups`, `40-directories` run | 6, 7, 8 |
| ☐ | OI-05 | Tailscale signed in on the mini and phone; MagicDNS and HTTPS on; key expiry off; serve check | 9 |
| ☐ | — | pf limits SSH and Screen Sharing to the tailnet | 10 |
| ☐ | OI-04 | Working drive APFS (Encrypted), **password on paper**, saved in `owner`'s keychain (or later) | 11 |
| ☐ | — | Starter backup installed; **restic password on paper** | 12 |
| ☐ | — | `70-restore-test.sh` ends `restore test: pass` | 13 |
| ☐ | — | `90-verify.sh` has no FAIL; the three manual checks pass | 14 |
| ☐ | OI-07 | AI builder session started with your account, evidence files shared | 14 |
| ☐ | OI-08 | Phase 0a started inside the return window; note fan noise | After Phase 0 |

Paper sheet, kept together in a safe place: FileVault recovery key · working drive password ·
restic repository password.
