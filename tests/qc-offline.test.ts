import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {Hub} from "../lib/domain.ts";
import {SqliteStore} from "../self-host/sqlite.ts";
import {handleHub} from "../lib/hub-http.ts";
import {offlineResultSchema,offlineCsv,type OfflineResult} from "../lib/qc-offline.ts";
import {blankDraft,createBlankWorkspace,nextUnchecked,parseWorkspace} from "../qc-desktop/workspace.ts";
import {offlineWorkbook,readOfflineWorkbook} from "../lib/qc-offline-excel.ts";
import {unzipSync,zipSync,strFromU8,strToU8} from "fflate/browser";
const time="2026-10-24T01:00:00.000Z";
function result(withError=true):OfflineResult{return{format:"cuboid-qc-result-v1",id:crypto.randomUUID(),appVersion:"1.0.0",source:{name:"annotations.zip",sha256:"a".repeat(64),trackOffset:1,frames:[0,2]},startedAt:time,completedAt:time,checks:[{objectId:"1",label:"vehicle",present:[0,2],doneAt:time,logs:withError?[{id:"log-1",frameStart:0,frameEnd:2,description:"Hộp lệch trái",solution:""}]:[]},{objectId:"3",label:"person",present:[2],doneAt:time,logs:[]}]};}
async function fixture(){
 const db=new SqliteStore(":memory:",readFileSync(new URL("../drizzle/0000_sweet_white_queen.sql",import.meta.url),"utf8")),hub=new Hub(db,"26ai.khoint2@vinuni.edu.vn",new Date(time)),identity={userId:"lead-offline",email:"26ai.khoint2@vinuni.edu.vn"};await hub.setup(identity);const lead=await hub.current(identity);
 async function activate(n:number,role:string){const member=(await hub.members()).find(m=>m.id==="member-"+n)!;await hub.mutate(lead,"member",{...member,role,state:"invited"});const identity={userId:"offline-user-"+n,email:member.email};await hub.activate(identity);return hub.current(identity);}
 const ann=await activate(1,"Annotator"),qa=await activate(2,"QA/QC"),other=await activate(3,"QA/QC");
 await db.batch([hub.insert("task","offline-task",{code:"777",jobId:"888",assigneeId:ann.id,reviewerId:qa.id,title:"Offline QC",frameCount:3},{status:"doing"})]);
 const a=await hub.mutate(lead,"qc-job-assign",{taskId:"offline-task",reviewerId:qa.id});
 const http=(actor:typeof lead,path:string,body?:unknown)=>handleHub(new Request("http://hub.test/api/hub/"+path,{method:body?"POST":"GET",headers:{Origin:"http://hub.test","Content-Type":"application/json"},body:body?JSON.stringify(body):undefined}),{DB:db,LEAD_EMAIL:lead.email,authenticate:async()=>({userId:actor.auth_id!,email:actor.email}),now:()=>new Date(time)});
 const upload=async(r:OfflineResult)=>({assignmentId:a.id!,revision:(await hub.get(a.id!)).revision,result:r});
 return{db,hub,lead,ann,qa,other,assignmentId:a.id!,http,upload};
}
test("standalone results need only Datumaro, retain sparse IDs/frame zero and allow an empty solution",()=>{
 const r=result();assert.equal(offlineResultSchema.parse(r).checks[0].logs[0].solution,"");assert.ok(!("ticket" in r));
 for(const edit of [(r:OfflineResult)=>r.checks.push({...r.checks[0],objectId:"01"}),(r:OfflineResult)=>r.checks[0].objectId="invalid-id",(r:OfflineResult)=>r.checks[0].logs[0].frameStart=1,(r:OfflineResult)=>r.checks[0].logs[0].description=" ",(r:OfflineResult)=>r.checks[0].doneAt=""]){const bad=structuredClone(r);edit(bad);assert.equal(offlineResultSchema.safeParse(bad).success,false);}
 assert.equal(nextUnchecked(r.checks.map((c,i)=>({...c,doneAt:i===1?"":time})),0),1);assert.deepEqual(blankDraft(r.checks[0]),{frameStart:"0",frameEnd:"0",description:"",solution:""});
 const csv=offlineCsv({...r,checks:[{...r.checks[0],label:"=UNTRUSTED()",logs:[{...r.checks[0].logs[0],description:'=SUM(1,2) "quoted"',solution:"tùy chọn"}]}]});assert.ok(csv.includes("'=UNTRUSTED()"));assert.ok(csv.includes("'=SUM(1,2)"));assert.ok(csv.includes('""quoted""'));assert.ok(!csv.includes("Mức độ"));
 assert.throws(()=>parseWorkspace({version:1}),/checks|source|Required/);
});
test("web binds standalone upload to the selected Job, permits no Daily Report, protects evidence and prevents duplicate uploads",async()=>{
 const f=await fixture();try{
  const r=result(),body=await f.upload(r),before=await f.hub.rows("daily");
  assert.equal((await f.http(f.other,"qc-offline-import",body)).status,403);assert.equal((await f.http(f.ann,"qc-offline-import",body)).status,403);
  const response=await f.http(f.qa,"qc-offline-import",body);assert.equal(response.status,200,await response.clone().text());const {id}=await response.json() as {id:string},session=await f.hub.get(id),review=await f.hub.get(session.data.reviewId);
  assert.equal(session.status,"completed");assert.equal(session.data.jobId,"888");assert.equal(review.data.idCheckedCount,2);assert.equal(review.data.errors[0].description,"Hộp lệch trái");assert.equal(review.data.errors[0].type,undefined);assert.deepEqual(await f.hub.rows("daily"),before);
  const retry=await f.http(f.qa,"qc-offline-import",body);assert.equal(retry.status,200);assert.equal((await retry.json() as any).id,id);assert.equal((await f.hub.rows("qc-session")).filter(s=>s.natural_key==="offline:"+r.id).length,1);
  const changed=structuredClone(body);changed.result.checks[0].logs[0].description="Khác";assert.equal((await f.http(f.qa,"qc-offline-import",changed)).status,409);
  assert.equal((await f.http(f.qa,"qc-offline-import",{...body,result:result()})).status,409);
  assert.equal((await f.http(f.other,"qc-offline-export?id="+id)).status,403);
  for(const actor of [f.lead,f.ann,f.qa]){const downloaded=await f.http(actor,"qc-offline-export?id="+id);assert.equal(downloaded.status,200);assert.deepEqual(await downloaded.json(),r);const csv=await f.http(actor,"qc-offline-export?id="+id+"&format=csv");const text=await csv.text();assert.ok(text.includes("Hộp lệch trái"));assert.ok(text.includes('"777","888"'));const excel=await f.http(actor,"qc-offline-export?id="+id+"&format=xlsx");assert.match(excel.headers.get("Content-Type")!,/spreadsheetml/);assert.deepEqual(readOfflineWorkbook(new Uint8Array(await excel.arrayBuffer())),r);}
  for(const actor of [f.lead,f.qa,f.ann])assert.equal((await f.hub.visible(actor)).find(s=>s.id===id)!.data.offlineResult,undefined);
 }finally{f.db.close();}
});
test("new full-ID inspections resolve prior errors only when their frames appear; repeated errors retain their origin",async()=>{
 const f=await fixture();try{
  const first=await f.hub.mutate(f.qa,"qc-offline-import",await f.upload(result())),session=await f.hub.get(first.id!),reviewId=session.data.reviewId;
  const repeated=await f.hub.mutate(f.qa,"qc-offline-import",await f.upload(result())),again=await f.hub.get(repeated.id!),nextReview=await f.hub.get(again.data.reviewId);
  assert.equal((await f.hub.get(reviewId)).data.errors[0].verification,"failed");assert.equal(nextReview.data.errors[0].originReviewId,reviewId);
  const absent=result(false);absent.source.frames=[9];absent.checks=absent.checks.map(c=>({...c,present:[9]}));await f.hub.mutate(f.qa,"qc-offline-import",await f.upload(absent));assert.equal((await f.hub.get(nextReview.id)).data.errors[0].verification,undefined);
  const finished=await f.hub.mutate(f.qa,"qc-offline-import",await f.upload(result(false))),last=await f.hub.get(finished.id!);
  assert.equal((await f.hub.get(nextReview.id)).data.errors[0].verification,"passed");assert.equal((await f.hub.get(last.data.reviewId)).status,"passed");assert.equal(last.data.errorCount,0);
 }finally{f.db.close();}
});
test("Lead can preserve old web drafts while switching a Job to standalone offline uploads",async()=>{
 const f=await fixture();try{
  await f.db.batch([f.hub.insert("qc-session","old-open-draft",{draft:{note:"Giữ log cũ"},assigneeId:f.ann.id,reviewerId:f.qa.id},{task_id:"offline-task",status:"in_progress"})]);
  const body=await f.upload(result());await assert.rejects(()=>f.hub.mutate(f.qa,"qc-offline-import",body),/phiên QC web đang mở/);
  await assert.rejects(()=>f.hub.mutate(f.qa,"qc-offline-migrate",{id:f.assignmentId,revision:body.revision}),/Chỉ Lead/);
  await f.hub.mutate(f.lead,"qc-offline-migrate",{id:f.assignmentId,revision:body.revision});
  const old=await f.hub.get("old-open-draft");assert.equal(old.status,"superseded");assert.equal(old.data.draft.note,"Giữ log cũ");assert.equal(old.data.completedAt,undefined);
  assert.ok(await f.hub.mutate(f.qa,"qc-offline-import",await f.upload(result())));
 }finally{f.db.close();}
});
test("blank QC records its Job and complete ID/frame scope without inventing a Datumaro fingerprint",async()=>{
 const w=createBlankWorkspace({jobId:"888",frameCount:"90",idCount:"3"});
 assert.ok(w.source?.kind==="blank");assert.equal("sha256" in w.source,false);assert.equal(w.checks.length,3);assert.deepEqual(w.checks.map(c=>c.objectId),["1","2","3"]);assert.deepEqual(w.checks[0].present,Array.from({length:90},(_,i)=>i));
 assert.ok(w.checks.every(c=>!c.doneAt));assert.equal(parseWorkspace(w).source?.kind,"blank");
 const completedAt=new Date().toISOString(),r=offlineResultSchema.parse({format:"cuboid-qc-result-v1",id:w.exportId,appVersion:"1.1.0",source:w.source,startedAt:w.startedAt,completedAt,checks:w.checks.map(c=>({...c,doneAt:completedAt}))});
 assert.ok(offlineCsv(r).includes('"888"'));
 const missing=structuredClone(r);missing.checks.pop();assert.equal(offlineResultSchema.safeParse(missing).success,false);
 const missingFrame=structuredClone(r);missingFrame.checks[0].present.pop();assert.equal(offlineResultSchema.safeParse(missingFrame).success,false);
 assert.throws(()=>createBlankWorkspace({jobId:"888",frameCount:2000,idCount:5000}),/500.000/);
 assert.throws(()=>createBlankWorkspace({jobId:"wrong",frameCount:90,idCount:3}));
 const f=await fixture();try{
  const wrong=structuredClone(r);assert.ok(wrong.source.kind==="blank");wrong.source.jobId="999";
  assert.equal((await f.http(f.qa,"qc-offline-import",await f.upload(wrong))).status,409);
  const response=await f.http(f.qa,"qc-offline-import",await f.upload(r));assert.equal(response.status,200,await response.clone().text());
  const session=await f.hub.get((await response.json() as {id:string}).id),review=await f.hub.get(session.data.reviewId);
  assert.equal(review.data.sourceKind,"blank");assert.equal(review.data.sourceHash,null);assert.equal(review.data.idCheckedCount,3);
  const proof=await f.http(f.ann,"qc-offline-export?id="+session.id);assert.deepEqual(await proof.json(),r);
 }finally{f.db.close();}
});
test("QC Excel preserves the web matrix format, optional solutions, proof and visible log edits",()=>{
 const r=result();r.marks=[{objectId:"1",frame:2,codes:"SD"}];
 const bytes=offlineWorkbook(r),files=unzipSync(bytes),book=strFromU8(files["xl/workbook.xml"]),matrix=strFromU8(files["xl/worksheets/sheet1.xml"]),log=strFromU8(files["xl/worksheets/sheet2.xml"]);
 assert.deepEqual(readOfflineWorkbook(bytes),r);assert.match(book,/name="__QC_DATA"[^>]*state="veryHidden"/);assert.match(matrix,/topLeftCell="D2"/);assert.match(matrix,/SDL/);assert.ok(!/Mức độ|Loại lỗi/.test(log));assert.match(log,/Giải thích lỗi/);assert.match(log,/Hướng giải quyết/);
 files["xl/worksheets/sheet2.xml"]=strToU8(log.replace("Hộp lệch trái","Đã sửa nội dung &amp; ghi chú"));
 assert.equal(readOfflineWorkbook(zipSync(files)).checks[0].logs[0].description,"Đã sửa nội dung & ghi chú");
 // Office rewrites inline text to shared strings and may emit self-closing empty cells.
 files["xl/sharedStrings.xml"]=strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Log chỉnh trong Excel</t></si></sst>');
 files["xl/worksheets/sheet2.xml"]=strToU8(log.replace(/<c r="D2"[^>]*>[\s\S]*?<\/c>/,'<c r="D2" t="s"><v>0</v></c>').replace(/<c r="E2"[^>]*>[\s\S]*?<\/c>/,'<c r="E2"/>'));
 const edited=readOfflineWorkbook(zipSync(files));assert.equal(edited.checks[0].logs[0].description,"Log chỉnh trong Excel");assert.equal(edited.checks[0].logs[0].solution,"");
 files["xl/worksheets/sheet2.xml"]=strToU8(log.replace("</sheetData>",'<row r="3"><c r="D3"><f>WEBSERVICE("x")</f><v>0</v></c></row></sheetData>'));
 assert.throws(()=>readOfflineWorkbook(zipSync(files)),/công thức/);
 const empty=result(false);assert.deepEqual(readOfflineWorkbook(offlineWorkbook(empty)),empty);
});
