import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppState } from "../../shared/ipc";
import "../shared/global.css";
import { StageView } from "../shared/stage-view";

function StageApp() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => window.api.onState(setState), []);

  return <main style={{ width: "100vw", height: "100vh", cursor: "none" }}><StageView state={state} /></main>;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <StageApp />
    </StrictMode>,
  );
}
