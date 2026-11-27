import type { Command, DerivedView } from "../engine";

export type TimerCommand = Command;

export type DisplayStatus = {
  mode: "stage-window" | "single-monitor";
  stageDisplayId?: number;
  banner?: string;
};

export type AppState = {
  now: number;
  view: DerivedView;
  display: DisplayStatus;
};

export type Api = {
  send: (command: TimerCommand) => void;
  onState: (callback: (state: AppState) => void) => () => void;
};
