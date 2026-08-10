"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { Profile } from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";
import { RoleBadges } from "@/components/v13/RoleBadges";

function relativeLastSeen(value: string | null) {
  if (!value) return "Last seen unavailable";
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return "Active recently";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  return `Active ${Math.floor(hours / 24)}d ago`;
}

type Props = {
  open: boolean;
  profile: Profile | null;
  online?: boolean;
  onClose: () => void;
  onMessage?: () => void;
  onBlock?: () => void;
  blocked?: boolean;
  onReport?: () => void;
};

export function ProfileModal({ open, profile, online = false, onClose, onMessage, onBlock, blocked = false, onReport }: Props) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const link = useMemo(() => {
    if (!profile || typeof window === "undefined") return "";
    return `${window.location.origin}/?user=${encodeURIComponent(profile.username)}`;
  }, [profile]);

  useEffect(() => {
    if (!open || !link) return;
    void QRCode.toDataURL(link, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [link, open]);

  if (!open || !profile) return null;
  const currentProfile = profile;

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  async function share() {
    if (navigator.share) await navigator.share({ title: currentProfile.display_name, text: `Message @${currentProfile.username} on Tiger Chat`, url: link });
    else await copyLink();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card profile-modal-v8" role="dialog" aria-modal="true">
        <div className="modal-heading"><h2>Profile</h2><button className="icon-button" type="button" onClick={onClose}>×</button></div>
        <div className="profile-card-v8">
          <Avatar name={profile.display_name || profile.username} path={profile.avatar_path} size="large" online={online} />
          <div className="profile-card-copy-v8">
            <div className="admin-name-line-v7"><h3>{profile.display_name}</h3>{profile.admin_tag && <span className="admin-badge-v7">{profile.admin_tag}</span>}<RoleBadges staffRole={profile.staff_role} communityRoles={profile.community_roles ?? []} hideOwner={Boolean(profile.admin_tag)} /></div>
            <p>@{profile.username}</p>
            {profile.status_text && <div className="status-pill-v8">{profile.status_text}</div>}
            {profile.bio && <p className="profile-bio-v8">{profile.bio}</p>}
            <small>{online ? "Active now" : relativeLastSeen(profile.last_active_at)}</small>
          </div>
        </div>
        <div className="profile-share-v8">
          {qr && <img src={qr} alt={`QR code for @${profile.username}`} />}
          <div><strong>Profile link</strong><small>{link}</small><div className="inline-button-row-v8"><button type="button" className="secondary-button" onClick={() => void copyLink()}>{copied ? "Copied" : "Copy link"}</button><button type="button" className="secondary-button" onClick={() => void share()}>Share</button></div></div>
        </div>
        <div className="modal-actions spread-actions">
          <div className="inline-button-row-v8">{onBlock && <button type="button" className="secondary-button" onClick={onBlock}>{blocked ? "Unblock" : "Block"}</button>}{onReport && <button type="button" className="secondary-button" onClick={onReport}>Report</button>}</div>
          {onMessage && <button type="button" className="primary-button" onClick={onMessage}>Message</button>}
        </div>
      </section>
    </div>
  );
}
