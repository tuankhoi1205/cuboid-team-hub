import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {packBackup,unpackBackup,inspectBackup} from "../self-host/repo-backup.mjs";
process.env.HUB_NO_LISTEN="1";
const buildDir=resolve(process.env.HUB_TEST_BUILD_DIR||"self-host/dist");
const {createLocalApp}=await import((await import("node:url")).pathToFileURL(join(buildDir,"server/server.mjs")).href);
const origin="http://127.0.0.1:3210";
const cookie=r=>r.headers.get("set-cookie")?.split(";")[0]||"";
const leadPassword="A private lead test phrase 2026!";
const memberPassword="A private member test phrase 2026!";
async function fixture(options={}) {
 const dir=await mkdtemp(resolve(".sites-runtime/selfhost-test-"));
 const app=await createLocalApp({dataDir:dir,publicDir:join(buildDir,"client"),...options});
 const req=(path,{method="GET",body,cookie:session="",host=origin,headers={}}={})=>app.handle(new Request(host+path,{method,headers:{...(session?{Cookie:session}:{}),...(method!=="GET"?{Origin:host}:{}),...(body&&! (body instanceof FormData)?{"Content-Type":"application/json"}:{}),...headers},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})}));
 const setup=await req("/auth/setup");const boot=cookie(setup);
 return {dir,app,req,boot,close:()=>app.close()};
}
async function setupLead(f) {const r=await f.req("/api/auth/setup",{method:"POST",cookie:f.boot,body:{password:leadPassword}});assert.equal(r.status,200,await r.clone().text());return cookie(r);}
async function invite(f,lead,number,role="Annotator") {const m=(await f.app.hub.members()).find(m=>m.id==="member-"+number);const response=await f.req("/api/hub/member",{method:"POST",cookie:lead,body:{...m,role,state:"invited"}});assert.equal(response.status,200);const d=await response.json();return new URL(d.invitationUrl).searchParams.get("token");}
async function activate(f,token,password=memberPassword) {const r=await f.req("/api/auth/activate",{method:"POST",body:{token,password}});assert.equal(r.status,200,await r.clone().text());return cookie(r);}

