export const V13_THEME_VERSION = 2;

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
  outgoingBubble: string;
  outgoingText: string;
  incomingBubble: string;
  incomingText: string;
  navWidth: number;
  sidebarWidth: number;
  pageWidth: number;
  radius: number;
  messageRadius: number;
  messageMaxWidth: number;
  messagePaddingX: number;
  messagePaddingY: number;
  messageSpacing: number;
  fontScale: number;
  density: "compact" | "comfortable" | "spacious";
  fontFamily: "system" | "rounded" | "mono" | "serif";
  glass: boolean;
  shadows: boolean;
  animations: boolean;
  scrollbars: boolean;
  focusRings: boolean;
  showAvatars: boolean;
  bubbleTail: boolean;
  messageStyle: "bubbles" | "flat" | "minimal";
  composerStyle: "floating" | "attached" | "minimal";
  messageMeta: "always" | "hover" | "minimal";
  backgroundStyle: "solid" | "spotlight" | "gradient" | "mesh";
  backgroundIntensity: number;
  surfaceOpacity: number;
  blurStrength: number;
  borderStrength: number;
  shadowStrength: number;
  accentGlow: number;
  avatarShape: "circle" | "squircle" | "square";
  avatarScale: number;
  navPosition: "left" | "right";
  navStyle: "rail" | "compact" | "hidden";
  navLabels: "always" | "hover" | "never";
  sidebarStyle: "standard" | "compact" | "minimal";
  conversationHeight: number;
  buttonShape: "rounded" | "pill" | "square";
  mobileNavStyle: "floating" | "attached" | "minimal";
  mobileNavLabels: boolean;
  mobileNavHeight: number;
  mobileHideNavInChat: boolean;
  mobileHeaderStyle: "full" | "compact" | "minimal";
  mobileMessageWidth: number;
  mobileChatPadding: number;
  mobileComposerStyle: "floating" | "attached" | "compact";
  mobileTapSize: "compact" | "comfortable" | "large";
  mobileEdgeToEdge: boolean;
  mobileFontScale: number;
  mobileModalStyle: "sheet" | "full";
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
  outgoingBubble: "#f58220",
  outgoingText: "#ffffff",
  incomingBubble: "#171c24",
  incomingText: "#f7f8fa",
  navWidth: 94,
  sidebarWidth: 332,
  pageWidth: 1360,
  radius: 26,
  messageRadius: 18,
  messageMaxWidth: 720,
  messagePaddingX: 13,
  messagePaddingY: 10,
  messageSpacing: 9,
  fontScale: 100,
  density: "comfortable",
  fontFamily: "system",
  glass: true,
  shadows: true,
  animations: true,
  scrollbars: true,
  focusRings: true,
  showAvatars: true,
  bubbleTail: true,
  messageStyle: "bubbles",
  composerStyle: "floating",
  messageMeta: "always",
  backgroundStyle: "spotlight",
  backgroundIntensity: 10,
  surfaceOpacity: 94,
  blurStrength: 24,
  borderStrength: 8,
  shadowStrength: 32,
  accentGlow: 24,
  avatarShape: "circle",
  avatarScale: 100,
  navPosition: "left",
  navStyle: "rail",
  navLabels: "always",
  sidebarStyle: "standard",
  conversationHeight: 66,
  buttonShape: "rounded",
  mobileNavStyle: "floating",
  mobileNavLabels: true,
  mobileNavHeight: 58,
  mobileHideNavInChat: true,
  mobileHeaderStyle: "compact",
  mobileMessageWidth: 92,
  mobileChatPadding: 12,
  mobileComposerStyle: "floating",
  mobileTapSize: "comfortable",
  mobileEdgeToEdge: true,
  mobileFontScale: 100,
  mobileModalStyle: "sheet",
};

function merge(overrides: Partial<TigerThemeConfig>): TigerThemeConfig {
  return { ...baseDark, ...overrides, version: V13_THEME_VERSION };
}

