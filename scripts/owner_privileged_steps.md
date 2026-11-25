# Phase 0 runbook: the Owner's privileged steps

To have Claude Code run these for you, use `QUICKSTART.md` instead; this is the manual version.

Spec 24.3, 4.4, 5.3, 5.5 and 13.1, in the order to run them on the Mac mini. Each script is
idempotent: rerunning it changes only what is missing and prints `ok`, `changed`, `skipped`,
`WARN` or `FAIL` per item. Allow about 1.5 hours [estimate].

**Never type a recovery key or password into a file, a photo, a chat or this repository.** Three
secrets go on one sheet of paper kept in a safe place: the FileVault recovery key (step 4), the
working drive's password (step 11) and the restic password (step 12).

Commands marked [CHECK] are written for macOS 27 from Apple's documented tools but have not been
run on macOS 27 yet; the first run records the result in `INFRASTRUCTURE.md` (24.2).

## Before you start

- On the MacBook: an SSH key (`ls ~/.ssh/id_ed25519.pub`, or create one with
  `ssh-keygen -t ed25519`), and the Tailscale app installed and signed in.
- On the phone: the Tailscale app installed and signed in with the same account (OI-05).
- The mini on Ethernet and power. The working drive is optional on day one (decision 96).
- Paper and a pen.

## 1. First boot: create `deskadmin` (OI-02)

In Setup Assistant:

- Create the first account with the account name **`deskadmin`**. It is the administrator, used
  only for these steps and for macOS updates (5.3).
- Skip signing in with an Apple Account for `deskadmin`.
- If Setup Assistant offers FileVault, you may turn it on here, choosing **create a recovery key
  and do not use my iCloud account** [CHECK wording on macOS 27]. Otherwise do it in step 4.
- Turn off analytics and Siri; leave Location Services as you prefer.

Then install every pending update in System Settings > General > Software Update and note the
macOS build (`sw_vers`).

## 2. Create `owner` (OI-02)

System Settings > Users & Groups > Add User: **Standard**, account name **`owner`**. Log in as
`owner` once to finish its setup, then log out and back in as `deskadmin`. Do not sign `owner` in
to an Apple Account yet; Phase 9 decides that with the Mac bridge.

## 3. Get the scripts onto the mini

As `deskadmin`, either download the repository ZIP from GitHub in Safari, or AirDrop the
`scripts/` folder from the MacBook. Then:

```sh
cd ~/Downloads/home-ai/scripts/phase0     # wherever it landed
xattr -cr .                                # clear the download quarantine
./00-preflight.sh                          # read-only inventory; save its output
```

## 4. FileVault for both accounts (OI-03; decision 11) — hard to undo

System Settings > Privacy & Security > FileVault > Turn On. Choose a **recovery key**, not your
iCloud account. Write the key on the paper sheet, then allow `owner` to unlock the disk when
asked. Encryption continues in the background; the Mac stays usable.

Check: `sudo fdesetup list` shows both `deskadmin` and `owner`. If `owner` is missing:
`sudo fdesetup add -usertoadd owner` (it asks for the `deskadmin` and `owner` passwords).

## 5. Sharing and SSH key

System Settings > General > Sharing:

- **Screen Sharing** on. Under its (i): allow access for **Only these users: deskadmin, owner**.
  Leave "VNC viewers may control screen with password" off.
- **Remote Login** on, for **Only these users: deskadmin, owner**. Leave "Allow full disk access
  for remote users" off.

From the MacBook, while both are on the same network:

```sh
ssh-copy-id deskadmin@<mini-name>.local
```

## 6. Homebrew (24.3 step 6)

As `deskadmin`, install Homebrew from <https://brew.sh> (it installs the Xcode Command Line Tools
first). Homebrew belongs to `deskadmin` because `owner` is a standard account.

## 7. OS settings (4.4)

```sh
sudo ./10-os-settings.sh
```

Sets `pmset sleep 0 disksleep 0 autorestart 1 womp 1`, the UPS cutoff at 30% if one is
connected, the macOS firewall, updates to download only, and SSH to public keys only for
`deskadmin` and `owner`. It refuses to turn off SSH passwords until step 5's key is in place, so
you cannot lock yourself out.

