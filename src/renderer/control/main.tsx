import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "../../shared/ipc";
import { formatTime } from "../shared/format";

function ControlApp() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => window.api.onState(setState), []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Control</h1>
      <p>Status: {state?.view.status ?? "loading"}</p>
      <p>Item: {state?.view.current?.title ?? "none"}</p>
      <p>Time left: {state ? formatTime(state.view.timeLeftMs) : "--:--"}</p>
      {state?.display.mode === "single-monitor" && state.display.banner ? (
        <section style={{ border: "1px solid #f59e0b", padding: 16, marginTop: 16 }}>
          <p>{state.display.banner}</p>
          <p>Stage preview: {state.view.current?.title ?? "none"} ({state ? formatTime(state.view.timeLeftMs) : "--:--"})</p>
        </section>
      ) : null}
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ControlApp />
    </StrictMode>,
  );
}
