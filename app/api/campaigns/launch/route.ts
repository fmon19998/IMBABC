import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner,safeError } from "@/lib/server/auth";

const input=z.object({organizationId:z.string().uuid(),campaignId:z.string().uuid(),templateId:z.string().uuid()}).strict();
export async function POST(request:NextRequest){
  try{
    const body=input.parse(await request.json());
    const {db,user}=await requireOwner(request,body.organizationId);
    const {data:workers,error:workerError}=await db.from("worker_heartbeats").select("worker_id")
      .gte("updated_at",new Date(Date.now()-120000).toISOString()).limit(1);
    if(workerError||!workers?.length)throw new Error("Worker pengirim belum aktif; jalankan worker terlebih dahulu");
    const {data:campaign,error:campaignError}=await db.from("campaigns")
      .select("id").eq("id",body.campaignId).eq("organization_id",body.organizationId).maybeSingle();
    if(campaignError||!campaign)throw new Error("Campaign tidak tersedia");
    const {data,error}=await db.rpc("launch_campaign",{
      p_campaign_id:body.campaignId,p_owner_id:user.id,p_template_id:body.templateId});
    if(error)throw error;
    return NextResponse.json({queued:data});
  }catch(error){return NextResponse.json({error:safeError(error)},{status:400})}
}
