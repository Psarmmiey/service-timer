import type { Command, DerivedView, Plan } from "../engine";

export type Settings = {
  stageDisplayId?: number;
  timeUpStyle: "whole-screen" | "digits";
  pulse: boolean;
  openAtLogin: boolean;
  trayOnClose: boolean;
  keepAwake?: boolean;
};

export type TimerCommand =
  | Command
  | { type: "savePlans"; plans: Plan[]; activePlanId: string }
  | { type: "saveSettings"; settings: Settings };

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
};

export type Api = {
  send: (command: TimerCommand) => void;
  onState: (callback: (state: AppState) => void) => () => void;
};
