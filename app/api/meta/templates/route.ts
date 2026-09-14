import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner,safeError } from "@/lib/server/auth";
import { decryptToken,graphPages } from "@/lib/server/meta";

type MetaTemplate={id:string;name:string;language:string;category:string;status:string;
  components:{type:string;text?:string}[]};

export async function POST(request:NextRequest){
  try{
    const {organizationId}=z.object({organizationId:z.string().uuid()}).strict().parse(await request.json());
    const {db}=await requireOwner(request,organizationId);
    const {data:connection,error:connectionError}=await db.from("meta_connections")
      .select("waba_id,access_token_ciphertext").eq("organization_id",organizationId).maybeSingle();
    if(connectionError||!connection)throw new Error("Hubungkan nomor WhatsApp terlebih dahulu");
    const token=await decryptToken(connection.access_token_ciphertext);
    const templates=await graphPages<MetaTemplate>(token,`/${connection.waba_id}/message_templates?fields=id,name,language,category,status,components&limit=100`);
    const mapped=templates.filter(t=>t.id&&t.name&&t.language).map(t=>({
      organization_id:organizationId,meta_template_id:String(t.id),name:t.name,language:t.language,
      category:["MARKETING","UTILITY","AUTHENTICATION"].includes(t.category)?t.category:"UTILITY",
      status:["APPROVED","PENDING","REJECTED","PAUSED","DISABLED"].includes(t.status)?t.status:"DISABLED",
      components:Array.isArray(t.components)?t.components:[],
      body:t.components?.find(c=>c.type==="BODY")?.text||"",
      updated_at:new Date().toISOString()
    }));
    if(mapped.length){const {error}=await db.from("templates").upsert(mapped,{onConflict:"organization_id,meta_template_id"});if(error)throw error}
    const {data:stored,error:storedError}=await db.from("templates")
      .select("id,meta_template_id").eq("organization_id",organizationId);
    if(storedError)throw storedError;
    const present=new Set(mapped.map(t=>t.meta_template_id));
    const stale=(stored||[]).filter(t=>t.meta_template_id&&!present.has(t.meta_template_id)).map(t=>t.id);
    if(stale.length){const {error}=await db.from("templates").update({status:"DISABLED"}).in("id",stale);if(error)throw error}
    return NextResponse.json({synced:mapped.length,approved:mapped.filter(t=>t.status==="APPROVED").length});
  }catch(error){return NextResponse.json({error:safeError(error)},{status:400})}
}
