import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner,safeError } from "@/lib/server/auth";

export async function GET(request:NextRequest){
  try{
    const organizationId=z.string().uuid().parse(new URL(request.url).searchParams.get("organizationId"));
    const {db}=await requireOwner(request,organizationId);
    const {data,error}=await db.from("worker_heartbeats").select("worker_id")
      .gte("updated_at",new Date(Date.now()-120000).toISOString()).limit(1);
    if(error)throw error;
    return NextResponse.json({online:Boolean(data?.length)});
  }catch(error){return NextResponse.json({error:safeError(error)},{status:400})}
}
