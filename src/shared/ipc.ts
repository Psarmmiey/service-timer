import type { Command, DerivedView, Plan } from "../engine";

export type Settings = {
  stageDisplayId?: number;
  timeUpStyle: "whole-screen" | "digits";
  pulse: boolean;
  openAtLogin: boolean;
  trayOnClose: boolean;
  keepAwake?: boolean;
  automaticUpdates?: boolean;
};

export type UpdateStatus = {
  state: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
  version?: string;
  message?: string;
  portable?: boolean;
};

export type TimerCommand =
  | Command
  | { type: "savePlans"; plans: Plan[]; activePlanId: string }
  | { type: "saveSettings"; settings: Settings }
  | { type: "identifyDisplays" }
  | { type: "checkForUpdates" }
  | { type: "restartToUpdate" };

export type DisplayStatus = {
  mode: "stage-window" | "single-monitor";
  stageDisplayId?: number;
  banner?: string;
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
};

export type Api = {
  send: (command: TimerCommand) => void;
  onState: (callback: (state: AppState) => void) => () => void;
};
