"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  formatClockTime,
  isFocusActive,
  localDateKey,
  nextClassCountdown,
  rotationDayForDate,
  type BetaFeatureKey,
  type DashboardPreferences,
  type DashboardWidgetKey,
  type FocusModeKind,
  type FocusSession,
  type SchoolClass,
  type SchoolScheduleException,
  type SchoolScheduleSettings,
} from "@/lib/v13-3";

type Conversation = {
  conversation_id: string;
  title: string;
  kind: "dm" | "group";
  unread_count: number;
  favorite: boolean;
  last_message: string | null;
};

type Profile = { display_name: string; username: string; staff_role?: string | null; community_roles?: string[] };

const WIDGET_LABELS: Record<DashboardWidgetKey, string> = {
  messages: "Messages",
  school: "School schedule",
  focus: "Focus Mode",
  quick: "Quick actions",
  beta: "Beta Labs",
};

function defaultFocus(userId: string): FocusSession {
  return { user_id: userId, enabled: false, active_until: null, mode: "favorites", allowed_conversation_ids: [], hide_non_priority: true, mute_notifications: true, label: "Focus" };
}
function defaultSchedule(userId: string): SchoolScheduleSettings {
  return { user_id: userId, enabled: true, schedule_name: "School", anchor_date: localDateKey(), anchor_day: "A", cycle_days: ["A", "B"], skip_weekends: true };
}

