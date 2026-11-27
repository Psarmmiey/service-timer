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

The installer is per-user and does not need an administrator account. It adds a Start menu shortcut and, if selected, a desktop shortcut.

### Portable build

Download `ServiceTimer-<version>-portable.exe` if no installation is wanted. It can run from a USB drive or any folder. Portable builds cannot install updates automatically. Open Settings and use the link to GitHub Releases to install the latest Setup .exe.

## Install on Mac

The Mac build is for Apple Silicon and is ad-hoc signed. Download the latest `.dmg` or `.zip` from GitHub Releases.

1. Open the `.dmg`, then drag **Service Timer** into Applications.
2. The first time, right-click **Service Timer** in Applications and select **Open**.
3. Select **Open** in the security prompt.

Alternatively, remove the downloaded-app quarantine attribute:

```sh
xattr -cr "/Applications/Service Timer.app"
```

Unsigned Mac builds do not support OTA updates. Reinstall the newer `.dmg` or `.zip` by hand.

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

## Docs

- [SPEC.md](SPEC.md): product and build spec, requirements and acceptance tests
- [design/](design/): UI mockup screens
- [AGENTS.md](AGENTS.md): rules for coding agents working in this repo

The operator guide, install steps (including the Windows SmartScreen and Mac first-open steps) and the laptop checklist will be added here in milestone 5.
