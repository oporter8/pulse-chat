"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Attachment } from "@/lib/chat-types";
import { formatBytes } from "@/lib/chat-utils";

type Props = { open: boolean; conversationId: string; title: string; clearedAt?: string | null; onClose: () => void; onImage: (src:string,name:string,images?:Array<{src:string;name:string}>)=>void };
type Row = Attachment & { messages?: { conversation_id: string } | null };
export function SharedMediaModal({ open, conversationId, title, clearedAt = null, onClose, onImage }: Props) {
  const [rows,setRows]=useState<Row[]>([]);
  const [tab,setTab]=useState<"photos"|"files">("photos");
  useEffect(()=>{ if(!open)return; void (async()=>{
    const {data,error}=await supabase.from("message_attachments").select("id,message_id,uploader_id,storage_path,file_name,content_type,size_bytes,created_at,messages!inner(conversation_id)").eq("messages.conversation_id",conversationId).order("created_at",{ascending:false}).limit(200);
    if(error)return; const base=(data??[]) as unknown as Row[]; const list=clearedAt?base.filter(x=>new Date(x.created_at).getTime()>new Date(clearedAt).getTime()):base; const paths=list.map(x=>x.storage_path); const signed=new Map<string,string>(); if(paths.length){const {data:s}=await supabase.storage.from("attachments").createSignedUrls(paths,3600); for(const x of s??[]) if(x.path&&x.signedUrl)signed.set(x.path,x.signedUrl);} setRows(list.map(x=>({...x,signed_url:signed.get(x.storage_path)})));
  })();},[clearedAt,conversationId,open]);
  if(!open)return null; const filtered=rows.filter(r=>tab==="photos"?r.content_type?.startsWith("image/"):!r.content_type?.startsWith("image/"));
  const photoList = filtered.filter((r) => r.signed_url).map((r) => ({ src: r.signed_url as string, name: r.file_name }));
  return <div className="modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal-card media-modal-v8"><div className="modal-heading"><div><h2>Shared media</h2><p>{title}</p></div><button type="button" className="icon-button" onClick={onClose}>×</button></div><div className="segmented-v8"><button className={tab==="photos"?"active":""} type="button" onClick={()=>setTab("photos")}>Photos</button><button className={tab==="files"?"active":""} type="button" onClick={()=>setTab("files")}>Files</button></div>{filtered.length===0?<div className="empty-card">No {tab} shared yet.</div>:tab==="photos"?<div className="media-grid-v8">{filtered.map(r=><button type="button" key={r.id} onClick={()=>r.signed_url&&onImage(r.signed_url,r.file_name,photoList)}><img src={r.signed_url} alt={r.file_name}/></button>)}</div>:<div className="settings-list">{filtered.map(r=><a key={r.id} href={r.signed_url} download={r.file_name} className="settings-list-row file-row-v8"><span className="device-icon-v8">↓</span><span className="grow-copy"><strong>{r.file_name}</strong><small>{formatBytes(r.size_bytes)}</small></span></a>)}</div>}</section></div>;
}
