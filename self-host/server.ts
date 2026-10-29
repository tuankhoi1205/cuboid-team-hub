import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, sep, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { Hub, HubError, ensure, type Member } from "../lib/domain.ts";
import { handleHub, type HubRuntime } from "../lib/hub-http.ts";
import { SqliteStore } from "./sqlite.ts";
import { LocalAuth, cookieValue, sessionCookie } from "./auth.ts";
import {BasicQcService} from "./qc-basic.ts";
import {KpiCountService} from "./kpi-count.ts";
import schema from "../drizzle/0000_sweet_white_queen.sql?raw";

const LEAD_EMAIL="26ai.khoint2@vinuni.edu.vn";
export const BASE_HEADERS={
  "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY",
  "Content-Security-Policy":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Permissions-Policy":"camera=(), microphone=(), geolocation=()","Cache-Control":"no-store",
};
const json=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{...BASE_HEADERS,...headers}});
const redirect=(path:string,headers:Record<string,string>={})=>new Response(null,{status:303,headers:{...BASE_HEADERS,Location:path,...headers}});
async function readJson(req:Request,limit=1024*1024) {
  ensure(Number(req.headers.get("content-length")||0)<=limit,"Yêu cầu quá lớn",413);
  const reader=req.body?.getReader();ensure(reader,"Thiếu dữ liệu");const chunks:Uint8Array[]=[];let length=0;
  for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new HubError("Yêu cầu quá lớn",413);}chunks.push(value);}
  try {return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new HubError("JSON không hợp lệ");}
}
class LocalBucket {
  constructor(private root:string) {}
  file(key:string) { ensure(/^files\/[a-f0-9-]{36}$/.test(key),"Mã tệp không hợp lệ");return join(this.root,key.slice(6)); }
  async put(key:string,body:ArrayBuffer) { await mkdir(this.root,{recursive:true,mode:0o700});await writeFile(this.file(key),new Uint8Array(body),{flag:"wx",mode:0o600}); }
  async get(key:string) {try{return {body:new Uint8Array(await readFile(this.file(key)))};}catch(e:any){if(e.code==="ENOENT")return null;throw e;} }
  async delete(key:string) { await rm(this.file(key),{force:true}); }
}
type Options={dataDir:string;publicDir:string;port?:number;now?:()=>Date};
export async function createLocalApp(options:Options) {
  const dataDir=resolve(options.dataDir),publicDir=resolve(options.publicDir),port=options.port||3210;
  const startedAt=new Date().toISOString();
  let buildId:string|null=null;try{buildId=JSON.parse(readFileSync(resolve(publicDir,"../build-manifest.json"),"utf8")).buildId||null;}catch{}
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const store=new SqliteStore(join(dataDir,"cuboid.sqlite"),schema);
  const now=options.now||(()=>new Date()),hub=new Hub(store,LEAD_EMAIL,now());
  if(!(await hub.members()).length)await hub.setup({userId:"local:member-0",email:LEAD_EMAIL});
  let instance=(store.sql.prepare("SELECT value FROM selfhost_meta WHERE key='instance'").get() as any)?.value;
  if(!instance){instance=randomUUID();store.sql.prepare("INSERT INTO selfhost_meta VALUES('instance',?)").run(instance);}
  const auth=new LocalAuth(store);await auth.initialize();
  const basicQc=new BasicQcService(()=>new Hub(store,LEAD_EMAIL,now()),dataDir,resolve(process.env.HUB_ROOT||"self-host"));await basicQc.initialize();
  const kpiCount=new KpiCountService(()=>new Hub(store,LEAD_EMAIL,now()),dataDir,resolve(process.env.HUB_ROOT||"self-host"));await kpiCount.initialize();
  const refreshAttendance=()=>new Hub(store,LEAD_EMAIL,now()).ensureAttendanceDefaults();
  await refreshAttendance();
  const attendanceTimer=setInterval(()=>{void refreshAttendance().catch(e=>console.error("Không thể tạo điểm danh mặc định:",e.message));},60000);attendanceTimer.unref();
  const publicOrigin=()=>{
    try{const value=(process.env.HUB_PUBLIC_ORIGIN||readFileSync(join(dataDir,"public-url.txt"),"utf8")).trim();const u=new URL(value);return u.protocol==="https:"&&u.username===""&&u.password===""&&u.pathname==="/"?u.origin:"";}catch{return "";}
  };
  const origins=()=>new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,...(publicOrigin()?[publicOrigin()]:[])]);
  const localRequest=(req:Request)=>["127.0.0.1","localhost"].includes(new URL(req.url).hostname)&&!req.headers.has("cf-connecting-ip")&&!req.headers.has("x-forwarded-for");
  const ip=(req:Request)=>req.headers.get("cf-connecting-ip")||"loopback";
  const runtime:HubRuntime={DB:store,now,BUCKET:new LocalBucket(join(dataDir,"files")),LEAD_EMAIL,backupExtra:{authMode:"local",instanceId:instance},authenticate:async req=>{const m=await auth.current(req);return m?{userId:m.auth_id!,email:m.email}:null;},afterMutation:(action,result,me,body,req)=>auth.afterMutation(action,result,me,body,req,publicOrigin())};
  const memberInfo=(m:Member)=>({id:m.id,name:m.name,username:m.email.split("@")[0],role:m.role});
  const bootstrapState=(m:Member)=>new Hub(store,LEAD_EMAIL,now()).state({userId:m.auth_id!,email:m.email});

  async function restore(req:Request,me:Member) {
    hub.attendanceLead(me);const body=await readJson(req,15*1024*1024),s=body.snapshot;
    ensure(body.confirm==="KHOI PHUC","Cần nhập KHOI PHUC để xác nhận");
    ensure(s?.format==="cuboid-hub-v1"&&s.authMode==="local"&&s.instanceId===instance,"Bản sao lưu không thuộc bản tự host này");
    ensure(Array.isArray(s.members)&&s.members.length<=1000&&Array.isArray(s.records)&&s.records.length<=50000,"Bản sao lưu không hợp lệ");
    ensure(s.members.some((m:any)=>m.id===me.id&&m.role==="Lead"&&m.state==="active"),"Cần giữ tài khoản Lead hiện tại");
    const members=s.members.map((m:any)=>z.object({id:z.string().min(1).max(100),name:z.string().min(1).max(500),email:z.string().email(),role:z.enum(["Lead","QA/QC","Annotator"]),state:z.enum(["active","invited","pending","disabled"]),created_at:z.string(),invite_expires:z.string().nullable()}).parse(m));
    const kinds=["project","task","daily","weekly","attendance","request","review","document","settings","kpi-exclusion","kpi-rate","target","comment","notification","file","import","legacy","qc-session","qc-assignment","qc-basic","kpi-count","kpi-source","manual-rework", "weekly-snapshot", "qa-question", "qa-answer"];
    for(const r of s.records)ensure(kinds.includes(r.kind)&&typeof r.id==="string"&&typeof r.natural_key==="string"&&r.data&&typeof r.data==="object","Bản ghi sao lưu không hợp lệ");
    store.transaction(()=>{
      store.sql.prepare("DELETE FROM auth_sessions WHERE member_id!=?").run(me.id);store.sql.exec("DELETE FROM auth_tokens; DELETE FROM records;");
      const ids=new Set(members.map((m:any)=>m.id));for(const old of store.sql.prepare("SELECT id FROM members").all())if(!ids.has(old.id)){store.sql.prepare("DELETE FROM auth_credentials WHERE member_id=?").run(old.id);store.sql.prepare("DELETE FROM members WHERE id=?").run(old.id);}
      for(const m of members){const hasPassword=store.sql.prepare("SELECT 1 FROM auth_credentials WHERE member_id=?").get(m.id);const state=m.state==="active"&&!hasPassword?"pending":m.state;
        store.sql.prepare("INSERT INTO members(id,name,email,auth_id,role,state,created_at,invite_expires) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,auth_id=excluded.auth_id,role=excluded.role,state=excluded.state,invite_expires=excluded.invite_expires").run(m.id,m.name,m.email,"local:"+m.id,m.role,state,m.created_at,m.invite_expires);}
      for(const r of s.records)store.sql.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(r.id,r.kind,r.natural_key,r.owner_id,r.project_id,r.task_id,r.date,r.status,r.revision,JSON.stringify(r.data),r.created_at,r.updated_at);
      store.sql.prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?)").run(randomUUID(),me.id,"Khôi phục dữ liệu tự host","backup",null,JSON.stringify({createdAt:s.createdAt,records:s.records.length}),new Date().toISOString());
    });return json({ok:true});
  }
  async function handle(req:Request):Promise<Response> {
    try{
      const u=new URL(req.url);ensure(origins().has(u.origin),"Host không được phép",403);
      const secure=u.protocol==="https:";
      if(!["GET","HEAD"].includes(req.method)){ensure(req.headers.get("Origin")===u.origin&&req.headers.get("Sec-Fetch-Site")!=="cross-site","Yêu cầu không cùng nguồn",403);}
      if(u.pathname==="/api/health")return json({ok:true,service:"cuboid-self-host",auth:"local-password",buildId,startedAt});
      if(u.pathname==="/api/auth/me") {const m=await auth.current(req);return json({authenticated:!!m,setupRequired:!auth.isSetup(),localSetupAllowed:localRequest(req),member:m?memberInfo(m):null,...(m&&u.searchParams.get("bootstrap")==="1"?{hubState:await bootstrapState(m)}:{})});}
      if(u.pathname==="/api/auth/login"&&req.method==="POST") {const b=await readJson(req,4096);const r=await auth.login(b.username,b.password,ip(req));return json({ok:true,...(b.bootstrap===true?{authenticated:true,member:memberInfo(r.member),hubState:await bootstrapState(r.member)}:{})},200,{"Set-Cookie":sessionCookie(r.token,secure)});}
      if(u.pathname==="/api/auth/setup"&&req.method==="POST") {
        ensure(localRequest(req)&&!auth.isSetup(),"Chỉ được thiết lập Lead từ trình duyệt trên máy host",403);auth.limit("setup:"+ip(req),12);
        const b=await readJson(req,4096);const result=await auth.consume(cookieValue(req,"cuboid_setup"),b.password);return json({ok:true},200,{"Set-Cookie":sessionCookie(result.token,false)});
      }
      if(u.pathname==="/api/auth/token"&&req.method==="GET") {auth.limit("token-info:"+ip(req),100);const info=auth.tokenInfo(u.searchParams.get("token")||"");ensure(info.purpose!=="setup","Liên kết không hợp lệ",403);return json({name:info.name,username:info.email.split("@")[0],purpose:info.purpose,expires:new Date(info.expires_at).toISOString()});}
      if(u.pathname==="/api/auth/activate"&&req.method==="POST") {auth.limit("activate:"+ip(req),15);const b=await readJson(req,4096);const info=auth.tokenInfo(b.token||"");ensure(info.purpose!=="setup","Liên kết không hợp lệ",403);const result=await auth.consume(b.token,b.password);return json({ok:true},200,{"Set-Cookie":sessionCookie(result.token,secure)});}
      if(u.pathname==="/api/auth/reset"&&req.method==="POST") {
        const me=await auth.current(req);ensure(me,"Vui lòng đăng nhập",401);hub.lead(me);const b=await readJson(req,4096);const member=(await hub.members()).find(m=>m.id===b.memberId);ensure(member&&member.state==="active","Tài khoản cần đang hoạt động");ensure(member.id!=="member-0"||me.id==="member-0","Chỉ Khôi được khôi phục tài khoản của Khôi",403);
        const token=auth.issue(member.id,"reset",0.5);await store.batch([hub.audit(me.id,"Tạo liên kết khôi phục mật khẩu",member.id,null,{expires:token.expires})]);return json({ok:true,invitationUrl:`${publicOrigin()||u.origin}/auth/activate?token=${token.token}`,username:member.email.split("@")[0],inviteExpires:token.expires});
      }
      if(u.pathname==="/api/auth/change-password"&&req.method==="POST") {const me=await auth.current(req);ensure(me,"Vui lòng đăng nhập",401);const b=await readJson(req,4096);const result=await auth.changePassword(me,b.currentPassword,b.password);return json({ok:true},200,{"Set-Cookie":sessionCookie(result.token,secure)});}
      if(u.pathname==="/auth/logout") {auth.logout(req);return redirect("/auth/login",{"Set-Cookie":sessionCookie("",secure,0)});}
      if(u.pathname==="/api/hub/restore"&&req.method==="POST") {const me=await auth.current(req);ensure(me,"Vui lòng đăng nhập",401);return await restore(req,me);}
      if(u.pathname.startsWith("/api/hub/qc-basic/")){const me=await auth.current(req);ensure(me,"Vui lòng đăng nhập",401);return await basicQc.handle(req,me);}
      if(u.pathname.startsWith("/api/hub/kpi-count/")){const me=await auth.current(req);ensure(me,"Vui lòng đăng nhập",401);return await kpiCount.handle(req,me);}
      if(u.pathname.startsWith("/api/hub/"))return await handleHub(req,runtime);
      if(u.pathname.startsWith("/api/"))return json({error:"Không tìm thấy"},404);
      if(req.method!=="GET"&&req.method!=="HEAD")return json({error:"Phương thức không hợp lệ"},405);
      if(u.pathname==="/"&&!auth.isSetup()&&localRequest(req))return redirect("/auth/setup");
      let setupCookie="";
      if(u.pathname==="/auth/setup") {
        ensure(localRequest(req),"Thiết lập Lead chỉ thực hiện trực tiếp trên máy host",403);if(auth.isSetup())return redirect("/auth/login");
        const setup=auth.issue("member-0","setup",0.5);setupCookie=`cuboid_setup=${setup.token}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=1800`;
      }
      let file=resolve(publicDir,"."+decodeURIComponent(u.pathname));ensure(file===publicDir||file.startsWith(publicDir+sep),"Đường dẫn không hợp lệ",404);
      if(u.pathname==="/"||u.pathname.startsWith("/auth/"))file=join(publicDir,"index.html");
      try{ensure((await stat(file)).isFile(),"Không tìm thấy",404);}catch{throw new HubError("Không tìm thấy",404);}
      const types:Record<string,string>={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".css":"text/css;charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon",".woff2":"font/woff2"};
      return new Response(req.method==="HEAD"?null:new Uint8Array(await readFile(file)),{headers:{...BASE_HEADERS,"Content-Type":types[extname(file)]||"application/octet-stream",...(setupCookie?{"Set-Cookie":setupCookie}:{}),...(u.pathname.startsWith("/assets/")?{"Cache-Control":"public,max-age=31536000,immutable"}:{})}});
    }catch(e:any){if(e instanceof HubError)return json({error:e.message},e.status);if(e instanceof z.ZodError)return json({error:e.issues.map(i=>i.message).join("; ")},400);console.error("Request failed:",e?.message);return json({error:"Không thể xử lý yêu cầu. Vui lòng thử lại."},500);}
  }
  const server=createServer({maxHeaderSize:16384,requestTimeout:30000,headersTimeout:15000},async(incoming:IncomingMessage,out:ServerResponse)=>{
    try{
      const host=incoming.headers.host||"";const publicUrl=publicOrigin();const origin=publicUrl&&host===new URL(publicUrl).host?publicUrl:`http://${host}`;
      ensure(origins().has(origin),"Host không được phép",403);ensure(incoming.url?.startsWith("/")&&!incoming.url.startsWith("//"),"Đường dẫn không hợp lệ",400);
      const init:any={method:incoming.method,headers:incoming.headers};if(!["GET","HEAD"].includes(incoming.method||"GET")){init.body=Readable.toWeb(incoming);init.duplex="half";}
      const request=new Request(origin+incoming.url,init);const response=await handle(request);
      out.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)Readable.fromWeb(response.body as any).pipe(out);else out.end();
    }catch(e:any){out.writeHead(e instanceof HubError?e.status:500,{...BASE_HEADERS,"Content-Type":"application/json"});out.end(JSON.stringify({error:e instanceof HubError?e.message:"Không thể xử lý yêu cầu"}));}
  });
  return {server,store,auth,hub,handle,instance,publicOrigin,refreshAttendance,close:async()=>{clearInterval(attendanceTimer);await Promise.allSettled([basicQc.close(),kpiCount.close()]);await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();}};
}

if(process.env.HUB_NO_LISTEN!=="1") {
  const port=Number(process.env.HUB_PORT||3210);const base=process.env.HUB_ROOT||fileURLToPath(new URL("../../",import.meta.url));
  const {applyPublishedData}=await import(/* @vite-ignore */ pathToFileURL(join(base,"repo-data-update.mjs")).href);
  await applyPublishedData({root:base,dataDir:process.env.HUB_DATA_DIR||join(base,"data"),port});
  const app=await createLocalApp({dataDir:process.env.HUB_DATA_DIR||join(base,"data"),publicDir:process.env.HUB_PUBLIC_DIR||join(base,"dist/client"),port});
  app.server.on("error",e=>{console.error("Không thể mở máy chủ:",e.message);process.exitCode=1;});
  app.server.listen(port,"127.0.0.1",()=>console.log(`Cuboid Team Hub tự host: http://127.0.0.1:${port}\nĐăng nhập bằng tài khoản riêng. Dữ liệu: ${resolve(process.env.HUB_DATA_DIR||join(base,"data"))}`));
  const cleanup=setInterval(()=>app.auth.cleanup(),15*60000);cleanup.unref();
  for(const signal of ["SIGINT","SIGTERM"] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
}