test("local-only Lead setup, password hashing, login, session rotation and logout",async()=>{
 const f=await fixture();try{
  await writeFile(join(f.dir,"public-url.txt"),"https://cuboid-test.trycloudflare.com");
  assert.equal((await f.req("/auth/setup",{host:"https://cuboid-test.trycloudflare.com"})).status,403);
  assert.equal((await f.req("/api/auth/setup",{method:"POST",cookie:f.boot,body:{password:"12"}})).status,400);
  const lead=await setupLead(f);assert.match(lead,/cuboid_session=/);
  const credential=f.app.store.sql.prepare("SELECT password_hash FROM auth_credentials WHERE member_id='member-0'").get();assert.match(credential.password_hash,/^scrypt-v1:/);assert.ok(!credential.password_hash.includes(leadPassword));
  assert.equal((await f.req("/api/hub/state",{headers:{"oai-authenticated-user-id":"local:member-0","oai-authenticated-user-email":"26ai.khoint2@vinuni.edu.vn"}})).status,401);
  const state=await(await f.req("/api/hub/state",{cookie:lead})).json();assert.equal(state.records.filter(r=>r.kind==="daily").length,18);
  const login=await f.req("/api/auth/login",{method:"POST",body:{username:"26ai.khoint2",password:leadPassword}});assert.equal(login.status,200);assert.match(login.headers.get("set-cookie"),/HttpOnly; SameSite=Lax/);assert.notEqual(cookie(login),lead);
  const session=f.app.store.sql.prepare("SELECT token_hash FROM auth_sessions LIMIT 1").get();assert.ok(!session.token_hash.includes(lead.split("=")[1]));
  assert.equal((await f.req("/api/auth/login",{method:"POST",body:{username:"26ai.khoint2",password:leadPassword},headers:{Origin:"https://evil.example"}})).status,403);
  assert.equal((await f.req("/api/auth/setup",{method:"POST",cookie:f.boot,body:{password:leadPassword}})).status,403);
  const logout=await f.req("/auth/logout",{cookie:lead});assert.equal(logout.status,303);assert.equal(logout.headers.get("Location"),"/auth/login");assert.match(logout.headers.get("Set-Cookie"),/cuboid_session=;.*Max-Age=0/);
  assert.equal((await f.req("/api/hub/state",{cookie:lead})).status,401);assert.equal((await(await f.req("/api/auth/me",{cookie:lead})).json()).authenticated,false);
 }finally{await f.close();}
});
test("three-character passwords work for setup, activation and password changes",async()=>{
 const f=await fixture();try {
  const setup=await f.req("/api/auth/setup",{method:"POST",cookie:f.boot,body:{password:"123"}});assert.equal(setup.status,200);
  const lead=cookie(setup),ann=await activate(f,await invite(f,lead,1),"123");
  assert.equal((await f.req("/api/auth/login",{method:"POST",body:{username:"26ai.khoint2",password:"123"}})).status,200);
  assert.equal((await f.req("/api/auth/change-password",{method:"POST",cookie:ann,body:{currentPassword:"123",password:"456"}})).status,200);
  assert.equal((await f.req("/api/auth/login",{method:"POST",body:{username:"26ai.minhnt3",password:"123"}})).status,401);
  assert.equal((await f.req("/api/auth/login",{method:"POST",body:{username:"26ai.minhnt3",password:"456"}})).status,200);
 } finally {await f.close();}
});
test("invitation and reset links are single-use; disabled accounts and old sessions fail",async()=>{
 const f=await fixture();try{
  const lead=await setupLead(f),token=await invite(f,lead,1),ann=await activate(f,token);
  assert.equal((await f.req("/api/auth/activate",{method:"POST",body:{token,password:memberPassword}})).status,400);
  const state=await(await f.req("/api/hub/state",{cookie:ann})).json();assert.ok(state.records.filter(r=>r.kind==="daily").every(r=>r.owner_id==="member-1"));
  assert.equal((await f.req("/api/hub/attendance-mark",{method:"POST",cookie:ann,body:{}})).status,403);
  assert.equal((await f.req("/api/hub/member",{method:"POST",cookie:ann,body:{name:"X",email:"x@example.com",role:"Lead",state:"pending"}})).status,403);
  const reset=await f.req("/api/auth/reset",{method:"POST",cookie:lead,body:{memberId:"member-1"}});const resetUrl=(await reset.json()).invitationUrl;const resetToken=new URL(resetUrl).searchParams.get("token");
  const next=await activate(f,resetToken,"Another private member phrase 2026!");assert.equal((await f.req("/api/hub/state",{cookie:ann})).status,401);assert.equal((await f.req("/api/hub/state",{cookie:next})).status,200);
  const m=(await f.app.hub.members()).find(m=>m.id==="member-1");await f.req("/api/hub/member",{method:"POST",cookie:lead,body:{...m,state:"disabled"}});assert.equal((await f.req("/api/hub/state",{cookie:next})).status,401);
 }finally{await f.close();}
});
test("QA/QC cannot mark attendance; uploads are private and JSON restore preserves local credentials",async()=>{
 const f=await fixture();try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC"));
  assert.equal((await f.req("/api/hub/attendance-mark",{method:"POST",cookie:qa,body:{}})).status,403);
  for(const actor of [ann,qa])for(const type of ["correction","leave"])assert.equal((await f.req("/api/hub/request",{method:"POST",cookie:actor,body:{type,date:"2026-10-22",endDate:"2026-10-22",reason:"Yêu cầu thử"}})).status,403);
  const form=new FormData();form.set("entityId","import-task-1241");form.set("file",new File(["Private evidence fixture"],"evidence.txt"));
  const upload=await f.req("/api/hub/upload",{method:"POST",cookie:ann,body:form});assert.equal(upload.status,200,await upload.clone().text());
  const file=(await f.app.hub.rows("file"))[0];assert.equal((await f.req("/api/hub/file/"+file.id,{cookie:qa})).status,403);assert.equal((await f.req("/api/hub/file/"+file.id)).status,401);assert.equal(await(await f.req("/api/hub/file/"+file.id,{cookie:ann})).text(),"Private evidence fixture");
  assert.equal((await f.req("/data/cuboid.sqlite")).status,404);
  const snapshot=await(await f.req("/api/hub/backup",{cookie:lead})).json();assert.equal(snapshot.authMode,"local");assert.equal(snapshot.instanceId,f.app.instance);assert.equal(snapshot.auth_credentials,undefined);
  assert.equal((await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot:{...snapshot,instanceId:"other"}}})).status,400);
  const restore=await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot}});assert.equal(restore.status,200,await restore.clone().text());assert.equal((await f.req("/api/hub/state",{cookie:lead})).status,200);
  const login=await f.req("/api/auth/login",{method:"POST",body:{username:"26ai.khoint2",password:leadPassword}});assert.equal(login.status,200);
 }finally{await f.close();}
});
test("persistent database survives reopen and repeated failures are rate limited",async()=>{
 const f=await fixture();let reopened;
 try{await setupLead(f);for(let i=0;i<12;i++)assert.equal((await f.req("/api/auth/login",{method:"POST",body:{username:"unknown-user",password:"wrong"}})).status,401);assert.equal((await f.req("/api/auth/login",{method:"POST",body:{username:"unknown-user",password:"wrong"}})).status,429);await f.close();reopened=await createLocalApp({dataDir:f.dir,publicDir:resolve("self-host/dist/client")});assert.equal(reopened.auth.isSetup(),true);assert.equal((await reopened.hub.rows("daily")).length,18);assert.equal((await reopened.hub.members()).length,10);}finally{if(reopened)await reopened.close();}
});
test("report endpoints export readable tables and protect personal KPI exclusions",async()=>{
 const f=await fixture();try {
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1));
  assert.equal((await f.req("/api/hub/kpi-exclusion",{method:"POST",cookie:ann,body:{date:"2026-10-22",memberId:"member-1"}})).status,403);
  assert.equal((await f.req("/api/hub/kpi-exclusion",{method:"POST",cookie:lead,body:{date:"2026-10-22",memberId:"member-2",reason:"Private exception"}})).status,200);
  assert.equal((await f.req("/api/hub/kpi-rate",{method:"POST",cookie:ann,body:{date:"2026-10-22",memberId:"member-1",quantity:600}})).status,403);
  assert.equal((await f.req("/api/hub/kpi-rate",{method:"POST",cookie:lead,body:{date:"2026-10-22",memberId:"member-2",quantity:600}})).status,200);
  for(const kind of ["attendance","task","daily","weekly","review","target"]) {
   const r=await f.req("/api/hub/export?kind="+kind+"&format=xlsx",{cookie:lead});assert.equal(r.status,200);const xml=new TextDecoder().decode(await r.arrayBuffer());assert.ok(xml.includes('TableStyleMedium2'));assert.ok(!xml.includes('Dữ liệu JSON'));
  }
  const personal=await f.req("/api/hub/export?kind=daily&format=xlsx",{cookie:ann});const xml=new TextDecoder().decode(await personal.arrayBuffer());assert.ok(xml.includes('26ai.minhnt3'));assert.ok(!xml.includes('26ai.hant'));assert.ok(!xml.includes('Private exception'));
  const morning=await f.req("/api/hub/export?kind=morning&format=xlsx&date=2026-10-22&productionDate=2026-10-21",{cookie:lead});assert.equal(morning.status,200);const morningXml=new TextDecoder().decode(await morning.arrayBuffer());assert.ok(morningXml.includes('Hôm nay dự kiến làm gì'));assert.ok(morningXml.includes('Hôm qua đã làm gì'));assert.ok(!morningXml.includes('Trạng thái báo cáo'));
  assert.equal((await f.req("/api/hub/export?kind=morning&format=xlsx&date=invalid",{cookie:lead})).status,400);
  const ownMorning=await f.req("/api/hub/export?kind=morning&format=xlsx&date=2026-10-22",{cookie:ann});assert.ok(!new TextDecoder().decode(await ownMorning.arrayBuffer()).includes('26ai.hant'));
  const backup=await(await f.req("/api/hub/backup",{cookie:lead})).json();assert.ok(backup.records.some(r=>r.kind==="kpi-exclusion"));assert.equal((await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot:backup}})).status,200);
 } finally {await f.close();}
});

