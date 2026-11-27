import type { RunStatus } from "../engine";

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function canCheckForUpdates(status: RunStatus): boolean {
  return status === "idle";
}

export function canInstallUpdate(status: RunStatus): boolean {
  return status === "idle";
}
