"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, Check, ChevronRight, CircleHelp, FileText, LayoutDashboard, Megaphone, Menu, MessageCircleMore, Plus, Send, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/api";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type View="Dashboard"|"Inbox"|"Broadcast"|"Contacts"|"Templates"|"Automation"|"IMBABC AI"|"WhatsApp"|"Analytics"|"Integrations"|"Team"|"Billing"|"Settings";
type Contact={id:string;name:string;phone_e164:string;consent_status:string;created_at:string};
type Campaign={id:string;name:string;status:string;created_at:string};
type Template={id:string;name:string;language:string;category:string;status:string;body:string;components:{type:string;text?:string}[]};
type Connection={waba_id:string;phone_number_id:string;connected_at:string};
type CampaignStatus={campaign:{id:string;status:string;template_name:string;started_at:string;finished_at:string};counts:Record<string,number>};
const nav: {title:View;icon:typeof Activity}[]=[
  {title:"Dashboard",icon:LayoutDashboard},{title:"Broadcast",icon:Megaphone},
  {title:"Contacts",icon:UsersRound},{title:"Templates",icon:FileText},
  {title:"WhatsApp",icon:MessageCircleMore}
];
const steps=["Buat Workspace","Hubungkan Meta","Hubungkan WhatsApp","Sinkronkan Template","Tambahkan Kontak","Buat Broadcast","Kirim Pesan"];