export const TIGER_THEME_PRESETS: TigerThemePreset[] = [
  { id: "tiger", label: "Tiger Classic", description: "The default orange Tiger Chat look.", config: merge({}) },
  { id: "midnight", label: "Midnight", description: "Deep navy with electric blue accents.", config: merge({ accent: "#6ea8ff", accent2: "#9f7aea", outgoingBubble: "#4f7fe7", canvas: "#070b14", surface: "#0d1320", surface2: "#131c2d", surface3: "#1a263a", incomingBubble: "#131c2d", muted: "#8c9bb3", backgroundStyle: "mesh", backgroundIntensity: 16 }) },
  { id: "oled", label: "OLED", description: "True-black surfaces and restrained contrast.", config: merge({ accent: "#ff8a2a", accent2: "#ffc46b", outgoingBubble: "#ff7b14", canvas: "#000000", surface: "#050505", surface2: "#0b0b0b", surface3: "#121212", incomingBubble: "#0b0b0b", line: "rgba(255,255,255,.11)", shadows: false, glass: false, backgroundStyle: "solid", surfaceOpacity: 100 }) },
  { id: "frost", label: "Frost", description: "Bright, cool, minimal and airy.", config: merge({ mode: "light", accent: "#2f6fed", accent2: "#6b8cff", outgoingBubble: "#2f6fed", outgoingText: "#ffffff", canvas: "#edf3fb", surface: "#ffffff", surface2: "#f5f8fc", surface3: "#e8eef7", incomingBubble: "#f5f8fc", incomingText: "#172033", text: "#172033", muted: "#66738a", line: "rgba(23,32,51,.10)", shadows: true, backgroundStyle: "gradient", backgroundIntensity: 8 }) },
  { id: "lavender", label: "Lavender", description: "Purple accents with soft dark surfaces.", config: merge({ accent: "#a78bfa", accent2: "#d8b4fe", outgoingBubble: "#8b6de5", canvas: "#0d0a14", surface: "#15101f", surface2: "#1d1729", surface3: "#251d34", incomingBubble: "#1d1729", muted: "#a49ab6", backgroundStyle: "spotlight", backgroundIntensity: 14 }) },
  { id: "forest", label: "Forest", description: "Dark green with natural highlights.", config: merge({ accent: "#4ade80", accent2: "#a3e635", outgoingBubble: "#2ea85d", canvas: "#07100b", surface: "#0d1711", surface2: "#142018", surface3: "#1b2a20", incomingBubble: "#142018", muted: "#91a596", backgroundStyle: "mesh", backgroundIntensity: 13 }) },
  { id: "sunset", label: "Sunset", description: "Warm orange-pink CSS gradients.", config: merge({ accent: "#fb7185", accent2: "#fb923c", outgoingBubble: "#e95f76", canvas: "#12090d", surface: "#1b0f14", surface2: "#26151d", surface3: "#311b25", incomingBubble: "#26151d", muted: "#b89aa4", backgroundStyle: "gradient", backgroundIntensity: 18, accentGlow: 34 }) },
  { id: "retro", label: "Retro Terminal", description: "Monospace, compact, green-on-black.", config: merge({ accent: "#65f58a", accent2: "#b6ff6a", outgoingBubble: "#123f20", outgoingText: "#d9ffe1", canvas: "#020702", surface: "#061006", surface2: "#0a170a", surface3: "#102010", incomingBubble: "#0a170a", text: "#d9ffe1", incomingText: "#d9ffe1", muted: "#7faf88", fontFamily: "mono", density: "compact", messageStyle: "flat", composerStyle: "attached", radius: 10, messageRadius: 8, shadows: false, glass: false, backgroundStyle: "solid", navStyle: "compact", navLabels: "never", sidebarStyle: "compact", conversationHeight: 54, mobileNavLabels: false, mobileHeaderStyle: "minimal", mobileComposerStyle: "compact" }) },
  { id: "minimal", label: "Minimal", description: "Low chrome, flatter messages and cleaner spacing.", config: merge({ accent: "#d0d4dc", accent2: "#ffffff", outgoingBubble: "#2c3037", canvas: "#101113", surface: "#15171a", surface2: "#1b1d21", surface3: "#202329", incomingBubble: "#1b1d21", muted: "#9499a3", messageStyle: "minimal", composerStyle: "minimal", messageMeta: "hover", shadows: false, glass: false, radius: 14, messageRadius: 8, backgroundStyle: "solid", accentGlow: 0, navStyle: "compact", navLabels: "hover", sidebarStyle: "minimal", mobileNavStyle: "minimal", mobileNavLabels: false, mobileHeaderStyle: "minimal" }) },
  { id: "discordish", label: "Night Social", description: "Dense social-chat layout with compact navigation.", config: merge({ accent: "#7c8cff", accent2: "#9c7cff", outgoingBubble: "#5765d8", canvas: "#111318", surface: "#171a21", surface2: "#1d212a", surface3: "#242934", incomingBubble: "#1d212a", density: "compact", messageRadius: 10, messageMaxWidth: 820, messageMeta: "hover", navStyle: "compact", navLabels: "hover", sidebarWidth: 300, sidebarStyle: "compact", conversationHeight: 56, mobileNavStyle: "attached", mobileNavLabels: false, mobileHeaderStyle: "compact", backgroundStyle: "solid" }) },
  { id: "bubblegum", label: "Bubblegum", description: "Rounded, colorful, playful without image assets.", config: merge({ accent: "#ff6fae", accent2: "#a78bfa", outgoingBubble: "#ec5d9d", canvas: "#130d15", surface: "#1c1420", surface2: "#281b2c", surface3: "#34243a", incomingBubble: "#281b2c", radius: 34, messageRadius: 26, buttonShape: "pill", avatarShape: "squircle", backgroundStyle: "mesh", backgroundIntensity: 20, accentGlow: 38 }) },
];

