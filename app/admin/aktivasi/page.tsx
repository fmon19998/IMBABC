"use client";
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {apiRequest} from '@/lib/api';
export default function Activation(){const [code,setCode]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [email,setEmail]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await apiRequest<{email:string}>('/api/admin/bootstrap',{code:code.trim(),password},true);setEmail(r.email);setCode('');setPassword('');}catch(e){setError(e instanceof Error?e.message:'Aktivasi gagal');}finally{setBusy(false);}}
 return <main className="auth-shell"><section className="auth-panel"><span className="eyebrow">IMBABC · PEMILIK</span><h1>Aktivasi super admin</h1>{email?<><p>Akun {email} siap. Masuk dengan kata sandi yang baru Anda buat.</p><Button asChild><Link href="/admin/login">Masuk super admin</Link></Button></>:<><p>Gunakan kode aktivasi pribadi yang diberikan kepada pemilik. Kode hanya berlaku sekali.</p><form className="form-stack" onSubmit={submit}><label htmlFor="activation-code">Kode aktivasi</label><Input id="activation-code" type="password" autoComplete="off" required value={code} onChange={e=>setCode(e.target.value)}/><label htmlFor="new-password">Kata sandi super admin</label><Input id="new-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)}/><Button disabled={busy} type="submit">Aktifkan akun</Button></form></>}{error&&<p role="alert" className="form-error">{error}</p>}</section></main>;
}