test("full local backup restores credentials and files without reviving sessions or tokens",async()=>{
 const f=await fixture();let reopened;
 try {
  const lead=await setupLead(f);await invite(f,lead,1);
  const form=new FormData();form.set("entityId","import-task-1241");form.set("file",new File(["Backup evidence"],"backup-evidence.txt"));
  assert.equal((await f.req("/api/hub/upload",{method:"POST",cookie:lead,body:form})).status,200);
  const evidence=(await f.app.hub.rows("file"))[0];await f.close();
  const admin=(...args)=>execFileSync(process.execPath,[resolve("self-host/admin.mjs"),...args],{env:{...process.env,HUB_DATA_DIR:f.dir,HUB_PORT:"43219"},encoding:"utf8",timeout:15000});
  const result=admin("backup");const folder=result.trim().split("Full backup saved: ")[1];assert.ok(folder);
  const snapshot=new DatabaseSync(join(folder,"cuboid.sqlite"));
  assert.equal(snapshot.prepare("SELECT COUNT(*) n FROM auth_sessions").get().n,0);assert.equal(snapshot.prepare("SELECT COUNT(*) n FROM auth_tokens").get().n,0);
  assert.equal(snapshot.prepare("SELECT COUNT(*) n FROM auth_credentials").get().n,1);snapshot.close();
  const manifest=JSON.parse(await readFile(join(folder,"manifest.json"),"utf8"));assert.equal(manifest.format,"cuboid-selfhost-full-v1");
  const live=new DatabaseSync(join(f.dir,"cuboid.sqlite"));live.prepare("UPDATE members SET name='Changed after backup' WHERE id='member-1'").run();live.close();
  const restored=admin("restore",folder,"KHOI_PHUC");assert.match(restored,/Previous data saved:/);
  reopened=await createLocalApp({dataDir:f.dir,publicDir:resolve("self-host/dist/client")});
  assert.equal((await reopened.hub.members()).find(m=>m.id==="member-1").name,"Nguyễn Tuấn Minh");
  assert.equal(reopened.store.sql.prepare("SELECT COUNT(*) n FROM auth_tokens").get().n,0);
  assert.equal(await reopened.auth.current(new Request(origin,{headers:{Cookie:lead}})),null);
  assert.ok((await reopened.auth.login("26ai.khoint2",leadPassword,"test-backup")).token);
  const file=await reopened.handle(new Request(origin+"/api/hub/file/"+evidence.id,{headers:{Cookie:"cuboid_session="+reopened.auth.session("member-0")}}));
  assert.equal(file.status,200);assert.equal(await file.text(),"Backup evidence");
 } finally {if(reopened)await reopened.close();}
});

