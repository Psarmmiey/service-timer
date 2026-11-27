import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerSaveBlocker, screen, Tray } from "electron";
import { join } from "node:path";
import { createIdleState, createWaitingState, derive, reduce, type Item, type Plan, type RunState } from "../engine";
import { chooseTodaysPlan, localDateString } from "../engine/schedule";
import { chooseStagePlacement, type DisplayInfo, type StagePlacement } from "./display-selection";
import { createJsonStore, type JsonStore } from "./storage";
import type { AppState, DisplayStatus, Settings, TimerCommand } from "../shared/ipc";

const STAGE_BANNER = "No second screen found. Check the cable and that Windows is set to Extend (Win+P).";
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
    && (value.keepAwake === undefined || typeof value.keepAwake === "boolean");
}

function isItem(value: unknown): value is Item {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && isFiniteNumber(value.minutes)
    && (value.note === undefined || typeof value.note === "string")
    && (value.warnAtSeconds === undefined || isFiniteNumber(value.warnAtSeconds));
}

function isPlan(value: unknown): value is Plan {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.startTime === "string"
    && Array.isArray(value.days)
    && value.days.every(isInteger)
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
      return isInteger(value.index);
    case "message":
      return typeof value.text === "string" && (value.flash === undefined || typeof value.flash === "boolean");
    case "blackout":
      return typeof value.on === "boolean";
    case "identifyDisplays":
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
};
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
  if (!placement || placement.mode === "single-monitor") {
    return { mode: "single-monitor", banner: STAGE_BANNER };
  }

  return {
    mode: "stage-window",
    stageDisplayId: placement.activeDisplayId,
  };
}

function toAppState(now: number): AppState {
  return {
    now,
    view: derive(state, currentPlan, now),
    plan: currentPlan,
    display: getDisplayStatus(),
    plans,
    activePlanId,
    settings,
  };
}

function broadcastState(now = Date.now()): void {
  const payload = toAppState(now);
  controlWindow?.webContents.send("state", payload);
  stageWindow?.webContents.send("state", payload);
}

function persistRunState(): void {
  store?.write("run-state.json", state);
}

function updatePowerBlocker(): void {
  const active = settings.keepAwake !== false && (
    state.status === "running"
    || state.status === "paused"
    || state.status === "waiting"
  );
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
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/control.html`);
  } else {
    void window.loadFile(join(__dirname, "../renderer/control.html"));
  }

  window.on("closed", () => {
    controlWindow = null;
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
    fullscreen: true,
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
    const now = Date.now();
    state = reduce(state, { type: "tick" }, now, currentPlan);
    updatePowerBlocker();
    broadcastState(now);
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

function registerIpc(): void {
  ipcMain.on("command", (_, payload: unknown) => {
    if (!isTimerCommand(payload)) return;

    try {
      const now = Date.now();
      if (payload.type === "identifyDisplays") {
        identifyDisplays();
      } else if (payload.type === "savePlans") {
        plans = payload.plans;
        activePlanId = payload.activePlanId;
        currentPlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? defaultPlan;
        store?.write("plans.json", { plans, activePlanId });
        state = reduce(state, { type: "editPlan", plan: currentPlan }, now, currentPlan);
      } else if (payload.type === "saveSettings") {
        settings = payload.settings;
        app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });
        store?.write("settings.json", settings);
        updatePlacement();
      } else {
        state = reduce(state, payload, now, currentPlan);
      }
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
  const planFile = store.read<{ plans?: Plan[]; activePlanId?: string }>("plans.json", {});
  if (planFile.plans?.length) plans = planFile.plans;
  activePlanId = planFile.activePlanId && plans.some((plan) => plan.id === planFile.activePlanId)
    ? planFile.activePlanId
    : plans[0]!.id;
  currentPlan = chooseTodaysPlan(plans, new Date(), activePlanId) ?? plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? defaultPlan;

  settings = { ...settings, ...store.read<Partial<Settings>>("settings.json", {}) };
  app.setLoginItemSettings({ openAtLogin: settings.openAtLogin });

  const saved = store.read<RunState | null>("run-state.json", null);
  const today = localDateString(new Date());
  if (process.env.NODE_ENV !== "test" && saved?.runDate === today && ["running", "paused"].includes(saved.status)) {
    state = { ...saved, banner: "Recovered: this run resumed from the clock." };
  } else {
    const waiting = createWaitingState(currentPlan, today);
    const now = Date.now();
    const start = currentPlan.autoStart
      ? new Date(now).setHours(
          Number(currentPlan.startTime.split(":")[0]),
          Number(currentPlan.startTime.split(":")[1]),
          0,
          0,
        )
      : Number.NaN;
    state = !currentPlan.autoStart
      ? createIdleState(currentPlan, today)
      : currentPlan.autoStart && now < start && start - now <= 30 * 60_000
        ? waiting
        : reduce(waiting, { type: "tick" }, now, currentPlan);
  }
  if (state.status !== "idle" && state.status !== "finished") persistRunState();
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
    updatePowerBlocker();
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
  if (tickTimer) clearInterval(tickTimer);
  if (hotPlugTimer) clearTimeout(hotPlugTimer);
  if (persistenceTimer) clearInterval(persistenceTimer);
  persistRunState();
  if (powerBlockerId !== null) {
    powerSaveBlocker.stop(powerBlockerId);
    powerBlockerId = null;
  }
  app.quit();
});
