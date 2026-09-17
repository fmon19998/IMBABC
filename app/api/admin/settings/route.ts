import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAccount,safeError} from '@/lib/server/auth';
const keys=['META_GRAPH_API_VERSION','META_APP_SECRET','META_WEBHOOK_VERIFY_TOKEN'];
export async function GET(req:NextRequest){try{const {db}=await requireAccount(req,'SUPER_ADMIN');const {data,error}=await db.from('server_settings').select('key').in('key',keys);if(error)throw error;return NextResponse.json({configured:data?.map(x=>x.key)||[]});}catch(e){return NextResponse.json({error:safeError(e)},{status:403});}}
export async function POST(req:NextRequest){try{const {db}=await requireAccount(req,'SUPER_ADMIN');const body=z.object({version:z.string().regex(/^v\d{2}\.\d+$/),appSecret:z.string().min(16).max(256),verifyToken:z.string().min(20).max(256)}).strict().parse(await req.json());const {error}=await db.from('server_settings').upsert([{key:keys[0],value:body.version},{key:keys[1],value:body.appSecret},{key:keys[2],value:body.verifyToken}]);if(error)throw error;return NextResponse.json({saved:true});}catch(e){return NextResponse.json({error:safeError(e)},{status:400});}}