test("team evaluation API and Excel require Lead and preserve business records",async()=>{
 const f=await fixture();try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC"));
  await f.req("/api/hub/state",{cookie:lead});const before=await f.app.hub.rows();
  for(const actor of [ann,qa])for(const path of ["/api/hub/evaluation?member=member-1","/api/hub/export?kind=evaluation&format=xlsx&member=member-1"]){assert.equal((await f.req(path,{cookie:actor})).status,403);}
  assert.equal((await f.req("/api/hub/evaluation")).status,401);
  const all=await f.req("/api/hub/evaluation?from=2026-10-20&to=2026-10-21",{cookie:lead});assert.equal(all.status,200);const result=await all.json();assert.equal(result.rows.length,10);assert.equal(result.totals.quantity,16800);assert.equal(result.totals.target,21600);
  const filtered=await(await f.req("/api/hub/evaluation?from=2026-10-20&to=2026-10-21&role=QA%2FQC",{cookie:lead})).json();assert.equal(filtered.rows.length,1);assert.equal(filtered.rows[0].memberId,"member-2");
  const excel=await f.req("/api/hub/export?kind=evaluation&format=xlsx&from=2026-10-20&to=2026-10-21",{cookie:lead});assert.equal(excel.status,200);assert.match(excel.headers.get("Content-Disposition"),/cuboid-evaluation-2026-10-20-2026-10-21.xlsx/);const bytes=new Uint8Array(await excel.arrayBuffer());assert.deepEqual([...bytes.slice(0,2)],[80,75]);assert.match(new TextDecoder().decode(bytes),/Chuyen can/);
  assert.equal((await f.req("/api/hub/evaluation?from=2026-10-22&to=2026-10-21",{cookie:lead})).status,400);
  assert.deepEqual(await f.app.hub.rows(),before);
 }finally{await f.close();}
});

