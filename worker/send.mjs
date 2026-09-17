import { createClient } from "@supabase/supabase-js";
import { createDecipheriv } from "node:crypto";

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;


const rate=Number(process.env.SEND_RATE_PER_SECOND||2);
const rest=Number(process.env.WORKER_IDLE_MS||2000);

export function messagePayload(recipient,campaign){
  if(!/^\+[1-9][0-9]{7,14}$/.test(recipient.phone_e164))throw new Error("Nomor tidak valid");
  if(!campaign.template_name||!campaign.template_language)throw new Error("Template campaign belum dipilih");
  return {messaging_product:"whatsapp",to:recipient.phone_e164.slice(1),type:"template",
    template:{name:campaign.template_name,language:{code:campaign.template_language}}};
}

export function decryptToken(ciphertext,encodedKey){
  const [iv,text]=ciphertext.split(".");
  if(!iv||!text)throw new Error("Token terenkripsi tidak valid");
  const bytes=Buffer.from(encodedKey,"base64");
  if(bytes.length!==32)throw new Error("Kunci enkripsi tidak valid");
  const encrypted=Buffer.from(text,"base64");
  const decipher=createDecipheriv("aes-256-gcm",bytes,Buffer.from(iv,"base64"));
  decipher.setAuthTag(encrypted.subarray(encrypted.length-16));
  return Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString("utf8");
}

export function graphOutcome(status,body){
  if(status>=200&&status<300&&body?.messages?.[0]?.id)
    return {status:"ACCEPTED",meta_message_id:String(body.messages[0].id),accepted_at:new Date().toISOString()};
  if(status===429)return {status:"QUEUED",error_code:"META_429"};
  if(status>=400&&status<500)return {status:"FAILED",error_code:"META_"+status};
  // HTTP 5xx and broken responses may have accepted the message; never auto-retry.
  return {status:"UNKNOWN",error_code:"AMBIGUOUS_META_RESPONSE"};
}

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function must(result,label){if(result.error)throw new Error(label+": "+result.error.message);return result.data}

