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
};

export type Api = {
  send: (command: TimerCommand) => void;
  onState: (callback: (state: AppState) => void) => () => void;
};