test("daily QC HTTP workflow is assigned by Lead, visible to the assigned QA and annotator, and exportable",async()=>{
 const f=await fixture();try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC")),other=await activate(f,await invite(f,lead,3));
  const source=(await f.app.hub.rows("daily")).find(r=>r.owner_id==="member-1"&&r.date==="2026-10-21"),taskId=source.data.lines[0].taskId,body={taskId,sourceReportId:source.id,reviewerId:"member-2",frameCount:60};
  assert.equal((await f.req("/api/hub/qc-assign",{method:"POST",cookie:qa,body})).status,403);
  const a=await f.req("/api/hub/qc-assign",{method:"POST",cookie:lead,body});assert.equal(a.status,200);const id=(await a.json()).id;
  assert.equal((await f.req("/api/hub/qc-start",{method:"POST",cookie:other,body:{id}})).status,403);
  const start=await f.req("/api/hub/qc-start",{method:"POST",cookie:qa,body:{id,endId:"20",endIdNote:"Đã đối chiếu CVAT"}});assert.equal(start.status,200,await start.clone().text());
  assert.equal((await f.req("/api/hub/qc-result",{method:"POST",cookie:ann,body:{id}})).status,403);
  const idChecks=Array.from({length:34},(_,i)=>({objectId:String(i+1),result:i===9?"changes":"passed",type:"Sai vị trí",severity:"major",description:i===9?"Kiểm thử hộp":"",frameId:"",evidence:""}));
  assert.equal((await f.req("/api/hub/qc-draft",{method:"POST",cookie:ann,body:{id,idChecks}})).status,403);
  assert.equal((await f.req("/api/hub/qc-draft",{method:"POST",cookie:qa,body:{id,idChecks}})).status,200);
  const done=await f.req("/api/hub/qc-result",{method:"POST",cookie:qa,body:{id,idChecks}});assert.equal(done.status,200,await done.clone().text());
  const reviewId=(await f.app.hub.get(id)).data.reviewId;
  assert.equal((await f.app.hub.get(taskId)).data.frameCount,60);assert.equal((await f.app.hub.get(reviewId)).data.frameCount,60);
  for(const actor of [ann,qa]){const state=await(await f.req("/api/hub/state",{cookie:actor})).json();assert.ok(state.records.some(r=>r.id===id));assert.ok(state.records.some(r=>r.id===reviewId));}
  const hidden=await(await f.req("/api/hub/state",{cookie:other})).json();assert.ok(!hidden.records.some(r=>r.id===id||r.id===reviewId));
  const personalDaily=await f.req("/api/hub/export?kind=daily&format=xlsx&scope=team",{cookie:qa});const personalXml=new TextDecoder().decode(await personalDaily.arrayBuffer());assert.equal(personalDaily.status,200);assert.ok(personalXml.includes("26ai.hant"));assert.ok(!personalXml.includes("26ai.minhnt3"));
  const forcedOther=await f.req("/api/hub/export?kind=daily&format=csv&member=member-1",{cookie:qa});assert.ok(!(await forcedOther.text()).includes("26ai.minhnt3"));
  const leadMine=await f.req("/api/hub/export?kind=daily&format=xlsx&scope=mine",{cookie:lead});assert.ok(!new TextDecoder().decode(await leadMine.arrayBuffer()).includes("26ai.hant"));
  assert.equal((await f.req("/api/hub/review-fix",{method:"POST",cookie:ann,body:{id:reviewId,errorIndex:0,fixed:true,note:"Đã sửa"}})).status,200);
  assert.equal((await f.app.hub.get(source.id)).status,"approved");
  const excel=await f.req("/api/hub/export?kind=qc-session&format=xlsx",{cookie:lead});assert.equal(excel.status,200);const exported=new TextDecoder().decode(await excel.arrayBuffer());assert.match(exported,/Phan cong va tien do QC/);assert.match(exported,/QC tung ID/);assert.equal((await f.app.hub.get(reviewId)).data.idChecks.length,34);
 }finally{await f.close();}
});

test("daily HTTP editing closes at 17:00 for members; Lead can write and correct another member's report",async()=>{
 let clock=new Date("2026-10-24T09:59:59Z");const f=await fixture({now:()=>clock});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC"));
  const task=(await f.app.hub.rows("task")).find(r=>r.data.assigneeId==="member-1");await f.app.store.batch([f.app.hub.replace(task,{...task.data,frameCount:60})]);const body={date:"2026-10-24",submit:true,lines:[{taskId:task.id,idCount:10,endId:"50",quantity:600,minutes:120,rework:0}]};
  let response=await f.req("/api/hub/daily",{method:"POST",cookie:ann,body});assert.equal(response.status,200,await response.clone().text());const id=(await response.json()).id;
  response=await f.req("/api/hub/daily",{method:"POST",cookie:ann,body:{...body,lines:[{...body.lines[0],idCount:12,quantity:700}]}});assert.equal(response.status,200,await response.clone().text());
  clock=new Date("2026-10-24T10:00:00Z");
  assert.equal((await f.req("/api/hub/daily",{method:"POST",cookie:ann,body})).status,403);assert.equal((await f.req("/api/hub/daily",{method:"POST",cookie:qa,body:{...body,memberId:"member-1"}})).status,403);
  const upload=new FormData();upload.set("entityId",id);upload.set("file",new File(["late"],"late.txt"));assert.equal((await f.req("/api/hub/upload",{method:"POST",cookie:ann,body:upload})).status,403);
  const revision=(await f.app.hub.get(id)).revision;
  response=await f.req("/api/hub/daily",{method:"POST",cookie:lead,body:{...body,id,revision,memberId:"member-1",lines:[{...body.lines[0],idCount:16,quantity:800}]}});assert.equal(response.status,200,await response.clone().text());
  let report=await f.app.hub.get(id);assert.equal(report.owner_id,"member-1");assert.equal(report.data.lastEditedBy,"member-0");assert.equal(report.data.lines[0].quantity,816);
  response=await f.req("/api/hub/daily",{method:"POST",cookie:lead,body:{...body,date:"2026-10-23",memberId:"member-1"}});assert.equal(response.status,200,await response.clone().text());
  report=await f.app.hub.get((await response.json()).id);assert.equal(report.owner_id,"member-1");assert.equal(report.data.createdBy,"member-0");
  const state=await(await f.req("/api/hub/state",{cookie:ann})).json();assert.equal(state.serverTime,clock.toISOString());assert.equal(state.records.find(r=>r.id==="settings").data.reportDeadline,"17:00");
 }finally{await f.close();}
});

