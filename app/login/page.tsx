"use client";
import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function Login() {
  const router=useRouter();
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent) {
    e.preventDefault(); const db=getSupabase(); if(!db){setError("Autentikasi belum dikonfigurasi. Hubungi pengelola IMBABC.");return}
    setBusy(true);setError("");
    const {error}=await db.auth.signInWithPassword({email,password}); setBusy(false);
    if(error){setError(error.message);return} router.replace("/dashboard");
  }
  async function google(){
    const db=getSupabase(); if(!db){setError("Login Google belum dikonfigurasi.");return}
    const {error}=await db.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin+"/dashboard"}});
    if(error)setError(error.message);
  }
  if(!isSupabaseConfigured)return <main className="auth-shell"><div className="auth-panel">
    <Link href="/" className="auth-logo"><Image src="/imbabc-logo.png" alt="IMBABC" width={140} height={140}/></Link>
    <span className="eyebrow">AKTIVASI AKUN</span><h1>Login belum aktif</h1>
    <p>Database khusus IMBABC belum tersambung sehingga belum ada akun yang bisa dipakai masuk.</p>
    <Button asChild className="gradient-button auth-submit"><Link href="/setup">Lihat langkah aktivasi <ArrowRight size={17}/></Link></Button>
    <p className="auth-bottom"><Link href="/dashboard">Jelajahi tampilan dashboard</Link></p>
  </div><aside className="auth-aside"><div><span className="eyebrow">IMBABC</span><h2>Mulai setelah data siap disimpan.</h2></div></aside></main>;
  return <main className="auth-shell"><div className="auth-panel">
    <Link href="/" className="auth-logo"><Image src="/imbabc-logo.png" alt="IMBABC" width={140} height={140}/></Link>
    <span className="eyebrow">SELAMAT DATANG KEMBALI</span><h1>Masuk ke IMBABC</h1><p>Kelola komunikasi WhatsApp bisnis Anda dalam satu tempat.</p>
    <form onSubmit={submit}><label htmlFor="email">Email</label><Input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nama@perusahaan.com"/>
      <label htmlFor="password">Kata sandi</label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Kata sandi Anda"/>
      <Button type="submit" className="gradient-button auth-submit" disabled={busy}>{busy?"Memproses...":"Masuk"}<ArrowRight size={17}/></Button>
    </form>
    <div className="auth-divider">atau</div><Button type="button" variant="outline" className="auth-google" onClick={google}>Lanjutkan dengan Google</Button>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <p className="auth-bottom">Belum punya akun? <Link href="/register">Daftar sekarang</Link></p>
  </div><aside className="auth-aside"><div><span className="eyebrow">IMBABC</span><h2>Komunikasi bisnis yang lebih tertata.</h2><p>Workspace, koneksi resmi, kontak, template, dan broadcast dengan langkah yang jelas.</p></div></aside></main>;
}
