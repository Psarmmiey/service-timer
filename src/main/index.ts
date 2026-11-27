import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerSaveBlocker, screen, Tray } from "electron";
// electron-updater is CommonJS; a named ESM import crashes the main process on launch.
import electronUpdater from "electron-updater";
import { join } from "node:path";
import QRCode from "qrcode";
import { createIdleState, createWaitingState, derive, isLive, reduce, type Item, type Plan, type RunState } from "../engine";
import { chooseTodaysPlan, localDateString, planStartMs } from "../engine/schedule";
import { chooseStagePlacement, type DisplayInfo, type StagePlacement } from "./display-selection";
import { createJsonStore, type JsonStore } from "./storage";
import type { AppState, DisplayStatus, Settings, TimerCommand, UpdateStatus, WebControlStatus } from "../shared/ipc";
import type { Command } from "../engine";
import { createWebControl, DEFAULT_PHONE_PORT, lanAddresses, newPin } from "./web-control";
import { canCheckForUpdates, canInstallUpdate, UPDATE_CHECK_INTERVAL_MS } from "./update-policy";

// Loaded on first use, not at startup.
const autoUpdater = () => electronUpdater.autoUpdater;

// Tests (and anyone running a second copy) can point the app at its own data folder.
if (process.env.SERVICE_TIMER_USER_DATA) app.setPath("userData", process.env.SERVICE_TIMER_USER_DATA);

const STAGE_BANNER = process.platform === "darwin"
  ? "No second screen found. Check the cable, and that the display is set to extend rather than mirror."
  : "No second screen found. Check the cable and that Windows is set to Extend (Win+P).";
const TICK_MS = 250;

const defaultPlan: Plan = {
  id: "sunday-service",
  name: "Sunday service",
  startTime: "09:45",
  days: [0],
  autoStart: true,
  items: [
    { id: "welcome", title: "Welcome and opening prayer", minutes: 5, warnAtSeconds: 120 },
    { id: "worship", title: "Praise and worship", minutes: 20, warnAtSeconds: 120 },
    { id: "announcements", title: "Announcements", minutes: 5, warnAtSeconds: 120 },
    { id: "offering", title: "Offering", minutes: 10, warnAtSeconds: 120 },
    { id: "sermon", title: "Sermon", minutes: 40, warnAtSeconds: 120 },
    { id: "closing", title: "Closing prayer", minutes: 5, warnAtSeconds: 120 },
  ],
  updatedAt: "2026-11-26T00:00:00.000Z",
  kind: "recurring",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isSettings(value: unknown): value is Settings {
  if (!isRecord(value)) return false;
  return (value.stageDisplayId === undefined || isInteger(value.stageDisplayId))
    && (value.timeUpStyle === "whole-screen" || value.timeUpStyle === "digits")
    && typeof value.pulse === "boolean"
    && typeof value.openAtLogin === "boolean"
    && typeof value.trayOnClose === "boolean"
    && (value.automaticUpdates === undefined || typeof value.automaticUpdates === "boolean")
    && (value.keepAwake === undefined || typeof value.keepAwake === "boolean")
    && (value.theme === undefined || value.theme === "system" || value.theme === "light" || value.theme === "dark")
    && (value.warnAtSeconds === undefined || (isInteger(value.warnAtSeconds) && value.warnAtSeconds >= 0 && value.warnAtSeconds <= 1800))
    && (value.walkthroughSeen === undefined || typeof value.walkthroughSeen === "boolean")
    && (value.flashAtZero === undefined || typeof value.flashAtZero === "boolean")
    && (value.flashTimeUp === undefined || typeof value.flashTimeUp === "boolean")
    && (value.itemNamesUppercase === undefined || typeof value.itemNamesUppercase === "boolean")
    && (value.dangerAtSeconds === undefined || (isInteger(value.dangerAtSeconds) && value.dangerAtSeconds >= 0 && value.dangerAtSeconds <= 600))
    && (value.chime === undefined || value.chime === "off" || value.chime === "time-up" || value.chime === "warning-and-time-up")
    && (value.overtimeSign === undefined || value.overtimeSign === "plus" || value.overtimeSign === "minus")
    && (value.phoneControl === undefined || typeof value.phoneControl === "boolean")
    && (value.phonePin === undefined || (typeof value.phonePin === "string" && /^\d{4}$/.test(value.phonePin)));
}

function isItem(value: unknown): value is Item {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && isFiniteNumber(value.minutes)
    && value.minutes >= 0.5
    && (value.note === undefined || typeof value.note === "string")
    && (value.warnAtSeconds === undefined || isFiniteNumber(value.warnAtSeconds));
}

function isPlan(value: unknown): value is Plan {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.startTime === "string"
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime)
    && Array.isArray(value.days)
    && value.days.every((day) => isInteger(day) && day >= 0 && day <= 6)
    && typeof value.autoStart === "boolean"
    && (value.autoAdvanceSeconds === undefined || isFiniteNumber(value.autoAdvanceSeconds))
    && Array.isArray(value.items)
    && value.items.every(isItem)
    && typeof value.updatedAt === "string"
    && (value.kind === "recurring" || value.kind === "oneOff")
    && (value.date === undefined || typeof value.date === "string");
}

