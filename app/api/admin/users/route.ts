import { authorizeStaff, staffAtLeast, type StaffRole } from "@/lib/admin-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const COMMUNITY_ROLES=["beta_tester","developer","helper","contributor","event_team","verified"] as const;
type CommunityRole=(typeof COMMUNITY_ROLES)[number];

export async function GET(request: Request){
  try{
    const auth=await authorizeStaff(request,"moderator");
    if(!auth) return Response.json({error:"Unauthorized"},{status:401});
    const q=new URL(request.url).searchParams.get("q")?.trim().toLowerCase()||"";
    const {data:authData,error:authError}=await auth.admin.auth.admin.listUsers({page:1,perPage:200});
    if(authError) throw authError;
    const ids=authData.users.map(u=>u.id);
    let profiles:Array<Record<string,any>>=[];
    if(ids.length){
      const result=await auth.admin.from("profiles").select("id,username,display_name,admin_tag,status_text,last_active_at,created_at,supporter,supporter_since,supporter_label,profile_emoji,staff_role,community_roles").in("id",ids);
      if(result.error) throw result.error;
      profiles=result.data??[];
    }
    const profileById=new Map(profiles.map((p:any)=>[p.id,p]));
    const users=authData.users.map(user=>{
      const p:any=profileById.get(user.id);
      return {id:user.id,email:user.email??"",username:p?.username??"",display_name:p?.display_name??p?.username??"User",admin_tag:p?.admin_tag??null,status_text:p?.status_text??"",profile_emoji:p?.profile_emoji??"🐯",last_active_at:p?.last_active_at??null,created_at:p?.created_at??user.created_at,last_sign_in_at:user.last_sign_in_at??null,banned_until:user.banned_until??null,is_admin:["owner","admin","moderator"].includes(p?.staff_role),staff_role:p?.staff_role??null,community_roles:Array.isArray(p?.community_roles)?p.community_roles:[],supporter:Boolean(p?.supporter),supporter_since:p?.supporter_since??null,supporter_label:p?.supporter_label??"SUPPORTER"};
    }).filter(user=>!q||[user.email,user.username,user.display_name].some(v=>v.toLowerCase().includes(q))).slice(0,50);
    return Response.json({users,myStaffRole:auth.staffRole});
  }catch(error){console.error("Tiger staff user lookup failed:",error);return Response.json({error:error instanceof Error?error.message:"Staff lookup failed."},{status:500});}
}

