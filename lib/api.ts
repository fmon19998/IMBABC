import {getSupabase} from './supabase';
export async function apiRequest<T>(path:string,body?:object,anonymous=false):Promise<T>{
 const db=getSupabase();if(!db)throw new Error('Database belum dikonfigurasi');
 const {data:{session}}=await db.auth.getSession();
 if(!anonymous&&!session)throw new Error('Silakan masuk terlebih dahulu');
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL+'/functions/v1/imbabc-api'+path;
 const res=await fetch(url,{method:body?'POST':'GET',headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,...(session?{authorization:'Bearer '+session.access_token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await res.json() as {error?:string};if(!res.ok)throw new Error(data.error||'Permintaan gagal');return data as T;
}
