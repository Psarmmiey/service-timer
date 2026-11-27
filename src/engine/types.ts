export type Item = {
  id: string;
  title: string;
  minutes: number;
  note?: string;
  warnAtSeconds?: number;
};

export type Plan = {
  id: string;
  name: string;
  startTime: string;
  days: number[];
  autoStart: boolean;
  autoAdvanceSeconds?: number;
  items: Item[];
  updatedAt: string;
  kind: "recurring" | "oneOff";
  date?: string;
};

export type RunStatus = "idle" | "waiting" | "running" | "paused" | "finished";

export type RunState = {
  planId: string;
  runDate: string;
  status: RunStatus;
  index: number;
  timing: "item" | "clock";
  itemStartedAt?: number;
  itemDurationMs?: number;
  pausedLeftMs?: number;
  shiftMs: number;
  skipped: string[];
  message?: { text: string; flash: boolean };
  blackout: boolean;
  undoReorder?: ReorderUndo;
  clockJumpLoggedMs?: number;
  runItems?: Item[];
  currentItemId?: string;
  currentItemMinutes?: number;
  actualStarts?: Record<string, number>;
  banner?: string;
  /** Offered next to the banner, e.g. after an automatic catch-up start. */
  bannerAction?: "fromTop";
  /** Ids of items added for this run only (FR-14), kept when the saved plan is edited. */
  runOnlyIds?: string[];
};

export type ReorderUndo = {
  items: Item[];
  expiresAt: number;
};

export type ScheduleRow = {
  index: number;
  item: Item;
  scheduledStart: number;
  actualStart?: number;
  status: "done" | "current" | "upcoming";
};

export type DerivedView = {
  status: "idle" | "waiting" | "running" | "paused" | "overrun" | "finished";
  /** True while paused, including a pause during overrun (status is then "overrun"). */
  paused: boolean;
  current: Item | null;
  next: Item | null;
  timeLeftMs: number;
  colourBand: "normal" | "warning" | "over";
  scheduleRows: ScheduleRow[];
  behindAheadMs: number;
  projectedFinish: number;
  /** Finish time of the saved plan as planned, with no live changes. */
  plannedFinish: number;
  message?: { text: string; flash: boolean };
  blackout: boolean;
  banner?: string;
  bannerAction?: "fromTop";
};
