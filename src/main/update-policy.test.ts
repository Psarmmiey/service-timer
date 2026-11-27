import { describe, expect, it } from "vitest";
import { canCheckForUpdates, canInstallUpdate, UPDATE_CHECK_INTERVAL_MS } from "./update-policy";

describe("update policy", () => {
  it("checks and installs only while idle", () => {
    expect(canCheckForUpdates("idle")).toBe(true);
    expect(canInstallUpdate("idle")).toBe(true);
    for (const status of ["waiting", "running", "paused", "finished"] as const) {
      expect(canCheckForUpdates(status)).toBe(false);
      expect(canInstallUpdate(status)).toBe(false);
    }
  });

  it("uses a six-hour check interval", () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(21_600_000);
  });
});