function isTimerCommand(value: unknown): value is TimerCommand {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "start":
    case "pause":
    case "resume":
    case "next":
    case "previous":
    case "restartItem":
    case "stop":
    case "undoReorder":
    case "clearMessage":
    case "dismissBanner":
      return true;
    case "savePlans":
      return Array.isArray(value.plans) && value.plans.every(isPlan)
        && typeof value.activePlanId === "string";
    case "saveSettings":
      return isSettings(value.settings);
    case "startChoice":
      return (value.mode === "catchUp" || value.mode === "fromTop" || value.mode === "fromItem")
        && (value.index === undefined || isInteger(value.index));
    case "adjust":
      return isFiniteNumber(value.ms);
    case "editPlan":
      return isPlan(value.plan);
    case "insertAfterCurrent":
      return isItem(value.item);
    case "reorder":
      return isInteger(value.fromIndex) && isInteger(value.toIndex);
    case "moveUp":
    case "moveDown":
    case "doNext":
    case "removeUpcoming":
      return isInteger(value.index);
    case "setRunItemMinutes":
      return isInteger(value.index) && isFiniteNumber(value.minutes) && value.minutes >= 0.5 && value.minutes <= 600;
    case "message":
      return typeof value.text === "string" && (value.flash === undefined || typeof value.flash === "boolean");
    case "blackout":
      return typeof value.on === "boolean";
    case "skipAutoStartToday":
    case "newPhonePin":
    case "identifyDisplays":
      return true;
    case "checkForUpdates":
    case "restartToUpdate":
      return true;
    case "tick":
      return true;
    default:
      return false;
  }
}

let controlWindow: BrowserWindow | null = null;
let stageWindow: BrowserWindow | null = null;
let placement: StagePlacement | null = null;
let state: RunState;
let currentPlan: Plan = defaultPlan;
let tickTimer: NodeJS.Timeout | null = null;
let hotPlugTimer: NodeJS.Timeout | null = null;
let plans: Plan[] = [defaultPlan];
let activePlanId = defaultPlan.id;
let settings: Settings = {
  timeUpStyle: "whole-screen",
  pulse: true,
  openAtLogin: true,
  trayOnClose: false,
  keepAwake: true,
  automaticUpdates: true,
  theme: "system",
  warnAtSeconds: 120,
  walkthroughSeen: false,
  flashTimeUp: true,
  itemNamesUppercase: true,
  dangerAtSeconds: 30,
  chime: "time-up",
  overtimeSign: "plus",
  phoneControl: false,
};
let webStatus: WebControlStatus = { enabled: false, running: false, urls: [], clients: 0 };
let lastWebBroadcast = 0;
/** Local date on which the operator turned auto-start off ("Turn off auto-start today"). */
let autoStartSkippedOn: string | null = null;
let updateStatus: UpdateStatus = {
  state: "idle",
  portable: Boolean(process.env.PORTABLE_EXECUTABLE_DIR),
};
let updateCheckTimer: NodeJS.Timeout | null = null;
let downloadedUpdateVersion: string | undefined;
let store: JsonStore | null = null;
let tray: Tray | null = null;
let powerBlockerId: number | null = null;
let persistenceTimer: NodeJS.Timeout | null = null;

