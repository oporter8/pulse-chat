"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Attachment } from "@/lib/chat-types";
import { formatBytes } from "@/lib/chat-utils";

type Props = { open: boolean; conversationId: string; title: string; clearedAt?: string | null; onClose: () => void; onImage: (src:string,name:string,images?:Array<{src:string;name:string}>)=>void };
type Row = Attachment & { messages?: { conversation_id: string } | null };
type MessageLinkRow = { id: string; body: string; created_at: string };
const URL_RE = /https?:\/\/[^\s<>()]+/g;

export function SharedMediaModal({ open, conversationId, title, clearedAt = null, onClose }: Props) {
  const [rows,setRows]=useState<Row[]>([]);
  const [messages,setMessages]=useState<MessageLinkRow[]>([]);
  const [tab,setTab]=useState<"files"|"links">("files");
  const [filter,setFilter]=useState("");
  const [notice,setNotice]=useState("");

  useEffect(()=>{ if(!open)return; void (async()=>{
    const [attachments,messagesResult]=await Promise.all([
      supabase.from("message_attachments").select("id,message_id,uploader_id,storage_path,file_name,content_type,size_bytes,created_at,messages!inner(conversation_id)").eq("messages.conversation_id",conversationId).order("created_at",{ascending:false}).limit(200),
      supabase.from("messages").select("id,body,created_at").eq("conversation_id",conversationId).is("deleted_at",null).order("created_at",{ascending:false}).limit(500),
    ]);
    if(!attachments.error){ const base=(attachments.data??[]) as unknown as Row[]; const list=(clearedAt?base.filter(x=>new Date(x.created_at).getTime()>new Date(clearedAt).getTime()):base).filter(x=>!x.content_type?.startsWith("image/")&&!x.content_type?.startsWith("video/")); const paths=list.map(x=>x.storage_path); const signed=new Map<string,string>(); if(paths.length){const {data:s}=await supabase.storage.from("attachments").createSignedUrls(paths,3600); for(const x of s??[]) if(x.path&&x.signedUrl)signed.set(x.path,x.signedUrl);} setRows(list.map(x=>({...x,signed_url:signed.get(x.storage_path)}))); }
    if(!messagesResult.error){ const base=(messagesResult.data??[]) as MessageLinkRow[]; setMessages(clearedAt?base.filter(x=>new Date(x.created_at).getTime()>new Date(clearedAt).getTime()):base); }
  })();},[clearedAt,conversationId,open]);

  const links=useMemo(()=>messages.flatMap(message=>(message.body?.match(URL_RE)??[]).map(url=>({url,messageId:message.id,createdAt:message.created_at}))).filter(item=>item.url.toLowerCase().includes(filter.toLowerCase())).slice(0,200),[messages,filter]);
  const files=rows.filter(row=>row.file_name.toLowerCase().includes(filter.toLowerCase()));
  if(!open)return null;

  async function copy(url:string){try{await navigator.clipboard.writeText(url);setNotice("Link copied.");}catch{setNotice("Could not copy the link in this browser.");}}

  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal-card media-modal-v8 v13-files-modal"><div className="modal-heading"><div><h2>Files & links</h2><p>{title} · visual media is disabled</p></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><div className="segmented-v8"><button className={tab==="files"?"active":""} type="button" onClick={()=>setTab("files")}>Files & voice</button><button className={tab==="links"?"active":""} type="button" onClick={()=>setTab("links")}>Links</button></div><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter this conversation…" />{tab==="files"?(files.length===0?<div className="empty-card">No matching files or voice notes.</div>:<div className="settings-list">{files.map(r=><a key={r.id} href={r.signed_url} target="_blank" rel="noreferrer" download={r.file_name} className="settings-list-row file-row-v8"><span className="device-icon-v8">{r.content_type?.startsWith("audio/")?"🎙":"↓"}</span><span className="grow-copy"><strong>{r.file_name}</strong><small>{formatBytes(r.size_bytes)} · {new Date(r.created_at).toLocaleString()}</small></span></a>)}</div>):(links.length===0?<div className="empty-card">No matching links.</div>:<div className="settings-list">{links.map((item,index)=><div className="settings-list-row" key={`${item.messageId}-${index}`}><span className="grow-copy"><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.url}</strong></a><small>{new Date(item.createdAt).toLocaleString()}</small></span><button className="secondary-button" onClick={()=>void copy(item.url)}>Copy</button></div>)}</div>)}{notice&&<p className="inline-status">{notice}</p>}</section></div>;
}
