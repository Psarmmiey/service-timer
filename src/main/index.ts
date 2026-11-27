import { app, BrowserWindow, ipcMain, screen } from "electron";
import { join } from "node:path";
import { createWaitingState, derive, reduce, type Item, type Plan, type RunState } from "../engine";
import { localDateString } from "../engine/schedule";
import { chooseStagePlacement, type DisplayInfo, type StagePlacement } from "./display-selection";
import type { AppState, DisplayStatus, TimerCommand } from "../shared/ipc";

const STAGE_BANNER = "No second screen found. Check the cable and that Windows is set to Extend (Win+P).";
const TICK_MS = 250;

const defaultPlan: Plan = {
  id: "placeholder",
  name: "Service",
  startTime: "09:45",
  days: [0, 1, 2, 3, 4, 5, 6],
  autoStart: true,
  items: [{ id: "placeholder-item", title: "Placeholder item", minutes: 10, warnAtSeconds: 120 }],
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
let tickTimer: NodeJS.Timeout | null = null;
let hotPlugTimer: NodeJS.Timeout | null = null;

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
    view: derive(state, defaultPlan, now),
    display: getDisplayStatus(),
  };
}

function broadcastState(now = Date.now()): void {
  const payload = toAppState(now);
  controlWindow?.webContents.send("state", payload);
  stageWindow?.webContents.send("state", payload);
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
  placement = chooseStagePlacement(getDisplaySnapshot(), placement?.preferredDisplayId);
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
    width: 1000,
    height: 700,
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
    state = reduce(state, { type: "tick" }, now, defaultPlan);
    broadcastState(now);
  }, TICK_MS);
}

function registerIpc(): void {
  ipcMain.on("command", (_, payload: unknown) => {
    if (!isTimerCommand(payload)) return;

    try {
      const now = Date.now();
      state = reduce(state, payload, now, defaultPlan);
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

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusControlWindow();
  });

  app.whenReady().then(() => {
    const runDate = localDateString(new Date());
    state = createWaitingState(defaultPlan, runDate);

    registerIpc();
    registerDisplayListeners();
    createWindows();
    startTickLoop();

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
  app.quit();
});
