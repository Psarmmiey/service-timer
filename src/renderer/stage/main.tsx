import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "../../shared/ipc";
import { formatTime } from "../shared/format";

function StageApp() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => window.api.onState(setState), []);

  return (
    <main
      style={{
        margin: 0,
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "sans-serif",
        backgroundColor: "#09090b",
        color: "#fafafa",
        cursor: "none",
      }}
    >
      <h1 style={{ fontSize: "6vh", margin: 0 }}>Stage</h1>
      <p style={{ fontSize: "5vh", margin: "2vh 0" }}>{state?.view.current?.title ?? "Waiting"}</p>
      <p style={{ fontSize: "20vh", margin: 0 }}>{state ? formatTime(state.view.timeLeftMs) : "--:--"}</p>
      <p style={{ fontSize: "3vh", margin: "2vh 0 0" }}>{state?.view.status ?? "loading"}</p>
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <StageApp />
    </StrictMode>,
  );
}