function getDisplaySnapshot(): DisplayInfo[] {
  const displays = screen.getAllDisplays().map((display) => ({
    id: display.id,
    bounds: display.bounds,
    isPrimary: display.id === screen.getPrimaryDisplay().id,
  }));

  if (process.env.SERVICE_TIMER_E2E_FORCE_DUAL === "1") {
    const second = displays[0]
      ? {
          id: 999,
          bounds: {
            x: displays[0].bounds.x + displays[0].bounds.width,
            y: displays[0].bounds.y,
            width: displays[0].bounds.width,
            height: displays[0].bounds.height,
          },
          isPrimary: false,
        }
      : undefined;
    return second ? [displays[0]!, second] : displays;
  }

  return displays;
}

function getDisplayStatus(): DisplayStatus {
  const displays = getDisplaySnapshot().map((display, index) => ({
    id: display.id,
    isPrimary: display.isPrimary,
    label: `Screen ${index + 1} · ${display.bounds.width}×${display.bounds.height}${display.isPrimary ? " (this laptop)" : ""}`,
  }));
  if (!placement || placement.mode === "single-monitor") {
    return { mode: "single-monitor", banner: STAGE_BANNER, aspectRatio: 16 / 9, displays };
  }
  const bounds = placement.bounds;
  return {
    mode: "stage-window",
    stageDisplayId: placement.activeDisplayId,
    aspectRatio: bounds && bounds.height ? bounds.width / bounds.height : 16 / 9,
    displays,
  };
}

function toAppState(now: number): AppState {
  return {
    now,
    view: deriveView(now),
    plan: currentPlan,
    display: getDisplayStatus(),
    plans,
    activePlanId,
    settings,
    update: { ...updateStatus, currentVersion: app.getVersion() },
    showWalkthrough: !settings.walkthroughSeen && process.env.NODE_ENV !== "test",
    web: { ...webStatus, pin: settings.phoneControl ? settings.phonePin : undefined },
  };
}

function deriveView(now: number) {
  return derive(state, currentPlan, now, { defaultWarnSeconds: settings.warnAtSeconds, dangerSeconds: settings.dangerAtSeconds ?? 30 });
}

/** What the phone page needs: the live timer, never plans or settings. */
function phoneSnapshot(now = Date.now()) {
  const view = deriveView(now);
  const plannedStart = view.scheduleRows[0]?.scheduledStart ?? now;
  return {
    now,
    planName: currentPlan.name,
    status: view.status,
    paused: view.paused,
    timeLeftMs: view.timeLeftMs,
    colourBand: view.colourBand,
    flashTimeUp: settings.flashTimeUp !== false,
    uppercase: settings.itemNamesUppercase !== false,
    live: isLive(state),
    rows: view.scheduleRows.map((row) => ({
      index: row.index,
      title: row.item.title,
      minutes: row.item.minutes,
      scheduledStart: row.scheduledStart,
      actualStart: row.actualStart ?? null,
      status: row.status,
      skipped: row.skipped,
    })),
    undoAvailable: Boolean(state.undoReorder && state.undoReorder.expiresAt > now),
    hasRunChanges: view.hasRunChanges,
    current: view.current ? { title: view.current.title, minutes: view.current.minutes } : null,
    next: view.next ? { title: view.next.title, minutes: view.next.minutes } : null,
    blackout: view.blackout,
    message: view.message ?? null,
    banner: view.banner ?? null,
    plannedStart,
    plannedFinish: view.plannedFinish,
    projectedFinish: view.projectedFinish,
    untilStartMs: plannedStart - now,
    late: now - plannedStart > 60_000 && now < view.plannedFinish,
  };
}

