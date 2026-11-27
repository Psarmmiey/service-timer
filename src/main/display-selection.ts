export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DisplayInfo = {
  id: number;
  bounds: Rect;
  isPrimary: boolean;
};

export type StagePlacement = {
  mode: "stage-window" | "single-monitor";
  preferredDisplayId?: number;
  activeDisplayId?: number;
  bounds?: Rect;
};

function findDisplay(displays: DisplayInfo[], id: number | undefined): DisplayInfo | undefined {
  return id === undefined ? undefined : displays.find((display) => display.id === id);
}

export function chooseStagePlacement(displays: DisplayInfo[], preferredDisplayId?: number): StagePlacement {
  if (displays.length < 2) {
    return {
      mode: "single-monitor",
      preferredDisplayId,
    };
  }

  const preferred = findDisplay(displays, preferredDisplayId);
  const fallback = displays.find((display) => !display.isPrimary) ?? displays[0];
  const chosen = preferred ?? fallback;

  if (!chosen) {
    return {
      mode: "single-monitor",
      preferredDisplayId,
    };
  }

  return {
    mode: "stage-window",
    preferredDisplayId: preferred?.id ?? preferredDisplayId ?? chosen.id,
    activeDisplayId: chosen.id,
    bounds: chosen.bounds,
  };
}
