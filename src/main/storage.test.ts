import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createJsonStore } from "./storage";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories.length = 0;
});

describe("atomic JSON storage", () => {
  it("writes and reloads run state", () => {
    const directory = mkdtempSync(join(tmpdir(), "service-timer-store-"));
    directories.push(directory);
    const store = createJsonStore(directory);
    store.write("run-state.json", { status: "running", index: 4 });

    expect(store.read("run-state.json", null)).toEqual({ status: "running", index: 4 });
    expect(readFileSync(join(directory, "run-state.json"), "utf8")).toContain("\"status\": \"running\"");
  });

  it("returns a fallback for missing or invalid JSON", () => {
    const directory = mkdtempSync(join(tmpdir(), "service-timer-store-"));
    directories.push(directory);
    const store = createJsonStore(directory);
    expect(store.read("plans.json", { plans: [] })).toEqual({ plans: [] });
  });

  it("overwrites an existing JSON file", () => {
    const directory = mkdtempSync(join(tmpdir(), "service-timer-store-"));
    directories.push(directory);
    const store = createJsonStore(directory);
    store.write("plans.json", { plans: ["first"] });
    store.write("plans.json", { plans: ["second"] });

    expect(store.read("plans.json", null)).toEqual({ plans: ["second"] });
  });
});
