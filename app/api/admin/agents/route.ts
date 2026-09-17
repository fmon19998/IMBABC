import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAccount,safeError} from '@/lib/server/auth';
export async function GET(request:NextRequest){
 try{const {db}=await requireAccount(request,'SUPER_ADMIN');
 const {data,error}=await db.from('account_profiles').select('user_id,email,name,active,created_at').eq('role','AGENT').order('created_at',{ascending:false});
 if(error)throw error;return NextResponse.json({agents:data});
 }catch(e){return NextResponse.json({error:safeError(e)},{status:403});}
}
const create=z.object({action:z.literal('create'),email:z.string().email().max(254),name:z.string().trim().min(2).max(100),company:z.string().trim().min(2).max(100),password:z.string().min(12).max(128)}).strict();
const toggle=z.object({action:z.literal('toggle'),userId:z.string().uuid(),active:z.boolean()}).strict();
export async function POST(request:NextRequest){
 try{const {db}=await requireAccount(request,'SUPER_ADMIN');const body=z.discriminatedUnion('action',[create,toggle]).parse(await request.json());
 if(body.action==='toggle'){
 const {data,error}=await db.from('account_profiles').update({active:body.active}).eq('user_id',body.userId).eq('role','AGENT').select('user_id').single();
 if(error||!data)throw new Error('Agen tidak ditemukan');return NextResponse.json({updated:true});
 }
 const {data,error}=await db.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true,user_metadata:{name:body.name}});
 if(error||!data.user)throw new Error('Akun gagal dibuat. Periksa email yang mungkin sudah terdaftar.');
 const created=await db.rpc('provision_agent',{p_user:data.user.id,p_email:body.email,p_name:body.name,p_company:body.company});
 if(created.error){await db.auth.admin.deleteUser(data.user.id);throw new Error('Workspace agen gagal dibuat. Akun dibatalkan.');}
 return NextResponse.json({created:true});
 }catch(e){return NextResponse.json({error:safeError(e)},{status:400});}
}
