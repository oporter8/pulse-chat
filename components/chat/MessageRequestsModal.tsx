"use client";

import type { DmRequest } from "@/lib/chat-types";
import { Avatar } from "@/components/chat/Avatar";
import { formatDateTime } from "@/lib/chat-utils";

type Props = { open: boolean; requests: DmRequest[]; onClose: () => void; onRespond: (requestId: string, accept: boolean) => Promise<void> };
export function MessageRequestsModal({ open, requests, onClose, onRespond }: Props) {
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal-card compact-modal-v8"><div className="modal-heading"><div><h2>Message requests</h2><p>People asking to start a new conversation.</p></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>{requests.length === 0 ? <div className="empty-card">No pending requests.</div> : <div className="settings-list">{requests.map((r) => <div className="settings-list-row" key={r.id}><Avatar name={r.sender?.display_name || r.sender?.username || "User"} path={r.sender?.avatar_path} size="small"/><span className="grow-copy"><strong>{r.sender?.display_name || r.sender?.username || "User"}</strong><small>{formatDateTime(r.created_at)}</small></span><div className="inline-button-row-v8"><button className="secondary-button" type="button" onClick={() => void onRespond(r.id,false)}>Decline</button><button className="primary-button" type="button" onClick={() => void onRespond(r.id,true)}>Accept</button></div></div>)}</div>}</section></div>;
}
