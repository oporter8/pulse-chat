"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import type { Profile, Report, Theme } from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";
import { formatDateTime } from "@/lib/chat-utils";

type SettingsModalProps = {
  open: boolean;
  profile: Profile;
  email: string;
  theme: Theme;
  blockedProfiles: Profile[];
  isAdmin: boolean;
  reports: Report[];
  onClose: () => void;
  onThemeChange: (theme: Theme) => void;
  onSaveProfile: (values: {
    username: string;
    displayName: string;
    bio: string;
    avatarFile: File | null;
  }) => Promise<void>;
  onUnblock: (userId: string) => Promise<void>;
  onUpdateReport: (reportId: string, status: "resolved" | "dismissed") => Promise<void>;
  onSignOut: () => Promise<void>;
};

export function SettingsModal({
  open,
  profile,
  email,
  theme,
  blockedProfiles,
  isAdmin,
  reports,
  onClose,
  onThemeChange,
  onSaveProfile,
  onUnblock,
  onUpdateReport,
  onSignOut,
}: SettingsModalProps) {
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"profile" | "privacy" | "moderation">("profile");

  useEffect(() => {
    if (!open) return;
    setUsername(profile.username);
    setDisplayName(profile.display_name);
    setBio(profile.bio);
    setAvatarFile(null);
    setAvatarPreview(null);
    setMessage("");
    setTab("profile");
  }, [open, profile]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  if (!open) return null;

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("Profile pictures must be an image.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage("Profile pictures must be 2 MB or smaller.");
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setMessage("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setMessage("Username must be 3–20 characters using letters, numbers, or underscores.");
      return;
    }

    if (cleanDisplayName.length < 1 || cleanDisplayName.length > 40) {
      setMessage("Display name must be 1–40 characters.");
      return;
    }

    setSaving(true);
    try {
      await onSaveProfile({
        username: cleanUsername,
        displayName: cleanDisplayName,
        bio: bio.trim(),
        avatarFile,
      });
      setAvatarFile(null);
      setAvatarPreview(null);
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="modal-card settings-modal-v5" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-heading">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Profile, appearance, privacy, and moderation.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">×</button>
        </div>

        <div className="settings-layout">
          <nav className="settings-tabs" aria-label="Settings sections">
            <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button>
            <button type="button" className={tab === "privacy" ? "active" : ""} onClick={() => setTab("privacy")}>Privacy</button>
            {isAdmin && (
              <button type="button" className={tab === "moderation" ? "active" : ""} onClick={() => setTab("moderation")}>Moderation</button>
            )}
          </nav>

          <div className="settings-content">
            {tab === "profile" && (
              <form className="stack-form" onSubmit={submit}>
                <div className="profile-editor-header">
                  {avatarPreview ? (
                    <span className="avatar-wrap avatar-large"><span className="avatar"><img src={avatarPreview} alt="New profile preview" /></span></span>
                  ) : (
                    <Avatar name={profile.display_name || profile.username} path={profile.avatar_path} size="large" />
                  )}
                  <label className="file-button">
                    Change photo
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={chooseAvatar} />
                  </label>
                </div>

                <div className="two-column-fields">
                  <label>
                    Display name
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} />
                  </label>

                  <label>
                    Username
                    <input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} autoComplete="username" />
                  </label>
                </div>

                <label>
                  Bio
                  <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} rows={3} placeholder="A short bio" />
                  <small>{bio.length}/160</small>
                </label>

                <label>
                  Email
                  <input value={email} disabled />
                </label>

                <label>
                  Theme
                  <select value={theme} onChange={(event) => onThemeChange(event.target.value as Theme)}>
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </label>

                {message && <p className="inline-status" aria-live="polite">{message}</p>}

                <div className="modal-actions spread-actions">
                  <button type="button" className="danger-button secondary-danger" onClick={() => void onSignOut()}>Sign out</button>
                  <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
                </div>
              </form>
            )}

            {tab === "privacy" && (
              <div className="settings-section-v5">
                <h3>Blocked users</h3>
                <p className="muted-copy">Blocked people cannot start or continue a direct message with you.</p>
                {blockedProfiles.length === 0 ? (
                  <div className="empty-card">You have not blocked anyone.</div>
                ) : (
                  <div className="settings-list">
                    {blockedProfiles.map((blocked) => (
                      <div className="settings-list-row" key={blocked.id}>
                        <Avatar name={blocked.display_name || blocked.username} path={blocked.avatar_path} size="small" />
                        <span className="grow-copy">
                          <strong>{blocked.display_name}</strong>
                          <small>@{blocked.username}</small>
                        </span>
                        <button type="button" className="secondary-button" onClick={() => void onUnblock(blocked.id)}>Unblock</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "moderation" && isAdmin && (
              <div className="settings-section-v5">
                <h3>Open reports</h3>
                <p className="muted-copy">Only accounts listed in <code>app_admins</code> can access this panel.</p>
                {reports.filter((report) => report.status === "open").length === 0 ? (
                  <div className="empty-card">No open reports.</div>
                ) : (
                  <div className="report-list">
                    {reports.filter((report) => report.status === "open").map((report) => (
                      <article className="report-card" key={report.id}>
                        <div>
                          <strong>{report.reason}</strong>
                          <small>{formatDateTime(report.created_at)}</small>
                        </div>
                        {report.details && <p>{report.details}</p>}
                        <div className="report-actions">
                          <button type="button" className="secondary-button" onClick={() => void onUpdateReport(report.id, "dismissed")}>Dismiss</button>
                          <button type="button" className="primary-button" onClick={() => void onUpdateReport(report.id, "resolved")}>Resolve</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
