import type { Command, DerivedView, Plan } from "../engine";

export type Settings = {
  stageDisplayId?: number;
  timeUpStyle: "whole-screen" | "digits";
  pulse: boolean;
  openAtLogin: boolean;
  trayOnClose: boolean;
  keepAwake?: boolean;
  automaticUpdates?: boolean;
  /** Control window colour scheme. Defaults to following the operating system. */
  theme?: "system" | "light" | "dark";
  /** Default amber warning, in seconds, for items without their own (FR-3). */
  warnAtSeconds?: number;
  walkthroughSeen?: boolean;
  /** Flash the stage three times when an item hits 0:00. Default on. */
  flashAtZero?: boolean;
  /** Red digits for this many seconds before 0:00. 0 turns it off. Default 30. */
  dangerAtSeconds?: number;
  /** Chime on the control laptop only, never the stage. Default "time-up". */
  chime?: "off" | "time-up" | "warning-and-time-up";
  /** How overtime is written on the stage. Default "plus" (+1:30). */
  overtimeSign?: "plus" | "minus";
  /** Serve the phone control page on the local network (FR-22). Default off. */
  phoneControl?: boolean;
  /** 4-digit PIN for phone control. */
  phonePin?: string;
};

export type WebControlStatus = {
  enabled: boolean;
  running: boolean;
  urls: string[];
  qrSvg?: string;
  pin?: string;
  clients: number;
  error?: string;
};

export type UpdateStatus = {
  state: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
  version?: string;
  message?: string;
  portable?: boolean;
  currentVersion?: string;
};

export type TimerCommand =
  | Command
  | { type: "savePlans"; plans: Plan[]; activePlanId: string }
  | { type: "saveSettings"; settings: Settings }
  | { type: "identifyDisplays" }
  | { type: "checkForUpdates" }
  | { type: "skipAutoStartToday" }
  | { type: "newPhonePin" }
  | { type: "restartToUpdate" };

export type DisplayOption = {
  id: number;
  label: string;
  isPrimary: boolean;
};

export type DisplayStatus = {
  mode: "stage-window" | "single-monitor";
  stageDisplayId?: number;
  banner?: string;
  /** Width / height of the stage screen, so the preview has the same shape (FR-9). */
  aspectRatio: number;
  displays: DisplayOption[];
};

export type AppState = {
  now: number;
  view: DerivedView;
  plan: Plan;
  display: DisplayStatus;
  plans: Plan[];
  activePlanId: string;
  settings: Settings;
  update: UpdateStatus;
  /** Open the walkthrough automatically (first run only). */
  showWalkthrough: boolean;
  web: WebControlStatus;
};

export type Api = {
  send: (command: TimerCommand) => void;
  onState: (callback: (state: AppState) => void) => () => void;
};
