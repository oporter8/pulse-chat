"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import type { DmPrivacy, MyProfile, NotificationSound, Profile, Report, Theme } from "@/lib/chat-types";
import type { DevicePushState } from "@/lib/push-client";
import { Avatar } from "@/components/chat/Avatar";
import { AdminPanel } from "@/components/chat/AdminPanel";
import { formatDateTime } from "@/lib/chat-utils";
import { SecurityPanel } from "@/components/chat/SecurityPanel";
import { ReportHistory } from "@/components/chat/ReportHistory";
import { cropSquareImage } from "@/lib/image-crop";
import { supabase } from "@/lib/supabase";

type PreferenceValues = {
  dmPrivacy: DmPrivacy;
  showReadReceipts: boolean;
  showOnlineStatus: boolean;
  notificationsEnabled: boolean;
  notificationPreview: boolean;
  notificationSound: NotificationSound;
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
  initialTab?: "profile" | "privacy" | "notifications" | "security" | "moderation";
  onClose: () => void;
  onThemeChange: (theme: Theme) => void;
  onSaveProfile: (values: {
    username: string;
    displayName: string;
    bio: string;
    statusText: string;
    avatarFile: File | null;
  }) => Promise<void>;
  onSavePreferences: (values: PreferenceValues) => Promise<void>;
  onEnableDevicePush: () => Promise<void>;
  onDisableDevicePush: () => Promise<void>;
  onUnblock: (userId: string) => Promise<void>;
  onUpdateReport: (reportId: string, status: "resolved" | "dismissed") => Promise<void>;
  onAdminTagChanged: (tag: string) => void;
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
  initialTab = "profile",
  onClose,
  onThemeChange,
  onSaveProfile,
  onSavePreferences,
  onEnableDevicePush,
  onDisableDevicePush,
  onUnblock,
  onUpdateReport,
  onAdminTagChanged,
  onSignOut,
}: SettingsModalProps) {
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio);
  const [statusText, setStatusText] = useState(profile.status_text);
  const [cropZoom, setCropZoom] = useState(1);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [pushWorking, setPushWorking] = useState(false);
  const [tab, setTab] = useState<"profile" | "privacy" | "notifications" | "security" | "moderation">("profile");

  const [dmPrivacy, setDmPrivacy] = useState<DmPrivacy>(profile.dm_privacy);
  const [showReadReceipts, setShowReadReceipts] = useState(profile.show_read_receipts);
  const [showOnlineStatus, setShowOnlineStatus] = useState(profile.show_online_status);
  const [notificationsEnabled, setNotificationsEnabled] = useState(profile.notifications_enabled);
  const [notificationPreview, setNotificationPreview] = useState(profile.notification_preview);
  const [notificationSound, setNotificationSound] = useState<NotificationSound>(profile.notification_sound);

  useEffect(() => {
    if (!open) return;
    setUsername(profile.username);
    setDisplayName(profile.display_name);
    setBio(profile.bio);
    setStatusText(profile.status_text);
    setCropZoom(1);
    setUsernameAvailable(null);
    setAvatarFile(null);
    setAvatarPreview(null);
    setMessage("");
    setTab(initialTab);
    setDmPrivacy(profile.dm_privacy);
    setShowReadReceipts(profile.show_read_receipts);
    setShowOnlineStatus(profile.show_online_status);
    setNotificationsEnabled(profile.notifications_enabled);
    setNotificationPreview(profile.notification_preview);
    setNotificationSound(profile.notification_sound);
  }, [initialTab, open, profile]);

  useEffect(() => {
    if (!open) return;
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
      setUsernameAvailable(null);
      return;
    }
    if (clean === profile.username) {
      setUsernameAvailable(true);
      return;
    }
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.rpc("username_available", { candidate: clean });
      setUsernameAvailable(Boolean(data));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, profile.username, username]);

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
      let finalAvatar = avatarFile;
      if (finalAvatar) finalAvatar = await cropSquareImage(finalAvatar, cropZoom);
      await onSaveProfile({
        username: cleanUsername,
        displayName: cleanDisplayName,
        bio: bio.trim(),
        statusText: statusText.trim(),
        avatarFile: finalAvatar,
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
        notificationSound,
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
            <button type="button" className={tab === "security" ? "active" : ""} onClick={() => { setTab("security"); setMessage(""); }}>Security</button>
            {isAdmin && (
              <button type="button" className={tab === "moderation" ? "active" : ""} onClick={() => { setTab("moderation"); setMessage(""); }}>Moderation</button>
            )}
          </nav>

          <div className="settings-content">
            {tab === "profile" && (
              <form className="stack-form" onSubmit={submitProfile}>
                <div className="tiger-no-image-profile-note">
                  <strong>🐯 Text-only profile</strong>
                  <span>Tiger Chat v11 uses text-only profiles. Profile photos and image banners are disabled.</span>
                </div>

                <div className="two-column-fields">
                  <label>
                    Display name
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} />
                  </label>

                  <label>
                    Username
                    <input value={username} onChange={(event) => { setUsername(event.target.value); setUsernameAvailable(null); }} maxLength={20} autoComplete="username" />
                    {usernameAvailable !== null && <small className={usernameAvailable ? "availability-good-v8" : "availability-bad-v8"}>{usernameAvailable ? "Username available" : "Username already taken"}</small>}
                  </label>
                </div>

                <label>
                  Status
                  <input value={statusText} onChange={(event) => setStatusText(event.target.value)} maxLength={60} placeholder="At practice, studying, available…" />
                  <small>{statusText.length}/60</small>
                </label>

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
                      <option value="requests">Everyone, but send requests first</option>
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

                <ReportHistory open={open && tab === "privacy"} />

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

                <label className="setting-select-row">
                  <span><strong>Foreground sound</strong><small>Used while Pulse is open. Background web-push sound is controlled by the device/browser.</small></span>
                  <select value={notificationSound} onChange={(event) => setNotificationSound(event.target.value as NotificationSound)}>
                    <option value="default">Default</option><option value="soft">Soft</option><option value="pop">Pop</option><option value="none">None</option>
                  </select>
                </label>

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

            {tab === "security" && (
              <div className="settings-section-v5"><SecurityPanel email={email} onDeleted={() => { void onSignOut(); }} /></div>
            )}

            {tab === "moderation" && isAdmin && (
              <div className="settings-section-v5">
                <div className="v12-moderation-launch">
                  <h3>Moderation Center</h3>
                  <p>Account controls, reports, supporter status, and operating-goal tools now have a full page so nothing is cramped inside Settings.</p>
                  <a className="primary-button" href="/moderation">Open Moderation Center</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
