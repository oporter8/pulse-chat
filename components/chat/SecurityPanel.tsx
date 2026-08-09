"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceKey } from "@/lib/device";
import type { AccountEvent, DeviceSession } from "@/lib/chat-types";
import { formatDateTime } from "@/lib/chat-utils";

type Props = { email: string; onDeleted: () => void };

export function SecurityPanel({ email, onDeleted }: Props) {
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [newEmail, setNewEmail] = useState(email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deleteText, setDeleteText] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const currentKey = getDeviceKey();

  const load = useCallback(async () => {
    const [deviceResult, eventResult] = await Promise.all([
      supabase.from("device_sessions").select("id,user_id,device_key,device_name,user_agent,created_at,last_seen_at,revoked_at").order("last_seen_at", { ascending: false }),
      supabase.from("account_events").select("id,event_type,detail,created_at").order("created_at", { ascending: false }).limit(30),
    ]);
    if (!deviceResult.error) setDevices((deviceResult.data ?? []) as DeviceSession[]);
    if (!eventResult.error) setEvents((eventResult.data ?? []) as AccountEvent[]);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setNewEmail(email); }, [email]);

  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const clean = newEmail.trim();
    if (!clean || clean === email) return;
    setWorking(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: clean });
      if (error) throw error;
      await supabase.rpc("record_account_event", { p_event_type: "email_change" });
      setMessage("Check your email to finish the change.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update email.");
    } finally { setWorking(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (currentPassword.length < 1) { setMessage("Enter your current password."); return; }
    if (newPassword.length < 8) { setMessage("Use at least 8 characters for the new password."); return; }
    setWorking(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword, current_password: currentPassword });
      if (error) throw error;
      setCurrentPassword("");
      setNewPassword("");
      await supabase.rpc("record_account_event", { p_event_type: "password_change" });
      setMessage("Password updated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update password.");
    } finally { setWorking(false); }
  }

  async function revokeDevice(id: string) {
    setWorking(true); setMessage("");
    try {
      const { error } = await supabase.rpc("revoke_device", { p_device_id: id });
      if (error) throw error;
      setMessage("That device has been removed from Pulse and will be signed out when it checks in again.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove that device.");
    } finally { setWorking(false); }
  }

  async function revokeOthers() {
    setWorking(true); setMessage("");
    try {
      const { error: authError } = await supabase.auth.signOut({ scope: "others" });
      if (authError) throw authError;
      const { error: deviceError } = await supabase.rpc("revoke_other_devices", { p_current_device_key: currentKey });
      if (deviceError) throw deviceError;
      setMessage("All other sessions have been signed out.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out other devices.");
    } finally { setWorking(false); }
  }

  async function deleteAccount() {
    if (deleteText !== "DELETE") return;
    if (!window.confirm("Permanently delete your Pulse account and app data? This cannot be undone.")) return;
    setWorking(true); setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired.");
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not delete account.");
      await supabase.auth.signOut({ scope: "local" });
      onDeleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete account.");
    } finally { setWorking(false); }
  }

  return <div className="security-panel-v8 preference-stack-v6">
    <div><h3>Signed-in devices</h3><p className="muted-copy">Pulse records each browser/device so you can remove old access. A removed device is blocked by Pulse on its next check-in.</p></div>
    <div className="settings-list">{devices.length === 0 ? <div className="empty-card">No device sessions found.</div> : devices.map((device) => <div className="settings-list-row" key={device.id}>
      <span className="device-icon-v8">▣</span>
      <span className="grow-copy"><strong>{device.device_name}{device.device_key === currentKey ? " · This device" : ""}</strong><small>Last active {formatDateTime(device.last_seen_at)}{device.revoked_at ? " · Removed" : ""}</small></span>
      {!device.revoked_at && device.device_key !== currentKey && <button type="button" className="secondary-button" disabled={working} onClick={() => void revokeDevice(device.id)}>Remove</button>}
    </div>)}</div>
    <button type="button" className="secondary-button fit-button" disabled={working} onClick={() => void revokeOthers()}>Sign out all other devices</button>

    <div className="security-grid-v8">
      <form className="stack-form" onSubmit={changeEmail}><h3>Change email</h3><label>New email<input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} autoComplete="email" /></label><button className="secondary-button fit-button" disabled={working || newEmail.trim() === email} type="submit">Update email</button></form>
      <form className="stack-form" onSubmit={changePassword}><h3>Change password</h3><label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label><label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} autoComplete="new-password" /></label><button className="secondary-button fit-button" disabled={working} type="submit">Update password</button></form>
    </div>

    <div><h3>Login & security activity</h3><div className="history-list-v8">{events.length === 0 ? <div className="empty-card">No recent security events.</div> : events.map((item) => <article key={item.id}><strong>{item.event_type.replaceAll("_", " ")}</strong><small>{formatDateTime(item.created_at)}</small><p>{item.detail}</p></article>)}</div></div>

    <div className="danger-zone-v8"><h3>Delete account</h3><p>Permanently removes your Pulse account and associated app data. Type <strong>DELETE</strong> to enable the button.</p><input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="DELETE"/><button type="button" className="danger-button" disabled={deleteText !== "DELETE" || working} onClick={() => void deleteAccount()}>Delete my account</button></div>
    {message && <p className="inline-status" aria-live="polite">{message}</p>}
  </div>;
}
