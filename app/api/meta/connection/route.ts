import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner,safeError } from "@/lib/server/auth";
import { encryptToken,graphPages,graphRequest } from "@/lib/server/meta";

const input=z.object({organizationId:z.string().uuid(),wabaId:z.string().regex(/^[0-9]{5,30}$/),
  phoneNumberId:z.string().regex(/^[0-9]{5,30}$/),accessToken:z.string().min(30).max(4096)}).strict();

export async function GET(request:NextRequest){
  try{
    const org=input.shape.organizationId.parse(new URL(request.url).searchParams.get("organizationId"));
    const {db}=await requireOwner(request,org);
    const {data,error}=await db.from("meta_connections")
      .select("waba_id,phone_number_id,connected_at").eq("organization_id",org).maybeSingle();
    if(error)throw error;
    return NextResponse.json({connection:data});
  }catch(error){return NextResponse.json({error:safeError(error)},{status:400})}
}

// Owner-operated system-user connection while Meta Embedded Signup app review is pending.
// Verify that the supplied token can enumerate this WABA's selected phone and subscribe
// the app before persisting its encrypted token. Never return the token to the browser.
export async function POST(request:NextRequest){
  try{
    if(Number(request.headers.get("content-length")||0)>8192)return NextResponse.json({error:"Payload terlalu besar"},{status:413});
    const body=input.parse(await request.json());
    const {db}=await requireOwner(request,body.organizationId);
    const phones=await graphPages<{id:string}>(body.accessToken,`/${body.wabaId}/phone_numbers?fields=id&limit=100`);
    if(!phones.some(p=>p.id===body.phoneNumberId))throw new Error("Nomor tidak terdapat di akun WhatsApp Business ini");
    await graphRequest(body.accessToken,`/${body.wabaId}/subscribed_apps`,"POST");
    const encrypted=await encryptToken(body.accessToken);
    const {error}=await db.from("meta_connections").upsert({organization_id:body.organizationId,
      waba_id:body.wabaId,phone_number_id:body.phoneNumberId,access_token_ciphertext:encrypted,
      connected_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    if(error)throw error;
    return NextResponse.json({connected:true});
  }catch(error){return NextResponse.json({error:safeError(error)},{status:400})}
}
