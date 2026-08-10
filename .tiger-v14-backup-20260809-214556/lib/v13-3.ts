export type DashboardWidgetKey = "messages" | "school" | "focus" | "quick" | "beta";

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetKey[] = ["focus", "school", "messages", "quick", "beta"];

export type DashboardPreferences = {
  user_id: string;
  widget_order: DashboardWidgetKey[];
  hidden_widgets: DashboardWidgetKey[];
  updated_at?: string;
};

export type FocusModeKind = "favorites" | "selected" | "mute_only";
export type FocusSession = {
  user_id: string;
  enabled: boolean;
  active_until: string | null;
  mode: FocusModeKind;
  allowed_conversation_ids: string[];
  hide_non_priority: boolean;
  mute_notifications: boolean;
  label: string;
  updated_at?: string;
};

export type SchoolScheduleSettings = {
  user_id: string;
  enabled: boolean;
  schedule_name: string;
  anchor_date: string;
  anchor_day: "A" | "B";
  cycle_days: string[];
  skip_weekends: boolean;
  updated_at?: string;
};

export type SchoolClass = {
  id: string;
  user_id: string;
  cycle_day: string;
  period_label: string;
  class_name: string;
  start_time: string | null;
  end_time: string | null;
  room: string;
  position: number;
};

export type SchoolScheduleException = {
  id: string;
  user_id: string;
  exception_date: string;
  kind: "no_school" | "force_day";
  forced_day: string | null;
  note: string;
};

export type BetaFeatureKey = "compact_home" | "focus_nav_status" | "schedule_countdown";

export const BETA_FEATURES: Array<{ key: BetaFeatureKey; title: string; description: string }> = [
  { key: "compact_home", title: "Compact Home", description: "Fits more dashboard information on screen with denser cards." },
  { key: "focus_nav_status", title: "Focus status in navigation", description: "Shows an active Focus Mode indicator and countdown in the global navigation." },
  { key: "schedule_countdown", title: "Class countdown", description: "Shows time remaining until the next scheduled class on the School widget." },
];

export function isFocusActive(focus: FocusSession | null | undefined, now = Date.now()) {
  if (!focus?.enabled) return false;
  if (!focus.active_until) return true;
  return new Date(focus.active_until).getTime() > now;
}

export function focusAllowsConversation(
  focus: FocusSession | null | undefined,
  conversation: { conversation_id: string; favorite?: boolean },
  now = Date.now(),
) {
  if (!isFocusActive(focus, now) || focus?.mode === "mute_only") return true;
  if (focus?.mode === "favorites") return Boolean(conversation.favorite);
  return Boolean(focus?.allowed_conversation_ids?.includes(conversation.conversation_id));
}

export function focusAllowsConversationId(
  focus: FocusSession | null | undefined,
  conversationId: string,
  favorite = false,
  now = Date.now(),
) {
  return focusAllowsConversation(focus, { conversation_id: conversationId, favorite }, now);
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, Math.max(0, month - 1), day || 1, 12, 0, 0, 0);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function exceptionForDate(exceptions: SchoolScheduleException[], key: string) {
  return exceptions.find((item) => item.exception_date === key) ?? null;
}

function isSchoolDate(date: Date, settings: SchoolScheduleSettings, exceptions: SchoolScheduleException[]) {
  const key = localDateKey(date);
  const exception = exceptionForDate(exceptions, key);
  if (exception?.kind === "no_school") return false;
  if (exception?.kind === "force_day") return true;
  if (settings.skip_weekends && (date.getDay() === 0 || date.getDay() === 6)) return false;
  return true;
}

export function rotationDayForDate(
  settings: SchoolScheduleSettings | null | undefined,
  exceptions: SchoolScheduleException[],
  target = new Date(),
): string | null {
  if (!settings?.enabled) return null;
  const targetKey = localDateKey(target);
  const targetException = exceptionForDate(exceptions, targetKey);
  if (targetException?.kind === "no_school") return null;
  if (targetException?.kind === "force_day" && targetException.forced_day) return targetException.forced_day;
  if (!isSchoolDate(target, settings, exceptions)) return null;

  const cycle = settings.cycle_days?.length ? settings.cycle_days : ["A", "B"];
  const anchorIndex = Math.max(0, cycle.indexOf(settings.anchor_day));
  const anchor = dateFromKey(settings.anchor_date);
  const targetNoon = dateFromKey(targetKey);
  const direction = targetNoon.getTime() >= anchor.getTime() ? 1 : -1;
  let cursor = new Date(anchor);
  let offset = 0;

  while (localDateKey(cursor) !== targetKey) {
    cursor = addDays(cursor, direction);
    if (isSchoolDate(cursor, settings, exceptions)) offset += direction;
  }

  const index = ((anchorIndex + offset) % cycle.length + cycle.length) % cycle.length;
  return cycle[index];
}

export function formatClockTime(value: string | null | undefined) {
  if (!value) return "";
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function nextClassCountdown(classes: SchoolClass[], now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const next = classes
    .filter((item) => item.start_time)
    .map((item) => {
      const [h, m] = String(item.start_time).split(":").map(Number);
      return { item, minutes: h * 60 + m };
    })
    .filter((entry) => entry.minutes >= nowMinutes)
    .sort((a, b) => a.minutes - b.minutes)[0];
  if (!next) return null;
  const difference = Math.max(0, next.minutes - nowMinutes);
  if (difference < 60) return `${difference}m until ${next.item.class_name}`;
  const hours = Math.floor(difference / 60);
  const minutes = difference % 60;
  return `${hours}h${minutes ? ` ${minutes}m` : ""} until ${next.item.class_name}`;
}
