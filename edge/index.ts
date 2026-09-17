import process from 'runtime-env';
import {createClient} from '@supabase/supabase-js';

const cors={'access-control-allow-origin':'https://imbabc.mrchongno1.chatgpt.site','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'GET,POST,OPTIONS','vary':'Origin'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 try{
 const secret=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
process.env.SUPABASE_URL=Deno.env.get('SUPABASE_URL');process.env.SUPABASE_SECRET_KEY=secret;
const db=createClient(process.env.SUPABASE_URL!,secret,{auth:{persistSession:false,autoRefreshToken:false}});

 const path=new URL(req.url).pathname.replace(/^.*\/imbabc-api/,'');
 const {data:values,error}=await db.from('server_settings').select('key,value');
 if(error)throw new Error('Database backend belum siap');
 for(const setting of values||[])if(['META_GRAPH_API_VERSION','META_APP_SECRET','META_WEBHOOK_VERIFY_TOKEN','TOKEN_ENCRYPTION_KEY'].includes(setting.key))process.env[setting.key]=setting.value;
 let response:Response;
 if(path==='/worker'){
 const expected=values?.find(s=>s.key==='WORKER_TOKEN')?.value;
 if(!expected||req.headers.get('x-worker-token')!==expected)return Response.json({error:'Unauthorized'},{status:401});
 const {runBatch}=await import('./worker/send.mjs');response=Response.json(await runBatch(db,3));
 }else{
 const modules:Record<string,()=>Promise<Record<string,(req:Request)=>Promise<Response>>>>={
 '/api/account':()=>import('./app/api/account/route.ts'),'/api/admin/agents':()=>import('./app/api/admin/agents/route.ts'),
 '/api/admin/settings':()=>import('./app/api/admin/settings/route.ts'),'/api/admin/bootstrap':()=>import('./app/api/admin/bootstrap/route.ts'),
 '/api/meta/connection':()=>import('./app/api/meta/connection/route.ts'),'/api/meta/templates':()=>import('./app/api/meta/templates/route.ts'),
 '/api/campaigns/launch':()=>import('./app/api/campaigns/launch/route.ts'),'/api/campaigns/status':()=>import('./app/api/campaigns/status/route.ts'),
 '/api/worker/status':()=>import('./app/api/worker/status/route.ts'),'/webhooks/meta/whatsapp':()=>import('./app/webhooks/meta/whatsapp/route.ts')};
 const handler=modules[path]?(await modules[path]())[req.method]:null;
 if(!handler)return Response.json({error:'Not found'},{status:404,headers:cors});
 // Every protected route validates the live Supabase user and account role.
 // Bootstrap uses a 256-bit one-time secret; webhook verifies Meta HMAC.
 response=await handler(req);
 }
 const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors))headers.set(k,v);
 return new Response(response.body,{status:response.status,headers});
 }catch{return Response.json({error:'Layanan belum siap. Periksa pengaturan Meta dan database.'},{status:503,headers:cors});}
});
