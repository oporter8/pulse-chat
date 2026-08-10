export const V13_THEME_VERSION = 1;

export type TigerThemeConfig = {
  version: number;
  mode: "dark" | "light";
  accent: string;
  accent2: string;
  canvas: string;
  surface: string;
  surface2: string;
  surface3: string;
  text: string;
  muted: string;
  line: string;
  navWidth: number;
  sidebarWidth: number;
  pageWidth: number;
  radius: number;
  messageRadius: number;
  messageMaxWidth: number;
  fontScale: number;
  density: "compact" | "comfortable" | "spacious";
  fontFamily: "system" | "rounded" | "mono" | "serif";
  glass: boolean;
  shadows: boolean;
  animations: boolean;
  messageStyle: "bubbles" | "flat" | "minimal";
  composerStyle: "floating" | "attached" | "minimal";
};

export type TigerSavedTheme = {
  id: string;
  user_id: string;
  name: string;
  preset: string;
  config: TigerThemeConfig;
  custom_css: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TigerThemePreset = {
  id: string;
  label: string;
  description: string;
  config: TigerThemeConfig;
};

const baseDark: TigerThemeConfig = {
  version: V13_THEME_VERSION,
  mode: "dark",
  accent: "#f58220",
  accent2: "#ff9f43",
  canvas: "#090b0f",
  surface: "#11151b",
  surface2: "#171c24",
  surface3: "#1d2430",
  text: "#f7f8fa",
  muted: "#8d97a7",
  line: "rgba(255,255,255,.075)",
  navWidth: 94,
  sidebarWidth: 332,
  pageWidth: 1360,
  radius: 26,
  messageRadius: 18,
  messageMaxWidth: 720,
  fontScale: 100,
  density: "comfortable",
  fontFamily: "system",
  glass: true,
  shadows: true,
  animations: true,
  messageStyle: "bubbles",
  composerStyle: "floating",
};

function merge(overrides: Partial<TigerThemeConfig>): TigerThemeConfig {
  return { ...baseDark, ...overrides, version: V13_THEME_VERSION };
}

export const TIGER_THEME_PRESETS: TigerThemePreset[] = [
  { id: "tiger", label: "Tiger Classic", description: "The default orange Tiger Chat look.", config: merge({}) },
  { id: "midnight", label: "Midnight", description: "Deep navy with electric blue accents.", config: merge({ accent: "#6ea8ff", accent2: "#9f7aea", canvas: "#070b14", surface: "#0d1320", surface2: "#131c2d", surface3: "#1a263a", muted: "#8c9bb3" }) },
  { id: "oled", label: "OLED", description: "True-black surfaces and restrained contrast.", config: merge({ accent: "#ff8a2a", accent2: "#ffc46b", canvas: "#000000", surface: "#050505", surface2: "#0b0b0b", surface3: "#121212", line: "rgba(255,255,255,.11)", shadows: false }) },
  { id: "frost", label: "Frost", description: "Bright, cool, minimal and airy.", config: merge({ mode: "light", accent: "#2f6fed", accent2: "#6b8cff", canvas: "#edf3fb", surface: "#ffffff", surface2: "#f5f8fc", surface3: "#e8eef7", text: "#172033", muted: "#66738a", line: "rgba(23,32,51,.10)", shadows: true }) },
  { id: "lavender", label: "Lavender", description: "Purple accents with soft dark surfaces.", config: merge({ accent: "#a78bfa", accent2: "#d8b4fe", canvas: "#0d0a14", surface: "#15101f", surface2: "#1d1729", surface3: "#251d34", muted: "#a49ab6" }) },
  { id: "forest", label: "Forest", description: "Dark green with natural highlights.", config: merge({ accent: "#4ade80", accent2: "#a3e635", canvas: "#07100b", surface: "#0d1711", surface2: "#142018", surface3: "#1b2a20", muted: "#91a596" }) },
  { id: "sunset", label: "Sunset", description: "Warm orange-pink gradients without image assets.", config: merge({ accent: "#fb7185", accent2: "#fb923c", canvas: "#12090d", surface: "#1b0f14", surface2: "#26151d", surface3: "#311b25", muted: "#b89aa4" }) },
  { id: "retro", label: "Retro Terminal", description: "Monospace, compact, green-on-black.", config: merge({ accent: "#65f58a", accent2: "#b6ff6a", canvas: "#020702", surface: "#061006", surface2: "#0a170a", surface3: "#102010", text: "#d9ffe1", muted: "#7faf88", fontFamily: "mono", density: "compact", messageStyle: "flat", composerStyle: "attached", radius: 10, messageRadius: 8, shadows: false, glass: false }) },
  { id: "minimal", label: "Minimal", description: "Low chrome, flatter messages and cleaner spacing.", config: merge({ accent: "#d0d4dc", accent2: "#ffffff", canvas: "#101113", surface: "#15171a", surface2: "#1b1d21", surface3: "#202329", muted: "#9499a3", messageStyle: "minimal", composerStyle: "minimal", shadows: false, glass: false, radius: 14, messageRadius: 8 }) },
];

export const DEFAULT_TIGER_THEME = TIGER_THEME_PRESETS[0].config;

const HEX = /^#[0-9a-f]{6}$/i;
const LINE_VALUE = /^(rgba?\([^;{}]+\)|#[0-9a-f]{6})$/i;

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && HEX.test(value) ? value : fallback;
}

export function normalizeTigerThemeConfig(raw: unknown): TigerThemeConfig {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const fallback = DEFAULT_TIGER_THEME;
  const line = typeof input.line === "string" && LINE_VALUE.test(input.line) ? input.line : fallback.line;
  return {
    version: V13_THEME_VERSION,
    mode: input.mode === "light" ? "light" : "dark",
    accent: safeColor(input.accent, fallback.accent),
    accent2: safeColor(input.accent2, fallback.accent2),
    canvas: safeColor(input.canvas, fallback.canvas),
    surface: safeColor(input.surface, fallback.surface),
    surface2: safeColor(input.surface2, fallback.surface2),
    surface3: safeColor(input.surface3, fallback.surface3),
    text: safeColor(input.text, fallback.text),
    muted: safeColor(input.muted, fallback.muted),
    line,
    navWidth: clampNumber(input.navWidth, 72, 150, fallback.navWidth),
    sidebarWidth: clampNumber(input.sidebarWidth, 240, 460, fallback.sidebarWidth),
    pageWidth: clampNumber(input.pageWidth, 920, 1800, fallback.pageWidth),
    radius: clampNumber(input.radius, 0, 36, fallback.radius),
    messageRadius: clampNumber(input.messageRadius, 0, 30, fallback.messageRadius),
    messageMaxWidth: clampNumber(input.messageMaxWidth, 420, 980, fallback.messageMaxWidth),
    fontScale: clampNumber(input.fontScale, 82, 130, fallback.fontScale),
    density: input.density === "compact" || input.density === "spacious" ? input.density : "comfortable",
    fontFamily: input.fontFamily === "rounded" || input.fontFamily === "mono" || input.fontFamily === "serif" ? input.fontFamily : "system",
    glass: input.glass !== false,
    shadows: input.shadows !== false,
    animations: input.animations !== false,
    messageStyle: input.messageStyle === "flat" || input.messageStyle === "minimal" ? input.messageStyle : "bubbles",
    composerStyle: input.composerStyle === "attached" || input.composerStyle === "minimal" ? input.composerStyle : "floating",
  };
}

export function validateCustomCss(css: string): string | null {
  if (css.length > 12000) return "Custom CSS is limited to 12,000 characters.";
  const lowered = css.toLowerCase();
  const blocked = ["@import", "url(", "javascript:", "expression(", "behavior:", "-moz-binding", "<script", "</style"];
  const hit = blocked.find((token) => lowered.includes(token));
  if (hit) return `Custom CSS cannot contain ${hit}. Remote assets and executable CSS are blocked.`;
  return null;
}

export function exportedTheme(name: string, preset: string, config: TigerThemeConfig, customCss: string) {
  return JSON.stringify({
    kind: "tiger-chat-theme",
    version: V13_THEME_VERSION,
    name,
    preset,
    config: normalizeTigerThemeConfig(config),
    custom_css: customCss,
  }, null, 2);
}

export function parseImportedTheme(text: string): { name: string; preset: string; config: TigerThemeConfig; custom_css: string } {
  const value = JSON.parse(text) as Record<string, unknown>;
  if (value.kind !== "tiger-chat-theme") throw new Error("That file is not a Tiger Chat theme.");
  const customCss = typeof value.custom_css === "string" ? value.custom_css : "";
  const cssError = validateCustomCss(customCss);
  if (cssError) throw new Error(cssError);
  return {
    name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 40) : "Imported theme",
    preset: typeof value.preset === "string" ? value.preset.slice(0, 32) : "custom",
    config: normalizeTigerThemeConfig(value.config),
    custom_css: customCss,
  };
}

