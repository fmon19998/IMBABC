import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner,safeError } from "@/lib/server/auth";

export async function GET(request:NextRequest){
  try{
    const url=new URL(request.url);
    const organizationId=z.string().uuid().parse(url.searchParams.get("organizationId"));
    const campaignId=z.string().uuid().parse(url.searchParams.get("campaignId"));
    const {db}=await requireOwner(request,organizationId);
    const {data:campaign,error}=await db.from("campaigns").select("id,status,template_name,started_at,finished_at")
      .eq("organization_id",organizationId).eq("id",campaignId).maybeSingle();
    if(error||!campaign)throw new Error("Campaign tidak tersedia");
    const statuses=["QUEUED","SENDING","ACCEPTED","SENT","DELIVERED","READ","FAILED","UNKNOWN","SUPPRESSED"];
    const counts=await Promise.all(statuses.map(async status=>{
      const {count,error:countError}=await db.from("campaign_recipients").select("id",{head:true,count:"exact"})
        .eq("campaign_id",campaignId).eq("status",status);
      if(countError)throw countError;
      return [status,count||0] as const;
    }));
    return NextResponse.json({campaign,counts:Object.fromEntries(counts)});
  }catch(error){return NextResponse.json({error:safeError(error)},{status:400})}
}
