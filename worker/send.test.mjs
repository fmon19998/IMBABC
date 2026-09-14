import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { decryptToken,graphOutcome,isOptOut,messagePayload } from "./send.mjs";

test("official template request normalizes an opted-in E.164 recipient",()=>{
  assert.deepEqual(messagePayload({phone_e164:"+628123456789"},
    {template_name:"info_pelanggan",template_language:"id"}),{
    messaging_product:"whatsapp",to:"628123456789",type:"template",
    template:{name:"info_pelanggan",language:{code:"id"}}
  });
  assert.throws(()=>messagePayload({phone_e164:"08123456789"},
    {template_name:"info_pelanggan",template_language:"id"}));
});

test("ambiguous Meta failures are never classified as safe retries",()=>{
  assert.equal(graphOutcome(200,{messages:[{id:"wamid.123"}]}).status,"ACCEPTED");
  assert.equal(graphOutcome(429,{}).status,"QUEUED");
  assert.equal(graphOutcome(500,{}).status,"UNKNOWN");
  assert.equal(graphOutcome(200,{}).status,"UNKNOWN");
});

test("owner's AES-GCM token ciphertext can be opened by worker",async()=>{
  const secret=webcrypto.getRandomValues(new Uint8Array(32));
  const iv=webcrypto.getRandomValues(new Uint8Array(12));
  const key=await webcrypto.subtle.importKey("raw",secret,{name:"AES-GCM"},false,["encrypt"]);
  const ciphertext=await webcrypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode("example-access-token"));
  const format=Buffer.from(iv).toString("base64")+"."+Buffer.from(ciphertext).toString("base64");
  assert.equal(decryptToken(format,Buffer.from(secret).toString("base64")),"example-access-token");
  assert.throws(()=>decryptToken(format,Buffer.alloc(32).toString("base64")));
});

test("inbound unsubscribe expressions suppress future sends",()=>{
  for(const text of ["STOP","Berhenti sekarang"," unsubscribe ","BATAL"])
    assert.equal(isOptOut(text),true);
  for(const text of ["stoppage","promo stop","terima kasih"])
    assert.equal(isOptOut(text),false);
});
