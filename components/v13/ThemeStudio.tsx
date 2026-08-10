"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  applyTigerThemeToDocument,
  DEFAULT_TIGER_THEME,
  exportedTheme,
  normalizeTigerThemeConfig,
  parseImportedTheme,
  TIGER_THEME_PRESETS,
  validateCustomCss,
  type TigerSavedTheme,
  type TigerThemeConfig,
} from "@/lib/v13-theme";

const EMPTY_ID = "new";
type ColorKey = "accent" | "accent2" | "canvas" | "surface" | "surface2" | "surface3" | "text" | "muted";
const COLOR_FIELDS: Array<[ColorKey, string]> = [["accent","Accent"],["accent2","Second accent"],["canvas","Background"],["surface","Main surface"],["surface2","Raised surface"],["surface3","Hover surface"],["text","Text"],["muted","Muted text"]];

export function ThemeStudio({ userId }: { userId: string }) {
  const [themes, setThemes] = useState<TigerSavedTheme[]>([]);
  const [selectedId, setSelectedId] = useState(EMPTY_ID);
  const [name, setName] = useState("Tiger Custom");
  const [preset, setPreset] = useState("tiger");
  const [config, setConfig] = useState<TigerThemeConfig>(DEFAULT_TIGER_THEME);
  const [customCss, setCustomCss] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("user_themes").select("id,user_id,name,preset,config,custom_css,is_active,created_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false });
    if (error) { setMessage(error.message); return; }
    const rows = (data ?? []) as TigerSavedTheme[];
    setThemes(rows);
    const active = rows.find((row) => row.is_active) ?? rows[0];
    if (active) selectTheme(active);
  }

  useEffect(() => { void load(); }, [userId]);

  useEffect(() => {
    applyTigerThemeToDocument(config);
    let style = document.getElementById("tiger-v13-preview-css") as HTMLStyleElement | null;
    if (!style) { style = document.createElement("style"); style.id = "tiger-v13-preview-css"; document.head.appendChild(style); }
    style.textContent = validateCustomCss(customCss) ? "" : customCss;
    return () => { const current = document.getElementById("tiger-v13-preview-css"); if (current) current.textContent = ""; };
  }, [config, customCss]);

  function selectTheme(theme: TigerSavedTheme) {
    setSelectedId(theme.id); setName(theme.name); setPreset(theme.preset); setConfig(normalizeTigerThemeConfig(theme.config)); setCustomCss(theme.custom_css || ""); setMessage("");
  }

  function applyPreset(id: string) {
    const found = TIGER_THEME_PRESETS.find((item) => item.id === id) ?? TIGER_THEME_PRESETS[0];
    setPreset(found.id); setConfig(found.config); setMessage(`Previewing ${found.label}. Save to keep it.`);
  }

  function patch<K extends keyof TigerThemeConfig>(key: K, value: TigerThemeConfig[K]) { setConfig((current) => normalizeTigerThemeConfig({ ...current, [key]: value })); }

  async function save(makeActive = true) {
    setMessage("");
    const cssError = validateCustomCss(customCss); if (cssError) { setMessage(cssError); return; }
    const cleanName = name.trim().slice(0, 40); if (!cleanName) { setMessage("Give the theme a name."); return; }
    setSaving(true);
    try {
      let id = selectedId;
      if (id === EMPTY_ID) {
        const { data, error } = await supabase.from("user_themes").insert({ user_id: userId, name: cleanName, preset, config: normalizeTigerThemeConfig(config), custom_css: customCss, is_active: false }).select("id").single();
        if (error) throw error; id = String(data.id); setSelectedId(id);
      } else {
        const { error } = await supabase.from("user_themes").update({ name: cleanName, preset, config: normalizeTigerThemeConfig(config), custom_css: customCss, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
        if (error) throw error;
      }
      if (makeActive) {
        const { error } = await supabase.rpc("activate_user_theme_v13", { target_theme: id });
        if (error) throw error;
      }
      await load(); window.sessionStorage.removeItem("tiger-safe-theme"); window.dispatchEvent(new Event("tiger-theme-updated")); setMessage(makeActive ? "Theme saved and activated." : "Theme saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save theme."); }
    finally { setSaving(false); }
  }

  async function activate(id: string) {
    const { error } = await supabase.rpc("activate_user_theme_v13", { target_theme: id });
    if (error) setMessage(error.message); else { await load(); window.sessionStorage.removeItem("tiger-safe-theme"); window.dispatchEvent(new Event("tiger-theme-updated")); setMessage("Theme activated."); }
  }

  async function duplicate() {
    setSelectedId(EMPTY_ID); setName(`${name} copy`.slice(0, 40)); setMessage("Copy ready. Save it as a new theme.");
  }

  async function remove(theme: TigerSavedTheme) {
    if (!window.confirm(`Delete “${theme.name}”?`)) return;
    const { error } = await supabase.from("user_themes").delete().eq("id", theme.id).eq("user_id", userId);
    if (error) { setMessage(error.message); return; }
    setSelectedId(EMPTY_ID); setName("Tiger Custom"); setPreset("tiger"); setConfig(DEFAULT_TIGER_THEME); setCustomCss(""); await load(); window.dispatchEvent(new Event("tiger-theme-updated"));
  }

  function exportCurrent() {
    const blob = new Blob([exportedTheme(name, preset, config, customCss)], { type: "application/json" });
    const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "tiger-theme"}.tiger-theme.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function copyTheme() { await navigator.clipboard.writeText(exportedTheme(name, preset, config, customCss)); setMessage("Theme JSON copied."); }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try { const parsed = parseImportedTheme(await file.text()); setSelectedId(EMPTY_ID); setName(parsed.name); setPreset(parsed.preset); setConfig(parsed.config); setCustomCss(parsed.custom_css); setMessage("Theme imported into preview. Save to keep it."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not import theme."); }
  }

  async function resetSafe() {
    window.sessionStorage.removeItem("tiger-safe-theme"); setSelectedId(EMPTY_ID); setName("Tiger Classic"); setPreset("tiger"); setConfig(DEFAULT_TIGER_THEME); setCustomCss(""); setMessage("Safe default loaded. Save to make it your active theme."); applyTigerThemeToDocument(DEFAULT_TIGER_THEME);
  }

  const active = useMemo(() => themes.find((theme) => theme.is_active), [themes]);
  const cssError = validateCustomCss(customCss);

  return <div className="v13-theme-studio">
    <section className="v13-theme-sidebar tiger-card">
      <div><p className="v12-kicker">Appearance</p><h2>Theme Studio</h2><p className="muted-copy">BetterDiscord-style flexibility, without plugins, scripts, remote images, or unsafe CSS.</p></div>
      <button className="primary-button" onClick={() => { setSelectedId(EMPTY_ID); setName("New theme"); setPreset("tiger"); setConfig(DEFAULT_TIGER_THEME); setCustomCss(""); }}>＋ New theme</button>
      <div className="v13-saved-themes">{themes.map((theme) => <button key={theme.id} className={selectedId === theme.id ? "active" : ""} onClick={() => selectTheme(theme)}><span><strong>{theme.name}</strong><small>{theme.preset}</small></span>{theme.is_active && <b>Active</b>}</button>)}{themes.length === 0 && <p className="muted-copy">No saved themes yet. Pick a preset and save it.</p>}</div>
      {active && <small>Current across devices: <strong>{active.name}</strong></small>}
      <button className="secondary-button" onClick={() => void resetSafe()}>Reset preview to safe default</button>
      <small>Recovery shortcut: <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>R</kbd>. You can also add <code>?safeTheme=1</code> to any Tiger Chat URL.</small>
    </section>

    <section className="v13-theme-workbench">
      <div className="tiger-card v13-theme-preview">
        <div><p className="v12-kicker">Live preview</p><h2>{name || "Untitled theme"}</h2><p>This page updates immediately. Nothing is permanent until you save.</p></div>
        <div className="v13-preview-chat"><div className="v13-preview-message"><span>Friend</span><p>This is what an incoming message looks like.</p></div><div className="v13-preview-message mine"><span>You</span><p>And this is your message. 🐯</p></div><div className="v13-preview-composer">Message Tiger Chat… <b>Send</b></div></div>
      </div>

      <div className="tiger-card"><h3>Presets</h3><div className="v13-preset-grid">{TIGER_THEME_PRESETS.map((item) => <button key={item.id} className={preset === item.id ? "active" : ""} onClick={() => applyPreset(item.id)}><span className="v13-preset-swatch" style={{ background: `linear-gradient(135deg,${item.config.accent},${item.config.surface2})` }} /><strong>{item.label}</strong><small>{item.description}</small></button>)}</div></div>

      <div className="tiger-card"><h3>Theme identity</h3><label>Theme name<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label><div className="v13-color-grid">{COLOR_FIELDS.map(([key,label]) => <label key={key}>{label}<span className="v13-color-input"><input type="color" value={config[key]} onChange={(e) => patch(key, e.target.value)} /><code>{config[key]}</code></span></label>)}</div></div>

      <div className="tiger-card"><h3>Layout</h3><label>Navigation width <b>{config.navWidth}px</b><input type="range" min="72" max="150" value={config.navWidth} onChange={(e) => patch("navWidth", Number(e.target.value))} /></label><label>Conversation sidebar <b>{config.sidebarWidth}px</b><input type="range" min="240" max="460" value={config.sidebarWidth} onChange={(e) => patch("sidebarWidth", Number(e.target.value))} /></label><label>Message width <b>{config.messageMaxWidth}px</b><input type="range" min="420" max="980" value={config.messageMaxWidth} onChange={(e) => patch("messageMaxWidth", Number(e.target.value))} /></label><label>Corner radius <b>{config.radius}px</b><input type="range" min="0" max="36" value={config.radius} onChange={(e) => patch("radius", Number(e.target.value))} /></label><label>Message radius <b>{config.messageRadius}px</b><input type="range" min="0" max="30" value={config.messageRadius} onChange={(e) => patch("messageRadius", Number(e.target.value))} /></label><label>Text scale <b>{config.fontScale}%</b><input type="range" min="82" max="130" value={config.fontScale} onChange={(e) => patch("fontScale", Number(e.target.value))} /></label></div>

      <div className="tiger-card"><h3>Behavior & feel</h3><div className="v13-select-grid"><label>Density<select value={config.density} onChange={(e) => patch("density", e.target.value as TigerThemeConfig['density'])}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label><label>Font<select value={config.fontFamily} onChange={(e) => patch("fontFamily", e.target.value as TigerThemeConfig['fontFamily'])}><option value="system">System</option><option value="rounded">Rounded</option><option value="mono">Monospace</option><option value="serif">Serif</option></select></label><label>Messages<select value={config.messageStyle} onChange={(e) => patch("messageStyle", e.target.value as TigerThemeConfig['messageStyle'])}><option value="bubbles">Bubbles</option><option value="flat">Flat</option><option value="minimal">Minimal</option></select></label><label>Composer<select value={config.composerStyle} onChange={(e) => patch("composerStyle", e.target.value as TigerThemeConfig['composerStyle'])}><option value="floating">Floating</option><option value="attached">Attached</option><option value="minimal">Minimal</option></select></label></div><div className="v13-toggle-grid"><label><input type="checkbox" checked={config.glass} onChange={(e) => patch("glass", e.target.checked)} /> Glass blur</label><label><input type="checkbox" checked={config.shadows} onChange={(e) => patch("shadows", e.target.checked)} /> Shadows</label><label><input type="checkbox" checked={config.animations} onChange={(e) => patch("animations", e.target.checked)} /> Motion</label></div></div>

      <div className="tiger-card"><button className="v13-disclosure" onClick={() => setAdvanced((value) => !value)}><span><strong>Advanced custom CSS</strong><small>Optional. Remote assets, imports and executable CSS are blocked.</small></span><b>{advanced ? "−" : "+"}</b></button>{advanced && <><textarea className="v13-css-editor" rows={14} spellCheck={false} value={customCss} onChange={(e) => setCustomCss(e.target.value)} placeholder={'.message-bubble-v5 {\n  border-width: 2px !important;\n}'} /><small className={cssError ? "v13-error" : "muted-copy"}>{cssError || `${customCss.length}/12000 characters · CSS only affects your own Tiger Chat UI.`}</small></>}</div>

      <div className="tiger-card v13-theme-actions"><div><button className="primary-button" disabled={saving || Boolean(cssError)} onClick={() => void save(true)}>{saving ? "Saving…" : "Save & activate"}</button><button className="secondary-button" onClick={() => void duplicate()}>Duplicate</button>{selectedId !== EMPTY_ID && themes.find((theme) => theme.id === selectedId) && <button className="danger-button secondary-danger" onClick={() => void remove(themes.find((theme) => theme.id === selectedId)!)}>Delete</button>}</div><div><button className="secondary-button" onClick={exportCurrent}>Export file</button><button className="secondary-button" onClick={() => void copyTheme()}>Copy JSON</button><label className="secondary-button v13-file-label">Import<input type="file" accept="application/json,.json,.tiger-theme.json" onChange={(event) => void importFile(event)} /></label></div>{message && <p className="tiger-notice">{message}</p>}</div>
    </section>
  </div>;
}
