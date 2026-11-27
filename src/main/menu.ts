import type { MenuItemConstructorOptions } from "electron";
import type { DisplayOption, MenuAction, Settings, TimerCommand } from "../shared/ipc";

export const GUIDE_URL = "https://github.com/Psarmmiey/service-timer#readme";
export const ISSUES_URL = "https://github.com/Psarmmiey/service-timer/issues/new";

export type MenuContext = {
  platform: NodeJS.Platform;
  appName: string;
  /** Development builds keep Reload and the developer tools; release builds never show them. */
  isDev: boolean;
  status: "idle" | "waiting" | "running" | "paused" | "finished";
  /** Running or paused. */
  live: boolean;
  blackout: boolean;
  hasMessage: boolean;
  settings: Settings;
  displays: DisplayOption[];
  /** Updates only work in installed builds. */
  canUpdate: boolean;
  command: (command: TimerCommand) => void;
  /** Ask the control window to open something, such as Plans or Settings. */
  ui: (action: MenuAction) => void;
  about: () => void;
  openLink: (url: string) => void;
};

/**
 * The menu bar. Single-key shortcuts (Space, arrows, B) are shown in the labels but handled by
 * the control window, so they never fire while someone is typing a message or a plan.
 */
export function menuTemplate(context: MenuContext): MenuItemConstructorOptions[] {
  const mac = context.platform === "darwin";
  const { command, ui, settings } = context;
  const saveSettings = (patch: Partial<Settings>) => command({ type: "saveSettings", settings: { ...settings, ...patch } });

  const startLabel = context.status === "paused" ? "Resume (Space)" : context.live ? "Pause (Space)" : "Start Service (Space)";

  const appMenu: MenuItemConstructorOptions = {
    label: context.appName,
    submenu: [
      { label: `About ${context.appName}`, click: context.about },
      { label: "Check for Updates…", enabled: context.canUpdate, click: () => command({ type: "checkForUpdates" }) },
      { type: "separator" },
      { label: "Settings…", accelerator: "Cmd+,", click: () => ui("settings") },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit", label: `Quit ${context.appName}` },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      { label: "Plans…", accelerator: "CmdOrCtrl+E", click: () => ui("plans") },
      { label: "Paste Running Order…", accelerator: "CmdOrCtrl+Shift+V", click: () => ui("pastePlan") },
      { label: "Import Plan or CSV…", accelerator: "CmdOrCtrl+O", click: () => ui("importPlans") },
      { label: "Back Up All Plans…", accelerator: "CmdOrCtrl+Shift+S", click: () => ui("backupPlans") },
      ...(mac
        ? []
        : [
          { type: "separator" } as const,
          { label: "Settings…", accelerator: "Ctrl+,", click: () => ui("settings") },
          { type: "separator" } as const,
          { role: "quit", label: "Exit" } as const,
        ]),
    ],
  };

  // Needed on a Mac for copy and paste to work in text boxes.
  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
  };

  const timerMenu: MenuItemConstructorOptions = {
    label: "Timer",
    submenu: [
      { label: startLabel, click: () => ui("toggle") },
      { label: "Next Item (→)", enabled: context.live, click: () => command({ type: "next" }) },
      { label: "Previous Item (←)", enabled: context.live || context.status === "finished", click: () => command({ type: "previous" }) },
      { type: "separator" },
      { label: "Add a Minute (+)", enabled: context.live, click: () => command({ type: "adjust", ms: 60_000 }) },
      { label: "Take Off a Minute (−)", enabled: context.live, click: () => command({ type: "adjust", ms: -60_000 }) },
      { type: "separator" },
      { label: "Message to Stage… (M)", click: () => ui("message") },
      { label: "Clear Message (Esc)", enabled: context.hasMessage, click: () => command({ type: "clearMessage" }) },
      { label: "Blackout Stage (B)", type: "checkbox", checked: context.blackout, click: () => command({ type: "blackout", on: !context.blackout }) },
      { type: "separator" },
      { label: "Restart Item…", enabled: context.live, click: () => ui("restart") },
      { label: "Stop Service…", enabled: context.live, click: () => ui("stop") },
    ],
  };

  const stageScreens: MenuItemConstructorOptions[] = [
    { label: "Automatic", type: "radio", checked: settings.stageDisplayId === undefined, click: () => saveSettings({ stageDisplayId: undefined }) },
    ...context.displays.map((display): MenuItemConstructorOptions => ({
      label: display.label,
      type: "radio",
      checked: settings.stageDisplayId === display.id,
      click: () => saveSettings({ stageDisplayId: display.id }),
    })),
  ];

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { label: "Show the Timer On", submenu: stageScreens },
      { label: "Which Screen Is Which?", click: () => command({ type: "identifyDisplays" }) },
      { type: "separator" },
      {
        label: "Theme",
        submenu: (["system", "light", "dark"] as const).map((theme): MenuItemConstructorOptions => ({
          label: theme === "system" ? "Match the Computer" : theme === "light" ? "Light" : "Dark",
          type: "radio",
          checked: (settings.theme ?? "system") === theme,
          click: () => saveSettings({ theme }),
        })),
      },
      { type: "separator" },
      { role: "zoomIn", label: "Bigger" },
      { role: "zoomOut", label: "Smaller" },
      { role: "resetZoom", label: "Actual Size" },
      { type: "separator" },
      { role: "togglefullscreen" },
      ...(context.isDev ? [{ type: "separator" } as const, { role: "reload" } as const, { role: "toggleDevTools" } as const] : []),
    ],
  };

  const windowMenu: MenuItemConstructorOptions = { role: "windowMenu" };

  const helpMenu: MenuItemConstructorOptions = {
    role: "help",
    submenu: [
      { label: "Show the Walkthrough (?)", click: () => ui("walkthrough") },
      { label: "Keyboard Shortcuts", click: () => ui("shortcuts") },
      { label: "Phone Control…", click: () => ui("phone") },
      { type: "separator" },
      { label: "Operator Guide", click: () => context.openLink(GUIDE_URL) },
      { label: "Report a Problem", click: () => context.openLink(ISSUES_URL) },
      ...(mac
        ? []
        : [
          { type: "separator" } as const,
          { label: "Check for Updates…", enabled: context.canUpdate, click: () => command({ type: "checkForUpdates" }) },
          { label: `About ${context.appName}`, click: context.about },
        ]),
    ],
  };

  return [...(mac ? [appMenu] : []), fileMenu, editMenu, timerMenu, viewMenu, ...(mac ? [windowMenu] : []), helpMenu];
}
