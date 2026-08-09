"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import type { DmPrivacy, MyProfile, Profile, Report, Theme } from "@/lib/chat-types";
import type { DevicePushState } from "@/lib/push-client";
import { Avatar } from "@/components/chat/Avatar";
import { formatDateTime } from "@/lib/chat-utils";

type PreferenceValues = {
  dmPrivacy: DmPrivacy;
  showReadReceipts: boolean;
  showOnlineStatus: boolean;
  notificationsEnabled: boolean;
  notificationPreview: boolean;
};

type SettingsModalProps = {
  open: boolean;
  profile: MyProfile;
  email: string;
  theme: Theme;
  blockedProfiles: Profile[];
  isAdmin: boolean;
  reports: Report[];
  pushState: DevicePushState;
  onClose: () => void;
  onThemeChange: (theme: Theme) => void;
  onSaveProfile: (values: {
    username: string;
    displayName: string;
    bio: string;
    avatarFile: File | null;
  }) => Promise<void>;
  onSavePreferences: (values: PreferenceValues) => Promise<void>;
  onEnableDevicePush: () => Promise<void>;
  onDisableDevicePush: () => Promise<void>;
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
  pushState,
  onClose,
  onThemeChange,
  onSaveProfile,
  onSavePreferences,
  onEnableDevicePush,
  onDisableDevicePush,
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
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [pushWorking, setPushWorking] = useState(false);
  const [tab, setTab] = useState<"profile" | "privacy" | "notifications" | "moderation">("profile");

  const [dmPrivacy, setDmPrivacy] = useState<DmPrivacy>(profile.dm_privacy);
  const [showReadReceipts, setShowReadReceipts] = useState(profile.show_read_receipts);
  const [showOnlineStatus, setShowOnlineStatus] = useState(profile.show_online_status);
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile.notifications_enabled);
  const [notificationPreview, setNotificationPreview] = useState(profile.notification_preview);

  useEffect(() => {
    if (!open) return;
    setUsername(profile.username);
    setDisplayName(profile.display_name);
    setBio(profile.bio);
    setAvatarFile(null);
    setAvatarPreview(null);
    setMessage("");
    setTab("profile");
    setDmPrivacy(profile.dm_privacy);
    setShowReadReceipts(profile.show_read_receipts);
    setShowOnlineStatus(profile.show_online_status);
    setNotificationsEnabled(profile.notifications_enabled);
    setNotificationPreview(profile.notification_preview);
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

  async function submitProfile(event: FormEvent) {
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

  async function savePreferences() {
    setSavingPreferences(true);
    setMessage("");
    try {
      await onSavePreferences({
        dmPrivacy,
        showReadReceipts,
        showOnlineStatus,
        notificationsEnabled,
        notificationPreview,
      });
      setMessage("Preferences saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save preferences.");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function toggleDevicePush() {
    setPushWorking(true);
    setMessage("");
    try {
      if (pushState.enabled) await onDisableDevicePush();
      else await onEnableDevicePush();
      setMessage(pushState.enabled ? "Notifications disabled on this device." : "Notifications enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change notification access.");
    } finally {
      setPushWorking(false);
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
            <p>Profile, privacy, notifications, appearance, and moderation.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">×</button>
        </div>

        <div className="settings-layout">
          <nav className="settings-tabs" aria-label="Settings sections">
            <button type="button" className={tab === "profile" ? "active" : ""} onClick={() => { setTab("profile"); setMessage(""); }}>Profile</button>
            <button type="button" className={tab === "privacy" ? "active" : ""} onClick={() => { setTab("privacy"); setMessage(""); }}>Privacy</button>
            <button type="button" className={tab === "notifications" ? "active" : ""} onClick={() => { setTab("notifications"); setMessage(""); }}>Notifications</button>
            {isAdmin && (
              <button type="button" className={tab === "moderation" ? "active" : ""} onClick={() => { setTab("moderation"); setMessage(""); }}>Moderation</button>
            )}
          </nav>

          <div className="settings-content">
            {tab === "profile" && (
              <form className="stack-form" onSubmit={submitProfile}>
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
              <div className="settings-section-v5 preference-stack-v6">
                <div>
                  <h3>Direct messages</h3>
                  <p className="muted-copy">Choose who can create a brand-new DM with you. Existing conversations still work unless someone is blocked.</p>
                  <label className="setting-select-row">
                    <span><strong>Who can start a DM?</strong><small>Controls new conversations.</small></span>
                    <select value={dmPrivacy} onChange={(event) => setDmPrivacy(event.target.value as DmPrivacy)}>
                      <option value="everyone">Everyone</option>
                      <option value="mutual_groups">People in shared groups</option>
                      <option value="nobody">Nobody</option>
                    </select>
                  </label>
                </div>

                <div className="setting-toggle-list">
                  <label className="setting-toggle-row">
                    <span><strong>Read receipts</strong><small>Let other members see when you have read their messages.</small></span>
                    <input type="checkbox" checked={showReadReceipts} onChange={(event) => setShowReadReceipts(event.target.checked)} />
                  </label>
                  <label className="setting-toggle-row">
                    <span><strong>Online status</strong><small>Show your live online indicator while Pulse is open.</small></span>
                    <input type="checkbox" checked={showOnlineStatus} onChange={(event) => setShowOnlineStatus(event.target.checked)} />
                  </label>
                </div>

                <div>
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

                {message && <p className="inline-status" aria-live="polite">{message}</p>}
                <div className="modal-actions">
                  <button type="button" className="primary-button" onClick={() => void savePreferences()} disabled={savingPreferences}>
                    {savingPreferences ? "Saving…" : "Save privacy"}
                  </button>
                </div>
              </div>
            )}

            {tab === "notifications" && (
              <div className="settings-section-v5 preference-stack-v6">
                <div>
                  <h3>Message notifications</h3>
                  <p className="muted-copy">Web Push can alert this device even when Pulse is not the active tab.</p>
                </div>

                <div className="setting-toggle-list">
                  <label className="setting-toggle-row">
                    <span><strong>Notifications globally</strong><small>Master switch for all of your registered devices.</small></span>
                    <input type="checkbox" checked={notificationsEnabled} onChange={(event) => setNotificationsEnabled(event.target.checked)} />
                  </label>
                  <label className="setting-toggle-row">
                    <span><strong>Show message previews</strong><small>Turn this off to show only “New message” in notifications.</small></span>
                    <input type="checkbox" checked={notificationPreview} onChange={(event) => setNotificationPreview(event.target.checked)} />
                  </label>
                </div>

                <div className="device-notification-card">
                  <div>
                    <strong>This device</strong>
                    <small>
                      {!pushState.supported
                        ? "Push is not supported here."
                        : pushState.enabled
                          ? "Push notifications are enabled."
                          : pushState.permission === "denied"
                            ? "Notifications are blocked in browser settings."
                            : "Push notifications are not enabled yet."}
                    </small>
                  </div>
                  <button
                    type="button"
                    className={pushState.enabled ? "secondary-button" : "primary-button"}
                    disabled={!pushState.supported || pushWorking || pushState.permission === "denied"}
                    onClick={() => void toggleDevicePush()}
                  >
                    {pushWorking ? "Working…" : pushState.enabled ? "Disable on this device" : "Enable on this device"}
                  </button>
                </div>

                {message && <p className="inline-status" aria-live="polite">{message}</p>}
                <div className="modal-actions">
                  <button type="button" className="primary-button" onClick={() => void savePreferences()} disabled={savingPreferences}>
                    {savingPreferences ? "Saving…" : "Save notification settings"}
                  </button>
                </div>
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
