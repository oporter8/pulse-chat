"use client";

import { FormEvent, useEffect, useState } from "react";
import { Avatar } from "@/components/chat/Avatar";
import type { AdminUser } from "@/lib/chat-types";
import { supabase } from "@/lib/supabase";

type AdminPanelProps = {
  currentUserId: string;
  currentTag: string | null;
  onTagChanged: (tag: string) => void;
};

async function adminFetch(url: string, options?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired.");

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Admin request failed.");
  return body;
}

export function AdminPanel({ currentUserId, currentTag, onTagChanged }: AdminPanelProps) {
  const [tag, setTag] = useState(currentTag || "OWNER");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => setTag(currentTag || "OWNER"), [currentTag]);

  async function searchUsers(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const body = await adminFetch(`/api/admin/users?q=${encodeURIComponent(query.trim())}`);
      setUsers((body.users ?? []) as AdminUser[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  async function saveTag() {
    const clean = tag.trim();
    if (!/^[A-Za-z0-9 _-]{1,16}$/.test(clean)) {
      setMessage("Tag must be 1–16 characters using letters, numbers, spaces, _ or -.");
      return;
    }
    const { error } = await supabase.rpc("set_my_admin_tag", { new_tag: clean });
    if (error) {
      setMessage(error.message);
      return;
    }
    onTagChanged(clean);
    setMessage("Admin tag saved.");
  }

  async function setBan(userId: string, duration: string) {
    setWorkingId(userId);
    setMessage("");
    try {
      await adminFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ userId, banDuration: duration }),
      });
      await searchUsers();
      setMessage(duration === "none" ? "User unbanned." : "User suspension updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update user.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="admin-panel-v7">
      <section className="admin-card-v7">
        <h3>Owner badge</h3>
        <p className="muted-copy">This badge appears beside your name in Tiger Chat.</p>
        <div className="admin-tag-editor-v7">
          <input value={tag} onChange={(event) => setTag(event.target.value)} maxLength={16} />
          <span className="admin-badge-v7">{tag.trim() || "OWNER"}</span>
          <button type="button" className="primary-button" onClick={() => void saveTag()}>Save tag</button>
        </div>
      </section>

      <section className="admin-card-v7">
        <h3>User management</h3>
        <p className="muted-copy">Search accounts and suspend or restore access.</p>
        <form className="admin-search-v7" onSubmit={searchUsers}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username, display name, or email" />
          <button type="submit" className="secondary-button" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
        </form>

        <div className="admin-user-list-v7">
          {users.map((adminUser) => {
            const banned = Boolean(adminUser.banned_until && new Date(adminUser.banned_until).getTime() > Date.now());
            return (
              <article className="admin-user-row-v7" key={adminUser.id}>
                <Avatar name={adminUser.display_name || adminUser.username} path={adminUser.avatar_path} size="small" />
                <div className="grow-copy">
                  <div className="admin-name-line-v7">
                    <strong>{adminUser.display_name || adminUser.username}</strong>
                    {adminUser.admin_tag && <span className="admin-badge-v7">{adminUser.admin_tag}</span>}
                  </div>
                  <small>@{adminUser.username} · {adminUser.email}</small>
                  <small>{banned ? `Suspended until ${new Date(adminUser.banned_until!).toLocaleString()}` : "Active"}</small>
                </div>
                {adminUser.id !== currentUserId && (
                  <div className="admin-actions-v7">
                    {banned ? (
                      <button type="button" className="secondary-button" disabled={workingId === adminUser.id} onClick={() => void setBan(adminUser.id, "none")}>Unban</button>
                    ) : (
                      <>
                        <button type="button" className="secondary-button" disabled={workingId === adminUser.id} onClick={() => void setBan(adminUser.id, "24h")}>24h</button>
                        <button type="button" className="secondary-button" disabled={workingId === adminUser.id} onClick={() => void setBan(adminUser.id, "168h")}>7d</button>
                        <button type="button" className="danger-button secondary-danger" disabled={workingId === adminUser.id} onClick={() => void setBan(adminUser.id, "876000h")}>Ban</button>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!loading && users.length === 0 && <div className="empty-card">Search for an account to manage.</div>}
        </div>
      </section>

      {message && <p className="inline-status" aria-live="polite">{message}</p>}
    </div>
  );
}
