import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert, Database, MessageCircleMore, Send } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";

const setupSteps = [
  {
    id: "workspace", number: "01", title: "Aktifkan database dan pendaftaran",
    detail: "Buat proyek Supabase khusus IMBABC, jalankan skema IMBABC, lalu pasang URL dan kunci publik pada situs. Setelah itu daftar, masuk, dan pembuatan workspace dapat dipakai.",
    requires: "Proyek Supabase IMBABC",
  },
  {
    id: "meta", number: "02", title: "Siapkan aplikasi Meta dan webhook",
    detail: "Siapkan aplikasi Meta, WhatsApp Business Account, izin akses yang diperlukan, serta webhook untuk menerima status pesan dan balasan.",
    requires: "Aplikasi dan akun bisnis Meta",
  },
  {
    id: "whatsapp", number: "03", title: "Hubungkan nomor WhatsApp Business",
    detail: "Setelah masuk, isi WABA ID, Phone Number ID, dan system user access token di halaman WhatsApp. Jangan memasukkan token ke formulir pendaftaran atau mengirimkannya di chat.",
    requires: "Nomor WhatsApp Business resmi",
  },
  {
    id: "template", number: "04", title: "Sinkronkan template",
    detail: "Ambil template dari WABA yang terhubung. Versi ini mengirim template teks statis yang telah disetujui; template dengan variabel, header, atau tombol belum didukung.",
    requires: "Template berstatus APPROVED",
  },
  {
    id: "kontak", number: "05", title: "Tambahkan penerima yang memberi izin",
    detail: "Simpan nomor internasional dan catat izin penerima untuk menerima pesan bisnis. Kontak yang berhenti berlangganan tidak dimasukkan ke antrean.",
    requires: "Kontak berizin",
  },
  {
    id: "broadcast", number: "06", title: "Buat draft broadcast",
    detail: "Pilih template yang disetujui dan buat campaign. Draft disimpan tanpa mengirim pesan sampai Anda meluncurkannya.",
    requires: "Workspace, template, dan kontak",
  },
  {
    id: "pengiriman", number: "07", title: "Nyalakan worker pengirim",
    detail: "Jalankan worker IMBABC pada server yang selalu aktif dengan konfigurasi database dan Meta yang sama. Dashboard menolak peluncuran saat worker tidak terdeteksi.",
    requires: "Server worker yang aktif",
  },
];

export default function SetupPage() {
  return <div className="setup-page">
    <header className="setup-header wrap"><Link href="/" aria-label="Beranda IMBABC"><Image src="/imbabc-logo.png" alt="IMBABC" width={78} height={78}/></Link><Link href="/dashboard">Lihat dashboard <ArrowRight size={16}/></Link></header>
    <main className="setup-container wrap">
      <span className="eyebrow">AKTIVASI IMBABC</span>
      <h1>Supaya tombolnya benar-benar bekerja, hubungkan layanan dasarnya dulu.</h1>
      <p className="setup-intro">Saat ini situs sudah bisa dibuka, tetapi pengiriman massal belum aktif. Ikuti urutan ini untuk mengaktifkan daftar, kontak, draft, lalu pengiriman lewat WhatsApp Business Platform.</p>
      <div className="setup-status" role="status">
        {isSupabaseConfigured?<CheckCircle2 size={24}/>:<CircleAlert size={24}/>}
        <div><strong>Konfigurasi database: {isSupabaseConfigured?"tersedia":"belum tersedia"}</strong><p>{isSupabaseConfigured?"Anda bisa lanjut membuat akun dan menguji koneksi workspace.":"Pendaftaran dan tombol penyimpanan dinonaktifkan sampai proyek Supabase IMBABC dipasang."}</p></div>
      </div>
      <div className="setup-actions">
        {isSupabaseConfigured?<Link className="setup-primary" href="/register">Buat akun <ArrowRight size={17}/></Link>:<span className="setup-pending"><Database size={18}/> Menunggu database IMBABC</span>}
        <Link className="setup-secondary" href="/dashboard">Jelajahi tampilan dashboard</Link>
      </div>
      <div className="setup-steps">{setupSteps.map(({id,number,title,detail,requires})=><section id={id} key={id} className="setup-step"><span>{number}</span><div><h2>{title}</h2><p>{detail}</p><small>Perlu: {requires}</small></div></section>)}</div>
      <div className="setup-finish"><MessageCircleMore size={24}/><div><h2>Mulai dari percobaan kecil</h2><p>Setelah tujuh persiapan selesai, coba kirim ke nomor milik Anda yang sudah memberi izin. Status diterima, terkirim, dan dibaca baru muncul sesuai respons API dan webhook Meta.</p></div><Send size={25}/></div>
    </main>
  </div>;
}