export function applyTigerThemeToDocument(config: TigerThemeConfig) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const c = normalizeTigerThemeConfig(config);
  root.dataset.tigerV13 = "true";
  root.dataset.tigerV13Mode = c.mode;
  root.dataset.tigerV13Density = c.density;
  root.dataset.tigerV13Font = c.fontFamily;
  root.dataset.tigerV13Glass = c.glass ? "on" : "off";
  root.dataset.tigerV13Shadow = c.shadows ? "on" : "off";
  root.dataset.tigerV13Motion = c.animations ? "on" : "off";
  root.dataset.tigerV13Messages = c.messageStyle;
  root.dataset.tigerV13Composer = c.composerStyle;

  const style = root.style;
  style.setProperty("--v121-orange", c.accent);
  style.setProperty("--v121-orange-2", c.accent2);
  style.setProperty("--v121-canvas", c.canvas);
  style.setProperty("--v121-surface", c.surface);
  style.setProperty("--v121-surface-2", c.surface2);
  style.setProperty("--v121-surface-3", c.surface3);
  style.setProperty("--v121-text", c.text);
  style.setProperty("--v121-muted", c.muted);
  style.setProperty("--v121-line", c.line);
  style.setProperty("--v121-nav-w", `${c.navWidth}px`);
  style.setProperty("--v121-radius-xl", `${c.radius}px`);
  style.setProperty("--v121-radius-lg", `${Math.max(0, c.radius - 6)}px`);
  style.setProperty("--v121-radius-md", `${Math.max(0, c.radius - 12)}px`);
  style.setProperty("--tiger-v13-sidebar-w", `${c.sidebarWidth}px`);
  style.setProperty("--tiger-v13-page-w", `${c.pageWidth}px`);
  style.setProperty("--tiger-v13-message-radius", `${c.messageRadius}px`);
  style.setProperty("--tiger-v13-message-max", `${c.messageMaxWidth}px`);
  style.setProperty("--tiger-font-scale", `${c.fontScale / 100}`);
}
