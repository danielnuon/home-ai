# Day 1 quick start: hand the Phase 0 setup to Claude

You do about 15 minutes of clicking, then paste one prompt into Claude Code on the Mac mini.
Claude runs the Phase 0 scripts (`scripts/phase0/`, spec 24.3) in order, checks each result, and
stops when it needs you. It needs you for an administrator password dialog, a sign-in link, a few
switches in the Tailscale website, and one step whose password only you may see. The full manual
version is `owner_privileged_steps.md`.

Have ready: paper and a pen, the MacBook with Tailscale signed in, the phone with Tailscale
signed in, and the mini on Ethernet and power. The working drive can wait (decision 96).

**Three secrets go on paper and nowhere else:** the FileVault recovery key, the working drive's
password, and the backup (restic) password. Never type them into Claude, a file or a photo.

## What you do by hand (about 15 minutes)

1. **Setup Assistant.** Create the first account with the account name **`deskadmin`**. Skip the
   Apple Account for it. When FileVault is offered, turn it on and choose **create a recovery key
   and do not use my iCloud account** [CHECK wording on macOS 27]. **Write the key on paper.**
2. **Updates.** System Settings > General > Software Update: install everything, then restart.
3. **`owner` account.** System Settings > Users & Groups > Add User: **Standard**, account name
   **`owner`**. Being created by `deskadmin` lets it unlock FileVault. You sign it in to your Apple
   Account later, in Phase 9.
4. **Sharing.** System Settings > General > Sharing: turn on **Screen Sharing** and **Remote
   Login**, each for **Only these users: deskadmin, owner**.
5. **Claude Code.** As `deskadmin`, open Terminal and run:

   ```sh
   curl -fsSL https://claude.ai/install.sh | bash
   ```

   Open a new Terminal window, run `claude`, and sign in with your account.

## The prompt

Paste this into Claude Code as your first message:

```text
Set up Phase 0 of my home AI platform on this Mac mini, end to end, using the scripts in
https://github.com/danielnuon/home-ai (scripts/phase0/ and scripts/QUICKSTART.md).

Rules:
- Never ask me for, print, or store a password, recovery key or other secret. For every sudo
  step, set SUDO_ASKPASS to scripts/phase0/askpass.sh and use `sudo -A`, so I type the
  deskadmin password into a macOS dialog, not into this chat.
- Do not run 60-starter-backup.sh yourself. When you reach it, ask me to run it in my own
  Terminal window, because it shows the backup password once for my paper copy.
- Stay in Claude Code's default permission mode, where I approve each command. Before I type a
  password into a sudo dialog, show me the exact `sudo -A` command it is for.
- Do not erase, format or partition any disk. Do not turn FileVault off or change it.
- Change nothing outside what the scripts do. If a script prints FAIL or exits with an error,
  stop, show me the output, explain what you think went wrong, and wait for me.
- Use 600-second timeouts for steps that wait on me (the Tailscale sign-in).

Steps:
1. Download the repository without git:
   mkdir -p ~/home-ai-phase0 && curl -fsSL https://github.com/danielnuon/home-ai/archive/9e9e6afb5d92c76b128bddd253684a9824a4f45d.tar.gz | tar xz -C ~/home-ai-phase0 --strip-components 1
   This is pinned to one reviewed commit, so a later push to main cannot change what runs
   under sudo. Then cd ~/home-ai-phase0/scripts/phase0 and run `xattr -cr .` there.
2. Run ./00-preflight.sh and summarize it in five lines: macOS build, chip and memory,
   whether FileVault is on, whether deskadmin and owner exist with the right roles, and whether
   /Volumes/Data is mounted.
3. Check that `sudo fdesetup list` (through askpass) shows both deskadmin and owner. If owner
   is missing, stop and tell me to add it in System Settings > Privacy & Security > FileVault.
4. Ask me to run this on my MacBook, then wait for my "done":
   ssh-copy-id deskadmin@<this Mac's name>.local
   Confirm that ~/.ssh/authorized_keys is no longer empty.
5. Run with sudo -A: 10-os-settings.sh, 30-users-groups.sh, then 40-directories.sh.
6. Install Homebrew non-interactively, using the askpass helper:
   NONINTERACTIVE=1 SUDO_ASKPASS=<askpass path> /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   Then add /opt/homebrew/bin to PATH for this session.
7. Run ./50-tailscale.sh as deskadmin (no sudo; the script uses askpass itself). Show me the
   sign-in link it prints and wait. After sign-in, ask me to do three things in
   https://login.tailscale.com/admin and reply "done": turn on MagicDNS, turn on HTTPS
   Certificates, and choose Disable key expiry for this Mac only. Phones and other devices keep
   their default expiry (decisions 102 and 104). Then run ./50-tailscale.sh --serve-check.
8. Run 20-pf-anchor.sh with sudo -A.
9. If /Volumes/Data is not mounted, tell me the working drive is skipped for now (decision 96).
   If a new external drive is attached but not set up, do not touch it. Tell me to follow step 11
   of owner_privileged_steps.md, which erases the drive, and wait.
10. Ask me to run this in my own Terminal window and reply "done":
    cd ~/home-ai-phase0/scripts/phase0 && sudo ./60-starter-backup.sh
11. Run 70-restore-test.sh with sudo -A. It must end with "restore test: pass".
12. Run 90-verify.sh with sudo -A. Then walk me through its three MANUAL checks one at a time:
    the LAN block test and the UPS check (if I have one) first, then the authrestart remote
    login from my MacBook. `fdesetup authrestart` asks for a FileVault user's password, so I run
    `sudo fdesetup authrestart` myself in my own Terminal. Before that, tell me this session will
    end and that I should reopen Claude Code afterwards and say "continue Phase 0 from step 13".
13. Write ~/phase0-summary.md: the commit the scripts came from (step 1), each step with ok,
    changed, skipped or FAIL, the versions of
    macOS, tailscale and restic, every [CHECK] line the scripts printed, and the paths of the
    newest verify-*.txt and restore-test-*.txt in /var/log/aiplatform/phase0/. It must not
    contain any secret. Tell me to share that file in my project thread, then to log out of
    deskadmin and log in as owner with the screen locked (spec 5.1 and 5.3: deskadmin is never
    left logged in).
```

## While it runs

- **A "sudo" password dialog** is Claude asking to run one administrator step. Type the
  `deskadmin` password into the dialog. Never type it into the chat. Expect about ten of them,
  because sudo can't remember the password without a terminal.
- **Claude Code also asks before each command.** Keep it in its default permission mode (no
  auto-accept or bypass). The password dialog doesn't say what it's for, so read the `sudo -A`
  command Claude Code shows you before typing the password.
- **The backup password** (step 10) appears only in your own Terminal window. Write it on paper,
  then type `written`.

## When it ends

Share `~/phase0-summary.md` in the project thread. The results then go into `INFRASTRUCTURE.md`,
Phase 0 closes, and Phase 0a (hardware acceptance) starts. Phase 0a must finish, with its
keep-or-return record, before the return window closes; see the dates in decision 107. When the
working drive arrives, follow step 11 of `owner_privileged_steps.md`, then ask Claude to rerun
`40-directories.sh`, `70-restore-test.sh` and `90-verify.sh`. The backup switches to two-drive
mode by itself.

Untested until the first run: `askpass.sh`, the Homebrew install through it, and every macOS
command marked [CHECK] in the scripts.