async function sendOne(db,recipient){
  const [campaign,connection,contact]=await Promise.all([
    db.from("campaigns").select("id,status,template_name,template_language").eq("id",recipient.campaign_id).single(),
    db.from("meta_connections").select("phone_number_id,access_token_ciphertext").eq("organization_id",recipient.organization_id).single(),
    db.from("contacts").select("consent_status,phone_e164").eq("id",recipient.contact_id).single()
  ]);
  if(campaign.error||connection.error||contact.error){
    await mark(db,recipient,{status:"UNKNOWN",error_code:"STATE_LOOKUP_FAILED"});return;
  }
  const owner=await db.from("organizations").select("owner_id").eq("id",recipient.organization_id).single();
  const profile=owner.data?await db.from("account_profiles").select("active").eq("user_id",owner.data.owner_id).single():null;
  if(!profile?.data?.active||campaign.data.status!=="RUNNING"||contact.data.consent_status!=="OPTED_IN"||
      contact.data.phone_e164!==recipient.phone_e164){
    await mark(db,recipient,{status:"SUPPRESSED",error_code:"CONSENT_OR_CAMPAIGN_CHANGED"});return;
  }
  let body;
  try{body=messagePayload(recipient,campaign.data)}
  catch{await mark(db,recipient,{status:"FAILED",error_code:"INVALID_PAYLOAD"});return}
  let result;
  try{
    const token=decryptToken(connection.data.access_token_ciphertext,process.env.TOKEN_ENCRYPTION_KEY);
    const response=await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_API_VERSION}/${connection.data.phone_number_id}/messages`,{
      method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
    });
    const responseBody=await response.json().catch(()=>null);
    result=graphOutcome(response.status,responseBody);
  }catch{
    // Timeout or transport failure has an unknown delivery outcome. Do not retry.
    result={status:"UNKNOWN",error_code:"AMBIGUOUS_NETWORK_OUTCOME"};
  }
  if(result.status==="QUEUED"&&recipient.attempts>=3)
    result={status:"FAILED",error_code:"META_429_RETRY_EXHAUSTED"};
  if(result.status==="QUEUED")result.next_attempt_at=new Date(Date.now()+30000*recipient.attempts).toISOString();
  await mark(db,recipient,result);
}

async function mark(db,recipient,fields){
  must(await db.from("campaign_recipients").update({...fields,updated_at:new Date().toISOString()})
    .eq("id",recipient.id).eq("status","SENDING").select("id").single(),"Simpan status");
}

export function isOptOut(body){return /^(stop|berhenti|unsubscribe|batal|hentikan)(\b|$)/i.test(String(body||"").trim())}
const rank={ACCEPTED:0,SENT:1,DELIVERED:2,READ:3};

async function processStatus(db,status){
  const eventStatus={sent:"SENT",delivered:"DELIVERED",read:"READ",failed:"FAILED"}[status.status];
  if(!eventStatus||!status.id)return true;
  const row=must(await db.from("campaign_recipients").select("id,status").eq("meta_message_id",status.id).maybeSingle(),"Cari pesan");
  if(!row)return false; // The HTTP sender may not have saved the Meta ID yet.
  if(eventStatus==="FAILED"&&["DELIVERED","READ"].includes(row.status))return true;
  if(row.status==="FAILED"||rank[row.status]>=(rank[eventStatus]??Infinity))return true;
  const time=status.timestamp&&Number.isFinite(Number(status.timestamp))
    ?new Date(Number(status.timestamp)*1000).toISOString():new Date().toISOString();
  const field={SENT:"sent_at",DELIVERED:"delivered_at",READ:"read_at"}[eventStatus];
  const update={status:eventStatus,updated_at:new Date().toISOString()};
  if(field)update[field]=time;
  if(eventStatus==="FAILED")update.error_code=String(status.errors?.[0]?.code||"META_FAILED").slice(0,80);
  must(await db.from("campaign_recipients").update(update).eq("id",row.id),"Simpan webhook");
  return true;
}

async function processInbound(db,metadata,message){
  if(!isOptOut(message?.text?.body)||!/^\d{8,15}$/.test(message.from||""))return;
  const connection=must(await db.from("meta_connections").select("organization_id")
    .eq("phone_number_id",metadata.phone_number_id).maybeSingle(),"Cari nomor bisnis");
  if(!connection)return;
  must(await db.from("contacts").update({consent_status:"OPTED_OUT",updated_at:new Date().toISOString()})
    .eq("organization_id",connection.organization_id).eq("phone_e164","+"+message.from),"Catat opt-out");
}

async function processWebhooks(db){
  const events=must(await db.from("webhook_events").select("id,payload,received_at")
    .is("processed_at",null).order("received_at",{ascending:true}).limit(100),"Baca webhook");
  for(const event of events){
    let complete=true;
    for(const entry of event.payload?.entry||[])for(const change of entry.changes||[]){
      const value=change.value||{};
      for(const status of value.statuses||[]){
        if(!await processStatus(db,status))complete=false;
      }
      for(const message of value.messages||[])await processInbound(db,value.metadata||{},message);
    }
    // Orphan status events remain in durable storage but do not block newer events.
    if(complete||Date.now()-new Date(event.received_at).getTime()>30*60000)
      must(await db.from("webhook_events").update({processed_at:new Date().toISOString()})
        .eq("id",event.id),"Tandai webhook");
  }
}

async function recoverStale(db){
  must(await db.from("campaign_recipients").update({status:"UNKNOWN",error_code:"WORKER_INTERRUPTED",
    updated_at:new Date().toISOString()}).eq("status","SENDING")
    .lt("attempted_at",new Date(Date.now()-15*60000).toISOString()),"Pulihkan antrean");
}

async function finishCampaigns(db){
  const active=must(await db.from("campaigns").select("id").eq("status","RUNNING").limit(100),"Baca campaign");
  for(const campaign of active){
    const {count,error}=await db.from("campaign_recipients").select("id",{head:true,count:"exact"})
      .eq("campaign_id",campaign.id).in("status",["QUEUED","SENDING"]);
    if(error)throw error;
    if(count===0)must(await db.from("campaigns").update({status:"COMPLETED",finished_at:new Date().toISOString()})
      .eq("id",campaign.id).eq("status","RUNNING"),"Selesaikan antrean campaign");
  }
}

export async function runBatch(db,limit=1){
  if(!process.env.TOKEN_ENCRYPTION_KEY||!/^v\d{2}\.\d+$/.test(process.env.META_GRAPH_API_VERSION||""))throw new Error("Pengaturan Meta belum lengkap");
  must(await db.from("worker_heartbeats").upsert({worker_id:"cloud-sender",updated_at:new Date().toISOString()}),"Heartbeat");
  await recoverStale(db);await processWebhooks(db);
  const claims=must(await db.rpc("claim_campaign_recipients",{p_limit:limit}),"Ambil antrean");
  for(const recipient of claims){await sendOne(db,recipient);await wait(500);}
  await finishCampaigns(db);return {processed:claims.length};
}
async function main(){
  const cryptoKey=process.env.TOKEN_ENCRYPTION_KEY;const graphVersion=process.env.META_GRAPH_API_VERSION;
  if(!url||!key||!cryptoKey||!graphVersion||!/^v\d{2}\.\d+$/.test(graphVersion))
    throw new Error("Konfigurasi Supabase, token encryption, atau versi Meta belum lengkap");
  if(!Number.isFinite(rate)||rate<0.1||rate>20)throw new Error("SEND_RATE_PER_SECOND harus 0.1–20");
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let running=true;process.on("SIGTERM",()=>{running=false});process.on("SIGINT",()=>{running=false});
  do{
    must(await db.from("worker_heartbeats").upsert({worker_id:process.env.WORKER_ID||"sender",
      updated_at:new Date().toISOString()}),"Perbarui heartbeat worker");
    await recoverStale(db);
    await processWebhooks(db);
    const claims=must(await db.rpc("claim_campaign_recipients",{p_limit:1}),"Ambil antrean");
    for(const recipient of claims){await sendOne(db,recipient);await wait(1000/rate)}
    await finishCampaigns(db);
    if(!claims.length&&!process.argv.includes("--once"))await wait(rest);
  }while(running&&!process.argv.includes("--once"));
}

if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href)
  main().catch(error=>{console.error("Worker berhenti:",error.message);process.exitCode=1});