export async function POST(request: Request){
  try{
    const auth=await authorizeStaff(request,"moderator");
    if(!auth) return Response.json({error:"Unauthorized"},{status:401});
    const body=(await request.json().catch(()=>null)) as {userId?:unknown;banDuration?:unknown;supporterAction?:unknown;supporterLabel?:unknown;staffRole?:unknown;communityRole?:unknown;communityAction?:unknown}|null;
    const userId=typeof body?.userId==="string"?body.userId:"";
    if(!/^[0-9a-f-]{36}$/i.test(userId)) return Response.json({error:"Invalid user id."},{status:400});
    if(userId===auth.user.id && (body?.staffRole||body?.banDuration)) return Response.json({error:"You cannot change your own staff role or suspension."},{status:400});

    const {data:target,error:targetError}=await auth.admin.from("profiles").select("staff_role,community_roles,supporter,supporter_label").eq("id",userId).maybeSingle();
    if(targetError||!target) return Response.json({error:"User not found."},{status:404});
    const targetRole=(target.staff_role??null) as StaffRole|null;

    if(typeof body?.staffRole==="string"){
      if(auth.staffRole!=="owner") return Response.json({error:"Only the Owner can promote or demote staff."},{status:403});
      if(targetRole==="owner") return Response.json({error:"The Owner role cannot be changed here."},{status:400});
      const next=body.staffRole==="none"?null:body.staffRole;
      if(next!==null && !["admin","moderator"].includes(next)) return Response.json({error:"Invalid staff role."},{status:400});
      const {error}=await auth.admin.from("profiles").update({staff_role:next}).eq("id",userId); if(error) throw error;
      if(next){ await auth.admin.from("app_admins").upsert({user_id:userId},{onConflict:"user_id"}); }
      else { await auth.admin.from("app_admins").delete().eq("user_id",userId); }
      return Response.json({ok:true,staffRole:next});
    }

    if(typeof body?.communityRole==="string" || typeof body?.communityAction==="string"){
      if(auth.staffRole!=="owner") return Response.json({error:"Only the Owner can assign community badge roles."},{status:403});
      const role=body.communityRole as CommunityRole;
      const action=body.communityAction;
      if(!COMMUNITY_ROLES.includes(role)||!['grant','remove'].includes(String(action))) return Response.json({error:"Invalid community role action."},{status:400});
      const current=Array.isArray(target.community_roles)?target.community_roles.filter((r:any)=>COMMUNITY_ROLES.includes(r)):[];
      const next=action==="grant"?Array.from(new Set([...current,role])):current.filter((r:string)=>r!==role);
      const {error}=await auth.admin.from("profiles").update({community_roles:next}).eq("id",userId); if(error) throw error;
      return Response.json({ok:true,communityRoles:next});
    }

    const supporterAction=typeof body?.supporterAction==="string"?body.supporterAction:"";
    if(supporterAction){
      if(!staffAtLeast(auth.staffRole,"admin")) return Response.json({error:"Admin access required for supporter status."},{status:403});
      if(!/^(grant|remove)$/.test(supporterAction)) return Response.json({error:"Invalid supporter action."},{status:400});
      const supporterLabel=typeof body?.supporterLabel==="string"?body.supporterLabel.trim().slice(0,16):"SUPPORTER";
      const enabled=supporterAction==="grant";
      const {error}=await auth.admin.from("profiles").update({supporter:enabled,supporter_since:enabled?new Date().toISOString():null,supporter_label:supporterLabel||"SUPPORTER",profile_frame:enabled?"supporter":"none"}).eq("id",userId); if(error) throw error;
      if(!enabled){const {data:loungeRows}=await auth.admin.from("conversations").select("id").eq("supporter_only",true);const loungeIds=(loungeRows??[]).map((r:any)=>r.id);if(loungeIds.length) await auth.admin.from("conversation_members").delete().eq("user_id",userId).in("conversation_id",loungeIds);}
      return Response.json({ok:true,supporter:enabled});
    }

    const banDuration=typeof body?.banDuration==="string"?body.banDuration:"";
    if(!/^(none|24h|168h|876000h)$/.test(banDuration)) return Response.json({error:"Invalid suspension duration."},{status:400});
    if(targetRole==="owner") return Response.json({error:"The Owner account cannot be suspended here."},{status:403});
    if(auth.staffRole==="moderator"){
      if(targetRole) return Response.json({error:"Moderators cannot suspend staff accounts."},{status:403});
      if(banDuration==="876000h") return Response.json({error:"Moderators cannot permanently ban accounts."},{status:403});
    }
    if(auth.staffRole==="admin" && targetRole==="admin") return Response.json({error:"Admins cannot suspend other admins. Ask the Owner."},{status:403});
    const {error}=await auth.admin.auth.admin.updateUserById(userId,{ban_duration:banDuration}); if(error) throw error;
    if(banDuration!=="none"){const {error:deviceError}=await auth.admin.from("device_sessions").update({revoked_at:new Date().toISOString()}).eq("user_id",userId).is("revoked_at",null);if(deviceError) throw deviceError;}
    return Response.json({ok:true,suspended:banDuration!=="none"});
  }catch(error){console.error("Tiger staff action failed:",error);return Response.json({error:error instanceof Error?error.message:"Staff action failed."},{status:500});}
}