test("bootstrap returns authorized workspace in one request, preserves plain login, and clears after logout",async()=>{
 const f=await fixture();try{
  const anonymous=await(await f.req('/api/auth/me?bootstrap=1')).json();assert.equal(anonymous.authenticated,false);assert.ok(!('hubState' in anonymous));
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,'QA/QC'));
  const leadBoot=await f.req('/api/auth/me?bootstrap=1',{cookie:lead}),leadBody=await leadBoot.json();assert.equal(leadBody.hubState.me.id,'member-0');assert.equal(leadBody.hubState.members.length,10);assert.equal(leadBoot.headers.get('Cache-Control'),'no-store');
  for(const [session,id] of [[ann,'member-1'],[qa,'member-2']]){const boot=await(await f.req('/api/auth/me?bootstrap=1',{cookie:session})).json();assert.equal(boot.hubState.me.id,id);assert.ok(boot.hubState.records.filter(r=>r.kind==='daily').every(r=>r.owner_id===id));assert.ok(!boot.hubState.records.some(r=>r.kind==='import'||r.kind==='legacy'));assert.deepEqual(boot.hubState.audit,[]);}
  const login=await f.req('/api/auth/login',{method:'POST',body:{username:'26ai.minhnt3',password:memberPassword,bootstrap:true}});assert.equal(login.status,200);const body=await login.json();assert.equal(body.authenticated,true);assert.equal(body.member.id,'member-1');assert.equal(body.hubState.me.id,'member-1');assert.ok(!JSON.stringify(body).includes('scrypt-v1:'));assert.ok(body.hubState.records.filter(r=>r.kind==='daily').every(r=>r.owner_id==='member-1'));
  const signed=cookie(login);await f.req('/auth/logout',{cookie:signed});const loggedOut=await(await f.req('/api/auth/me?bootstrap=1',{cookie:signed})).json();assert.equal(loggedOut.authenticated,false);assert.ok(!('hubState' in loggedOut));
  const plain=await f.req('/api/auth/login',{method:'POST',body:{username:'26ai.minhnt3',password:memberPassword}});assert.deepEqual(await plain.json(),{ok:true});
 }finally{await f.close();}
});

test("Lead can supplement manual rework and backups preserve manual entries and QC assignments",async()=>{
 const f=await fixture();try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC"));
  const body={memberId:"member-1",date:"2026-10-22",reason:"Lead xác nhận đã rework thủ công"};
  assert.equal((await f.req("/api/hub/manual-rework",{method:"POST",cookie:qa,body})).status,403);
  const response=await f.req("/api/hub/manual-rework",{method:"POST",cookie:lead,body});assert.equal(response.status,200);const created=await response.json();
  assert.equal((await(await f.req("/api/hub/manual-rework",{method:"POST",cookie:lead,body})).json()).id,created.id);
  const report=(await f.app.hub.rows("daily")).find(r=>r.owner_id==="member-1"&&r.date==="2026-10-21");
  assert.equal((await f.req("/api/hub/qc-assign",{method:"POST",cookie:lead,body:{taskId:report.data.lines[0].taskId,sourceReportId:report.id,reviewerId:"member-2"}})).status,200);
  const backup=await(await f.req("/api/hub/backup",{cookie:lead})).json();assert.ok(backup.records.some(r=>r.kind==="manual-rework"));assert.ok(backup.records.some(r=>r.kind==="qc-session"));
  const restored=await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot:backup}});assert.equal(restored.status,200,await restored.clone().text());
  const evaluation=await(await f.req("/api/hub/evaluation?from=2026-10-22&to=2026-10-22&member=member-1",{cookie:lead})).json();assert.equal(evaluation.rows[0].reworkCount,1);assert.equal(evaluation.rows[0].reviewCount,0);assert.equal(evaluation.rows[0].sources.manualReworks[0].reason,body.reason);
  assert.equal((await f.req("/api/hub/state",{cookie:ann})).status,401);
  const login=await f.req("/api/auth/login",{method:"POST",body:{username:"26ai.minhnt3",password:memberPassword}});assert.equal(login.status,200);
  const mine=await(await f.req("/api/hub/state",{cookie:cookie(login)})).json();assert.ok(mine.records.some(r=>r.id===created.id));
 }finally{await f.close();}
});