const webControl = createWebControl({
  getSnapshot: () => phoneSnapshot(),
  getPin: () => settings.phonePin ?? "",
  onCommand: (command) => {
    if (!isTimerCommand(command)) return false;
    applyTimerCommand(command as Command);
    return true;
  },
  onClientsChanged: (count) => {
    webStatus = { ...webStatus, clients: count };
    broadcastState();
  },
});

/** Start or stop phone control to match the setting (FR-22). */
async function syncWebControl(): Promise<void> {
  if (!settings.phoneControl || (process.env.NODE_ENV === "test" && process.env.SERVICE_TIMER_E2E_WEB !== "1")) {
    await webControl.stop();
    webStatus = { enabled: Boolean(settings.phoneControl), running: false, urls: [], clients: 0 };
    broadcastState();
    return;
  }
  if (!settings.phonePin) {
    settings = { ...settings, phonePin: newPin() };
    store?.write("settings.json", settings);
  }
  try {
    const port = await webControl.start(DEFAULT_PHONE_PORT);
    const urls = lanAddresses().map((address) => `http://${address}:${port}`);
    const qrSvg = urls[0] ? await QRCode.toString(urls[0], { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : undefined;
    webStatus = {
      enabled: true,
      running: true,
      urls,
      qrSvg,
      clients: webControl.clientCount(),
      error: urls.length ? undefined : "This laptop isn't on a Wi-Fi or wired network, so phones can't reach it.",
    };
  } catch (error) {
    webStatus = { enabled: true, running: false, urls: [], clients: 0, error: `Phone control couldn't start: ${(error as Error).message}` };
  }
  broadcastState();
}

/** Apply a timer command from the control window or a phone. */
function applyTimerCommand(command: Command): void {
  const now = Date.now();
  state = reduce(state, command, now, currentPlan);
  persistRunState();
  updatePowerBlocker();
  broadcastState(now);
}

/** A window can close between ticks (stage unplugged, app quitting); never send to a dead one. */
function sendTo(win: BrowserWindow | null | undefined, payload: unknown): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed() || win.webContents.isCrashed()) return;
  try {
    win.webContents.send("state", payload);
  } catch {
    // The frame was torn down mid-send; the next tick goes to whatever window replaces it.
  }
}

function broadcastState(now = Date.now()): void {
  const payload = toAppState(now);
  sendTo(controlWindow, payload);
  sendTo(stageWindow, payload);
  // Phones get two updates a second, plus one straight after any change.
  if (now - lastWebBroadcast >= 450) {
    lastWebBroadcast = now;
    webControl.broadcast();
  }
}

function persistRunState(): void {
  try {
    store?.write("run-state.json", state);
  } catch (error) {
    console.error("Could not save run state", error);
  }
}

/**
 * Pick today's plan and arm it. Only a plan that applies today (one-off date or matching
 * recurring day) can auto-start; on other days the timer stays idle (FR-18).
 */
function armForToday(now = Date.now()): void {
  const date = new Date(now);
  const today = localDateString(date);
  const todays = chooseTodaysPlan(plans, date, activePlanId);
  currentPlan = todays ?? plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? defaultPlan;
  state = todays?.autoStart && autoStartSkippedOn !== today
    ? reduce(createWaitingState(todays, today), { type: "tick" }, now, todays)
    : createIdleState(currentPlan, today);
}

