import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, MessageCircleMore, Send, ShieldCheck, UsersRound, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase";

const features = [
  { icon: Send, title: "Broadcast resmi", body: "Susun kampanye dari template yang disetujui dan kirim melalui WhatsApp Business Platform." },
  { icon: UsersRound, title: "Kontak dalam satu tempat", body: "Kelola pelanggan, tag, serta izin menerima pesan secara rapi." },
  { icon: MessageCircleMore, title: "Status pesan", body: "Pantau hasil penerimaan API dan pembaruan status dari webhook Meta." },
  { icon: Workflow, title: "Alur yang sederhana", body: "Ikuti langkah dari membuat workspace hingga memantau pengiriman." },
];

export default function Home() {
  const startHref = isSupabaseConfigured ? "/agen/login" : "/setup";
  const setupAnchors = ["workspace", "meta", "whatsapp", "template", "kontak", "broadcast", "pengiriman"];
  return <div className="site">
    <header className="public-nav wrap">
      <Link href="/" className="logo-lockup" aria-label="Beranda IMBABC"><Image src="/imbabc-logo.png" alt="IMBABC" width={180} height={180} priority /></Link>
      <nav className="public-links" aria-label="Navigasi utama">
        <a href="#fitur">Fitur</a><a href="#cara-kerja">Cara kerja</a><Link href="/agen/login">Masuk</Link>
        <Button asChild className="gradient-button"><Link href={startHref}>Mulai sekarang <ArrowRight size={16}/></Link></Button>
      </nav>
    </header>
    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <span className="eyebrow"><span className="live-dot"/> ALUR UNTUK WHATSAPP BUSINESS PLATFORM</span>
          <h1>Broadcast WhatsApp bisnis <em>tanpa ribet.</em></h1>
          <p>Siapkan kontak, template, dan broadcast dari satu dashboard. Hubungkan database dan akun WhatsApp Business sebelum mengirim pesan.</p>
          <div className="hero-actions">
            <Button asChild size="lg" className="gradient-button"><Link href={startHref}>Mulai sekarang <ArrowRight size={18}/></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/dashboard">Lihat dashboard <ChevronRight size={18}/></Link></Button>
          </div>
          <p className="hero-note"><ShieldCheck size={17}/> Kampanye tetap mengikuti kebijakan, persetujuan, biaya, dan batas pengiriman Meta.</p>
        </div>
        <div className="hero-preview" aria-label="Pratinjau alur dashboard IMBABC">
          <div className="preview-bar"><span className="preview-mark">IMBABC</span><span className="preview-caption">Gambaran alur kerja</span><span className="preview-avatar">IB</span></div>
          <div className="preview-content">
            <div className="preview-main"><span className="preview-kicker">MULAI MENGGUNAKAN IMBABC</span><h2>Semua dimulai di sini.</h2>
              <p>Langkah awal untuk menyiapkan broadcast resmi bisnis Anda.</p>
              <div className="preview-progress"><span>Urutan aktivasi</span><strong>7 langkah</strong><div/></div>
              <div className="preview-steps">
                {["Buat workspace","Hubungkan Meta","Hubungkan WhatsApp","Sinkronkan template","Tambahkan kontak","Buat broadcast","Kirim pesan"].map((s,i)=><Link href={`/setup#${setupAnchors[i]}`} key={s}><span>{String(i+1).padStart(2,"0")}</span>{s}<ChevronRight size={15}/></Link>)}
              </div>
            </div>
            <div className="preview-side"><span className="preview-icon"><MessageCircleMore size={25}/></span><span className="preview-kicker">KONEKSI WHATSAPP</span><h3>Siap saat akun Anda terhubung.</h3><p>Hubungkan akun bisnis melalui Meta untuk memakai nomor dan template resmi.</p><span className="preview-status">{isSupabaseConfigured?"Periksa koneksi akun":"Menunggu database"}</span></div>
          </div>
        </div>
      </section>
      <section id="fitur" className="features wrap">
        <div className="section-heading"><div><span className="eyebrow">SATU TEMPAT, ALUR JELAS</span><h2>Fokus pada pelanggan,<br/>bukan kerumitan teknis.</h2></div><p>Fondasi IMBABC memisahkan data setiap bisnis dan memberi status pengiriman hanya dari peristiwa resmi.</p></div>
        <div className="feature-grid">{features.map(({icon:Icon,title,body})=><article className="feature-card" key={title}><span><Icon size={23}/></span><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>
      <section id="cara-kerja" className="how wrap"><div><span className="eyebrow">CARA KERJA</span><h2>Dari daftar sampai siap mengirim.</h2><p>Langkah penting tampil jelas. Konfigurasi teknis tetap ada untuk admin, namun tidak menghalangi alur utama.</p></div><ol>{["Daftar dan buat workspace","Hubungkan WhatsApp Business melalui Meta","Siapkan kontak dengan persetujuan dan template yang disetujui","Buat kampanye lalu pantau status dari webhook"].map((v,i)=><li key={v}><span>{String(i+1).padStart(2,"0")}</span>{v}<Check size={18}/></li>)}</ol></section>
      <section className="cta wrap"><div><span className="eyebrow">MULAI DENGAN FONDASI RESMI</span><h2>Siap menata komunikasi bisnis?</h2></div><Button asChild size="lg" className="light-button"><Link href={startHref}>{isSupabaseConfigured?"Buat akun IMBABC":"Lihat langkah aktivasi"} <ArrowRight size={18}/></Link></Button></section>
    </main>
    <footer className="footer wrap"><span>© {new Date().getFullYear()} IMBABC</span><span>Penggunaan WhatsApp mengikuti persyaratan Meta. IMBABC tidak mengklaim status kemitraan Meta.</span></footer>
  </div>;
}
