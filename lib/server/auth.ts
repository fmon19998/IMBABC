import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export function adminDb() {
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Backend Supabase belum dikonfigurasi");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

export async function requireOwner(request:NextRequest,organizationId:string){
  const bearer=request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if(!bearer)throw new Error("Masuk ke akun terlebih dahulu");
  const db=adminDb();
  const {data:{user},error}=await db.auth.getUser(bearer);
  if(error||!user)throw new Error("Sesi tidak valid");
  const {data:organization,error:orgError}=await db.from("organizations")
    .select("id").eq("id",organizationId).eq("owner_id",user.id).maybeSingle();
  if(orgError||!organization)throw new Error("Workspace tidak tersedia untuk akun ini");
  return {db,user};
}

export function safeError(error:unknown){
  const message=typeof error==="object"&&error!==null&&"message" in error
    ?String(error.message):"Permintaan gagal";
  // Avoid returning provider errors (which might contain account data) verbatim.
  if(message.startsWith("Meta:"))return "Meta menolak permintaan. Periksa token, izin, dan akun WhatsApp Business.";
  if(["Campaign draft tidak tersedia untuk pemilik ini","Nomor WhatsApp belum terhubung",
    "Template belum disetujui Meta","Template dengan variabel, header, atau tombol belum didukung",
    "Tidak ada penerima dengan izin pesan"].includes(message))return message;
  if(!(error instanceof Error))return "Permintaan backend gagal; periksa pengaturan database";
  return message;
}