export const DEFAULT_TIGER_THEME = TIGER_THEME_PRESETS[0].config;

const HEX = /^#[0-9a-f]{6}$/i;
const LINE_VALUE = /^(rgba?\([^;{}]+\)|#[0-9a-f]{6})$/i;

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}
function safeColor(value: unknown, fallback: string) { return typeof value === "string" && HEX.test(value) ? value : fallback; }
function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T { return typeof value === "string" && options.includes(value as T) ? value as T : fallback; }

export function normalizeTigerThemeConfig(raw: unknown): TigerThemeConfig {
  const input = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const fallback = DEFAULT_TIGER_THEME;
  const line = typeof input.line === "string" && LINE_VALUE.test(input.line) ? input.line : fallback.line;
  return {
    version: V13_THEME_VERSION,
    mode: input.mode === "light" ? "light" : "dark",
    accent: safeColor(input.accent, fallback.accent), accent2: safeColor(input.accent2, fallback.accent2),
    canvas: safeColor(input.canvas, fallback.canvas), surface: safeColor(input.surface, fallback.surface), surface2: safeColor(input.surface2, fallback.surface2), surface3: safeColor(input.surface3, fallback.surface3),
    text: safeColor(input.text, fallback.text), muted: safeColor(input.muted, fallback.muted), line,
    outgoingBubble: safeColor(input.outgoingBubble, safeColor(input.accent, fallback.outgoingBubble)), outgoingText: safeColor(input.outgoingText, fallback.outgoingText),
    incomingBubble: safeColor(input.incomingBubble, safeColor(input.surface2, fallback.incomingBubble)), incomingText: safeColor(input.incomingText, safeColor(input.text, fallback.incomingText)),
    navWidth: clampNumber(input.navWidth, 68, 170, fallback.navWidth), sidebarWidth: clampNumber(input.sidebarWidth, 220, 520, fallback.sidebarWidth), pageWidth: clampNumber(input.pageWidth, 860, 1900, fallback.pageWidth),
    radius: clampNumber(input.radius, 0, 42, fallback.radius), messageRadius: clampNumber(input.messageRadius, 0, 34, fallback.messageRadius), messageMaxWidth: clampNumber(input.messageMaxWidth, 360, 1040, fallback.messageMaxWidth),
    messagePaddingX: clampNumber(input.messagePaddingX, 6, 24, fallback.messagePaddingX), messagePaddingY: clampNumber(input.messagePaddingY, 4, 20, fallback.messagePaddingY), messageSpacing: clampNumber(input.messageSpacing, 2, 24, fallback.messageSpacing),
    fontScale: clampNumber(input.fontScale, 78, 140, fallback.fontScale),
    density: choice(input.density, ["compact","comfortable","spacious"] as const, fallback.density), fontFamily: choice(input.fontFamily, ["system","rounded","mono","serif"] as const, fallback.fontFamily),
    glass: input.glass !== false, shadows: input.shadows !== false, animations: input.animations !== false, scrollbars: input.scrollbars !== false, focusRings: input.focusRings !== false, showAvatars: input.showAvatars !== false, bubbleTail: input.bubbleTail !== false,
    messageStyle: choice(input.messageStyle, ["bubbles","flat","minimal"] as const, fallback.messageStyle), composerStyle: choice(input.composerStyle, ["floating","attached","minimal"] as const, fallback.composerStyle), messageMeta: choice(input.messageMeta, ["always","hover","minimal"] as const, fallback.messageMeta),
    backgroundStyle: choice(input.backgroundStyle, ["solid","spotlight","gradient","mesh"] as const, fallback.backgroundStyle), backgroundIntensity: clampNumber(input.backgroundIntensity, 0, 40, fallback.backgroundIntensity),
    surfaceOpacity: clampNumber(input.surfaceOpacity, 55, 100, fallback.surfaceOpacity), blurStrength: clampNumber(input.blurStrength, 0, 40, fallback.blurStrength), borderStrength: clampNumber(input.borderStrength, 0, 24, fallback.borderStrength), shadowStrength: clampNumber(input.shadowStrength, 0, 60, fallback.shadowStrength), accentGlow: clampNumber(input.accentGlow, 0, 60, fallback.accentGlow),
    avatarShape: choice(input.avatarShape, ["circle","squircle","square"] as const, fallback.avatarShape), avatarScale: clampNumber(input.avatarScale, 75, 130, fallback.avatarScale),
    navPosition: choice(input.navPosition, ["left","right"] as const, fallback.navPosition), navStyle: choice(input.navStyle, ["rail","compact","hidden"] as const, fallback.navStyle), navLabels: choice(input.navLabels, ["always","hover","never"] as const, fallback.navLabels),
    sidebarStyle: choice(input.sidebarStyle, ["standard","compact","minimal"] as const, fallback.sidebarStyle), conversationHeight: clampNumber(input.conversationHeight, 48, 88, fallback.conversationHeight), buttonShape: choice(input.buttonShape, ["rounded","pill","square"] as const, fallback.buttonShape),
    mobileNavStyle: choice(input.mobileNavStyle, ["floating","attached","minimal"] as const, fallback.mobileNavStyle), mobileNavLabels: input.mobileNavLabels !== false, mobileNavHeight: clampNumber(input.mobileNavHeight, 50, 78, fallback.mobileNavHeight), mobileHideNavInChat: input.mobileHideNavInChat !== false,
    mobileHeaderStyle: choice(input.mobileHeaderStyle, ["full","compact","minimal"] as const, fallback.mobileHeaderStyle), mobileMessageWidth: clampNumber(input.mobileMessageWidth, 72, 100, fallback.mobileMessageWidth), mobileChatPadding: clampNumber(input.mobileChatPadding, 6, 28, fallback.mobileChatPadding),
    mobileComposerStyle: choice(input.mobileComposerStyle, ["floating","attached","compact"] as const, fallback.mobileComposerStyle), mobileTapSize: choice(input.mobileTapSize, ["compact","comfortable","large"] as const, fallback.mobileTapSize),
    mobileEdgeToEdge: input.mobileEdgeToEdge !== false, mobileFontScale: clampNumber(input.mobileFontScale, 88, 120, fallback.mobileFontScale), mobileModalStyle: choice(input.mobileModalStyle, ["sheet","full"] as const, fallback.mobileModalStyle),
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
  return JSON.stringify({ kind: "tiger-chat-theme", version: V13_THEME_VERSION, name, preset, config: normalizeTigerThemeConfig(config), custom_css: customCss }, null, 2);
}

export function parseImportedTheme(text: string): { name: string; preset: string; config: TigerThemeConfig; custom_css: string } {
  const value = JSON.parse(text) as Record<string, unknown>;
  if (value.kind !== "tiger-chat-theme") throw new Error("That file is not a Tiger Chat theme.");
  const customCss = typeof value.custom_css === "string" ? value.custom_css : "";
  const cssError = validateCustomCss(customCss); if (cssError) throw new Error(cssError);
  return { name: typeof value.name === "string" && value.name.trim() ? value.name.trim().slice(0, 40) : "Imported theme", preset: typeof value.preset === "string" ? value.preset.slice(0, 32) : "custom", config: normalizeTigerThemeConfig(value.config), custom_css: customCss };
}

export function applyTigerThemeToDocument(config: TigerThemeConfig) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const c = normalizeTigerThemeConfig(config);
  root.dataset.tigerV13 = "true"; root.dataset.tigerV13Mode = c.mode; root.dataset.tigerV13Density = c.density; root.dataset.tigerV13Font = c.fontFamily;
  root.dataset.tigerV13Glass = c.glass ? "on" : "off"; root.dataset.tigerV13Shadow = c.shadows ? "on" : "off"; root.dataset.tigerV13Motion = c.animations ? "on" : "off";
  root.dataset.tigerV13Messages = c.messageStyle; root.dataset.tigerV13Composer = c.composerStyle;
  root.dataset.tigerV131Background = c.backgroundStyle; root.dataset.tigerV131Meta = c.messageMeta; root.dataset.tigerV131Tail = c.bubbleTail ? "on" : "off";
  root.dataset.tigerV131Avatars = c.showAvatars ? "on" : "off"; root.dataset.tigerV131AvatarShape = c.avatarShape; root.dataset.tigerV131NavPosition = c.navPosition;
  root.dataset.tigerV131NavStyle = c.navStyle; root.dataset.tigerV131NavLabels = c.navLabels; root.dataset.tigerV131Sidebar = c.sidebarStyle; root.dataset.tigerV131Button = c.buttonShape;
  root.dataset.tigerV131Scrollbars = c.scrollbars ? "on" : "off"; root.dataset.tigerV131Focus = c.focusRings ? "on" : "off";
  root.dataset.tigerV131MobileNav = c.mobileNavStyle; root.dataset.tigerV131MobileLabels = c.mobileNavLabels ? "on" : "off"; root.dataset.tigerV131MobileHideNav = c.mobileHideNavInChat ? "on" : "off";
  root.dataset.tigerV131MobileHeader = c.mobileHeaderStyle; root.dataset.tigerV131MobileComposer = c.mobileComposerStyle; root.dataset.tigerV131MobileTap = c.mobileTapSize;
  root.dataset.tigerV131MobileEdge = c.mobileEdgeToEdge ? "on" : "off"; root.dataset.tigerV131MobileModal = c.mobileModalStyle;

  const style = root.style;
  style.setProperty("--v121-orange", c.accent); style.setProperty("--v121-orange-2", c.accent2); style.setProperty("--v121-canvas", c.canvas); style.setProperty("--v121-surface", c.surface); style.setProperty("--v121-surface-2", c.surface2); style.setProperty("--v121-surface-3", c.surface3); style.setProperty("--v121-text", c.text); style.setProperty("--v121-muted", c.muted); style.setProperty("--v121-line", c.line);
  style.setProperty("--v121-nav-w", `${c.navWidth}px`); style.setProperty("--v121-radius-xl", `${c.radius}px`); style.setProperty("--v121-radius-lg", `${Math.max(0, c.radius - 6)}px`); style.setProperty("--v121-radius-md", `${Math.max(0, c.radius - 12)}px`);
  style.setProperty("--tiger-v13-sidebar-w", `${c.sidebarWidth}px`); style.setProperty("--tiger-v13-page-w", `${c.pageWidth}px`); style.setProperty("--tiger-v13-message-radius", `${c.messageRadius}px`); style.setProperty("--tiger-v13-message-max", `${c.messageMaxWidth}px`); style.setProperty("--tiger-font-scale", `${c.fontScale / 100}`);
  style.setProperty("--tiger-v131-outgoing", c.outgoingBubble); style.setProperty("--tiger-v131-outgoing-text", c.outgoingText); style.setProperty("--tiger-v131-incoming", c.incomingBubble); style.setProperty("--tiger-v131-incoming-text", c.incomingText);
  style.setProperty("--tiger-v131-msg-px", `${c.messagePaddingX}px`); style.setProperty("--tiger-v131-msg-py", `${c.messagePaddingY}px`); style.setProperty("--tiger-v131-msg-gap", `${c.messageSpacing}px`);
  style.setProperty("--tiger-v131-bg-intensity", `${c.backgroundIntensity}%`); style.setProperty("--tiger-v131-bg-intensity-2", `${Math.round(c.backgroundIntensity * 0.72)}%`); style.setProperty("--tiger-v131-surface-opacity", `${c.surfaceOpacity}%`); style.setProperty("--tiger-v131-blur", `${c.blurStrength}px`); style.setProperty("--tiger-v131-border-strength", `${c.borderStrength}%`); style.setProperty("--tiger-v131-shadow-strength", `${c.shadowStrength}%`); style.setProperty("--tiger-v131-shadow-soft", `${Math.round(c.shadowStrength * 0.7)}%`); style.setProperty("--tiger-v131-glow", `color-mix(in srgb, ${c.accent} ${c.accentGlow}%, transparent)`);
  style.setProperty("--tiger-v131-avatar-scale", `${c.avatarScale / 100}`); style.setProperty("--tiger-v131-avatar-medium", `${Math.round(42 * c.avatarScale / 100)}px`); style.setProperty("--tiger-v131-avatar-small", `${Math.round(32 * c.avatarScale / 100)}px`); style.setProperty("--tiger-v131-avatar-large", `${Math.round(68 * c.avatarScale / 100)}px`); style.setProperty("--tiger-v131-conversation-h", `${c.conversationHeight}px`);
  style.setProperty("--tiger-v131-mobile-nav-h", `${c.mobileNavHeight}px`); style.setProperty("--tiger-v131-mobile-message-w", `${c.mobileMessageWidth}%`); style.setProperty("--tiger-v131-mobile-pad", `${c.mobileChatPadding}px`); style.setProperty("--tiger-v131-mobile-font-size", `${16 * c.mobileFontScale / 100}px`); style.setProperty("--tiger-v131-mobile-msg-gap", `${Math.max(2, Math.round(c.messageSpacing * 0.78))}px`);
}
