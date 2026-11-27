import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { Api, AppState, MenuAction, MenuFile, TimerCommand } from "../shared/ipc";

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
  onMenu(callback: (action: MenuAction, file?: MenuFile) => void) {
    const handler = (_event: IpcRendererEvent, action: MenuAction, file?: MenuFile) => callback(action, file);
    ipcRenderer.on("menu", handler);
    return () => {
      ipcRenderer.removeListener("menu", handler);
    };
  },
};

contextBridge.exposeInMainWorld("api", api);
