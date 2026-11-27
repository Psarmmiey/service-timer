# Service Timer

A simple stage countdown timer for church services, built to replace Ontime for RCCG City of God For All Nations, Stirling.

- Puts a huge countdown on the stage screen by itself, on the second monitor, full screen.
- Follows the service plan by the clock, so it starts at 9:45 with nobody touching it, and a late start never needs mental arithmetic.
- Turns the whole stage screen red with TIME UP and counts the overrun.
- Lets you add, reorder or change items while the timer keeps running.
- Ships as a Windows .exe (installer and portable), with an Apple Silicon Mac build for testing.

## Status

Milestone 5 adds installable Windows builds, a macOS Apple Silicon build and release publishing.

## Install on Windows

Download the latest `ServiceTimer-Setup-<version>.exe` from the GitHub Releases page.

The installer is unsigned, so Windows SmartScreen may show a warning:

1. Select **More info**.
2. Select **Run anyway**.

The installer is per-user and does not need an administrator account. It installs in a few seconds, adds Start menu and desktop shortcuts, and opens Service Timer. Plans and settings are kept if Service Timer is uninstalled and installed again.

The first time phone control is switched on, Windows may ask whether Service Timer can use the network. Choose **Allow** on private networks.

### Portable build

Download `ServiceTimer-<version>-portable.exe` if no installation is wanted. It can run from a USB drive or any folder. Portable builds cannot install updates automatically. Open Settings and use the link to GitHub Releases to install the latest Setup .exe.

## Install on Mac

The Mac build is for Apple Silicon and is ad-hoc signed. Download the latest `.dmg` or `.zip` from GitHub Releases.

1. Open the `.dmg`, then drag **Service Timer** into Applications.
2. Open **Service Timer**. macOS says it can't check the app for malicious software.
3. Open **System Settings**, then **Privacy & Security**, scroll down and select **Open Anyway** next to Service Timer, then confirm.

Alternatively, remove the downloaded-app quarantine attribute:

```sh
xattr -cr "/Applications/Service Timer.app"
```

Unsigned Mac builds do not support OTA updates. Reinstall the newer `.dmg` or `.zip` by hand.

## Menu bar

On Windows the menu bar is at the top of the window; on a Mac it is at the top of the screen.

- **File**: Plans, Paste Running Order, Import Plan or CSV, Back Up All Plans, Settings.
- **Timer**: Start, Pause or Resume, Next and Previous item, add or take off a minute, message to the stage, Blackout, Restart item, Stop.
- **View**: which screen shows the timer, Which Screen Is Which, theme, text size, full screen.
- **Help**: the walkthrough, keyboard shortcuts, phone control, this guide, report a problem, updates, About.

Single-key shortcuts (Space, arrows, B, M) are shown in the menu but only work when you are not typing in a box.

## Use at Sunday setup

1. Connect the stage display and set Windows display mode to **Extend** with **Win+P**.
2. Open Service Timer. The control window stays on the primary display and the stage countdown opens on the stage display.
3. Check the Sunday plan and start time in the Plans editor.
4. Keep the timer on **Idle** until the service is ready to begin. It may wait for the configured start time or start automatically.
5. Use **Next** to advance items. Use pause and time adjustment controls only when necessary.
6. Keep the laptop plugged in and allow it to stay awake throughout the service.

## Updating

Installed Windows builds check for updates on launch and every six hours while idle. Updates download in the background and are never installed while the timer is Waiting, Running or Paused.

In Settings:

- The dot beside **Update ready** means an update is downloaded.
- Select **Check for updates now** to check manually.
- Turn **Automatic updates** on or off.
- Select **Restart to update** to install a downloaded update while idle.

If an update fails, Service Timer keeps running the installed version and shows the error in Settings.

## Laptop checklist

- [ ] Windows display mode set to Extend (Win+P)
- [ ] Power plan: never sleep when plugged in, screen off never
- [ ] Windows Update active hours cover Sunday morning
- [ ] Notifications set to Do Not Disturb, or Focus assist on
- [ ] Service Timer set to open when Windows starts
- [ ] Laptop clock set to sync automatically
- [ ] Stage display connected and recognised
- [ ] Laptop plugged into mains power
- [ ] Test plan and start time checked

## Making a release

1. Make sure `main` has everything to ship and its CI is green.
2. Set the version in `package.json` (for example `1.0.0`), commit, then tag and push: `git tag v1.0.0 && git push origin v1.0.0`.
3. The Release workflow builds the Windows installer and portable `.exe` and the Mac `.dmg`, and attaches them to a GitHub Release for that tag. Installed Windows copies update themselves from it.

Every push to `main` also builds the installers as downloadable workflow artifacts, without making a release.

The logo lives in `build/icon.svg` (and `build/tray-template.svg` for the Mac menu bar). After changing either, run `npm run icons` on a Mac to regenerate every icon size.

## Docs

- [SPEC.md](SPEC.md): product and build spec, requirements and acceptance tests
- [design/](design/): UI mockup screens
- [AGENTS.md](AGENTS.md): rules for coding agents working in this repo

The operator guide, install steps (including the Windows SmartScreen and Mac first-open steps) and the laptop checklist will be added here in milestone 5.
