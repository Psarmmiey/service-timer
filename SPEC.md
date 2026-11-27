# Service Timer: Product and Build Spec

Samuel Oladipupo · 26 Nov 2026

## Overview and goals

Service Timer is a Windows desktop app (.exe) that shows a huge countdown on the church's stage screen and follows the service plan by the clock, so it still runs correctly when no volunteer is there at 9:45. It replaces Ontime, which the team found too hard to set up and run.

**Context.** RCCG City of God For All Nations, Stirling. Sunday service starts at 9:45. The plan is usually prepared the day before. A Windows laptop drives a second screen near the stage that the speaker can see. Operators are volunteers with little technical knowledge, and sometimes nobody is free to touch the timer.

**Problems with Ontime this app must fix**

| Pain point | What Service Timer does instead |
| --- | --- |
| Getting the timer onto the second screen | Finds the second monitor and opens the stage view there, full screen, by itself |
| Adding items while the timer runs | Add, edit, reorder or delete any item live; the current countdown never stops |
| Starting late means mental arithmetic | Plan is tied to clock times; a late start offers "Catch up to the clock" or "Start from the top" |
| Nobody there to start at 9:45 | Auto-starts at the planned time when the app is open |
| Time up is not obvious | Whole stage screen turns red with TIME UP and counts the overrun |
| Timer not big or bold enough | Countdown fills most of the screen in heavy digits |
| Hard to control | A few large buttons, keyboard shortcuts, nothing else on the main screen |

**Goals for version 1**

1. A volunteer who has never seen the app can run a service after a two-minute explanation.

2. With auto-start on, the stage screen shows the correct item and time on Sunday morning with zero clicks.

3. Install is one .exe, with no admin rights, no server and no browser setup.

## Core concepts

The plan is anchored to the wall clock: every item has a scheduled start time worked out from the plan's start time plus the durations before it. Everything else in the app follows from that.

**Plan.** A named list of items with a start time (for example 9:45) and the days it applies to (for example Sundays). Several plans can be saved; one is active.

**Item.** Title, duration in minutes, an optional note shown only on the control window, and an optional warning threshold (default 2 minutes).

**Scheduled times.** Item 1 starts at the plan start. Item n starts at plan start + sum of the durations of items 1 to n−1 + the plan's shift. The shift is 0 unless someone chose "Start from the top" late (see Functional requirements).

**Run state.** The timer is always in one of these states:

| State | Meaning | Stage screen shows |
| --- | --- | --- |
| Idle | No plan running, before the start window | Clock and "Service starts at 9:45" |
| Waiting | Auto-start is armed for today | Countdown to the service start |
| Running | An item is counting down | Big countdown, item title, next item |
| Paused | Operator paused the item | Frozen countdown with a small PAUSED label |
| Overrun | Current item passed zero | Red screen, TIME UP, +mm:ss counting up |
| Finished | Last item ended and operator pressed Next, or Stop | "Service ended" and the clock |

**Two timing modes while running.**

- **Item timing (default after any manual action).** Each item gets its full duration from the moment it starts. If an item overruns, the next item still gets its full time, and the control window shows how far behind schedule the service is.

- **Clock timing (used by Catch up and auto-start).** The current item's time left is its scheduled end minus now. Pressing Next or any manual adjustment switches back to item timing, so the app never fights the operator.

**Behind or ahead of schedule.** Always shown on the control window as a signed figure, for example "7 min behind", together with the projected finish time of the whole plan.

## Functional requirements

The app has two windows: a stage window that only displays, and a control window where everything is operated. Requirement ids (FR-x) are referenced by the acceptance tests.

### Stage window

- **FR-1 Big countdown.** mm:ss (h:mm:ss at one hour or more) in a heavy condensed font, sized to fill about 90% of the screen width and at least 65% of its height, whichever limit it reaches first. Text auto-scales to any resolution and aspect ratio.

- **FR-2 Context lines.** Current item title above the digits, "Next: <title> (<n> min)" below. A large wall clock in the top right, since speakers check the real time. Nothing else.

