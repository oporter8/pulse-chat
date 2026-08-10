import type { ReactNode, SVGProps } from "react";

export type TigerIconName =
  | "home"
  | "chat"
  | "community"
  | "appearance"
  | "support"
  | "labs"
  | "moderation"
  | "focus"
  | "school"
  | "messages"
  | "settings"
  | "shield"
  | "calendar"
  | "heart"
  | "users"
  | "flask";

type Props = SVGProps<SVGSVGElement> & { name: TigerIconName };

export function TigerIcon({ name, ...props }: Props) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<TigerIconName, ReactNode> = {
    home: <><path d="M3.5 10.4 12 3.5l8.5 6.9"/><path d="M5.7 9.4v10.1h12.6V9.4"/><path d="M9.6 19.5v-5.4h4.8v5.4"/></>,
    chat: <><path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.2L7 20.5v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/><path d="M7.5 10.1h9M7.5 13.4h6"/></>,
    community: <><circle cx="8" cy="8.2" r="2.8"/><circle cx="16.5" cy="9" r="2.3"/><path d="M2.8 19c.5-3.6 2.5-5.4 5.2-5.4s4.7 1.8 5.2 5.4"/><path d="M13.7 14.4c.8-.6 1.7-.9 2.8-.9 2.4 0 4.1 1.5 4.7 4.5"/></>,
    appearance: <><circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/></>,
    support: <><path d="M12 20.3S4.5 16 4.5 9.8A4.3 4.3 0 0 1 12 6.9a4.3 4.3 0 0 1 7.5 2.9c0 6.2-7.5 10.5-7.5 10.5Z"/></>,
    labs: <><path d="M9 3.5h6M10 3.5v5.2l-5 8.7a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8.7V3.5"/><path d="M7.7 15h8.6"/></>,
    moderation: <><path d="M12 3.2 19 6v5.1c0 4.5-2.7 7.8-7 9.7-4.3-1.9-7-5.2-7-9.7V6l7-2.8Z"/><path d="m8.8 12 2.1 2.1 4.4-4.4"/></>,
    focus: <><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/></>,
    school: <><path d="m3 8 9-4.5L21 8l-9 4.5L3 8Z"/><path d="M6.5 10v5.4c2.8 2 8.2 2 11 0V10M21 8v6"/></>,
    messages: <><path d="M4.5 5h15A1.5 1.5 0 0 1 21 6.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5.5 3v-3.5A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5Z"/></>,
    settings: <><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.8 7.8 0 0 0 .1-3l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L14.2 2h-4.4l-.4 3.1A8 8 0 0 0 6.9 6.6l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 .1 3l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2.5 1.5l.4 3.1h4.4l.4-3.1a8 8 0 0 0 2.5-1.5l2.4 1 2-3.4-2.2-1.5Z"/></>,
    shield: <><path d="M12 3.2 19 6v5.1c0 4.5-2.7 7.8-7 9.7-4.3-1.9-7-5.2-7-9.7V6l7-2.8Z"/></>,
    calendar: <><rect x="3.5" y="5.2" width="17" height="15" rx="2"/><path d="M7.5 3v4.2M16.5 3v4.2M3.5 9h17M7.5 12.8h3M13.5 12.8h3M7.5 16h3"/></>,
    heart: <><path d="M12 20.3S4.5 16 4.5 9.8A4.3 4.3 0 0 1 12 6.9a4.3 4.3 0 0 1 7.5 2.9c0 6.2-7.5 10.5-7.5 10.5Z"/></>,
    users: <><circle cx="8" cy="8.2" r="2.8"/><circle cx="16.5" cy="9" r="2.3"/><path d="M2.8 19c.5-3.6 2.5-5.4 5.2-5.4s4.7 1.8 5.2 5.4"/><path d="M13.7 14.4c.8-.6 1.7-.9 2.8-.9 2.4 0 4.1 1.5 4.7 4.5"/></>,
    flask: <><path d="M9 3.5h6M10 3.5v5.2l-5 8.7a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8.7V3.5"/><path d="M7.7 15h8.6"/></>,
  };

  return <svg {...common} {...props}>{paths[name]}</svg>;
}
