import type { Command, DerivedView, Plan } from "../engine";

export type TimerCommand = Command;

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
};

export type Api = {
  send: (command: TimerCommand) => void;
  onState: (callback: (state: AppState) => void) => () => void;
};