## 8. Service users, groups and folders (5.3, 5.5)

```sh
sudo ./30-users-groups.sh
sudo ./40-directories.sh
```

## 9. Tailscale (24.3 step 6; OI-05)

```sh
./50-tailscale.sh                # no sudo; it asks for the password when it needs it
```

It prints a sign-in link: open it on the MacBook or phone and sign in. Then, in the Tailscale
admin console (<https://login.tailscale.com/admin>):

- DNS: **MagicDNS** on, and **HTTPS Certificates** on.
- Machines: on the mini, **Disable key expiry**, so it never drops off the tailnet unattended.

Then check `tailscale serve` with HTTPS on this variant (a [CHECK] in 24.3 step 6):

```sh
./50-tailscale.sh --serve-check
```

## 10. Limit SSH and Screen Sharing to the tailnet (4.4, 5.6)

```sh
sudo ./20-pf-anchor.sh
```

Ports 22 and 5900 now accept only tailnet addresses. If something goes wrong at the desk:
`sudo launchctl bootout system/com.aiplatform.pf && sudo pfctl -f /etc/pf.conf`.

## 11. Working drive (OI-04) — only when it is here; erases the drive

Skip this on day one without the drive (decision 96) and come back when it arrives.

1. Log in as `owner`, open Disk Utility, choose View > Show All Devices, select the **drive**
   (not a volume) and Erase: Name **`Data`**, Format **APFS (Encrypted)**, Scheme **GUID
   Partition Map**. Choose a password and write it on the paper sheet. **This erases everything
   on the drive.**
2. When macOS asks for the password on the next mount, tick **Remember this password in my
   keychain**, so it unlocks when `owner` logs in (4.2).
3. Back as `deskadmin`: `sudo ./40-directories.sh` (enables ownership on `/Volumes/Data` and
   creates its folders).

## 12. Starter backup (13.1; 24.3 step 7)

```sh
sudo ./60-starter-backup.sh
```

Installs restic 0.19.1 (checksum-pinned), creates the repository password, **shows it once for
the paper sheet**, stores it in the System keychain, and installs the backup LaunchDaemon. Without
the working drive the repository is on the internal SSD and labeled same disk: it undoes deleted
and bad files but not an SSD failure (decision 96).

## 13. Restore test (Phase 0 exit)

```sh
sudo ./70-restore-test.sh
```

Seeds a canary set, backs up, runs `restic check --read-data`, restores into a scratch folder and
compares contents, owners and modes. It must end with `restore test: pass`.

## 14. Verify Phase 0

```sh
sudo ./90-verify.sh
```

Then the three manual checks it prints:

1. **Remote login from the login window:** `sudo fdesetup authrestart`. While the mini sits at the
   login window, from the MacBook over Tailscale: `ssh deskadmin@<mini MagicDNS name>`. It must
   connect. Then log in as `owner` at the desk (or over Screen Sharing) and lock the screen.
2. **LAN is blocked:** on the MacBook, turn Tailscale off, then `nc -vz -G 3 <mini LAN IP> 22` and
   the same for 5900. Both must time out. Turn Tailscale back on.
3. **UPS**, only if one is used: unplug it from the wall and confirm a clean shutdown.

Evidence lands in `/var/log/aiplatform/phase0/`. It holds no secrets. Share the latest
`verify-*.txt` and `restore-test-*.txt` so the results go into `INFRASTRUCTURE.md` and Phase 0
can be closed.

## After Phase 0

- Phase 0a (25.4) starts next, inside Apple's return window: `spec/hardware-acceptance/`.
- When the working drive arrives: step 11, then `sudo ./60-starter-backup.sh` and
  `sudo ./70-restore-test.sh` again; the backup switches to two-drive mode by itself.
- If the drive reports no health data (USB 3.x), set `INTERVAL_HOURS=4` in
  `/etc/aiplatform/starter-backup.conf` (13.1, 4.2).
