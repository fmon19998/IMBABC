import {NextRequest,NextResponse} from 'next/server';
import {requireAccount,safeError} from '@/lib/server/auth';
export async function GET(request:NextRequest){
 try { const {profile}=await requireAccount(request);return NextResponse.json({profile}); }
 catch(e){return NextResponse.json({error:safeError(e)},{status:403});}
}