function updatePowerBlocker(): void {
  const now = Date.now();
  const startSoon = state.status === "waiting"
    && planStartMs(currentPlan, state.runDate) + state.shiftMs - now <= 30 * 60_000;
  const active = settings.keepAwake !== false && (isLive(state) || startSoon);
  if (active && powerBlockerId === null) {
    powerBlockerId = powerSaveBlocker.start("prevent-display-sleep");
  } else if (!active && powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
}

function focusControlWindow(): void {
  if (!controlWindow) return;
  if (controlWindow.isMinimized()) controlWindow.restore();
  if (!controlWindow.isVisible()) controlWindow.show();
  controlWindow.focus();
}

function applyStageWindowMode(targetWindow: BrowserWindow): void {
  if (!placement || placement.mode === "single-monitor" || !placement.bounds) {
    targetWindow.hide();
    return;
  }

  if (process.env.NODE_ENV === "test") {
    targetWindow.setFullScreen(false);
    targetWindow.setBounds({
      x: Math.max(placement.bounds.x, 0),
      y: Math.max(placement.bounds.y, 0),
      width: Math.min(placement.bounds.width, 800),
      height: Math.min(placement.bounds.height, 600),
    });
    targetWindow.show();
    return;
  }

  if (process.platform !== "darwin" && targetWindow.isFullScreen()) targetWindow.setFullScreen(false);
  targetWindow.setBounds(placement.bounds);
  targetWindow.setAlwaysOnTop(true, "screen-saver");

  if (process.platform === "darwin") {
    app.dock?.hide();
    targetWindow.setSimpleFullScreen(true);
  } else {
    targetWindow.setFullScreen(true);
  }

  if (!targetWindow.isVisible()) targetWindow.show();
}

function updatePlacement(): void {
  placement = chooseStagePlacement(getDisplaySnapshot(), settings.stageDisplayId ?? placement?.preferredDisplayId);
  if (!stageWindow) return;
  applyStageWindowMode(stageWindow);
  broadcastState();
}

function schedulePlacementRefresh(): void {
  if (hotPlugTimer) clearTimeout(hotPlugTimer);
  hotPlugTimer = setTimeout(() => {
    updatePlacement();
  }, 200);
}

function createControlWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1366,
    height: 720,
    minWidth: 1200,
    minHeight: 680,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // The control window plays the time up chime without a click first.
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/control.html`);
  } else {
    void window.loadFile(join(__dirname, "../renderer/control.html"));
  }

  window.on("closed", () => {
    controlWindow = null;
    // Closing the control window always closes the stage window too (EXE-9).
    if (process.env.NODE_ENV !== "test") app.quit();
  });

  window.on("close", (event) => {
    if (process.env.NODE_ENV === "test") return;
    if (settings.trayOnClose && state.status !== "running" && state.status !== "paused") {
      event.preventDefault();
      createTray();
      window.hide();
      return;
    }
    if (state.status === "running" || state.status === "paused") {
      event.preventDefault();
      void dialog.showMessageBox(window, {
        type: "warning",
        buttons: ["Stop timer and close", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        title: "Close Service Timer?",
        message: "Stop the timer and close?",
      }).then((result) => {
        if (result.response === 0) {
          state = { ...state, status: "finished" };
          persistRunState();
          app.quit();
        }
      });
    }
  });

  window.webContents.on("did-finish-load", () => {
    broadcastState();
  });

  return window;
}

function createStageWindow(): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/stage.html`);
  } else {
    void window.loadFile(join(__dirname, "../renderer/stage.html"));
  }

  window.webContents.on("did-finish-load", () => {
    applyStageWindowMode(window);
    broadcastState();
  });

  window.on("closed", () => {
    stageWindow = null;
  });

  return window;
}

function startTickLoop(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    try {
      const now = Date.now();
      // A new day: re-pick and re-arm today's plan unless a run is still going (FR-18).
      if (state.runDate !== localDateString(new Date(now)) && !isLive(state)) {
        armForToday(now);
        persistRunState();
      }
      const before = state.status;
      state = reduce(state, { type: "tick" }, now, currentPlan);
      if (state.status !== before) persistRunState();
      updatePowerBlocker();
      broadcastState(now);
    } catch (error) {
      console.error("Tick failed", error);
    }
  }, TICK_MS);
}