test("one QC Job assignment is authorized, advances from yesterday's report, and survives backup restore",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-24T01:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC")),other=await activate(f,await invite(f,lead,8,"QA/QC"));
  const post=async(action,body,session=lead)=>f.req("/api/hub/"+action,{method:"POST",cookie:session,body});
  const created=async(action,body,session=lead)=>{const response=await post(action,body,session);assert.equal(response.status,200,await response.clone().text());return(await response.json()).id;};
  const projectId=await created("project",{name:"Rolling HTTP QC",unit:"cuboid"}),taskId=await created("task",{jobId:"7654321",frameCount:60,title:"Rolling HTTP",projectId,assigneeId:"member-1",reviewerId:"member-2",assignedDate:"2026-10-22",deadline:"2026-10-30",priority:"normal",quantity:10000});
  const report=(date,endId,idCount)=>({memberId:"member-1",date,submit:true,lines:[{taskId,idCount,endId,minutes:240,quantity:0,rework:0}]});
  const sourceId=await created("daily",report("2026-10-22","20",20));
  const assignmentBody={taskId,reviewerId:"member-2",frameCount:60},assignmentId=await created("qc-job-assign",assignmentBody);
  assert.equal(await created("qc-job-assign",assignmentBody),assignmentId);
  assert.equal((await post("qc-job-assign",assignmentBody,ann)).status,403);
  assert.equal((await post("qc-job-start",{id:assignmentId},other)).status,403);
  assert.equal((await post("qc-job-start",{id:assignmentId},ann)).status,403);
  const checks=(from,to)=>Array.from({length:to-from+1},(_,i)=>({objectId:String(from+i),result:"passed",description:"",frameId:"",type:"Sai vị trí",severity:"minor"}));
  const first=await created("qc-job-start",{id:assignmentId},qa);assert.equal(await created("qc-job-start",{id:assignmentId},qa),first);
  await created("qc-result",{id:first,idChecks:checks(1,20)},qa);assert.equal((await f.app.hub.get(sourceId)).status,"approved");
  const latestId=await created("daily",report("2026-10-23","80",60));await created("daily",report("2026-10-24","100",20));
  const second=await created("qc-job-start",{id:assignmentId},qa),cycle=await f.app.hub.get(second);
  assert.equal(cycle.data.rangeStart,"20");assert.equal(cycle.data.endId,"80");assert.equal(cycle.data.sourceReportId,latestId);
  const qaState=await(await f.req("/api/hub/state",{cookie:qa})).json(),annState=await(await f.req("/api/hub/state",{cookie:ann})).json();
  for(const state of [qaState,annState])assert.equal(state.records.filter(r=>r.kind==="qc-assignment"&&r.task_id===taskId).length,1);
  const otherState=await(await f.req("/api/hub/state",{cookie:other})).json();assert.ok(!otherState.records.some(r=>r.id===assignmentId));
  await created("qc-result",{id:second,idChecks:checks(20,80)},qa);assert.equal((await f.app.hub.get(latestId)).status,"approved");
  const snapshot=await(await f.req("/api/hub/backup",{cookie:lead})).json();assert.ok(snapshot.records.some(r=>r.id===assignmentId&&r.kind==="qc-assignment"));
  const restored=await post("restore",{confirm:"KHOI PHUC",snapshot});assert.equal(restored.status,200,await restored.clone().text());
  const saved=await f.app.hub.rows();assert.equal(saved.filter(r=>r.kind==="qc-assignment"&&r.task_id===taskId).length,1);assert.equal(saved.filter(r=>r.kind==="qc-session"&&r.task_id===taskId).length,2);
 }finally{await f.close();}
});

