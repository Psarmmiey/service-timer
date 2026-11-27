import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { Api, AppState, TimerCommand } from "../shared/ipc";

const api: Api = {
  send(command: TimerCommand) {
    ipcRenderer.send("command", command);
  },
  onState(callback: (state: AppState) => void) {
    const handler = (_event: IpcRendererEvent, state: AppState) => {
      callback(state);
    };
    ipcRenderer.on("state", handler);
    return () => {
      ipcRenderer.removeListener("state", handler);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
