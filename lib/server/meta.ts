const encoder=new TextEncoder();

function graphVersion(){
  const version=process.env.META_GRAPH_API_VERSION;
  if(!version||!/^v[0-9]{2}\.[0-9]+$/.test(version))throw new Error("Versi Meta Graph API belum dikonfigurasi");
  return version;
}
function base64(input:Uint8Array){return btoa(Array.from(input,x=>String.fromCharCode(x)).join(""))}
function unbase64(input:string){return Uint8Array.from(atob(input),c=>c.charCodeAt(0))}
async function encryptionKey(){
  const raw=process.env.TOKEN_ENCRYPTION_KEY;
  if(!raw)throw new Error("Kunci enkripsi token belum dikonfigurasi");
  const bytes=unbase64(raw);
  if(bytes.length!==32)throw new Error("Kunci enkripsi token harus berukuran 32 byte");
  return crypto.subtle.importKey("raw",bytes,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
export async function encryptToken(token:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(),encoder.encode(token));
  return base64(iv)+"."+base64(new Uint8Array(cipher));
}
export async function decryptToken(value:string){
  const [encodedIv,encodedCipher]=value.split(".");
  if(!encodedIv||!encodedCipher)throw new Error("Token tersimpan tidak valid");
  const iv=unbase64(encodedIv);
  const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:new Uint8Array(iv)},
    await encryptionKey(),unbase64(encodedCipher));
  return new TextDecoder().decode(plaintext);
}

export async function graphRequest<T>(token:string,path:string,method="GET"):Promise<T>{
  if(!path.startsWith("/")||path.startsWith("//"))throw new Error("Alamat Meta tidak valid");
  const url="https://graph.facebook.com/"+graphVersion()+path;
  const response=await fetch(url,{method,headers:{authorization:"Bearer "+token},
    signal:AbortSignal.timeout(15000),cache:"no-store"});
  if(!response.ok)throw new Error("Meta: HTTP "+response.status);
  return await response.json() as T;
}

export async function graphPages<T>(token:string,path:string):Promise<T[]>{
  let next="https://graph.facebook.com/"+graphVersion()+path;
  const all:T[]=[];
  for(let page=0;page<100 && next;page++){
    // Paging links supplied by Meta are only accepted on graph.facebook.com.
    const url=new URL(next);
    if(url.protocol!=="https:"||url.hostname!=="graph.facebook.com"||!url.pathname.startsWith("/"+graphVersion()+"/"))
      throw new Error("Alamat halaman Meta tidak dikenal");
    const response=await fetch(url,{headers:{authorization:"Bearer "+token},signal:AbortSignal.timeout(15000),cache:"no-store"});
    if(!response.ok)throw new Error("Meta: HTTP "+response.status);
    const body=await response.json() as {data?:T[];paging?:{next?:string}};
    if(!Array.isArray(body.data))throw new Error("Respons Meta tidak valid");
    all.push(...body.data);next=body.paging?.next||"";
  }
  if(next)throw new Error("Terlalu banyak halaman Meta; sinkronisasi dibatalkan");
  return all;
}
