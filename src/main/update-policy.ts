import type { RunStatus } from "../engine";

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** After a failed check (for example a release still uploading), try again sooner. */
export const UPDATE_RETRY_MS = 30 * 60 * 1000;
/** While waiting for a service, only check if it starts more than this far away. */
export const CHECK_BEFORE_START_MS = 60 * 60 * 1000;

/**
 * Check for updates when nothing is running: idle, after a service has ended, or while waiting
 * for a service that is still more than an hour away. Never during a service.
 */
export function canCheckForUpdates(status: RunStatus, msUntilStart = 0): boolean {
  if (status === "idle" || status === "finished") return true;
  if (status === "waiting") return msUntilStart > CHECK_BEFORE_START_MS;
  return false;
}

/** Install (on Restart now, or when the app is closed) whenever no service is running. */
export function canInstallUpdate(status: RunStatus): boolean {
  return status !== "running" && status !== "paused";
}
