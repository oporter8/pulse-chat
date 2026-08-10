import type { CommunityRole, StaffRole } from "@/lib/chat-types";

const COMMUNITY: Record<CommunityRole, { label: string; icon: string; className: string }> = {
  beta_tester: { label: "Beta Tester", icon: "β", className: "beta" },
  developer: { label: "Developer", icon: "⌘", className: "developer" },
  helper: { label: "Helper", icon: "✦", className: "helper" },
  contributor: { label: "Contributor", icon: "+", className: "contributor" },
  event_team: { label: "Event Team", icon: "◇", className: "event" },
  verified: { label: "Verified", icon: "✓", className: "verified" },
};
const STAFF: Record<Exclude<StaffRole, null>, { label: string; className: string }> = {
  owner: { label: "Owner", className: "owner" },
  admin: { label: "Admin", className: "admin" },
  moderator: { label: "Moderator", className: "moderator" },
};

export function RoleBadges({ staffRole=null, communityRoles=[], compact=false, hideOwner=false }: { staffRole?: StaffRole; communityRoles?: CommunityRole[]; compact?: boolean; hideOwner?: boolean }) {
  const staff = staffRole && !(hideOwner && staffRole === "owner") ? STAFF[staffRole] : null;
  if (!staff && communityRoles.length === 0) return null;
  return <span className={`tiger-role-badges ${compact ? "compact" : ""}`}>
    {staff && <span className={`tiger-role-badge staff ${staff.className}`}>{staff.label}</span>}
    {communityRoles.map((role) => {
      const item = COMMUNITY[role];
      return item ? <span key={role} className={`tiger-role-badge community ${item.className}`} title={item.label}><b>{item.icon}</b>{compact ? null : item.label}</span> : null;
    })}
  </span>;
}

export const COMMUNITY_ROLE_OPTIONS = Object.entries(COMMUNITY).map(([value, item]) => ({ value: value as CommunityRole, ...item }));
