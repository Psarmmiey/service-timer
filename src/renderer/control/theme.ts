import { useEffect, useState } from "react";
import type { Settings } from "../../shared/ipc";

/** Apply the control window theme and follow the OS when set to System. */
export function useTheme(theme: Settings["theme"] | undefined): "light" | "dark" {
  const query = "(prefers-color-scheme: dark)";
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const resolved = theme === "dark" || ((theme ?? "system") === "system" && systemDark) ? "dark" : "light";
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }, [resolved]);
  return resolved;
}
