import { HelpCircle, Monitor, Moon, Power, RefreshCw, Sun } from "lucide-react";
import { useState } from "react";
import type { AppState, Settings } from "../../shared/ipc";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "../shared/ui";
import { send } from "./common";

type Section = "stage" | "appearance" | "startup" | "updates" | "help";

const SECTIONS: { id: Section; label: string; icon: typeof Monitor }[] = [
  { id: "stage", label: "Stage display", icon: Monitor },
  { id: "appearance", label: "Appearance", icon: Sun },
  { id: "startup", label: "Startup and power", icon: Power },
  { id: "updates", label: "Updates", icon: RefreshCw },
  { id: "help", label: "Help", icon: HelpCircle },
];

const SHORTCUTS: [string, string][] = [
  ["→ or N", "Next item"],
  ["Space", "Start, pause or resume"],
  ["← or P", "Previous item"],
  ["+ / −", "Add or take away a minute"],
  ["B", "Blackout the stage"],
  ["M", "Type a stage message"],
  ["Esc", "Clear the stage message"],
  ["Ctrl/Cmd + E", "Edit plans"],
];

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-zinc-100 py-3 last:border-0">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {hint ? <div className="mt-0.5 text-xs text-zinc-500">{hint}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsDialog({
  state,
  open,
  onOpenChange,
  onReplayWalkthrough,
}: {
  state: AppState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReplayWalkthrough: () => void;
}) {
  const [section, setSection] = useState<Section>("stage");
  const update = (patch: Partial<Settings>) => send({ type: "saveSettings", settings: { ...state.settings, ...patch } });
  const settings = state.settings;
  const isMac = navigator.userAgent.includes("Mac");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(560px,calc(100vh-48px))] w-[min(820px,calc(100vw-32px))] gap-0 p-0">
        <nav className="flex w-[200px] shrink-0 flex-col gap-1 border-r border-zinc-200 p-3" aria-label="Settings sections">
          <DialogTitle className="px-2 pb-2 pt-1 text-base">Settings</DialogTitle>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
              className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${section === id ? "bg-zinc-100 font-semibold" : "text-zinc-600 hover:bg-zinc-50"}`}
            >
              <Icon className="size-4" /> {label}
              {id === "updates" && state.update.state === "ready" ? <span className="ml-auto size-2 rounded-full bg-blue-500" aria-label="Update ready" /> : null}
            </button>
          ))}
          <div className="mt-auto px-2 text-[11px] text-zinc-500">Version {state.update.currentVersion ?? ""}</div>
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-6 pr-12">
          <DialogDescription className="sr-only">Service Timer settings</DialogDescription>
          {section === "stage" ? (
            <>
              <h2 className="text-base font-semibold">Stage display</h2>
              <Row title="Show the timer on" hint={state.display.mode === "single-monitor" ? "No second screen is connected right now." : "Automatic uses the first screen that isn't this laptop."}>
                <Select
                  value={settings.stageDisplayId !== undefined && state.display.displays.some((d) => d.id === settings.stageDisplayId) ? String(settings.stageDisplayId) : "automatic"}
                  onValueChange={(value) => update({ stageDisplayId: value === "automatic" ? undefined : Number(value) })}
                >
                  <SelectTrigger className="w-[260px]" aria-label="Stage screen"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatic">Automatic</SelectItem>
                    {state.display.displays.map((display) => (
                      <SelectItem key={display.id} value={String(display.id)}>{display.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <Row title="Which screen is which?" hint="Shows a big number on every screen for a few seconds.">
                <Button onClick={() => send({ type: "identifyDisplays" })}>Identify screens</Button>
              </Row>
              <Row title="At time up" hint="What the stage does when an item runs out of time.">
                <ToggleGroup type="single" value={settings.timeUpStyle} onValueChange={(value) => value && update({ timeUpStyle: value as Settings["timeUpStyle"] })} className="flex gap-1">
                  <ToggleGroupItem value="whole-screen" className="h-9">Whole screen red</ToggleGroupItem>
                  <ToggleGroupItem value="digits" className="h-9">Red digits only</ToggleGroupItem>
                </ToggleGroup>
              </Row>
              <Row title="Pulse slowly at time up" hint="Turn off for anyone sensitive to flashing.">
                <Switch aria-label="Pulse slowly at time up" checked={settings.pulse} onCheckedChange={(pulse) => update({ pulse })} />
              </Row>
              <Row title="Turn amber when" hint="Items can override this in the plan editor.">
                <Select value={String(settings.warnAtSeconds ?? 120)} onValueChange={(value) => update({ warnAtSeconds: Number(value) })}>
                  <SelectTrigger className="w-[180px]" aria-label="Turn amber when"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[60, 120, 180, 300].map((seconds) => <SelectItem key={seconds} value={String(seconds)}>{seconds / 60} min left</SelectItem>)}
                  </SelectContent>
                </Select>
              </Row>
            </>
          ) : null}
          {section === "appearance" ? (
            <>
              <h2 className="text-base font-semibold">Appearance</h2>
              <Row title="Theme" hint="For this control window. The stage screen is always dark.">
                <ToggleGroup type="single" value={settings.theme ?? "system"} onValueChange={(value) => value && update({ theme: value as Settings["theme"] })} className="flex gap-1" aria-label="Theme">
                  <ToggleGroupItem value="system" className="h-9"><Monitor className="mr-1 inline size-4" />System</ToggleGroupItem>
                  <ToggleGroupItem value="light" className="h-9"><Sun className="mr-1 inline size-4" />Light</ToggleGroupItem>
                  <ToggleGroupItem value="dark" className="h-9"><Moon className="mr-1 inline size-4" />Dark</ToggleGroupItem>
                </ToggleGroup>
              </Row>
            </>
          ) : null}
          {section === "startup" ? (
            <>
              <h2 className="text-base font-semibold">Startup and power</h2>
              <Row title={isMac ? "Open when you log in" : "Open when Windows starts"} hint="So the timer is ready on Sunday morning without anyone opening it.">
                <Switch aria-label="Open at login" checked={settings.openAtLogin} onCheckedChange={(openAtLogin) => update({ openAtLogin })} />
              </Row>
              <Row title="Keep the screen awake" hint="From 30 minutes before the start until the service ends.">
                <Switch aria-label="Keep the screen awake" checked={settings.keepAwake !== false} onCheckedChange={(keepAwake) => update({ keepAwake })} />
              </Row>
              <Row title={isMac ? "Keep running in the menu bar when closed" : "Minimise to the tray when closed"}>
                <Switch aria-label="Minimise to tray" checked={settings.trayOnClose} onCheckedChange={(trayOnClose) => update({ trayOnClose })} />
              </Row>
            </>
          ) : null}
          {section === "updates" ? (
            <>
              <h2 className="text-base font-semibold">Updates</h2>
              <Row title={`Version ${state.update.currentVersion ?? ""}`} hint={
                state.update.portable
                  ? "Portable builds can't update themselves. Download the latest installer from GitHub Releases."
                  : state.update.state === "checking" ? "Checking for updates…"
                    : state.update.state === "downloading" ? `Downloading ${state.update.version ?? "update"}…`
                      : state.update.state === "ready" ? `Version ${state.update.version} is ready. It installs when the app restarts, never during a service.`
                        : state.update.state === "error" ? `Couldn't check: ${state.update.message ?? "unknown error"}`
                          : state.update.message ?? "Updates never install during a service."
              }>
                {state.update.state === "ready"
                  ? <Button variant="default" onClick={() => send({ type: "restartToUpdate" })}>Restart to update</Button>
                  : <Button disabled={state.update.portable || state.update.state === "checking" || state.update.state === "downloading"} onClick={() => send({ type: "checkForUpdates" })}>Check now</Button>}
              </Row>
              {state.update.portable ? null : (
                <Row title="Automatic updates" hint="Checks when the app opens and every 6 hours while idle.">
                  <Switch aria-label="Automatic updates" checked={settings.automaticUpdates !== false} onCheckedChange={(automaticUpdates) => update({ automaticUpdates })} />
                </Row>
              )}
            </>
          ) : null}
          {section === "help" ? (
            <>
              <h2 className="text-base font-semibold">Help</h2>
              <Row title="Walkthrough" hint="A two-minute tour of the control window.">
                <Button variant="default" onClick={() => { onOpenChange(false); onReplayWalkthrough(); }}>Replay walkthrough</Button>
              </Row>
              <h3 className="mt-4 text-sm font-semibold">Keyboard shortcuts</h3>
              <dl className="mt-2 grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
                {SHORTCUTS.map(([keys, action]) => (
                  <div key={keys} className="contents">
                    <dt><kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs font-semibold">{keys}</kbd></dt>
                    <dd className="text-zinc-600">{action}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