export function HomeDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState(0);
  const [saved, setSaved] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardPreferences | null>(null);
  const [focus, setFocus] = useState<FocusSession | null>(null);
  const [schedule, setSchedule] = useState<SchoolScheduleSettings | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [exceptions, setExceptions] = useState<SchoolScheduleException[]>([]);
  const [betaFeatures, setBetaFeatures] = useState<BetaFeatureKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editDashboard, setEditDashboard] = useState(false);
  const [editSchool, setEditSchool] = useState(false);
  const [now, setNow] = useState(new Date());

  const [focusDuration, setFocusDuration] = useState("60");
  const [focusMode, setFocusMode] = useState<FocusModeKind>("favorites");
  const [focusSelected, setFocusSelected] = useState<string[]>([]);
  const [focusHide, setFocusHide] = useState(true);
  const [focusMute, setFocusMute] = useState(true);
  const [focusLabel, setFocusLabel] = useState("Focus");

  const [newClassDay, setNewClassDay] = useState("A");
  const [newClassPeriod, setNewClassPeriod] = useState("");
  const [newClassName, setNewClassName] = useState("");
  const [newClassStart, setNewClassStart] = useState("");
  const [newClassEnd, setNewClassEnd] = useState("");
  const [newClassRoom, setNewClassRoom] = useState("");
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionKind, setExceptionKind] = useState<"no_school" | "force_day">("no_school");
  const [exceptionForcedDay, setExceptionForcedDay] = useState("A");
  const [exceptionNote, setExceptionNote] = useState("");

  async function load(currentUserId?: string) {
    const id = currentUserId || userId;
    if (!id) return;
    const [profileResult, convResult, memberResult, requestResult, savedResult, dashboardResult, focusResult, scheduleResult, classResult, exceptionResult, betaResult] = await Promise.all([
      supabase.from("profiles").select("display_name,username,staff_role,community_roles").eq("id", id).single(),
      supabase.rpc("get_my_conversations"),
      supabase.from("conversation_members").select("conversation_id,favorite").eq("user_id", id),
      supabase.from("dm_requests").select("id", { count: "exact", head: true }).eq("recipient_id", id).eq("status", "pending"),
      supabase.from("saved_messages").select("message_id", { count: "exact", head: true }).eq("user_id", id),
      supabase.from("dashboard_preferences").select("user_id,widget_order,hidden_widgets,updated_at").eq("user_id", id).maybeSingle(),
      supabase.from("focus_sessions").select("user_id,enabled,active_until,mode,allowed_conversation_ids,hide_non_priority,mute_notifications,label,updated_at").eq("user_id", id).maybeSingle(),
      supabase.from("school_schedule_settings").select("user_id,enabled,schedule_name,anchor_date,anchor_day,cycle_days,skip_weekends,updated_at").eq("user_id", id).maybeSingle(),
      supabase.from("school_schedule_classes").select("id,user_id,cycle_day,period_label,class_name,start_time,end_time,room,position").eq("user_id", id).order("cycle_day").order("position"),
      supabase.from("school_schedule_exceptions").select("id,user_id,exception_date,kind,forced_day,note").eq("user_id", id).order("exception_date"),
      supabase.from("user_beta_preferences").select("enabled_features").eq("user_id", id).maybeSingle(),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (convResult.error) throw convResult.error;
    const favorites = new Map((memberResult.data ?? []).map((row: any) => [String(row.conversation_id), Boolean(row.favorite)]));
    const convs = ((convResult.data ?? []) as any[]).map((row) => ({
      conversation_id: String(row.conversation_id),
      title: String(row.title ?? row.name ?? row.username ?? "Conversation"),
      kind: row.kind === "group" ? "group" as const : "dm" as const,
      unread_count: Number(row.unread_count ?? 0),
      favorite: favorites.get(String(row.conversation_id)) || false,
      last_message: typeof row.last_message === "string" ? row.last_message : null,
    }));
    setProfile(profileResult.data as Profile);
    setConversations(convs);
    setRequests(requestResult.count ?? 0);
    setSaved(savedResult.count ?? 0);
    setDashboard((dashboardResult.data as DashboardPreferences | null) ?? { user_id: id, widget_order: DEFAULT_DASHBOARD_WIDGETS, hidden_widgets: [] });
    const focusValue = (focusResult.data as FocusSession | null) ?? defaultFocus(id);
    setFocus(focusValue);
    setFocusMode(focusValue.mode);
    setFocusSelected(focusValue.allowed_conversation_ids ?? []);
    setFocusHide(focusValue.hide_non_priority);
    setFocusMute(focusValue.mute_notifications);
    setFocusLabel(focusValue.label || "Focus");
    setSchedule((scheduleResult.data as SchoolScheduleSettings | null) ?? defaultSchedule(id));
    setClasses((classResult.data ?? []) as SchoolClass[]);
    setExceptions((exceptionResult.data ?? []) as SchoolScheduleException[]);
    setBetaFeatures((((betaResult.data as any)?.enabled_features ?? []) as BetaFeatureKey[]));
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/"); return; }
      if (cancelled) return;
      setUserId(data.user.id);
      try { await load(data.user.id); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Could not load Home."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", refresh);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const betaEligible = Boolean(profile?.staff_role === "owner" || profile?.staff_role === "admin" || profile?.community_roles?.includes("beta_tester"));
  const focusActive = isFocusActive(focus, now.getTime());
  const totalUnread = conversations.reduce((sum, item) => sum + item.unread_count, 0);
  const unreadConversations = conversations.filter((item) => item.unread_count > 0).sort((a, b) => b.unread_count - a.unread_count).slice(0, 5);
  const todayRotation = rotationDayForDate(schedule, exceptions, now);
  const todayClasses = classes.filter((item) => item.cycle_day === todayRotation).sort((a, b) => a.position - b.position);
  const classCountdown = betaFeatures.includes("schedule_countdown") && todayRotation ? nextClassCountdown(todayClasses, now) : null;
  const widgetOrder = dashboard?.widget_order?.length ? dashboard.widget_order : DEFAULT_DASHBOARD_WIDGETS;
  const hidden = new Set(dashboard?.hidden_widgets ?? []);
  const shownWidgets = widgetOrder.filter((key) => !hidden.has(key) && (key !== "beta" || betaEligible));

  function focusRemaining() {
    if (!focusActive || !focus?.active_until) return focusActive ? "Until you turn it off" : "Off";
    const minutes = Math.max(1, Math.ceil((new Date(focus.active_until).getTime() - now.getTime()) / 60000));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m remaining` : `${minutes}m remaining`;
  }

  async function saveDashboard(next: DashboardPreferences) {
    setDashboard(next);
    const { error } = await supabase.from("dashboard_preferences").upsert({ ...next, updated_at: new Date().toISOString() });
    if (error) setMessage(error.message);
  }
  function moveWidget(key: DashboardWidgetKey, direction: -1 | 1) {
    if (!dashboard) return;
    const order = [...widgetOrder]; const index = order.indexOf(key); const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    void saveDashboard({ ...dashboard, widget_order: order });
  }
  function toggleWidget(key: DashboardWidgetKey) {
    if (!dashboard) return;
    const nextHidden = new Set(dashboard.hidden_widgets ?? []);
    if (nextHidden.has(key)) nextHidden.delete(key); else nextHidden.add(key);
    void saveDashboard({ ...dashboard, hidden_widgets: [...nextHidden] as DashboardWidgetKey[] });
  }

  async function startFocus() {
    if (!userId) return;
    if (focusMode === "selected" && focusSelected.length === 0) { setMessage("Choose at least one conversation for Selected chats mode."); return; }
    const duration = Number(focusDuration);
    const activeUntil = duration > 0 ? new Date(Date.now() + duration * 60_000).toISOString() : null;
    const row: FocusSession = { user_id: userId, enabled: true, active_until: activeUntil, mode: focusMode, allowed_conversation_ids: focusSelected, hide_non_priority: focusHide, mute_notifications: focusMute, label: focusLabel.trim() || "Focus" };
    const { error } = await supabase.from("focus_sessions").upsert({ ...row, updated_at: new Date().toISOString() });
    if (error) { setMessage(error.message); return; }
    setFocus(row); window.dispatchEvent(new CustomEvent("tiger-focus-updated")); setMessage("Focus Mode started.");
  }
  async function endFocus() {
    if (!userId) return;
    const { error } = await supabase.from("focus_sessions").upsert({ ...(focus ?? defaultFocus(userId)), user_id: userId, enabled: false, active_until: null, updated_at: new Date().toISOString() });
    if (error) { setMessage(error.message); return; }
    setFocus((current) => current ? { ...current, enabled: false, active_until: null } : defaultFocus(userId)); window.dispatchEvent(new CustomEvent("tiger-focus-updated"));
  }

  async function saveScheduleSettings(next: SchoolScheduleSettings) {
    setSchedule(next);
    const { error } = await supabase.from("school_schedule_settings").upsert({ ...next, updated_at: new Date().toISOString() });
    if (error) setMessage(error.message); else setMessage("School schedule saved.");
  }
  async function addClass() {
    if (!userId || !newClassName.trim()) return;
    const position = Math.max(-1, ...classes.filter((item) => item.cycle_day === newClassDay).map((item) => item.position)) + 1;
    const { error } = await supabase.from("school_schedule_classes").insert({ user_id: userId, cycle_day: newClassDay, period_label: newClassPeriod.trim(), class_name: newClassName.trim(), start_time: newClassStart || null, end_time: newClassEnd || null, room: newClassRoom.trim(), position });
    if (error) { setMessage(error.message); return; }
    setNewClassPeriod(""); setNewClassName(""); setNewClassStart(""); setNewClassEnd(""); setNewClassRoom(""); await load();
  }
  async function deleteClass(id: string) { await supabase.from("school_schedule_classes").delete().eq("id", id).eq("user_id", userId); await load(); }
  async function addException() {
    if (!exceptionDate) return;
    const { error } = await supabase.from("school_schedule_exceptions").upsert({ user_id: userId, exception_date: exceptionDate, kind: exceptionKind, forced_day: exceptionKind === "force_day" ? exceptionForcedDay : null, note: exceptionNote.trim() }, { onConflict: "user_id,exception_date" });
    if (error) { setMessage(error.message); return; }
    setExceptionDate(""); setExceptionNote(""); await load();
  }
  async function deleteException(id: string) { await supabase.from("school_schedule_exceptions").delete().eq("id", id).eq("user_id", userId); await load(); }

  const widgetNodes: Record<DashboardWidgetKey, ReactNode> = {
    focus: <section className="tiger-card v133-focus-card"><div className="v133-card-heading"><div><p className="v12-kicker">Focus Mode</p><h2>{focusActive ? focus?.label || "Focus" : "Cut the noise"}</h2></div><span className={`v133-state-pill ${focusActive ? "active" : ""}`}>{focusActive ? "ON" : "OFF"}</span></div>{focusActive ? <><p className="v133-focus-time">{focusRemaining()}</p><p className="muted-copy">{focus?.mode === "favorites" ? "Only favorite chats stay visible." : focus?.mode === "selected" ? "Only selected chats stay visible." : "Inbox stays visible; notifications are muted."}</p><button className="primary-button" onClick={() => void endFocus()}>End Focus</button></> : <div className="v133-focus-form"><label>Label<input value={focusLabel} maxLength={32} onChange={(e) => setFocusLabel(e.target.value)} /></label><div className="v133-inline-fields"><label>Duration<select value={focusDuration} onChange={(e) => setFocusDuration(e.target.value)}><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option><option value="0">Until I turn it off</option></select></label><label>Priority<select value={focusMode} onChange={(e) => setFocusMode(e.target.value as FocusModeKind)}><option value="favorites">Favorites only</option><option value="selected">Selected chats</option><option value="mute_only">Mute only</option></select></label></div>{focusMode === "selected" && <div className="v133-chat-picks">{conversations.map((conversation) => <label key={conversation.conversation_id}><input type="checkbox" checked={focusSelected.includes(conversation.conversation_id)} onChange={(e) => setFocusSelected((current) => e.target.checked ? [...new Set([...current, conversation.conversation_id])] : current.filter((id) => id !== conversation.conversation_id))} /><span>{conversation.kind === "group" ? "👥" : "💬"} {conversation.title}</span></label>)}</div>}<label className="v133-check"><input type="checkbox" checked={focusHide} onChange={(e) => setFocusHide(e.target.checked)} />Hide non-priority conversations</label><label className="v133-check"><input type="checkbox" checked={focusMute} onChange={(e) => setFocusMute(e.target.checked)} />Mute non-priority notifications</label><button className="primary-button" onClick={() => void startFocus()}>Start Focus</button></div>}</section>,
    school: <section className="tiger-card v133-school-card"><div className="v133-card-heading"><div><p className="v12-kicker">{schedule?.schedule_name || "School"}</p><h2>{todayRotation ? `${todayRotation} Day` : "No school today"}</h2>{classCountdown && <small className="v133-countdown">{classCountdown}</small>}</div><button className="secondary-button" onClick={() => setEditSchool((value) => !value)}>{editSchool ? "Done" : "Edit"}</button></div>{todayRotation && <div className="v133-class-list">{todayClasses.length === 0 ? <p className="muted-copy">No classes have been added for {todayRotation} Day yet.</p> : todayClasses.map((item) => <div className="v133-class-row" key={item.id}><span className="v133-period">{item.period_label || todayRotation}</span><div><strong>{item.class_name}</strong><small>{[item.start_time ? formatClockTime(item.start_time) : "", item.room].filter(Boolean).join(" · ")}</small></div></div>)}</div>}{editSchool && schedule && <div className="v133-school-editor"><div className="v133-inline-fields"><label>Schedule name<input value={schedule.schedule_name} maxLength={40} onChange={(e) => setSchedule((current) => current ? { ...current, schedule_name: e.target.value } : current)} /></label><label>Anchor date<input type="date" value={schedule.anchor_date} onChange={(e) => setSchedule((current) => current ? { ...current, anchor_date: e.target.value } : current)} /></label><label>Anchor day<select value={schedule.anchor_day} onChange={(e) => setSchedule((current) => current ? { ...current, anchor_day: e.target.value as "A" | "B" } : current)}><option>A</option><option>B</option></select></label></div><button className="secondary-button" onClick={() => { if (schedule) void saveScheduleSettings(schedule); }}>Save rotation</button><h3>Classes</h3><div className="v133-add-class"><select value={newClassDay} onChange={(e) => setNewClassDay(e.target.value)}><option>A</option><option>B</option></select><input value={newClassPeriod} onChange={(e) => setNewClassPeriod(e.target.value)} placeholder="Period" maxLength={24}/><input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="Class name" maxLength={80}/><input type="time" value={newClassStart} onChange={(e) => setNewClassStart(e.target.value)}/><input type="time" value={newClassEnd} onChange={(e) => setNewClassEnd(e.target.value)}/><input value={newClassRoom} onChange={(e) => setNewClassRoom(e.target.value)} placeholder="Room" maxLength={40}/><button className="primary-button" onClick={() => void addClass()}>Add</button></div><div className="v133-editor-list">{classes.map((item) => <div key={item.id}><span><strong>{item.cycle_day} · {item.period_label || "Class"}</strong> {item.class_name}</span><button className="text-button danger-text" onClick={() => void deleteClass(item.id)}>Delete</button></div>)}</div><h3>Schedule exceptions</h3><p className="muted-copy">Add holidays/no-school dates so the A/B rotation stays correct, or force a specific day after a schedule change.</p><div className="v133-exception-form"><input type="date" value={exceptionDate} onChange={(e) => setExceptionDate(e.target.value)}/><select value={exceptionKind} onChange={(e) => setExceptionKind(e.target.value as "no_school" | "force_day")}><option value="no_school">No school</option><option value="force_day">Force cycle day</option></select>{exceptionKind === "force_day" && <select value={exceptionForcedDay} onChange={(e) => setExceptionForcedDay(e.target.value)}><option>A</option><option>B</option></select>}<input value={exceptionNote} onChange={(e) => setExceptionNote(e.target.value)} placeholder="Note (optional)" maxLength={80}/><button className="secondary-button" onClick={() => void addException()}>Add exception</button></div><div className="v133-editor-list">{exceptions.map((item) => <div key={item.id}><span><strong>{item.exception_date}</strong> · {item.kind === "no_school" ? "No school" : `Force ${item.forced_day} Day`} {item.note ? `· ${item.note}` : ""}</span><button className="text-button danger-text" onClick={() => void deleteException(item.id)}>Delete</button></div>)}</div></div>}</section>,
    messages: <section className="tiger-card"><div className="v133-card-heading"><div><p className="v12-kicker">Messages</p><h2>{totalUnread ? `${totalUnread} unread` : "You're caught up"}</h2></div><Link className="secondary-button" href="/chat">Open chat</Link></div>{unreadConversations.length ? <div className="v133-message-list">{unreadConversations.map((item) => <Link key={item.conversation_id} href={`/chat?conversation=${item.conversation_id}`}><span><strong>{item.title}</strong><small>{item.last_message || "New message"}</small></span><b>{item.unread_count}</b></Link>)}</div> : <p className="muted-copy">No unread conversations right now.</p>}<div className="v133-mini-stats"><span><strong>{requests}</strong><small>Requests</small></span><span><strong>{saved}</strong><small>Saved</small></span><span><strong>{conversations.filter((item) => item.favorite).length}</strong><small>Favorites</small></span></div></section>,
    quick: <section className="tiger-card"><p className="v12-kicker">Quick actions</p><h2>Jump back in</h2><div className="v133-quick-grid"><Link href="/chat">◫<span>Messages</span></Link><Link href="/community">◇<span>Community</span></Link><Link href="/customize">✦<span>Customize</span></Link><Link href="/support">☆<span>Support</span></Link>{profile?.staff_role && <Link href="/moderation">⌾<span>Moderation</span></Link>}</div></section>,
    beta: <section className="tiger-card v133-beta-card"><p className="v12-kicker">Beta Tester</p><h2>Beta Labs</h2><p>Opt into working experiments before they become default Tiger Chat features.</p><Link className="primary-button" href="/labs">Open Beta Labs</Link></section>,
  };

  if (loading) return <main className="tiger-v12-page"><div className="v12-loading-card">Loading Home…</div></main>;

  return <main className={`tiger-v12-page v133-home ${betaFeatures.includes("compact_home") ? "v133-home-compact" : ""}`}>
    <header className="v12-page-header v133-home-header"><div><p className="v12-kicker">Tiger Chat Home</p><h1>{profile?.display_name ? `Hey, ${profile.display_name}` : "Home"}</h1><p>{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} · everything important in one place.</p></div><button className="secondary-button" onClick={() => setEditDashboard((value) => !value)}>{editDashboard ? "Done editing" : "Customize dashboard"}</button></header>
    {editDashboard && dashboard && <section className="tiger-card v133-dashboard-editor"><div><h2>Dashboard widgets</h2><p className="muted-copy">Show, hide and reorder Home without changing anyone else's layout.</p></div><div className="v133-widget-editor-list">{widgetOrder.map((key, index) => <div key={key}><label><input type="checkbox" checked={!hidden.has(key)} onChange={() => toggleWidget(key)} />{WIDGET_LABELS[key]}</label><span><button disabled={index === 0} onClick={() => moveWidget(key, -1)}>↑</button><button disabled={index === widgetOrder.length - 1} onClick={() => moveWidget(key, 1)}>↓</button></span></div>)}</div></section>}
    <div className="v133-dashboard-grid">{shownWidgets.map((key) => <div className={`v133-widget v133-widget-${key}`} key={key}>{widgetNodes[key]}</div>)}</div>
    {message && <button className="notice-toast-v8" onClick={() => setMessage("")}>{message} ×</button>}
  </main>;
}