- **FR-3 Colours.** White digits on near-black normally. Amber digits once time left is at or below the item's warning threshold (default 2:00).

- **FR-4 Time up.** At 0:00 the entire background turns strong red (#D00000 default), the overrun is the largest element as +mm:ss counting up, with "TIME UP" and the item name as a label above it. A setting offers "Red digits only" instead of a red screen. Optional slow pulse (on by default, can be turned off for accessibility). Stays until the operator presses Next.

- **FR-5 Stage message.** The operator can send a short message ("Please wrap up", "5 minutes", custom text) that appears as a banner over the stage view until cleared, with an optional flash.

- **FR-6 Blackout.** One button turns the stage screen black, and pressing it again brings it back.

- **FR-7 No clutter.** No cursor, window chrome, toolbars or system popups on the stage window.

### Control window

- **FR-8 Main controls.** Large buttons: Start, Pause/Resume, Next, Previous, +1 min, −1 min, Restart item, Stop. Each needs a confirmation only where it is destructive (Stop, Restart item).

- **FR-9 Live preview.** A small copy of exactly what the stage screen is showing, so the operator never needs to look up.

- **FR-10 Schedule panel.** The plan as a list showing each item's scheduled start, duration and status (done, current, upcoming), plus "X min behind/ahead" and the projected finish time.

- **FR-11 Quick messages.** Preset buttons for the stage messages and a text box for a custom one.

### Plan editing

- **FR-12 Simple editor.** Plan name, start time, days, then rows of title + minutes. Add row, delete row, drag to reorder, duplicate plan. Templates: save a plan as a reusable Sunday plan.

- **FR-13 Live editing.** Every edit is allowed while the timer runs and applies immediately without stopping it:changing the current item's minutes adjusts its time left by the difference;adding, deleting or reordering upcoming items updates the next-item line and projected finish at once;deleting the current item moves to the next item with its full duration;finished items can be edited for the record but do not affect the running item.

  - changing the current item's minutes adjusts its time left by the difference;

  - adding, deleting or reordering upcoming items updates the next-item line and projected finish at once;

  - deleting the current item moves to the next item with its full duration;

  - finished items can be edited for the record but do not affect the running item.

- **FR-14 Insert here.** A one-tap "Add item after current" for an unplanned slot (for example a testimony), asking only for title and minutes.

- **FR-12a Saved service plans.** A plan library holds any number of plans. Save, Save as, rename, duplicate, delete (with undo for 10 seconds) and set as the active plan. Two kinds:**Recurring plans** with days and a start time, for example "Sunday service" every Sunday at 9:45;**One-off plans** with a specific date, for example "Thanksgiving service, 13 Dec, 10:00", which take priority over a recurring plan on that date. The library shows the next date each plan will run. Plans autosave on every edit, and import and export as `.json`. Data model: `Plan` gains `kind: 'recurring' | 'oneOff'` and `date?: string`.

  - **Recurring plans** with days and a start time, for example "Sunday service" every Sunday at 9:45;

  - **One-off plans** with a specific date, for example "Thanksgiving service, 13 Dec, 10:00", which take priority over a recurring plan on that date. The library shows the next date each plan will run. Plans autosave on every edit, and import and export as `.json`. Data model: `Plan` gains `kind: 'recurring' | 'oneOff'` and `date?: string`.

- **FR-14a Reorder while running.** The control window's schedule lets the operator reorder upcoming items without opening the editor:each upcoming item has a drag handle, Move up and Move down buttons (keyboard: Alt+Up and Alt+Down on a focused row), and a "Do next" button that moves it straight after the current item;the current item is locked and finished items cannot be moved;scheduled times, the next-item line on stage and the projected finish update instantly, and the countdown never pauses;every change shows a toast with Undo for 10 seconds, and is saved to the plan for this run only unless the operator chooses "Save to plan" in the editor.

  - each upcoming item has a drag handle, Move up and Move down buttons (keyboard: Alt+Up and Alt+Down on a focused row), and a "Do next" button that moves it straight after the current item;

  - the current item is locked and finished items cannot be moved;

  - scheduled times, the next-item line on stage and the projected finish update instantly, and the countdown never pauses;

  - every change shows a toast with Undo for 10 seconds, and is saved to the plan for this run only unless the operator chooses "Save to plan" in the editor.

### Starting the service

- **FR-15 On-time start.** Pressing Start within 60 seconds of the plan start (before or after) starts item 1 with its full duration and no questions.

- **FR-16 Late start prompt.** Pressing Start more than 60 seconds after the plan start opens a dialog with three large choices:**Catch up to the clock (default, highlighted).** Jumps to the item whose scheduled window contains now, with time left = its scheduled end minus now. Earlier items are marked skipped.**Start from the top now.** Starts item 1 with its full duration and sets the plan shift to the lateness, so every later scheduled time and the finish time move. The dialog shows the new finish time before confirming.**Start from a chosen item.** Pick any item; it starts with its full duration. The dialog states the facts plainly, for example "It's 9:55. The plan started at 9:45. You are 10 min late."

  - **Catch up to the clock (default, highlighted).** Jumps to the item whose scheduled window contains now, with time left = its scheduled end minus now. Earlier items are marked skipped.

  - **Start from the top now.** Starts item 1 with its full duration and sets the plan shift to the lateness, so every later scheduled time and the finish time move. The dialog shows the new finish time before confirming.

  - **Start from a chosen item.** Pick any item; it starts with its full duration. The dialog states the facts plainly, for example "It's 9:55. The plan started at 9:45. You are 10 min late."

- **FR-17 Early start.** Pressing Start well before the plan start starts item 1 now with its full duration and shifts the schedule earlier.

- **FR-18 Auto-start.** Setting per plan, on by default. On a matching day, from 30 minutes before the start the stage shows the Waiting countdown, then item 1 starts by itself at the start time. If the app is opened or the laptop wakes after the start time, it automatically uses Catch up to the clock, and the control window shows a banner: "Started automatically at 9:45 following the clock. [Start from the top instead]".

### During the service

- **FR-19 Advancing.** Next is always manual by default. Optional per-plan setting: auto-advance to the next item N seconds after time up (off by default).

- **FR-20 Adjusting time.** +1/−1 min act on the current item only. Holding the button repeats.

- **FR-21 Last item.** After the last item ends, the stage shows TIME UP as normal; Next then goes to Finished.

### Keyboard shortcuts (control window focused)

| Key | Action |
| --- | --- |
| Space | Start / Pause / Resume |
| Right arrow or N | Next item |
| Left arrow or P | Previous item |
| + / − | Add / remove 1 minute |
| B | Blackout stage |
| M | Focus the custom message box |
| Esc | Clear stage message |
| Ctrl+E | Open plan editor |

**FR-22 Phone control (version 2, design for it now).** A local web page served by the app on the church Wi-Fi, opened by scanning a QR code, protected by a 4-digit PIN, offering the main controls and messages. Version 1 must keep all timer logic in one place so this is an added client, not a rewrite.

## Second screen handling

The stage window always goes to the second monitor on its own, full screen, and follows it if the monitor is unplugged and reconnected. No dragging, no Win+Shift+Arrow.

- **SS-1 Choose the display.** On launch, list displays with Electron's `screen.getAllDisplays()`. Use the saved stage display id if present; otherwise the first display that is not the primary. Settings offer a "Stage display" dropdown with "Identify" (shows a big number on each screen for 3 seconds).

- **SS-2 Full screen and frameless.** Stage window: `frame: false`, `fullscreen: true`, `alwaysOnTop: 'screen-saver'` level, `skipTaskbar: true`, bounds set to the chosen display before showing, cursor hidden via CSS.

- **SS-3 Hot-plug.** Listen to `display-added`, `display-removed` and `display-metrics-changed`. When the stage display returns, move the stage window back and re-enter full screen within 2 seconds.

- **SS-4 Single monitor.** If only one display exists, do not cover the control window. Show the stage view as a large preview inside the control window, plus a banner: "No second screen found. Check the cable and that Windows is set to Extend (Win+P)."

- **SS-5 Duplicate mode.** If Windows is mirroring (one logical display), treat it as single-monitor and show the same banner, since the congregation would otherwise see the controls.

- **SS-6 Resolution changes.** All stage layout is relative (vh/vw or container queries), so a projector at 1024×768 and a TV at 3840×2160 both render correctly.

## Windows .exe

Ship a per-user NSIS installer and a portable .exe, both built by GitHub Actions on a Windows runner, so the church laptop needs no admin rights and nobody has to build anything locally.

### Packaging and install

- **EXE-1 Build tool.** electron-builder. Targets: `nsis` (per-user, `oneClick: true`, `perMachine: false`) producing `ServiceTimer-Setup-<version>.exe`, and `portable` producing `ServiceTimer-<version>-portable.exe`. x64 only.

- **EXE-2 Identity.** appId `uk.rccgstirling.servicetimer`, product name "Service Timer", own icon (.ico at 256px), Start menu and desktop shortcut.

- **EXE-3 CI build.** Workflow `.github/workflows/release.yml` on `windows-latest`: install, typecheck, unit tests, `electron-builder --win --publish never`, upload both .exe files as workflow artefacts. On a `v*` tag, also attach them to a GitHub Release.

- **EXE-4 Code signing.** Version 1 is unsigned. Windows SmartScreen will warn on first run; the README tells the operator to click "More info" then "Run anyway" once. Leave config hooks (`CSC_LINK`, `CSC_KEY_PASSWORD` secrets) so signing can be switched on later without code changes.

### Running unattended on Sunday

- **EXE-5 Start with Windows.** Setting "Open when Windows starts", on by default, via `app.setLoginItemSettings({ openAtLogin: true })`. Launches straight into the control window with the stage window on the second screen.

- **EXE-6 Single instance.** `app.requestSingleInstanceLock()`; a second launch focuses the existing control window.

- **EXE-7 Keep awake.** `powerSaveBlocker.start('prevent-display-sleep')` from 30 minutes before a scheduled start until the service is Finished, and whenever the timer is Running or Paused. Released otherwise.

- **EXE-8 Crash and reboot recovery.** Persist the run state (plan id, current index, timing mode, item started-at, paused time left, shift) to disk at every state change and every 5 seconds. On launch, if a run from today was in progress, resume it by clock: work out where the service should be now and continue without asking, with a banner saying it resumed.

- **EXE-9 Closing.** Closing the control window while running asks "Stop the timer and close?" Closing the app always closes the stage window too. Option to minimise to the system tray instead of quitting.

- **EXE-10 Offline.** No network needed at any point. No telemetry.

### Updates

- **EXE-11 OTA updates (version 1).** electron-updater with the GitHub Releases provider. Checks on launch and every 6 hours while Idle, downloads in the background, and installs only on quit or when the operator presses "Restart to update". Never installs or restarts while a service is Waiting, Running or Paused. The control window header shows "Update ready: v1.2.0".

- **EXE-12 Release channel.** On every `v*` tag, CI publishes the NSIS installer, its `.blockmap` and `latest.yml` to a GitHub Release, which is what the app checks. The portable .exe cannot self-update; it shows a notice linking to the installer. A private repo needs a read-only token baked into the build, so a public releases repo is preferred.

- **EXE-13 Update safety.** A failed download or install leaves the current version running and shows the error in Settings. Plans, run state and settings live in userData, so updates never touch them. Settings has "Check for updates now" and an "Automatic updates" switch (on by default).

### Laptop checklist (goes in the README)

- [ ] Windows display mode set to Extend (Win+P)

- [ ] Power plan: never sleep when plugged in, screen off never

- [ ] Windows Update active hours cover Sunday morning

- [ ] Notifications set to Do Not Disturb, or Focus assist on

- [ ] Service Timer set to open when Windows starts

- [ ] Laptop clock set to sync automatically (the whole app depends on it)

### macOS build (development and testing)

The same codebase also ships an Apple Silicon Mac build so the app can be developed and tested on a MacBook. Windows stays the production target, and every Windows requirement above wins if the two conflict.

- **MAC-1 Targets.** electron-builder `mac` targets `dmg` and `zip`, arch `arm64` (add `x64` only if needed). The zip is required by electron-updater on macOS.

- **MAC-2 CI.** A second job in `release.yml` on `macos-latest` builds the .dmg and .zip and uploads them as artefacts, and attaches them to the GitHub Release on `v*` tags alongside `latest-mac.yml`.

- **MAC-3 Signing.** Without an Apple Developer account (99 USD a year), the build is ad-hoc signed only. It opens after right-click > Open the first time, or `xattr -cr "/Applications/Service Timer.app"`. OTA updates do NOT work on an unsigned Mac app, so on Mac you reinstall the new .dmg by hand. Leave `CSC_LINK`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` hooks for signing and notarisation later.

- **MAC-4 Stage window.** Use `setSimpleFullScreen(true)` (or kiosk mode) on the stage display rather than native full screen, which moves the window to its own Space and animates. Hide the menu bar and Dock on that display while the stage window is up.

- **MAC-5 Platform differences to handle.** Shortcuts use Cmd where Windows uses Ctrl (`CmdOrCtrl` accelerators). Closing the last window quits the app on Mac too (override the default stay-open behaviour). The tray icon becomes a menu bar icon. "Open at login" uses the same `setLoginItemSettings` API. Second-screen detection, hot-plug and the power blocker use the same Electron APIs and must behave identically.

- **MAC-6 Testing a second screen on a Mac.** An external monitor, a TV over HDMI, or an iPad with Sidecar all count as a second display, so SS-1 to SS-6 can be tested at home before Sunday.

- **MAC-7 What must still be proven on Windows.** AC-12 (installer without admin), AC-14 (open at login after reboot), SmartScreen behaviour and OTA updates have to be checked on a Windows machine before the app goes to church.

## Architecture, tech stack and data

All timer logic lives in one pure TypeScript module in the Electron main process; both windows (and later the phone page) only send commands and render the state they receive.

### Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | Electron (current stable) | Reliable multi-monitor placement, login items, power blocking, mature Windows packaging |
| Build | electron-vite + electron-builder | One config for main, preload and renderer; NSIS and portable targets |
| UI | React + TypeScript, shadcn/ui on Tailwind CSS (zinc theme) | Accessible Radix-based components (Dialog, Switch, Select, Tabs, Badge) matching the UI mockup |
| State | Engine in main process, broadcast over IPC | One source of truth across windows and future clients |
| Storage | JSON files in app.getPath('userData') | No database; easy to back up and inspect |
| Tests | Vitest (engine), Playwright for Electron (smoke) | Engine is tested with a fake clock |

### Processes

1. **Main process:** owns the engine, the clock tick (every 250 ms, using `Date.now()`, never accumulated intervals), window management, persistence, power blocker and login item.

2. **Preload:** exposes a typed `window.api` with `send(command)` and `onState(callback)` via `contextBridge`. `contextIsolation: true`, `nodeIntegration: false`.

3. **Control renderer:** editor, controls, schedule panel, preview.

4. **Stage renderer:** display only, receives state, sends nothing except "ready".

### Engine

- Pure function core: `reduce(state, command, now) -> state` and `derive(state, plan, now) -> view`. No timers or I/O inside, so every case in the acceptance tests is a unit test.

- Commands: `start`, `startChoice{mode: catchUp|fromTop|fromItem, index?}`, `pause`, `resume`, `next`, `previous`, `adjust{ms}`, `restartItem`, `stop`, `editPlan{plan}`, `insertAfterCurrent{item}`, `message{text, flash}`, `clearMessage`, `blackout{on}`, `tick`.

- `derive` returns everything a screen needs: status, current and next item, time left (negative when over), colour band (normal, warning, over), schedule rows with scheduled starts, behind/ahead in ms, projected finish, message, blackout.

### Data model
```ts
type Item = {
  id: string;
  title: string;
  minutes: number;          // whole or decimal, e.g. 2.5
  note?: string;            // control window only
  warnAtSeconds?: number;   // default 120
};

type Plan = {
  id: string;
  name: string;
  startTime: string;        // "09:45" local time
  days: number[];           // 0 = Sunday
  autoStart: boolean;       // default true
  autoAdvanceSeconds?: number; // undefined = manual Next
  items: Item[];
  updatedAt: string;
};

type RunState = {
  planId: string;
  runDate: string;          // "2026-11-29"
  status: 'idle' | 'waiting' | 'running' | 'paused' | 'finished';
  index: number;
  timing: 'item' | 'clock';
  itemStartedAt?: number;   // epoch ms
  itemDurationMs?: number;  // after live edits and +/-
  pausedLeftMs?: number;
  shiftMs: number;
  skipped: string[];        // item ids
  message?: { text: string; flash: boolean };
  blackout: boolean;
};
```
### Files on disk

- `plans.json`: all plans plus `activePlanId`.

- `run-state.json`: the current RunState, written atomically (write temp file, then rename).

- `settings.json`: stage display id, colours, pulse on/off, open at login, tray behaviour.

- Export and import a plan as a `.json` file from the editor, for backup or moving laptops.

## Edge cases and out of scope

The engine must handle these without crashing or asking confusing questions.

| Case | Expected behaviour |
| --- | --- |
| App opened after the whole plan should have ended | Status Idle with "Today's plan ended at 11:35. Start anyway?" offering From the top or From a chosen item |
| Catch up lands exactly on an item boundary | Pick the later item with its full duration |
| Item with 0 minutes | Not allowed in the editor; minimum 0.5 min |
| Plan edited so the current item no longer exists | Treat as deleted current item (FR-13) |
| System clock changes while running (sync jump, DST) | Item timing is unaffected beyond the jump; clock timing re-derives from the new time. Log the jump |
| DST change on a Sunday | Start time is local wall-clock time, so 9:45 stays 9:45 |
| Stage display unplugged mid-service | Timer keeps running; stage window returns when the display does (SS-3) |
| Laptop sleeps or reboots mid-service | Resume by clock on wake or relaunch (EXE-8) |
| Two plans match today | Use the active plan; warn in the editor |
| Pause during Overrun | Overrun freezes; resume continues counting up |
| Previous from item 1 | Restarts item 1 |
| Very long titles | Ellipsis on stage, full text in the control window |

**Out of scope for version 1:** phone control (FR-22, version 2),  Linux builds, a signed and notarised Mac build, ProPresenter, EasyWorship, vMix or OSC integrations, multiple stage screens with different views, user accounts, cloud sync, audio alerts, and translations.

## Acceptance criteria and test plan

Version 1 is done when every row below passes: AC-1 to AC-8 as Vitest engine tests with a fake clock, AC-9 to AC-14 by hand on a Windows laptop with a second screen.

**Reference plan for the tests** (start 9:45, Sundays, auto-start on): Welcome 5 min (9:45), Worship 20 (9:50), Announcements 5 (10:10), Offering 10 (10:15), Sermon 40 (10:25), Closing 5 (11:05). Planned finish 11:10.

| Id | Given | When | Then |
| --- | --- | --- | --- |
| AC-1 | Idle, 9:55, auto-start off | Start, choose Catch up | Worship running with 15:00 left; Welcome marked skipped; finish 11:10 |
| AC-2 | Idle, 9:55, auto-start off | Start, choose From the top | Welcome running with 5:00 left; finish 11:20; Worship scheduled 10:00 |
| AC-3 | Waiting, Sunday | Clock reaches 9:45:00, no input | Welcome running with 5:00 left |
| AC-4 | App launched Sunday 10:12, auto-start on | Launch | Announcements running with 3:00 left, banner offers From the top |
| AC-5 | Sermon running, 12:34 left | Edit Sermon from 40 to 45 min | 17:34 left, timer never stopped, finish +5 min |
| AC-6 | Offering running | Insert after current: Testimony, 3 min | Next line shows Testimony (3 min); finish +3 min |
| AC-7 | Worship running, 0:01 left | 1 second passes | Status overrun, stage red with TIME UP, +0:00 then counting up |
| AC-8 | Worship overran by 2:00 | Next | Announcements running with 5:00 left; control shows 2 min behind |
| AC-9 | Laptop with second screen in Extend mode | Launch app | Stage window full screen on the second screen, control on the primary, no clicks |
| AC-10 | Running service | Unplug stage HDMI, plug back in | Timer keeps going; stage returns full screen within 2 s |
| AC-11 | Sermon running | Kill the process in Task Manager, relaunch | Resumes on Sermon with correct time left (within 1 s) and a banner |
| AC-12 | Standard user account | Run Setup .exe | Installs and runs with no admin prompt; Start menu shortcut present |
| AC-13 | 1920×1080 stage screen | Any running item | Digits at least 60% of screen height, readable from 10 m |
| AC-14 | Settings: open at login on | Reboot laptop, log in | App opens itself; on Sunday before 9:45 the stage shows Waiting |

**Also required:** typecheck clean, lint clean, engine test coverage at least 90% of lines, and the CI workflow producing both .exe files on every push to main.

## Build plan

Build in five milestones, each ending in a merged pull request that passes CI, engine first so the hardest logic is proven before any UI exists. The build is done by the GitHub Copilot coding agent, one GitHub issue per milestone, assigned in order. See `AGENTS.md` for the standing rules.

### Repository layout
```
service-timer/
  src/
    engine/        # pure TS: reduce, derive, schedule maths, tests beside each file
    main/          # Electron main: windows, displays, persistence, power, login item, IPC
    preload/       # contextBridge api
    renderer/
      control/     # control window React app
      stage/       # stage window React app
      shared/      # fonts, colours, formatting
  build/           # icon.ico, installer assets
  .github/workflows/release.yml
  electron.vite.config.ts
  electron-builder.yml
  README.md        # operator guide + laptop checklist
```
### Milestones

1. **Engine.** Types, schedule maths, `reduce` and `derive`, all commands, Vitest suite covering AC-1 to AC-8 and the edge-case table. No Electron yet.

2. **Electron shell and second screen.** Main process, both windows, IPC, display selection and hot-plug (SS-1 to SS-6), placeholder UI.

3. **Stage and control UI.** FR-1 to FR-11 and shortcuts. Stage layout checked at 1024×768, 1920×1080 and 3840×2160.

4. **Editor, auto-start, persistence.** FR-12 to FR-21, EXE-5 to EXE-10, recovery after a kill.

5. **Packaging and CI.** electron-builder config, NSIS and portable targets, `release.yml` on `windows-latest`, a macos-latest job for the .dmg, README with SmartScreen and Mac first-open steps and the laptop checklist.

### How each milestone is delivered

- One issue per milestone, titled "Milestone N: ...". Only the current milestone is assigned to Copilot; the next one is assigned after the previous PR is merged.
- Copilot works on Linux (ubuntu-latest). Do not try to produce the .exe or .dmg locally; the GitHub Actions workflow builds them on `windows-latest` and `macos-latest` and uploads them as artefacts.
- A Copilot session stops after 59 minutes. If a milestone is too big for one session, finish a coherent slice that passes typecheck, lint and tests, push it, and list what is left in the PR description so the next session (via an `@copilot` comment on the PR) can continue.
- If a requirement is ambiguous, pick the simplest behaviour that satisfies the acceptance criteria and list the decision in the PR description under "Decisions".

### Commit and PR rules

- Conventional Commits, imperative lowercase subjects under 72 characters, bodies explain why.
- PR titles are Conventional Commits too, because each PR is squash-merged and the PR title becomes the commit subject on `main`.
- No AI-tool footers, session links or model names in PR titles or descriptions. (Copilot's own branch commits carry its attribution; squash-merging keeps `main` clean.)

## Decisions (answered 26 Nov 2026)

- **Name:** keep "Service Timer". appId `uk.rccgstirling.servicetimer`. A simple placeholder icon is fine for version 1.
- **Repository:** `Psarmmiey/service-timer`, public, so electron-updater can read GitHub Releases without a token (EXE-12).
- **Colours:** time up red `#D00000`, amber digits from 2:00 left, white on near-black otherwise. Where a mockup differs, this spec wins.
- **Separate from Hallel:** Service Timer is its own app and repo. It must not depend on Hallel being installed or open.
- **Next is the primary action (27 Nov 2026):** Next item is the dominant dark button on the control window; Pause is a large secondary button beside it. This replaces the mockup's Pause-first layout.
- **Dark theme (27 Nov 2026):** the control window has System, Light and Dark themes (Settings, Appearance). The stage is always dark.
- **Walkthrough (27 Nov 2026):** a short guided tour of the control window opens on first run (never during a service) and can be replayed from the ? button, the ? key or Settings, Help.
- **Time up screen (27 Nov 2026, from user testing):** a tester read "+1:36" as time added, so time up now shows the item name, a large white TIME UP sign, and the overtime as "1:36 OVER" with no plus sign (design concept C). The sign flashes, swapping solid and outline so it stays readable; Settings, "Flash TIME UP" turns it off (on by default; reduced motion also stops it). Red digits show in the last 30 seconds before 0:00 (Off, 15 s, 30 s or 1 min), and a chime plays on the control laptop only, never the stage (Off, at time up, or at amber and time up). This replaces the earlier pulse, flash at 0:00 and +/- options. Applies to the stage, the laptop preview and the phone page.
- **Phone control is in version 1 (27 Nov 2026):** FR-22 is built. It is off by default (Settings, Phone control). When on, the app serves a phone page on the local network on port 4280 (or the next free port), shown with a QR code and a 4-digit PIN. Phones can use Start, Next, Pause/Resume, ±1 min, Previous, stage messages and blackout, and never plans or settings. Five wrong PINs a minute per device are allowed; New PIN signs every phone out.

### Decision: item names in capitals on the stage (27 Nov 2026)

Item names on the stage (current item, Next, First) show in capitals by default so they read well from the back of the hall. Settings has a switch, "Item names in capitals", to turn it off. Plans keep the names as typed; only the stage display changes. The phone timer card follows the same setting.

### Decision: running order on the phone (27 Nov 2026)

The phone page has a second tab, Running order, showing today's items with times and Now/Done/Skipped. While the service is running, upcoming items can be moved up or down, made next, given more or fewer minutes, or removed, and a new item can be added after the current one. Every change is for today only, with a 10 second Undo, as on the laptop. Phones still cannot change saved plans or settings; to keep a change, someone presses Save to plan on the laptop. Save to plan only shows when today's order really differs from the plan (an undone change does not count).

### Decision: Do next versus Start now (27 Nov 2026)

Do next queues an item straight after the current one; the current item carries on. Start now goes to the item straight away: the current item ends, the chosen item starts with its full time, and the items it jumped over stay in the order for later (they are not marked skipped). Because Start now changes the stage at once, the laptop asks for confirmation and the phone needs a second tap within 4 seconds. There is no Undo for Start now; Previous goes back if it was a mistake.

### Decision: seeing and disconnecting phones (27 Nov 2026)

Each person enters their name when signing in on a phone (remembered on that phone). The laptop shows a toast when a phone connects ("Ada connected from a phone", with the device and network address), and the phones button in the header opens Settings, Phone control, at a list of signed-in phones: name, device and browser, address, connected or last seen, and their last action (for example "Next at 10:42"). Any phone can be disconnected from that list. Its page returns to sign-in with "The timer laptop disconnected this phone." Because a disconnected phone could sign back in with the PIN, the same check offers "Disconnect and change PIN", which signs every phone out. Names are self-reported, so the device and address are shown alongside to spot a stranger.

### Decision: colour only for states (27 Nov 2026)

Buttons stay black and white. Colour is kept for states that need noticing, with one meaning each: green for running or connected, amber for paused, behind or warning, red for time up, blackout and destructive actions. So while paused, the Pause button becomes an amber Resume (laptop and phone, and the Paused tag in the schedule); while the stage is blacked out, the Blackout button turns red and reads "Blacked out · Show timer" (phone: "Stage blacked out / Tap to show the timer"), matching a red badge in the header.
