import { NextRequest, NextResponse } from "next/server";

// Meta verifies a callback by sending the configured challenge to this endpoint.
export async function GET(request: NextRequest) {
  const token=process.env.META_WEBHOOK_VERIFY_TOKEN;
  if(!token)return new NextResponse("Webhook belum dikonfigurasi",{status:503});
  const url=new URL(request.url);
  if(url.searchParams.get("hub.mode")!=="subscribe"||url.searchParams.get("hub.verify_token")!==token)
    return new NextResponse("Verifikasi gagal",{status:403});
  const challenge=url.searchParams.get("hub.challenge");
  return challenge?new NextResponse(challenge,{status:200,headers:{"content-type":"text/plain"}}):new NextResponse("Challenge hilang",{status:400});
}

function equalHex(a:string,b:string){
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function hex(buffer:ArrayBuffer){return Array.from(new Uint8Array(buffer)).map(v=>v.toString(16).padStart(2,"0")).join("")}

// Phase 1 ingress: validate and store an immutable event for later processing.
// No delivery state is inferred or displayed until a worker processes a real event.
export async function POST(request: NextRequest){
  const secret=process.env.META_APP_SECRET;
  const url=process.env.SUPABASE_URL;
  const serviceKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!secret||!url||!serviceKey)return NextResponse.json({error:"Webhook belum dikonfigurasi"},{status:503});
  if(Number(request.headers.get("content-length")||0)>1024*1024)return NextResponse.json({error:"Payload terlalu besar"},{status:413});
  const raw=await request.text();
  if(new TextEncoder().encode(raw).length>1024*1024)return NextResponse.json({error:"Payload terlalu besar"},{status:413});
  const signature=request.headers.get("x-hub-signature-256")||"";
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const expected="sha256="+await hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
  if(!equalHex(signature,expected))return NextResponse.json({error:"Signature tidak valid"},{status:401});
  let payload:unknown;try{payload=JSON.parse(raw)}catch{return NextResponse.json({error:"JSON tidak valid"},{status:400})}
  if(typeof payload!=="object"||payload===null||(payload as {object?:string}).object!=="whatsapp_business_account")
    return NextResponse.json({error:"Objek webhook tidak dikenal"},{status:400});
  const eventKey=await hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw)));
  try{
    const stored=await fetch(url.replace(/\/$/,"")+"/rest/v1/webhook_events?on_conflict=event_key",{
      method:"POST",headers:{"apikey":serviceKey,
        ...(serviceKey.startsWith("sb_secret_")?{}:{"authorization":"Bearer "+serviceKey}),
        "content-type":"application/json","Prefer":"resolution=ignore-duplicates,return=minimal"},
      body:JSON.stringify({event_key:eventKey,payload})
    });
    if(!stored.ok)return NextResponse.json({error:"Penyimpanan webhook gagal"},{status:503});
  }catch{return NextResponse.json({error:"Penyimpanan webhook tidak tersedia"},{status:503})}
  return NextResponse.json({received:true});
}
