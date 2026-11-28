import { describe, expect, it } from "vitest";
import { canCheckForUpdates, canInstallUpdate, CHECK_BEFORE_START_MS, UPDATE_CHECK_INTERVAL_MS, UPDATE_RETRY_MS } from "./update-policy";

describe("update policy", () => {
  it("checks when nothing is running, never during a service", () => {
    expect(canCheckForUpdates("idle")).toBe(true);
    expect(canCheckForUpdates("finished")).toBe(true);
    expect(canCheckForUpdates("running")).toBe(false);
    expect(canCheckForUpdates("paused")).toBe(false);
  });

  it("checks while waiting only if the service is more than an hour away", () => {
    expect(canCheckForUpdates("waiting", CHECK_BEFORE_START_MS + 1)).toBe(true);
    expect(canCheckForUpdates("waiting", 20 * 60_000)).toBe(false);
  });

  it("installs whenever no service is running", () => {
    for (const status of ["idle", "waiting", "finished"] as const) expect(canInstallUpdate(status)).toBe(true);
    for (const status of ["running", "paused"] as const) expect(canInstallUpdate(status)).toBe(false);
  });

  it("checks every six hours and retries a failed check after half an hour", () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(21_600_000);
    expect(UPDATE_RETRY_MS).toBe(1_800_000);
  });
});
