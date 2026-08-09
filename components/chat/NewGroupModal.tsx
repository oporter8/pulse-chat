"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";

type NewGroupModalProps = {
  open: boolean;
  currentUserId: string;
  blockedUserIds: Set<string>;
  onClose: () => void;
  onCreate: (name: string, memberIds: string[]) => Promise<void>;
};

export function NewGroupModal({
  open,
  currentUserId,
  blockedUserIds,
  onClose,
  onCreate,
}: NewGroupModalProps) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setQuery("");
    setResults([]);
    setSelected([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const clean = query.trim();
    if (clean.length < 2) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_path, created_at")
        .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
        .neq("id", currentUserId)
        .limit(10);

      const selectedIds = new Set(selected.map((profile) => profile.id));
      setResults(
        ((data ?? []) as Profile[]).filter(
          (profile) => !selectedIds.has(profile.id) && !blockedUserIds.has(profile.id),
        ),
      );
    }, 250);

    return () => window.clearTimeout(timer);
  }, [blockedUserIds, currentUserId, open, query, selected]);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || selected.length === 0) return;
    setSaving(true);
    try {
      await onCreate(name.trim(), selected.map((profile) => profile.id));
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="group-title">
        <div className="modal-heading">
          <div>
            <h2 id="group-title">New group</h2>
            <p>Create a private group conversation.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form className="stack-form" onSubmit={submit}>
          <label>
            Group name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Weekend plans" />
          </label>

          <label>
            Add people
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people…" />
          </label>

          {selected.length > 0 && (
            <div className="person-chip-list">
              {selected.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className="person-chip"
                  onClick={() => setSelected((current) => current.filter((item) => item.id !== profile.id))}
                  title="Remove"
                >
                  <Avatar name={profile.display_name || profile.username} path={profile.avatar_path} size="small" />
                  <span>{profile.display_name || `@${profile.username}`}</span>
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <div className="people-results">
              {results.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    setSelected((current) => [...current, profile]);
                    setQuery("");
                    setResults([]);
                  }}
                >
                  <Avatar name={profile.display_name || profile.username} path={profile.avatar_path} size="small" />
                  <span>
                    <strong>{profile.display_name}</strong>
                    <small>@{profile.username}</small>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving || !name.trim() || selected.length === 0}>
              {saving ? "Creating…" : "Create group"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
