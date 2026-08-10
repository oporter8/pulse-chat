export type TigerAppearanceMode = "bright" | "green" | "blue";

export const TIGER_APPEARANCES: Array<{
  id: TigerAppearanceMode;
  name: string;
  description: string;
}> = [
  { id: "bright", name: "Bright", description: "Clean light surfaces with crisp blue accents." },
  { id: "green", name: "Dark Green", description: "Deep forest surfaces with a fresh green accent." },
  { id: "blue", name: "Dark Blue", description: "Dark navy surfaces with a clear blue accent." },
];

export function normalizeAppearance(value: unknown): TigerAppearanceMode {
  return value === "green" || value === "blue" ? value : "bright";
}

export function applyAppearance(mode: TigerAppearanceMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.tigerAppearance = mode;
  document.documentElement.style.colorScheme = mode === "bright" ? "light" : "dark";
  try { window.localStorage.setItem("tiger-appearance", mode); } catch { /* storage can be unavailable */ }
}
