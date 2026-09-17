import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {adminDb} from '@/lib/server/auth';
export async function POST(request:NextRequest){
 try{
 const body=z.object({code:z.string().min(40).max(128),password:z.string().min(12).max(128)}).strict().parse(await request.json());
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.code)))).map(v=>v.toString(16).padStart(2,'0')).join('');
 const db=adminDb();const {data:setting}=await db.from('server_settings').select('value').eq('key','BOOTSTRAP_HASH').maybeSingle();
 if(!setting||setting.value!==hash)throw new Error('Kode aktivasi tidak berlaku');
 const {data:owner}=await db.from('server_settings').select('value').eq('key','BOOTSTRAP_EMAIL').single();
 if(!owner)throw new Error('Pemilik belum ditetapkan');
 const {data,error}=await db.auth.admin.createUser({email:owner.value,password:body.password,email_confirm:true});
 if(error||!data.user)throw new Error('Akun pemilik sudah ada atau gagal dibuat');
 const result=await db.rpc('activate_super_admin',{p_user:data.user.id,p_email:owner.value,p_code_hash:hash});
 if(result.error){await db.auth.admin.deleteUser(data.user.id);throw new Error('Aktivasi sudah digunakan');}
 return NextResponse.json({email:owner.value});
 }catch{return NextResponse.json({error:'Aktivasi gagal. Periksa kode sekali pakai dan kata sandi minimal 12 karakter.'},{status:400});}
}