export default function DashboardPage(){
  const router=useRouter(); const [view,setView]=useState<View>("Dashboard");
  const [ready,setReady]=useState(false);const [userId,setUserId]=useState("");
  const [userName,setUserName]=useState("");const [orgId,setOrgId]=useState("");
  const [orgName,setOrgName]=useState("");
  const [contacts,setContacts]=useState<Contact[]>([]);const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [templates,setTemplates]=useState<Template[]>([]);const [connection,setConnection]=useState<Connection|null>(null);
  const [workerOnline,setWorkerOnline]=useState(false);
  const [backendConfigured,setBackendConfigured]=useState(true);
  const [wabaId,setWabaId]=useState("");const [phoneId,setPhoneId]=useState("");const [accessToken,setAccessToken]=useState("");
  const [templateId,setTemplateId]=useState("");const [selectedCampaign,setSelectedCampaign]=useState("");
  const [testContact,setTestContact]=useState("");
  const [campaignStatus,setCampaignStatus]=useState<CampaignStatus|null>(null);
  const [name,setName]=useState("");const [phone,setPhone]=useState("");const [consent,setConsent]=useState(false);
  const [campaignName,setCampaignName]=useState("");const [error,setError]=useState("");const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
  const preview=!isSupabaseConfigured;

  const loadData=useCallback(async (organizationId:string)=>{
    const db=getSupabase();if(!db)return;
    const [a,b,c]=await Promise.all([
      db.from("contacts").select("id,name,phone_e164,consent_status,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(50),
      db.from("campaigns").select("id,name,status,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(50),
      db.from("templates").select("id,name,language,category,status,body,components").eq("organization_id",organizationId).order("updated_at",{ascending:false}).limit(100)
    ]);
    if(a.error||b.error||c.error)setError(a.error?.message||b.error?.message||c.error?.message||"Data belum dapat dimuat.");
    setContacts((a.data??[]) as Contact[]);setCampaigns((b.data??[]) as Campaign[]);setTemplates((c.data??[]) as Template[]);
    try{const [data,worker]=await Promise.all([
      apiRequest<{connection:Connection|null}>(`/api/meta/connection?organizationId=${organizationId}`),
      apiRequest<{online:boolean}>(`/api/worker/status?organizationId=${organizationId}`)
    ]);setConnection(data.connection);setWorkerOnline(worker.online);setBackendConfigured(true)}
    catch(e){const message=e instanceof Error?e.message:"Layanan backend belum tersedia";
      if(message==="Backend Supabase belum dikonfigurasi"){
        setBackendConfigured(false);setConnection(null);setWorkerOnline(false);
      }else setError(message)}
  },[]);
  useEffect(()=>{
    let live=true;
    async function start(){
      const db=getSupabase();if(!db){setReady(true);return}
      const {data:{user},error:authError}=await db.auth.getUser();
      if(!live)return;
      if(authError||!user){router.replace("/agen/login");return}
      try{const {profile}=await apiRequest<{profile:{role:string}}>("/api/account");if(profile.role!=="AGENT"){router.replace("/admin");return;}}catch{await db.auth.signOut();router.replace("/agen/login");return;}
      setUserId(user.id);setUserName(String(user.user_metadata?.name||user.email||"Akun"));
      const {data,error:orgError}=await db.from("organizations").select("id,name").eq("owner_id",user.id).order("created_at",{ascending:true}).limit(1);
      if(!live)return;
      if(orgError)setError("Workspace belum dapat dimuat: "+orgError.message);
      if(data?.[0]){setOrgId(data[0].id);setOrgName(data[0].name);await loadData(data[0].id)}
      setReady(true);
    }
    void start();return()=>{live=false};
  },[router,loadData]);
  async function addContact(e:FormEvent){
    e.preventDefault();const db=getSupabase();if(!db||!orgId||!userId)return;
    if(!/^\+[1-9]\d{7,14}$/.test(phone.trim())){setError("Nomor harus dalam format internasional, misalnya +628123456789.");return}
    setBusy(true);setError("");setNotice("");
    const {error}=await db.from("contacts").insert({organization_id:orgId,created_by:userId,name:name.trim(),phone_e164:phone.trim(),consent_status:consent?"OPTED_IN":"UNKNOWN"});
    setBusy(false);if(error){setError(error.message);return}setName("");setPhone("");setConsent(false);setNotice("Kontak ditambahkan.");await loadData(orgId);
  }
  async function createDraft(e:FormEvent){
    e.preventDefault();const db=getSupabase();if(!db||!orgId||!userId)return;
    setBusy(true);setError("");setNotice("");
    const {error}=await db.from("campaigns").insert({organization_id:orgId,created_by:userId,name:campaignName.trim(),status:"DRAFT"});
    setBusy(false);if(error){setError(error.message);return}setCampaignName("");setNotice("Draft disimpan. Pengiriman memerlukan koneksi Meta, penerima yang memenuhi syarat, dan template yang disetujui.");await loadData(orgId);
  }
  async function connectMeta(e:FormEvent){
    e.preventDefault();if(!orgId)return;setBusy(true);setError("");setNotice("");
    try{await apiRequest("/api/meta/connection",{organizationId:orgId,wabaId:wabaId.trim(),
      phoneNumberId:phoneId.trim(),accessToken:accessToken.trim()});
      setAccessToken("");setNotice("Nomor diverifikasi dan webhook didaftarkan. Sinkronkan template Meta sebelum mengirim.");
      await loadData(orgId);
    }catch(e){setError(e instanceof Error?e.message:"Koneksi Meta gagal")}finally{setBusy(false)}
  }
  async function syncTemplates(){
    if(!orgId)return;setBusy(true);setError("");setNotice("");
    try{const result=await apiRequest<{synced:number;approved:number}>("/api/meta/templates",{organizationId:orgId});
      setNotice(`${result.synced} template disinkronkan dari Meta; ${result.approved} disetujui.`);await loadData(orgId)}
    catch(e){setError(e instanceof Error?e.message:"Sinkronisasi gagal")}finally{setBusy(false)}
  }
  async function launchCampaign(id:string,test=false){
    if(!orgId||!templateId)return;setBusy(true);setError("");setNotice("");
    try{const result=await apiRequest<{queued:number}>("/api/campaigns/launch",{
      organizationId:orgId,campaignId:id,templateId,...(test?{contactId:testContact}:{})});
      setNotice(`${result.queued} penerima berizin masuk antrean. Pengirim cloud akan memproses antrean lewat WhatsApp Cloud API.`);
      setSelectedCampaign(id);await loadData(orgId);await refreshCampaign(id)}
    catch(e){setError(e instanceof Error?e.message:"Campaign gagal diluncurkan")}finally{setBusy(false)}
  }
  async function refreshCampaign(id:string){
    if(!orgId)return;setSelectedCampaign(id);
    try{const result=await apiRequest<CampaignStatus>(`/api/campaigns/status?organizationId=${orgId}&campaignId=${id}`);
      setCampaignStatus(result);await loadData(orgId)}
    catch(e){setError(e instanceof Error?e.message:"Status belum tersedia")}
  }
  async function optOut(contact:Contact){
    const db=getSupabase();if(!db||!orgId)return;setBusy(true);setError("");
    const {error:changeError}=await db.from("contacts").update({consent_status:"OPTED_OUT",updated_at:new Date().toISOString()})
      .eq("id",contact.id).eq("organization_id",orgId);
    setBusy(false);if(changeError){setError(changeError.message);return}
    setNotice(`${contact.name} berhenti menerima broadcast.`);await loadData(orgId);
  }
  async function signOut(){const db=getSupabase();await db?.auth.signOut();router.replace("/agen/login")}
  const eligible=contacts.filter(c=>c.consent_status==="OPTED_IN").length;
  const approved=templates.filter(t=>t.status==="APPROVED"&&
    !JSON.stringify(t.components).match(/\{\{[0-9]+\}\}/)&&!t.components.some(c=>["HEADER","BUTTONS"].includes(c.type)));
  const sentCount=campaignStatus?(["SENT","DELIVERED","READ"] as const).reduce((n,s)=>n+(campaignStatus.counts[s]||0),0):null;
  const completed=(orgId?1:0)+(connection?2:0)+(approved.length?1:0)+(eligible?1:0)+
    (campaigns.length?1:0)+(campaigns.some(c=>c.status!=="DRAFT")?1:0);
  const title=view==="Dashboard"?"Ringkasan workspace":view;
  useEffect(()=>{
    type ModelContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
    const context=(document as Document&{modelContext?:ModelContext}).modelContext;
    if(!context?.registerTool)return;
    const controller=new AbortController();
    void Promise.resolve(context.registerTool({
      name:"open_imbabc_section",title:"Buka bagian IMBABC",
      description:"Buka Dashboard, Contacts, Broadcast, Templates, atau WhatsApp yang tersedia di antarmuka.",
      inputSchema:{type:"object",properties:{section:{type:"string",enum:["Dashboard","Contacts","Broadcast","Templates","WhatsApp"]}},required:["section"],additionalProperties:false},
      annotations:{readOnlyHint:false},
      execute(input){
        const section=(input as {section?:unknown})?.section;
        if(!["Dashboard","Contacts","Broadcast","Templates","WhatsApp"].includes(String(section)))throw new Error("Bagian tidak tersedia");
        setView(section as View);return {opened:section};
      }
    },{signal:controller.signal})).catch(()=>{});
    return()=>controller.abort();
  },[]);

  return <SidebarProvider><Sidebar className="app-sidebar" collapsible="offcanvas">
      <SidebarHeader className="app-sidebar-head"><Link href="/" aria-label="IMBABC beranda" className="dashboard-logo"><Image src="/imbabc-logo.png" alt="IMBABC" width={150} height={150}/></Link><span className="sidebar-caption">BUSINESS CONSOLE</span></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{nav.map(({title:label,icon:Icon})=><SidebarMenuItem key={label}><SidebarMenuButton isActive={view===label} onClick={()=>{setView(label);setError("");setNotice("")}}><Icon size={18}/><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="app-sidebar-foot"><Button variant="ghost" onClick={()=>router.push("/setup")}><CircleHelp size={17}/> Langkah aktivasi</Button><span>{userName||"Akun IMBABC"}</span>{!preview&&<Button variant="ghost" onClick={signOut}>Keluar</Button>}</SidebarFooter>
    </Sidebar><SidebarInset className="app-inset">
      <header className="app-header"><SidebarTrigger aria-label="Buka menu"><Menu size={19}/></SidebarTrigger><div className="app-breadcrumb">{orgName||"IMBABC"}<ChevronRight size={15}/><strong>{title}</strong></div><span className="header-status"><span/> WhatsApp {connection?"terhubung":"belum terhubung"}</span></header>
      <main className="app-main">
        {!ready?<p>Memuat workspace...</p>:<>
          {preview&&<div className="setup-warning"><ShieldCheck size={20}/><div><strong>Pratinjau struktur IMBABC</strong><p>Database belum terhubung. Pendaftaran, penyimpanan data, dan pengiriman belum aktif. <Link href="/setup">Buka langkah aktivasi</Link>.</p></div></div>}
          {!preview&&!backendConfigured&&<div className="setup-warning"><ShieldCheck size={20}/><div><strong>Akun dan data dasar sudah aktif</strong><p>Kontak dan draft tersimpan di database IMBABC. Koneksi Meta, sinkronisasi template, dan pengiriman masih menunggu kunci backend serta worker. <Link href="/setup">Lihat langkah berikutnya</Link>.</p></div></div>}
          {error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="form-notice" role="status">{notice}</div>}
          {!preview&&!orgId?<section className="workspace-create"><h1>Workspace belum tersedia</h1><p>Hubungi super admin untuk melengkapi akun agen ini.</p></section>:
          <>
            <div className="app-title"><div><span className="eyebrow">{view==="Dashboard"?"OVERVIEW":"PORTAL AGEN / "+view.toUpperCase()}</span><h1>{title}</h1><p>{view==="Dashboard"?"Pantau langkah awal dan aktivitas bisnis Anda.":description(view)}</p></div>{view==="Broadcast"&&<Button className="gradient-button" onClick={()=>preview?router.push("/setup#broadcast"):document.getElementById("draft-form")?.scrollIntoView({behavior:"smooth"})}><Plus size={17}/> Buat draft</Button>}</div>
            {view==="Dashboard"&&<><section className="onboard-card"><div className="onboard-text"><span className="eyebrow">MULAI MENGGUNAKAN IMBABC</span><h2>{completed===7?"IMBABC SIAP DIGUNAKAN":"Siapkan bisnis Anda, langkah demi langkah."}</h2><p>Mulai dari workspace, lanjutkan ke Meta dan nomor WhatsApp bisnis.</p><div className="onboard-progress"><span>{completed} / 7 selesai</span><strong>{Math.round(completed/7*100)}%</strong></div><Progress value={completed/7*100}/></div><div className="onboard-art"><Send size={48}/><span>IMBABC</span></div></section>
              <div className="dashboard-grid"><section className="steps-card"><h2>Checklist persiapan</h2><div className="step-list">{steps.map((step,i)=>{const done=[!!orgId,!!connection,!!connection,!!approved.length,!!eligible,!!campaigns.length,campaigns.some(c=>c.status!=="DRAFT")][i];return <button key={step} type="button" onClick={()=>preview?router.push(`/setup#${["workspace","meta","whatsapp","template","kontak","broadcast","pengiriman"][i]}`):setView(i===0?"Dashboard":i===1||i===2?"WhatsApp":i===3?"Templates":i===4?"Contacts":"Broadcast")}><span className={done?"step-done":"step-empty"}>{done?<Check size={15}/>:i+1}</span><strong>{step}</strong><ChevronRight size={16}/></button>})}</div></section>
              <section className="connection-card"><div className="connection-icon"><MessageCircleMore size={27}/></div><span className="eyebrow">KONEKSI RESMI</span><h2>Hubungkan WhatsApp</h2><p>{connection?`Nomor ID ${connection.phone_number_id} terhubung. Sinkronkan template dan tunggu pengirim cloud aktif untuk mengirim.`:"Hubungkan WABA dan nomor WhatsApp Business lewat token system user resmi Meta."}</p><span className="connection-state">{connection?"Terhubung":"Belum terhubung"}</span><Button onClick={()=>preview?router.push("/setup#meta"):setView("WhatsApp")} className="gradient-button">{preview?"Langkah menghubungkan":"Lihat pengaturan"} <ArrowRight size={16}/></Button></section></div>
              <div className="metrics-grid"><Metric title="Kontak berizin" value={preview?"—":String(eligible)} icon={UsersRound}/><Metric title="Draft broadcast" value={preview?"—":String(campaigns.filter(c=>c.status==="DRAFT").length)} icon={Megaphone}/><Metric title="Nomor terhubung" value={preview?"—":connection?"1":"0"} icon={MessageCircleMore}/><Metric title="Terkirim (campaign dipilih)" value={sentCount===null?"—":String(sentCount)} icon={Send}/></div>
              <section className="empty-panel"><Activity size={20}/><div><h2>{campaigns.some(c=>c.status!=="DRAFT")?"Pantau pengiriman campaign":"Belum ada aktivitas pengiriman"}</h2><p>{campaigns.some(c=>c.status!=="DRAFT")?"Buka Broadcast dan pilih Lihat status untuk angka penerimaan API dan status webhook Meta.":"Statistik pengiriman akan berasal dari WhatsApp Cloud API dan webhook resmi setelah koneksi aktif."}</p></div></section>
            </>}
            {view==="WhatsApp"&&<section className="feature-panel"><div className="large-icon"><MessageCircleMore size={32}/></div><h2>{connection?"Nomor WhatsApp Business terhubung":"Hubungkan nomor WhatsApp Business"}</h2><p>Gunakan WABA ID, Phone Number ID, dan system user access token resmi dari akun Meta bisnis Anda. Server memverifikasi bahwa nomor berada di WABA, mendaftarkan webhook, lalu mengenkripsi token. Meta Embedded Signup untuk pelanggan lain memerlukan konfigurasi aplikasi dan peninjauan Meta lebih lanjut.</p>{connection&&<p><strong>WABA:</strong> {connection.waba_id}<br/><strong>Nomor ID:</strong> {connection.phone_number_id}</p>}
              {!preview&&orgId&&<form onSubmit={connectMeta} className="form-stack"><label htmlFor="waba-id">WABA ID</label><Input id="waba-id" required inputMode="numeric" value={wabaId} onChange={e=>setWabaId(e.target.value)}/><label htmlFor="phone-id">Phone Number ID</label><Input id="phone-id" required inputMode="numeric" value={phoneId} onChange={e=>setPhoneId(e.target.value)}/><label htmlFor="access-token">System user access token</label><Input id="access-token" required type="password" autoComplete="off" value={accessToken} onChange={e=>setAccessToken(e.target.value)}/><Button disabled={busy} type="submit" className="gradient-button">{connection?"Perbarui koneksi":"Verifikasi dan hubungkan"}</Button></form>}
              {preview&&<p><Link href="/setup#meta">Lihat apa yang harus dihubungkan dahulu →</Link></p>}
              <small>Jangan gunakan token sementara untuk operasional. Kirim hanya ke kontak yang memberi izin; ketentuan dan biaya pesan Meta berlaku.</small></section>}
            {view==="Contacts"&&<div className="content-columns"><section className="content-panel"><h2>Daftar kontak</h2>{contacts.length?<Table><TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Nomor</TableHead><TableHead>Izin pesan</TableHead><TableHead>Tindakan</TableHead></TableRow></TableHeader><TableBody>{contacts.map(c=><TableRow key={c.id}><TableCell>{c.name}</TableCell><TableCell>{c.phone_e164}</TableCell><TableCell>{c.consent_status==="OPTED_IN"?"Tercatat":c.consent_status==="OPTED_OUT"?"Berhenti berlangganan":"Belum ada"}</TableCell><TableCell>{c.consent_status==="OPTED_IN"&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>optOut(c)}>Hentikan pesan</Button>}</TableCell></TableRow>)}</TableBody></Table>:<p className="muted">Belum ada kontak. Tambahkan kontak dengan nomor internasional dan catat izinnya.</p>}</section><section className="content-panel"><h2>Tambah kontak</h2><form onSubmit={addContact} className="form-stack"><label htmlFor="contact-name">Nama</label><Input id="contact-name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/><label htmlFor="contact-phone">Nomor WhatsApp</label><Input id="contact-phone" required type="tel" placeholder="+628123456789" value={phone} onChange={e=>setPhone(e.target.value)}/><label className="consent-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Saya memiliki bukti bahwa kontak ini setuju menerima pesan bisnis.</label><Button className="gradient-button" disabled={preview||!orgId||busy} type="submit">Simpan kontak</Button></form>{preview&&<small>Aktif setelah database dikonfigurasi.</small>}</section></div>}
            {view==="Broadcast"&&<div className="content-columns"><section className="content-panel"><h2>Campaign</h2><p className="muted">Worker pengirim: {workerOnline?"aktif":"belum aktif"} · <button className="text-button" onClick={()=>loadData(orgId)}>Periksa lagi</button></p>{campaigns.length?<Table><TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Status antrean</TableHead><TableHead>Dibuat</TableHead><TableHead>Tindakan</TableHead></TableRow></TableHeader><TableBody>{campaigns.map(c=><TableRow key={c.id}><TableCell>{c.name}</TableCell><TableCell>{c.status}</TableCell><TableCell>{new Date(c.created_at).toLocaleDateString("id-ID")}</TableCell><TableCell>{c.status==="DRAFT"?<><Button variant="outline" size="sm" disabled={busy||!workerOnline||!connection||!approved.length||!eligible||!templateId} onClick={()=>launchCampaign(c.id)}>Blast semua kontak berizin</Button> <Button variant="outline" size="sm" disabled={busy||!workerOnline||!connection||!templateId||!testContact} onClick={()=>launchCampaign(c.id,true)}>Kirim uji 1 kontak</Button></>:<Button variant="outline" size="sm" onClick={()=>refreshCampaign(c.id)}>Lihat status</Button>}</TableCell></TableRow>)}</TableBody></Table>:<p className="muted">Belum ada campaign. Buat draft untuk mulai menyusun rencana broadcast.</p>}
              {campaignStatus&&selectedCampaign&&<div className="campaign-report"><h3>Status campaign yang dipilih</h3><p>Campaign {campaignStatus.campaign.status}. “ACCEPTED” berarti API menerima pesan; “SENT”, “DELIVERED”, dan “READ” berasal dari webhook Meta.</p><div>{Object.entries(campaignStatus.counts).map(([status,count])=><span key={status}>{status}: <strong>{count}</strong></span>)}</div><Button variant="outline" onClick={()=>refreshCampaign(selectedCampaign)}>Perbarui status</Button></div>}</section><section className="content-panel"><h2>Broadcast berizin</h2><p className="muted">Buat draft, pilih template Meta yang disetujui, lalu masukkan seluruh kontak berizin ke antrean. Pengirim cloud memproses antrean setelah konfigurasi Meta lengkap; batas dan biaya Meta tetap berlaku.</p><form id="draft-form" onSubmit={createDraft} className="form-stack"><label htmlFor="campaign-name">Nama campaign</label><Input id="campaign-name" required maxLength={120} value={campaignName} onChange={e=>setCampaignName(e.target.value)} placeholder="Contoh: Informasi pelanggan September"/><Button className="gradient-button" disabled={preview||!orgId||busy} type="submit">Simpan draft</Button></form><div className="form-stack"><label htmlFor="approved-template">Template untuk peluncuran draft</label><select id="approved-template" value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Pilih template yang disetujui</option>{approved.map(t=><option value={t.id} key={t.id}>{t.name} · {t.language}</option>)}</select><label htmlFor="test-contact">Kontak untuk uji kirim</label><select id="test-contact" value={testContact} onChange={e=>setTestContact(e.target.value)}><option value="">Pilih satu kontak berizin</option>{contacts.filter(c=>c.consent_status==="OPTED_IN").map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone_e164}</option>)}</select><small>{eligible} kontak dengan izin tercatat. Pilih template sebelum menekan “Masukkan antrean” pada draft.</small></div></section></div>}
            {view==="Templates"&&<section className="feature-panel"><div className="large-icon"><FileText size={30}/></div><h2>Template Meta</h2><p>Sinkronkan template resmi dari WABA. Versi pengiriman ini mendukung template teks statis yang disetujui Meta, tanpa variabel, header, atau tombol.</p><Button disabled={preview||!connection||busy} onClick={syncTemplates}>Sinkronkan dari Meta</Button>{templates.length?<div className="template-list">{templates.map(t=><article key={t.id}><strong>{t.name}</strong> <span>{t.language} · {t.category} · {t.status}</span><p>{t.body||"Tidak ada teks body"}</p></article>)}</div>:<p className="muted">Belum ada template tersinkron.</p>}</section>}
            {!["Dashboard","WhatsApp","Contacts","Broadcast","Templates"].includes(view)&&<section className="feature-panel"><div className="large-icon"><Activity size={30}/></div><h2>{view} belum diaktifkan</h2><p>Modul ini direncanakan untuk tahap berikutnya. Belum ada data atau hasil yang dibuat-buat.</p><Button variant="outline" onClick={()=>setView("Dashboard")}>Kembali ke dashboard</Button></section>}
          </>}
        </>}
      </main>
    </SidebarInset></SidebarProvider>;
}
function Metric({title,value,icon:Icon}:{title:string;value:string;icon:typeof Activity}){return <div className="metric"><span><Icon size={19}/></span><p>{title}</p><strong>{value}</strong></div>}
function description(view:View){const descriptions:Record<View,string>={Dashboard:"",Inbox:"Percakapan pelanggan akan muncul setelah koneksi aktif.",Broadcast:"Siapkan dan pantau kampanye WhatsApp bisnis.",Contacts:"Kelola pelanggan dan status persetujuan mereka.",Templates:"Template pesan resmi untuk WhatsApp.",Automation:"Atur alur komunikasi setelah sistem terhubung.","IMBABC AI":"Asisten untuk membantu tim Anda saat modul aktif.",WhatsApp:"Status koneksi WhatsApp Business dan Meta.",Analytics:"Statistik dari data pengiriman sebenarnya.",Integrations:"Koneksi eksternal untuk operasional bisnis.",Team:"Anggota dan akses workspace.",Billing:"Langganan IMBABC dan biaya pesan Meta ditampilkan terpisah.",Settings:"Pengaturan ruang kerja."};return descriptions[view]}