function identifyDisplays(): void {
  screen.getAllDisplays().forEach((display, index) => {
    const overlay = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      show: false,
    });
    overlay.setIgnoreMouseEvents(true);
    void overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html>
        <body style="margin:0;background:rgba(24,24,27,.72);display:grid;place-items:center;">
          <div style="width:180px;height:180px;border-radius:24px;background:#ef4444;color:white;display:grid;place-items:center;font:700 96px sans-serif;">${index + 1}</div>
        </body>
      </html>
    `)}`);
    overlay.show();
    setTimeout(() => {
      if (!overlay.isDestroyed()) overlay.close();
    }, 2500);
  });
}

function checkForUpdates(): void {
  if (updateStatus.portable) return;
  if (!settings.automaticUpdates && updateStatus.state !== "idle") return;
  if (!canCheckForUpdates(state.status)) return;
  updateStatus = { ...updateStatus, state: "checking", message: undefined };
  broadcastState();
  void autoUpdater().checkForUpdates();
}

function setupUpdater(): void {
  autoUpdater().autoDownload = true;
  autoUpdater().autoInstallOnAppQuit = false;
  autoUpdater().on("checking-for-update", () => {
    updateStatus = { ...updateStatus, state: "checking" };
    broadcastState();
  });
  autoUpdater().on("update-available", (info) => {
    updateStatus = { ...updateStatus, state: "downloading", version: info.version };
    broadcastState();
  });
  autoUpdater().on("update-not-available", () => {
    updateStatus = { ...updateStatus, state: "idle", message: "No updates available" };
    broadcastState();
  });
  autoUpdater().on("update-downloaded", (event) => {
    downloadedUpdateVersion = event.version;
    updateStatus = { ...updateStatus, state: "ready", version: event.version };
    broadcastState();
  });
  autoUpdater().on("error", (error) => {
    updateStatus = { ...updateStatus, state: "error", message: error.message };
    broadcastState();
  });

  if (app.isPackaged && !updateStatus.portable && settings.automaticUpdates) {
    checkForUpdates();
  }
  if (!updateStatus.portable) {
    updateCheckTimer = setInterval(() => {
      if (settings.automaticUpdates) checkForUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);
  }
}

function restartToUpdate(): void {
  if (!downloadedUpdateVersion || !canInstallUpdate(state.status)) return;
  autoUpdater().quitAndInstall(false, true);
}

function registerIpc(): void {
  ipcMain.on("command", (_, payload: unknown) => {
    if (!isTimerCommand(payload)) return;

    try {
      const now = Date.now();
      if (payload.type === "identifyDisplays") {
        identifyDisplays();
      } else if (payload.type === "savePlans") {
        if (!payload.plans.length) return;
        plans = payload.plans;
        activePlanId = plans.some((plan) => plan.id === payload.activePlanId) ? payload.activePlanId : plans[0]!.id;
        store?.write("plans.json", { plans, activePlanId });
        if (isLive(state)) {
          // A live run keeps its own plan; edits to that plan apply live (FR-13).
          const running = plans.find((plan) => plan.id === state.planId);
          if (running) {
            const previous = currentPlan;
            currentPlan = running;
            state = reduce(state, { type: "editPlan", plan: running }, now, previous);
          }
        } else if (state.status === "finished") {
          currentPlan = plans.find((plan) => plan.id === state.planId) ?? currentPlan;
        } else {
          armForToday(now);
        }
      } else if (payload.type === "saveSettings") {
        const phoneWasOn = Boolean(settings.phoneControl);
        // The PIN is managed here, not by the control window.
        settings = { ...payload.settings, phonePin: settings.phonePin };
        app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
        store?.write("settings.json", settings);
        updatePlacement();
        if (phoneWasOn !== Boolean(settings.phoneControl)) void syncWebControl();
      } else if (payload.type === "newPhonePin") {
        settings = { ...settings, phonePin: newPin() };
        store?.write("settings.json", settings);
        webControl.signOutAll();
      } else if (payload.type === "skipAutoStartToday") {
        if (state.status === "waiting") {
          autoStartSkippedOn = state.runDate;
          state = { ...state, status: "idle" };
        }
      } else if (payload.type === "checkForUpdates") {
        checkForUpdates();
      } else if (payload.type === "restartToUpdate") {
        restartToUpdate();
      } else {
        state = reduce(state, payload, now, currentPlan);
      }
      lastWebBroadcast = 0;
      persistRunState();
      updatePowerBlocker();
      broadcastState(now);
    } catch (error) {
      console.error("Ignoring invalid timer command", error);
    }
  });
}

function registerDisplayListeners(): void {
  screen.on("display-added", schedulePlacementRefresh);
  screen.on("display-removed", schedulePlacementRefresh);
  screen.on("display-metrics-changed", schedulePlacementRefresh);
}

function createWindows(): void {
  controlWindow = createControlWindow();
  stageWindow = createStageWindow();
  updatePlacement();
}

function createTray(): void {
  if (tray) return;
  const trayIcon = nativeImage.createFromPath(join(
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    app.isPackaged ? "tray-icon.svg" : "resources/tray-icon.svg",
  ));
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createFromNamedImage("NSApplicationIcon") : trayIcon);
  const menu = Menu.buildFromTemplate([
    { label: "Show Service Timer", click: () => focusControlWindow() },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setToolTip("Service Timer");
  tray.setContextMenu(menu);
  tray.on("click", () => focusControlWindow());
}

function loadPersistentData(): void {
  store = createJsonStore(app.getPath("userData"));
  const planFile = store.read<{ plans?: unknown; activePlanId?: unknown } | null>("plans.json", null);
  const savedPlans = Array.isArray(planFile?.plans) ? planFile.plans.filter(isPlan) : [];
  if (planFile && Array.isArray(planFile.plans) && savedPlans.length !== planFile.plans.length) {
    console.error(`Ignored ${planFile.plans.length - savedPlans.length} invalid plan(s) in plans.json`);
  }
  if (savedPlans.length) plans = savedPlans;
  activePlanId = typeof planFile?.activePlanId === "string" && plans.some((plan) => plan.id === planFile.activePlanId)
    ? planFile.activePlanId
    : plans[0]!.id;

  const savedSettings = store.read<Partial<Settings> | null>("settings.json", null);
  const merged = { ...settings, ...(savedSettings ?? {}) };
  if (isSettings(merged)) settings = merged;
  app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });

  const now = Date.now();
  const saved = store.read<RunState | null>("run-state.json", null);
  const savedPlan = saved ? plans.find((plan) => plan.id === saved.planId) : undefined;
  if (
    process.env.NODE_ENV !== "test"
    && saved && savedPlan
    && saved.runDate === localDateString(new Date(now))
    && (saved.status === "running" || saved.status === "paused")
  ) {
    // Crash or reboot mid-service: carry on where the service should be now (EXE-8).
    currentPlan = savedPlan;
    state = { ...saved, banner: "Recovered after a restart. The timer carried on from where it was.", bannerAction: undefined };
  } else {
    armForToday(now);
  }
  persistRunState();
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusControlWindow();
  });

  app.whenReady().then(() => {
    loadPersistentData();

    registerIpc();
    registerDisplayListeners();
    createWindows();
    startTickLoop();
    void syncWebControl();
    updatePowerBlocker();
    setupUpdater();
    persistenceTimer = setInterval(persistRunState, 5_000);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindows();
        broadcastState();
      }
    });
  });
}

app.on("window-all-closed", () => {
  void webControl.stop();
  if (tickTimer) clearInterval(tickTimer);
  if (hotPlugTimer) clearTimeout(hotPlugTimer);
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (persistenceTimer) clearInterval(persistenceTimer);
  persistRunState();
  if (powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
  app.quit();
});

app.on("before-quit", () => {
  if (downloadedUpdateVersion && canInstallUpdate(state.status)) {
    autoUpdater().quitAndInstall(false, true);
  }
});
