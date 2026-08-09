"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type FileRow = { id: string; storage_path: string; file_name: string; content_type: string | null; size_bytes: number; created_at: string };
type MessageRow = { id: string; body: string; created_at: string; conversation_id: string };
const URL_RE = /https?:\/\/[^\s<>()]+/g;

export function FilesLinksPanel() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void Promise.all([
      supabase.from("message_attachments").select("id,storage_path,file_name,content_type,size_bytes,created_at").order("created_at", { ascending: false }).limit(150),
      supabase.from("messages").select("id,body,created_at,conversation_id").is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
    ]).then(([fileResult, messageResult]) => {
      setFiles(((fileResult.data ?? []) as FileRow[]).filter((file) => !file.content_type?.startsWith("image/") && !file.content_type?.startsWith("video/")));
      setMessages((messageResult.data ?? []) as MessageRow[]);
    });
  }, []);

  const links = useMemo(() => messages.flatMap((message) => (message.body.match(URL_RE) ?? []).map((url) => ({ url, messageId: message.id, createdAt: message.created_at }))).filter((item) => item.url.toLowerCase().includes(filter.toLowerCase())).slice(0, 150), [messages, filter]);
  const filteredFiles = files.filter((file) => file.file_name.toLowerCase().includes(filter.toLowerCase()));

  async function download(file: FileRow) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(file.storage_path, 60);
    if (error || !data?.signedUrl) { setNotice(error?.message || "Could not create download link."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return <div className="tiger-v11-grid">
    <section className="tiger-card tiger-span-2"><h3>Files & links</h3><p className="muted-copy">The old image gallery is replaced with an image-free library. Voice notes, documents, and links only.</p><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files and links" /></section>
    <section className="tiger-card"><h3>Shared files</h3>{filteredFiles.length === 0 ? <p>No matching files.</p> : <div className="tiger-list">{filteredFiles.map((file) => <div className="tiger-list-row" key={file.id}><span><strong>{file.content_type?.startsWith("audio/") ? "🎙" : "📄"} {file.file_name}</strong><small>{Math.max(1, Math.round(file.size_bytes / 1024))} KB · {new Date(file.created_at).toLocaleDateString()}</small></span><button className="secondary-button" onClick={() => void download(file)}>Open</button></div>)}</div>}</section>
    <section className="tiger-card"><h3>Shared links</h3>{links.length === 0 ? <p>No matching links.</p> : <div className="tiger-list">{links.map((item, index) => <a className="tiger-list-row" key={`${item.messageId}-${index}`} href={item.url} target="_blank" rel="noreferrer"><span><strong>{item.url}</strong><small>{new Date(item.createdAt).toLocaleDateString()}</small></span></a>)}</div>}</section>
    {notice && <p className="tiger-notice tiger-span-2">{notice}</p>}
  </div>;
}