test("encrypted repository backup restores business data, uploaded files and passwords without exposing credentials or sessions",async()=>{
 const f=await fixture();let restored;
 try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1));
  const form=new FormData();form.set("entityId","import-task-1241");form.set("file",new File(["Private backup file"],"repository-backup.txt"));
  assert.equal((await f.req("/api/hub/upload",{method:"POST",cookie:ann,body:form})).status,200);
  const originalRecords=await f.app.hub.rows(),evidence=originalRecords.find(r=>r.kind==="file"),digest=f.app.store.sql.prepare("SELECT password_hash FROM auth_credentials WHERE member_id='member-0'").get().password_hash;
  const output=execFileSync(process.execPath,[resolve("self-host/admin.mjs"),"backup"],{env:{...process.env,HUB_DATA_DIR:f.dir},encoding:"utf8",timeout:15000}),backupDir=output.trim().replace(/^Full backup saved: /,"");
  const archiveFile=join(f.dir,"team.enc"),keyFile=join(f.dir,"key.json");
  const info=await packBackup({backupDir,archiveFile,keyFile});assert.equal(info.summary.members,10);assert.equal(info.summary.dailyReports,18);assert.equal(info.summary.uploadedFiles,1);
  assert.deepEqual(await inspectBackup(archiveFile),info);
  const encrypted=await readFile(archiveFile);for(const secret of [digest,leadPassword,memberPassword,"Private backup file","26ai.khoint2@vinuni.edu.vn"])assert.ok(!encrypted.includes(Buffer.from(secret)));
  const wrongKey=join(f.dir,"wrong-key.json");await writeFile(wrongKey,JSON.stringify({format:"cuboid-repo-key-v1",key:Buffer.alloc(32,7).toString("base64")}));
  await assert.rejects(()=>unpackBackup({archiveFile,keyFile:wrongKey,backupRoot:join(f.dir,"wrong-key-output")}),/does not match/);
  const tampered=Buffer.from(encrypted);tampered[tampered.length-1]^=1;const changed=join(f.dir,"tampered.enc");await writeFile(changed,tampered);
  await assert.rejects(()=>unpackBackup({archiveFile:changed,keyFile,backupRoot:join(f.dir,"tampered-output")}));
  const target=await unpackBackup({archiveFile,keyFile,backupRoot:join(f.dir,"recovered")});
  restored=await createLocalApp({dataDir:target,publicDir:join(buildDir,"client")});
  assert.deepEqual(await restored.hub.rows(),originalRecords);assert.equal(restored.store.sql.prepare("SELECT COUNT(*) n FROM auth_sessions").get().n,0);assert.equal(restored.store.sql.prepare("SELECT COUNT(*) n FROM auth_tokens").get().n,0);
  assert.equal(await restored.auth.current(new Request(origin,{headers:{Cookie:lead}})),null);
  assert.ok((await restored.auth.login("26ai.khoint2",leadPassword,"test-encrypted-backup")).token);assert.ok((await restored.auth.login("26ai.minhnt3",memberPassword,"test-encrypted-member")).token);
  const download=await restored.handle(new Request(origin+"/api/hub/file/"+evidence.id,{headers:{Cookie:"cuboid_session="+restored.auth.session("member-1")}}));assert.equal(download.status,200);assert.equal(await download.text(),"Private backup file");
  const preserved=await restored.hub.rows();
  assert.throws(()=>execFileSync(process.execPath,[resolve("self-host/repo-backup.mjs"),"restore-new",archiveFile,keyFile],{env:{...process.env,HUB_DATA_DIR:target},encoding:"utf8",stdio:["ignore","pipe","pipe"]}),/Database already exists/);assert.deepEqual(await restored.hub.rows(),preserved);
  const fresh=join(f.dir,"fresh-host");execFileSync(process.execPath,[resolve("self-host/repo-backup.mjs"),"restore-new",archiveFile,keyFile],{env:{...process.env,HUB_DATA_DIR:fresh},encoding:"utf8",timeout:15000});
  const freshDb=new DatabaseSync(join(fresh,"cuboid.sqlite"),{readOnly:true});try{assert.equal(freshDb.prepare("SELECT COUNT(*) n FROM records").get().n,originalRecords.length);assert.equal(freshDb.prepare("SELECT password_hash FROM auth_credentials WHERE member_id='member-0'").get().password_hash,digest);}finally{freshDb.close();}
 }finally{if(restored)await restored.close();await f.close();}
});
