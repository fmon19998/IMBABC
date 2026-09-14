"use client";
import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function Register(){
  const router=useRouter();
  const [name,setName]=useState("");const [company,setCompany]=useState("");
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");
  const [notice,setNotice]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();const db=getSupabase();if(!db){setError("Pendaftaran belum dikonfigurasi. Hubungi pengelola IMBABC.");return}
    setBusy(true);setError("");setNotice("");
    const {data,error}=await db.auth.signUp({email,password,options:{data:{name,company_name:company},emailRedirectTo:window.location.origin+"/dashboard"}});
    setBusy(false);if(error){setError(error.message);return}
    if(data.session)router.replace("/dashboard");
    else setNotice("Akun dibuat. Periksa email Anda untuk mengonfirmasi pendaftaran, lalu masuk.");
  }
  async function google(){
    const db=getSupabase();if(!db){setError("Pendaftaran Google belum dikonfigurasi.");return}
    const {error}=await db.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin+"/dashboard"}});
    if(error)setError(error.message);
  }
  if(!isSupabaseConfigured)return <main className="auth-shell"><div className="auth-panel">
    <Link href="/" className="auth-logo"><Image src="/imbabc-logo.png" alt="IMBABC" width={140} height={140}/></Link>
    <span className="eyebrow">AKTIVASI AKUN</span><h1>Pendaftaran belum aktif</h1>
    <p>IMBABC belum terhubung ke database khusus. Akun belum dapat dibuat atau disimpan. Lihat persiapan yang diperlukan sebelum mulai.</p>
    <Button asChild className="gradient-button auth-submit"><Link href="/setup">Lihat langkah aktivasi <ArrowRight size={17}/></Link></Button>
    <p className="auth-bottom"><Link href="/dashboard">Jelajahi tampilan dashboard</Link></p>
  </div><aside className="auth-aside"><div><span className="eyebrow">IMBABC</span><h2>Mulai setelah data siap disimpan.</h2></div></aside></main>;
  return <main className="auth-shell"><div className="auth-panel">
    <Link href="/" className="auth-logo"><Image src="/imbabc-logo.png" alt="IMBABC" width={140} height={140}/></Link>
    <span className="eyebrow">MULAI DENGAN MUDAH</span><h1>Buat akun IMBABC</h1><p>Mulai dari workspace untuk bisnis Anda.</p>
    <form onSubmit={submit}>
      <label htmlFor="name">Nama</label><Input id="name" required autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Nama lengkap"/>
      <label htmlFor="company">Nama perusahaan</label><Input id="company" required value={company} onChange={e=>setCompany(e.target.value)} placeholder="Nama bisnis Anda"/>
      <label htmlFor="email">Email</label><Input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nama@perusahaan.com"/>
      <label htmlFor="password">Kata sandi</label><Input id="password" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimal 8 karakter"/>
      <Button type="submit" className="gradient-button auth-submit" disabled={busy}>{busy?"Memproses...":"Daftar"}<ArrowRight size={17}/></Button>
    </form>
    <div className="auth-divider">atau</div><Button type="button" variant="outline" className="auth-google" onClick={google}>Daftar dengan Google</Button>
    {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-notice" role="status">{notice}</p>}
    <p className="auth-bottom">Sudah punya akun? <Link href="/login">Masuk</Link></p>
  </div><aside className="auth-aside"><div><span className="eyebrow">MULAI TANPA DATA CONTOH</span><h2>Workspace milik bisnis Anda sendiri.</h2><p>Tidak ada perusahaan atau pesan palsu. Anda memutuskan kapan akun WhatsApp terhubung.</p></div></aside></main>;
}
