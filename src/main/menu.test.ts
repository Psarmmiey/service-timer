import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { menuTemplate, type MenuContext } from "./menu";

function context(overrides: Partial<MenuContext> = {}): MenuContext {
  return {
    platform: "win32",
    appName: "Service Timer",
    isDev: false,
    status: "idle",
    live: false,
    blackout: false,
    hasMessage: false,
    settings: { stageDisplayId: undefined, pulse: true, openAtLogin: false, trayOnClose: true, keepAwake: true, timeUpStyle: "whole-screen", theme: "system" },
    displays: [{ id: 1, label: "Built-in Retina Display", isPrimary: true }, { id: 2, label: "Projector", isPrimary: false }],
    canUpdate: true,
    command: vi.fn(),
    ui: vi.fn(),
    about: vi.fn(),
    openLink: vi.fn(),
    ...overrides,
  };
}

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [item, ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])]);
}

const find = (items: MenuItemConstructorOptions[], label: string | RegExp) =>
  flatten(items).find((item) => (typeof label === "string" ? item.label === label : label.test(item.label ?? "")));

describe("menu bar", () => {
  it("has File, Edit, Timer, View and Help on Windows, with Exit and About", () => {
    const menu = menuTemplate(context());
    expect(menu.map((item) => item.label ?? item.role)).toEqual(["File", "Edit", "Timer", "View", "help"]);
    expect(find(menu, "Exit")).toBeDefined();
    expect(find(menu, "About Service Timer")).toBeDefined();
  });

  it("follows Mac conventions: app menu first, Settings with ⌘, and a Window menu", () => {
    const menu = menuTemplate(context({ platform: "darwin" }));
    expect(menu[0]!.label).toBe("Service Timer");
    expect(menu.map((item) => item.label ?? item.role)).toContain("windowMenu");
    expect(find(menu, "Settings…")!.accelerator).toBe("Cmd+,");
    expect(find(menu, "Exit")).toBeUndefined();
  });

  it("never offers Reload or developer tools in a release build", () => {
    const roles = flatten(menuTemplate(context())).map((item) => item.role);
    expect(roles).not.toContain("reload");
    expect(roles).not.toContain("toggleDevTools");
    expect(flatten(menuTemplate(context({ isDev: true }))).map((item) => item.role)).toContain("reload");
  });

  it("only uses shortcuts with Ctrl or ⌘, so nothing fires while typing a message", () => {
    for (const platform of ["win32", "darwin"] as const) {
      for (const item of flatten(menuTemplate(context({ platform })))) {
        if (typeof item.accelerator === "string") expect(item.accelerator).toMatch(/Cmd|Ctrl/);
      }
    }
  });

  it("names the main button for what it will do", () => {
    expect(find(menuTemplate(context()), /^Start Service/)).toBeDefined();
    expect(find(menuTemplate(context({ status: "running", live: true })), /^Pause/)).toBeDefined();
    expect(find(menuTemplate(context({ status: "paused", live: true })), /^Resume/)).toBeDefined();
    expect(find(menuTemplate(context()), "Next Item (→)")!.enabled).toBe(false);
  });

  it("sends timer commands and settings changes", () => {
    const ctx = context({ status: "running", live: true, blackout: true });
    const menu = menuTemplate(ctx);
    const click = (label: string) => (find(menu, label)!.click as () => void)();
    click("Next Item (→)");
    click("Blackout Stage (B)");
    click("Projector");
    click("Dark");
    expect(ctx.command).toHaveBeenCalledWith({ type: "next" });
    expect(ctx.command).toHaveBeenCalledWith({ type: "blackout", on: false });
    expect(ctx.command).toHaveBeenCalledWith(expect.objectContaining({ type: "saveSettings", settings: expect.objectContaining({ stageDisplayId: 2 }) }));
    expect(ctx.command).toHaveBeenCalledWith(expect.objectContaining({ type: "saveSettings", settings: expect.objectContaining({ theme: "dark" }) }));
    expect(find(menu, "Projector")!.checked).toBe(false);
    expect(find(menu, "Automatic")!.checked).toBe(true);
  });

  it("opens the control window's dialogs and the guide", () => {
    const ctx = context();
    const menu = menuTemplate(ctx);
    (find(menu, "Paste Running Order…")!.click as () => void)();
    (find(menu, "Stop Service…")!.click as () => void)();
    (find(menu, "Operator Guide")!.click as () => void)();
    expect(ctx.ui).toHaveBeenCalledWith("pastePlan");
    expect(ctx.ui).toHaveBeenCalledWith("stop");
    expect(ctx.openLink).toHaveBeenCalledWith(expect.stringContaining("github.com/Psarmmiey/service-timer"));
  });
});
