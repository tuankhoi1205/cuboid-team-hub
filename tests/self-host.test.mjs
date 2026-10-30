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
test("missing Python dependencies are detected before QC/count jobs are created and include installation guidance",async()=>{
 const f=await fixture(),previous=process.env.HUB_QC_PYTHON;try{
  const lead=await setupLead(f),qa=await activate(f,await invite(f,lead,2,"QA/QC")),task=(await f.app.hub.rows("task")).find(t=>t.id==="import-task-1241");
  const assigned=await f.req("/api/hub/qc-job-assign",{method:"POST",cookie:lead,body:{taskId:task.id,reviewerId:"member-2"}});assert.equal(assigned.status,200);const assignmentId=(await assigned.json()).id;
  process.env.HUB_QC_PYTHON=process.execPath;
  const environment=await(await f.req("/api/hub/qc-basic/environment",{cookie:qa})).json();assert.equal(environment.ready,false);assert.match(environment.message,/setup_runtime.py/);
  let response=await basicRun(f,qa,assignmentId,{content:JSON.stringify(basicDataset()),name:"test.json"});assert.equal(response.status,503);assert.match((await response.json()).error,/setup_runtime.py/);assert.equal((await f.app.hub.rows("qc-basic")).length,0);
  const form=new FormData();form.set("projectId",task.project_id);form.set("jobId","995566");form.set("file",new File([JSON.stringify(basicDataset())],"test.json"));
  response=await f.req("/api/hub/kpi-count/preview",{method:"POST",cookie:lead,body:form});assert.equal(response.status,503);assert.match((await response.json()).error,/setup_runtime.py/);assert.equal((await f.app.hub.rows("kpi-count")).length,0);
 }finally{if(previous===undefined)delete process.env.HUB_QC_PYTHON;else process.env.HUB_QC_PYTHON=previous;await f.close();}
});
test("Lead controls past-day target and production independently; reports remain writable and backups retain policy",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-28T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),task=(await f.app.hub.rows("task")).find(t=>t.data.assigneeId==="member-1");
  const report=(date,quantity,session=lead)=>f.req("/api/hub/daily",{method:"POST",cookie:session,body:{memberId:"member-1",date,submit:true,lines:[{taskId:task.id,endId:date==="2026-10-26"?"100":"120",activity:"annotation",minutes:420,quantity,rework:0}]}});
  let response=await report("2026-10-26",1200);assert.equal(response.status,200,await response.clone().text());
  const before=await f.app.hub.rows("daily"),set=(body,cookie=lead)=>f.req("/api/hub/kpi-exclusion",{method:"POST",cookie,body:{date:"2026-10-26",memberId:"member-1",...body}});
  assert.equal((await set({enabled:false,excludeProduction:true},ann)).status,403);
  assert.equal((await set({enabled:false,excludeProduction:true})).status,200);assert.deepEqual(await f.app.hub.rows("daily"),before);
  response=await report("2026-10-28",600,ann);assert.equal(response.status,200,await response.clone().text());
  const week=async()=>await(await f.req("/api/hub/weekly-summary?week=2026-10-26&member=member-1",{cookie:lead})).json();
  let summary=await week();assert.equal(summary.rows[0].quantity,600);assert.equal(summary.rows[0].target,6000);assert.equal(summary.rows[0].daily[0].quantity,1200);
  assert.equal((await set({enabled:true,excludeProduction:true,date:"2026-10-28",memberId:null})).status,200);summary=await week();assert.equal(summary.rows[0].quantity,0);assert.equal(summary.rows[0].target,4800);
  assert.equal((await set({enabled:false,excludeProduction:false,date:"2026-10-28"})).status,200);summary=await week();assert.equal(summary.rows[0].quantity,600);assert.equal(summary.rows[0].target,6000);
  assert.equal((await set({enabled:false,excludeProduction:false})).status,200);assert.equal((await week()).rows[0].quantity,1800);
  const backup=await(await f.req("/api/hub/backup",{cookie:lead})).json();assert.ok(backup.records.some(r=>r.kind==="kpi-exclusion"&&r.data.policyVersion===2));
  response=await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot:backup}});assert.equal(response.status,200,await response.clone().text());assert.equal((await week()).rows[0].quantity,1800);
 }finally{await f.close();}
});
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
function basicDataset(){const box=(id,track,position,scale=[4,2,1.7],rotation=[0,0,0],extra={})=>({id,type:"cuboid_3d",label_id:0,position,scale,rotation,attributes:{...(track!==null?{track_id:track}:{}),...extra}});return{dm_format_version:"1.0",categories:{label:{labels:[{name:"vehicle"}]}},items:[{id:"frame_000000",attr:{frame:0},annotations:[box(1,0,[0,0,0]),box(2,1,[0.1,0,0]),box(3,2,[150,0,5],[20,20,20],[0,0,0],{outside:true}),box(4,null,[50,0,0])]},{id:"frame_000001",attr:{frame:1},annotations:[box(5,0,[101,0,4],[6,2,1.7],[0,0,Math.PI])]}]};}
async function basicRun(f,session,assignmentId,{content=JSON.stringify(basicDataset()),name="datumaro.json",reason=""}={}){const body=new FormData();body.set("assignmentId",assignmentId);body.set("trackOffset","1");body.set("reason",reason);body.set("file",new File([content],name));return f.req("/api/hub/qc-basic/run",{method:"POST",cookie:session,body});}
async function waitBasic(f,id){for(let i=0;i<300;i++){const run=await f.app.hub.get(id);if(run.status!=="running")return run;await new Promise(r=>setTimeout(r,30));}assert.fail("Basic QC did not finish within nine seconds");}
async function finishBasic(f,qa,assignmentId){const response=await basicRun(f,qa,assignmentId);assert.equal(response.status,202,await response.clone().text());const run=await waitBasic(f,(await response.json()).id);assert.equal(run.status,"ready",run.data.error);const done=await f.req("/api/hub/qc-basic/complete",{method:"POST",cookie:qa,body:{id:run.id,reviewed:true,note:"Đã đối chiếu kết quả tool"}});assert.equal(done.status,200,await done.clone().text());return run;}
test("historical QC KPI credits require stored Lead confirmation and survive report edits without accepting forged client credit",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-29T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC")),task=(await f.app.hub.rows("task")).find(t=>t.data.assigneeId==="member-1");await f.app.store.batch([f.app.hub.replace(task,{...task.data,reviewerId:"member-2"})]);
  const activity={version:1,verifiedBy:"member-0",jobs:null,jobIds:[],cuboids:660,kpiCuboids:660,checkedIds:null,note:"Lead đã xác nhận"};
  let response=await f.req("/api/hub/daily",{method:"POST",cookie:qa,body:{date:"2026-10-29",submit:true,qcActivity:activity,lines:[{taskId:task.id,activity:"qc",minutes:60,quantity:0,rework:0}]}});assert.equal(response.status,200,await response.clone().text());let saved=await f.app.hub.get((await response.json()).id);assert.equal(saved.data.qcActivity,undefined);
  await f.app.store.batch([f.app.hub.insert("daily","confirmed-qc-credit",{date:"2026-10-28",lines:[{taskId:task.id,activity:"qc",minutes:null,quantity:0,rework:0}],qcActivity:activity},{owner_id:"member-2",date:"2026-10-28",natural_key:"member-2:2026-10-28",status:"imported"})]);
  response=await f.req("/api/hub/daily",{method:"POST",cookie:lead,body:{id:"confirmed-qc-credit",memberId:"member-2",date:"2026-10-28",submit:true,qcActivity:{...activity,cuboids:99999,kpiCuboids:99999},lines:[{taskId:task.id,activity:"qc",minutes:120,quantity:0,rework:0}]}});assert.equal(response.status,200,await response.clone().text());saved=await f.app.hub.get("confirmed-qc-credit");assert.equal(saved.data.qcActivity.kpiCuboids,660);
  const weekly=await(await f.req("/api/hub/weekly-summary?week=2026-10-26&member=member-2",{cookie:qa})).json();assert.equal(weekly.rows[0].quantity,660);assert.equal(weekly.rows[0].quality,null);assert.equal(weekly.qcEvents.length,0);assert.equal(weekly.qcReported[0].jobs,null);
  response=await f.req("/api/hub/daily",{method:"POST",cookie:ann,body:{id:"confirmed-qc-credit",memberId:"member-2",date:"2026-10-28",submit:true,lines:[{taskId:task.id,activity:"qc",minutes:120,quantity:0,rework:0}]}});assert.equal(response.status,403);
 }finally{await f.close();}
});

test("team Q&A supports shared answers, owner acceptance, Lead FAQs, safe revisions and backup restore without changing KPI",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-27T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC")),other=await activate(f,await invite(f,lead,4));await f.app.hub.ensureAttendanceDefaults();
  const baseline=await f.app.hub.rows(),post=(action,body,cookie=ann)=>f.req("/api/hub/"+action,{method:"POST",body,cookie}),payload={title:"Cách xử lý object bị che khuất?",content:"Job 1261, ID 20: nên xử lý như thế nào?",category:"Annotation",context:"Job 1261 · ID 20"};
  assert.equal((await post("qa-question",payload,"")).status,401);assert.equal((await post("qa-question",{...payload,title:" "})).status,400);
  let response=await post("qa-question",{...payload,owner_id:"member-0",frequent:true});assert.equal(response.status,200,await response.clone().text());const id=(await response.json()).id;let question=await f.app.hub.get(id);assert.equal(question.owner_id,"member-1");assert.equal(question.data.frequent,false);
  assert.equal((await post("qa-question",{...payload,id,revision:question.revision},other)).status,403);assert.equal((await post("qa-question",{...payload,id,revision:99})).status,409);
  assert.equal((await post("qa-frequent",{id,revision:question.revision,frequent:true})).status,403);assert.equal((await post("qa-frequent",{id,revision:question.revision,frequent:true},lead)).status,400);
  response=await post("qa-answer",{questionId:id,content:"Đối chiếu guideline trước khi xử lý; đây là câu trả lời kiểm thử."},qa);assert.equal(response.status,200);const answerId=(await response.json()).id;let answer=await f.app.hub.get(answerId);
  assert.equal((await post("qa-answer",{id:answerId,revision:answer.revision,questionId:id,content:"Sửa trái phép"},other)).status,403);
  assert.equal((await post("qa-accept",{id,revision:question.revision,answerId},other)).status,403);
  response=await post("qa-question",{...payload,title:"Câu hỏi khác cần giải đáp"},other);const second=(await response.json()).id;
  assert.equal((await post("qa-accept",{id:second,revision:1,answerId},other)).status,400);
  assert.equal((await post("qa-accept",{id,revision:question.revision,answerId})).status,200);question=await f.app.hub.get(id);assert.equal(question.status,"resolved");
  assert.equal((await post("qa-frequent",{id,revision:question.revision,frequent:true},lead)).status,200);question=await f.app.hub.get(id);assert.equal(question.data.frequent,true);
  const shared=await(await f.req("/api/hub/state",{cookie:other})).json();assert.ok(shared.records.some(r=>r.id===id));assert.ok(shared.records.some(r=>r.id===answerId));const author=shared.members.find(m=>m.id==="member-2");assert.ok(author?.name);assert.equal(author.email,undefined);assert.equal(author.auth_id,undefined);
  response=await post("qa-answer",{id:answerId,revision:answer.revision,questionId:id,content:"Nội dung đã được sửa để đối chiếu lại."},qa);assert.equal(response.status,200);question=await f.app.hub.get(id);assert.equal(question.status,"open");assert.equal(question.data.acceptedAnswerId,null);assert.equal(question.data.frequent,false);
  assert.equal((await post("qa-answer",{id:answerId,revision:answer.revision,questionId:id,content:"Bản sửa cũ"},qa)).status,409);
  answer=await f.app.hub.get(answerId);assert.equal((await post("qa-answer",{id:answerId,revision:answer.revision,questionId:second,content:"Chuyển câu trả lời"},qa)).status,400);
  assert.equal((await post("qa-accept",{id,revision:question.revision,answerId},lead)).status,200);question=await f.app.hub.get(id);
  response=await post("qa-question",{...payload,id,revision:question.revision,content:"Tình huống đã thay đổi."});assert.equal(response.status,200);assert.equal((await f.app.hub.get(id)).status,"open");
  for(const old of baseline)assert.deepEqual(await f.app.hub.get(old.id),old);
  const snapshot=await(await f.req("/api/hub/backup",{cookie:lead})).json();assert.ok(snapshot.records.some(r=>r.kind==="qa-question"));assert.ok(snapshot.records.some(r=>r.kind==="qa-answer"));response=await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot}});assert.equal(response.status,200,await response.clone().text());assert.equal((await f.app.hub.get(answerId)).data.content,"Nội dung đã được sửa để đối chiếu lại.");
 }finally{await f.close();}
});

test("closed weekly totals stay separate from Daily Reports, rates and other weeks, require Lead and survive backup restore",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-27T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC"));
  await f.app.hub.ensureAttendanceDefaults();
  const before=await f.app.hub.rows(),current=await f.app.hub.weeklySummary((await f.app.hub.members())[0],"team","2026-10-26"),totals={quantity:3840,target:3700,daysMet:3,kpiDays:4,qcRounds:0,reworkCount:1,offEquivalent:1,lateDays:0,conductBad:0,quality:.93,qualityBasis:"Guideline",qualityPassed:0};
  const body={memberId:"member-1",week:"2026-10-19",asOf:"2026-10-24",role:"Annotator",totals},save=(cookie,body)=>f.req("/api/hub/weekly-snapshot",{method:"POST",cookie,body});
  assert.equal((await save(ann,body)).status,403);assert.equal((await save(qa,body)).status,403);assert.equal((await save(lead,{...body,week:"2026-10-26",asOf:"2026-10-27"})).status,400);
  let response=await save(lead,body);assert.equal(response.status,200,await response.clone().text());const id=(await response.json()).id;assert.equal((await save(lead,body)).status,200);assert.equal((await f.app.hub.get(id)).revision,1);
  const history=await f.app.hub.weeklySummary((await f.app.hub.members())[0],"team","2026-10-19"),row=history.rows.find(r=>r.memberId==="member-1");assert.equal(row.quantity,3840);assert.equal(row.target,3700);assert.equal(row.quality,.93);assert.equal(row.offEquivalent,1);assert.equal(row.reworkCount,1);assert.ok(row.daily.every(d=>d.quantity===null&&d.target===null));assert.ok(history.work.filter(r=>r.memberId==="member-1").every(r=>r.quantity===null));
  assert.deepEqual(await f.app.hub.weeklySummary((await f.app.hub.members())[0],"team","2026-10-26"),current);for(const old of before)assert.deepEqual(await f.app.hub.get(old.id),old);
  const qaState=await(await f.req("/api/hub/state",{cookie:qa})).json(),annState=await(await f.req("/api/hub/state",{cookie:ann})).json();assert.ok(!qaState.records.some(r=>r.id===id));assert.ok(annState.records.some(r=>r.id===id));
  const snapshot=await(await f.req("/api/hub/backup",{cookie:lead})).json();assert.ok(snapshot.records.some(r=>r.id===id));response=await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot}});assert.equal(response.status,200,await response.clone().text());assert.equal((await f.app.hub.get(id)).data.totals.quantity,3840);
 }finally{await f.close();}
});
test("Lead previews Datumaro while assigning, atomically binds the baseline, and members receive exact daily ID goals",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-27T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC")),other=await activate(f,await invite(f,lead,3)),project=(await f.app.hub.rows("project")).find(r=>r.data.unit==="cuboid"),snapshot=await f.app.hub.rows("daily"),originalTasks=await f.app.hub.rows("task");
  const dataset=(uniform=false)=>({categories:{label:{labels:[{name:"vehicle"}]}},items:Array.from({length:60},(_,frame)=>({id:"frame_"+frame,attr:{frame},annotations:Array.from({length:34},(_,track)=>({type:"cuboid_3d",label_id:0,attributes:{track_id:track}})).filter(a=>frame<(uniform?60:a.attributes.track_id===1?30:a.attributes.track_id===2?10:60))}))});
  const preview=async(session,jobId="995500",editTaskId="",uniform=false)=>{const form=new FormData();form.set("projectId",project.id);form.set("code","");form.set("jobId",jobId);form.set("editTaskId",editTaskId);form.set("file",new File([JSON.stringify(dataset(uniform))],"baseline-datumaro.json"));return f.req("/api/hub/kpi-count/preview",{method:"POST",cookie:session,body:form});};
  assert.equal((await preview(ann)).status,403);assert.equal((await preview(qa)).status,403);
  const upload=await preview(lead);assert.equal(upload.status,202,await upload.clone().text());const run=await waitBasic(f,(await upload.json()).id);assert.equal(run.status,"ready",run.data.error);assert.equal(run.task_id,null);
  assert.deepEqual(await f.app.hub.rows("task"),originalTasks);assert.deepEqual(await f.app.hub.rows("daily"),snapshot);
  const url="/api/hub/kpi-count/result?id="+run.id;
  assert.equal((await f.req(url,{cookie:ann})).status,403);assert.equal((await f.req("/api/hub/file/"+run.data.inputFileId,{cookie:ann})).status,403);
  let result=await(await f.req(url+"&memberId=member-1&day=2026-10-27",{cookie:lead})).json();assert.equal(result.production.idCount,34);assert.equal(result.accounting.creditTotal,1960);assert.equal(result.ids[1].baselineCount,30);assert.equal(result.ids[2].baselineCount,10);assert.equal(result.guide.endId,22);assert.equal(result.guide.quantity,1240);assert.equal(result.guide.target,1200);
  assert.equal((await f.req("/api/hub/kpi-rate",{method:"POST",cookie:lead,body:{memberId:"member-2",date:"2026-10-27",quantity:600}})).status,200);
  result=await(await f.req(url+"&memberId=member-2&day=2026-10-27",{cookie:lead})).json();assert.equal(result.guide.endId,12);assert.equal(result.guide.quantity,640);assert.equal(result.guide.target,600);
  const task={code:"",jobId:"995500",title:"Task with initial Datumaro",projectId:project.id,assigneeId:"member-1",reviewerId:"member-2",assignedDate:"2026-10-27",deadline:"2026-10-30",priority:"normal",quantity:999999,frameCount:999};
  const assign=(session,body)=>f.req("/api/hub/kpi-count/assign",{method:"POST",cookie:session,body});
  const body={task,runId:run.id,matched:true};
  assert.equal((await assign(ann,body)).status,403);assert.equal((await assign(lead,{...body,matched:false})).status,400);
  assert.equal((await assign(lead,{...body,task:{...task,jobId:"WRONG"}})).status,409);
  assert.equal((await assign(lead,{...body,task:{...task,assigneeId:"unknown"}})).status,400);
  assert.deepEqual(await f.app.hub.rows("task"),originalTasks);assert.equal((await f.app.hub.get(run.id)).data.assignedTaskId,undefined);
  const raced=await Promise.all([assign(lead,body),assign(lead,body)]);assert.ok(raced.every(r=>[200,409].includes(r.status)));const response=raced.find(r=>r.status===200);assert.ok(response);const id=(await response.json()).id,created=await f.app.hub.get(id),source=(await f.app.hub.rows("kpi-source")).find(r=>r.task_id===id),assignedRun=await f.app.hub.get(source.data.runId);
  assert.equal(created.data.quantity,1960);assert.equal(created.data.frameCount,60);assert.equal(source.data.production.ids.length,34);assert.equal(source.owner_id,"member-1");assert.equal(assignedRun.owner_id,"member-1");assert.equal(assignedRun.task_id,id);assert.notEqual(assignedRun.id,run.id);assert.notEqual(assignedRun.data.inputFileId,run.data.inputFileId);
  const retry=await assign(lead,body);assert.equal(retry.status,200);assert.equal((await retry.json()).id,id);assert.equal((await f.app.hub.rows("task")).length,originalTasks.length+1);
  assert.equal((await assign(lead,{...body,task:{...task,title:"Changed"}})).status,409);
  assert.equal((await f.req("/api/hub/kpi-count/result?id="+assignedRun.id,{cookie:ann})).status,200);assert.equal((await f.req("/api/hub/file/"+assignedRun.data.inputFileId,{cookie:ann})).status,200);assert.equal((await f.req("/api/hub/file/"+assignedRun.data.inputFileId,{cookie:other})).status,403);
  assert.equal((await f.req(url,{cookie:ann})).status,403);
  const state=await(await f.req("/api/hub/state",{cookie:ann})).json();assert.ok(state.records.some(r=>r.id===source.id));assert.ok(!state.records.some(r=>r.id===run.id));
  const report=await f.req("/api/hub/daily",{method:"POST",cookie:ann,body:{date:"2026-10-27",submit:true,lines:[{taskId:id,endId:"22",productionMethod:"datumaro-baseline-v1",minutes:480,quantity:9999,rework:0}]}});assert.equal(report.status,200,await report.clone().text());const saved=await f.app.hub.get((await report.json()).id);assert.equal(saved.data.lines[0].quantity,1240);
  const nextUpload=await preview(lead,"995500",id,true);assert.equal(nextUpload.status,202);const nextRun=await waitBasic(f,(await nextUpload.json()).id);
  result=await(await f.req("/api/hub/kpi-count/result?id="+nextRun.id+"&memberId=member-1&day=2026-10-28",{cookie:lead})).json();assert.equal(result.guide.previousEnd,22);assert.equal(result.guide.endId,34);assert.equal(result.guide.quantity,720);assert.equal(result.guide.shortfall,480);assert.equal(result.guide.status,"insufficient");
  result=await(await f.req("/api/hub/kpi-count/result?id="+nextRun.id+"&memberId=member-1&day=2026-11-01",{cookie:lead})).json();assert.equal(result.guide.status,"excluded");
  assert.equal((await assign(lead,{task:{...task,id},runId:nextRun.id,matched:true})).status,409);assert.equal((await f.app.hub.get(source.id)).data.production.creditTotal,1960);assert.equal((await f.app.hub.get(saved.id)).data.lines[0].quantity,1240);
  for(const old of snapshot)assert.deepEqual(await f.app.hub.get(old.id),old);
 }finally{await f.close();}
});
test("QC matrix ranges stay grouped, preserve history, protect drafts, and export colored cells with detailed logs",async()=>{
 let clock=new Date("2026-10-24T01:00:00Z");const f=await fixture({now:()=>clock});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC")),other=await activate(f,await invite(f,lead,3));
  const source=(await f.app.hub.rows("daily")).find(r=>r.owner_id==="member-1"&&r.date==="2026-10-21"),taskId=source.data.lines[0].taskId;
  const post=async(action,body,cookie=qa)=>f.req("/api/hub/"+action,{method:"POST",cookie,body});
  const a=await post("qc-job-assign",{taskId,reviewerId:"member-2"},lead),assignmentId=(await a.json()).id,run=await finishBasic(f,qa,assignmentId);
  const snapshot=await f.app.hub.rows("daily");
  let response=await f.req("/api/hub/qc-basic/matrix?id="+run.id,{cookie:qa});assert.equal(response.status,200);const matrix=await response.json();assert.deepEqual(matrix.frames,[0,1]);assert.equal(matrix.rows.find(r=>r.id==="1").cells.find(c=>c.frame===1).codes,"KZHD");
  assert.equal((await f.req("/api/hub/qc-basic/matrix?id="+run.id,{cookie:other})).status,403);assert.equal((await f.req("/api/hub/qc-basic/matrix?id="+run.id)).status,401);
  // Existing saved results have no presence JSON: read their Excel Matrix without rerunning checks.
  const resultPath=join(f.dir,run.data.resultKey),original=JSON.parse(await readFile(resultPath,"utf8"));delete original.matrix;await writeFile(resultPath,JSON.stringify(original));
  const legacy=await(await f.req("/api/hub/qc-basic/matrix?id="+run.id,{cookie:qa})).json();assert.deepEqual(legacy.rows.map(r=>[r.id,r.present]),matrix.rows.map(r=>[r.id,r.present]));assert.deepEqual(await f.app.hub.rows("daily"),snapshot);
  response=await post("qc-job-start",{id:assignmentId});assert.equal(response.status,200,await response.clone().text());const id=(await response.json()).id;
  let session=await f.app.hub.get(id),checks=Array.from({length:Number(session.data.endId)-Number(session.data.rangeStart)+1},(_,i)=>({objectId:String(i+Number(session.data.rangeStart)),result:i===0?"changes":"passed",frameId:"",type:"Sai vị trí",severity:"minor",description:"",evidence:"",...(i===0?{frameLogs:[{id:"range-001",frameId:"0",frameEnd:"1",code:"K",type:"Sai vị trí",severity:"major",description:"=Không phải công thức: sửa cả 2 frame",evidence:""}]}:{})}));
  const draft={id,revision:session.revision,matrixRunId:run.id,idChecks:checks};response=await post("qc-draft",draft);assert.equal(response.status,200,await response.clone().text());
  assert.equal((await post("qc-draft",draft)).status,409);session=await f.app.hub.get(id);assert.equal(session.data.draft.idChecks[0].frameLogs.length,1);
  const bad=structuredClone(checks);bad[0].frameLogs[0].frameEnd="2000";assert.equal((await post("qc-draft",{...draft,revision:session.revision,idChecks:bad})).status,400);
  const url="/api/hub/qc-basic/matrix-export?sessionId="+id;
  assert.equal((await f.req(url,{cookie:ann})).status,403);assert.equal((await f.req(url,{cookie:other})).status,403);
  const draftExcel=await f.req(url,{cookie:qa});assert.equal(draftExcel.status,200,await draftExcel.clone().text());assert.match(draftExcel.headers.get("Content-Disposition"),/draft/);
  const inspectXlsx=bytes=>JSON.parse(execFileSync(resolve("self-host/.runtime/qc-python/python.exe"),["-I","-X","utf8","-c","import io,sys,json,openpyxl; w=openpyxl.load_workbook(io.BytesIO(sys.stdin.buffer.read())); m=w['Matrix']; l=w['Log QC']; print(json.dumps({'names':w.sheetnames,'freeze':m.freeze_panes,'d2':m['D2'].value,'e2':m['E2'].value,'fill':m['E2'].fill.fgColor.rgb,'border':m['E2'].border.left.color.rgb,'filter':m.auto_filter.ref,'logs':l.max_row-1,'start':l['B2'].value,'end':l['C2'].value,'type':l['G2'].data_type,'desc':l['G2'].value},ensure_ascii=False))"],{input:bytes,windowsHide:true}).toString());
  const book=inspectXlsx(Buffer.from(await draftExcel.arrayBuffer()));assert.equal(book.freeze,"D2");assert.equal(book.logs,1);assert.equal(book.start,0);assert.equal(book.end,1);assert.equal(book.type,"s");assert.equal(book.e2,"KZHD");assert.equal(book.fill,"FFF4B084");assert.equal(book.border,"FFC03939");assert.match(book.filter,/A1:E/);
  response=await post("qc-result",{...draft,revision:session.revision});assert.equal(response.status,200,await response.clone().text());session=await f.app.hub.get(id);const review=await f.app.hub.get(session.data.reviewId);assert.equal(review.data.errors.length,1);assert.equal(review.data.errors[0].frameEnd,"1");assert.equal(review.data.matrixRunId,run.id);
  assert.equal((await f.req(url,{cookie:ann})).status,200);assert.equal((await f.req(url,{cookie:other})).status,403);
  assert.equal((await post("review-fix",{id:review.id,errorIndex:0,fixed:true,note:"Đã sửa toàn bộ vùng"},ann)).status,200);
  const fixed=await f.req(url,{cookie:qa}),fixedBook=inspectXlsx(Buffer.from(await fixed.arrayBuffer()));assert.equal(fixedBook.logs,1);assert.equal(fixedBook.border,"FF3675C5");
  for(const report of snapshot){const current=await f.app.hub.get(report.id);assert.deepEqual(current.data.lines,report.data.lines);}
  // A failed recheck the next day creates one linked range, including when that ID is outside the new production range.
  response=await post("daily",{memberId:"member-1",date:"2026-10-24",submit:true,lines:[{taskId,endId:"36",quantity:120,rework:0,minutes:60}]},lead);assert.equal(response.status,200,await response.clone().text());clock=new Date("2026-10-25T01:00:00Z");
  response=await post("qc-job-start",{id:assignmentId});assert.equal(response.status,200,await response.clone().text());const nextId=(await response.json()).id,nextSession=await f.app.hub.get(nextId),nextChecks=Array.from({length:Number(nextSession.data.endId)-Number(nextSession.data.rangeStart)+1},(_,i)=>({objectId:String(i+Number(nextSession.data.rangeStart)),result:"passed",type:"Sai vị trí",severity:"minor",description:"",frameId:"",evidence:""}));
  response=await post("qc-result",{id:nextId,idChecks:nextChecks,matrixRunId:run.id,rechecks:[{reviewId:review.id,errorIndex:0,result:"failed"}]});assert.equal(response.status,200,await response.clone().text());const repeated=await f.app.hub.get((await f.app.hub.get(nextId)).data.reviewId);assert.equal(repeated.data.errors.length,1);assert.equal(repeated.data.errors[0].frameEnd,"1");assert.equal(repeated.data.errors[0].code,"K");assert.equal(repeated.data.errors[0].originReviewId,review.id);
  const repeatedExcel=await f.req("/api/hub/qc-basic/matrix-export?sessionId="+nextId,{cookie:ann});assert.equal(repeatedExcel.status,200);assert.equal(inspectXlsx(Buffer.from(await repeatedExcel.arrayBuffer())).logs,1);
 }finally{await f.close();}
});

test("members receive only weekly KPI summaries and Excel while Lead retains cumulative access",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-26T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC"));
  const rate=await f.req("/api/hub/kpi-rate",{method:"POST",cookie:lead,body:{memberId:"member-2",date:"2026-10-26",quantity:600}});assert.equal(rate.status,200);
  for(const [session,memberId,target] of [[ann,"member-1",6000],[qa,"member-2",3000]]){
   const summary=await(await f.req("/api/hub/kpi-summary",{cookie:session})).json();assert.equal(summary.period,"weekly");assert.equal(summary.start,"2026-10-26");assert.equal(summary.end,"2026-11-01");assert.equal(summary.rows.length,1);assert.equal(summary.rows[0].memberId,memberId);assert.equal(summary.rows[0].kpi.quantity,0);assert.equal(summary.rows[0].kpi.target,target);
   const state=await(await f.req("/api/hub/state",{cookie:session})).json();assert.equal(state.kpiSummary.period,"weekly");assert.equal(state.kpiSummary.rows.length,1);
   const boot=await(await f.req("/api/auth/me?bootstrap=1",{cookie:session})).json();assert.equal(boot.hubState.kpiSummary.period,"weekly");
   assert.equal((await f.req("/api/hub/kpi-summary?period=cumulative&role=Lead",{cookie:session})).status,403);assert.equal((await f.req("/api/hub/kpi-summary?period=weekly&member=team",{cookie:session})).status,403);
   assert.equal((await f.req("/api/hub/export?kind=daily&format=xlsx&kpiPeriod=cumulative",{cookie:session})).status,403);
   const excel=await f.req("/api/hub/export?kind=daily&format=xlsx",{cookie:session});assert.equal(excel.status,200);const bytes=Buffer.from(await excel.arrayBuffer()).toString("utf8");assert.ok(bytes.includes('name="KPI tuan"'));assert.ok(!bytes.includes('name="KPI luy ke"'));
  }
  const team=await(await f.req("/api/hub/kpi-summary",{cookie:lead})).json();assert.equal(team.period,"cumulative");assert.equal(team.start,"2026-10-20");assert.equal(team.rows.find(r=>r.memberId==="member-1").kpi.quantity,2040);
  const excel=await f.req("/api/hub/export?kind=daily&format=xlsx",{cookie:lead});assert.ok(Buffer.from(await excel.arrayBuffer()).toString("utf8").includes('name="KPI luy ke"'));
  assert.equal((await f.req("/api/hub/kpi-summary?period=cumulative&member=member-1",{cookie:qa})).status,403);
 }finally{await f.close();}
});

test("Datumaro baseline and updates calculate milestone reports, retain outside work and protect baseline and historical KPI",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-26T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),other=await activate(f,await invite(f,lead,3)),template=(await f.app.hub.rows("task"))[0],taskId="datumaro-http-job";
  await f.app.store.batch([f.app.hub.insert("task",taskId,{...template.data,assigneeId:"member-1",jobId:"987700",frameCount:60,quantity:null},{project_id:template.project_id})]);
  const dataset=(ids,frames=50)=>({categories:{label:{labels:[{name:"vehicle"}]}},items:Array.from({length:60},(_,frame)=>({id:`frame_${frame}`,attr:{frame},annotations:frame<frames?ids.map(id=>({type:"cuboid_3d",label_id:0,attributes:{track_id:id-1,keyframe:true}})):[]}))});
  const upload=async(value)=>{const body=new FormData();body.set("taskId",taskId);body.set("file",new File([JSON.stringify(value)],"datumaro.json"));const response=await f.req("/api/hub/kpi-count/run",{method:"POST",cookie:ann,body});assert.equal(response.status,202,await response.clone().text());const run=await waitBasic(f,(await response.json()).id);assert.equal(run.status,"ready",run.data.error);return run;};
  const confirm=(session,run,sourceRevision)=>f.req("/api/hub/kpi-count/confirm",{method:"POST",cookie:session,body:{id:run.id,matched:true,sourceRevision}});
  const before=await f.app.hub.rows("daily"),baseline=await upload(dataset(Array.from({length:70},(_,i)=>i+1)));
  assert.equal((await confirm(ann,baseline,0)).status,403);assert.equal((await confirm(lead,baseline,0)).status,200);
  let source=(await f.app.hub.rows("kpi-source")).find(r=>r.task_id===taskId);assert.equal(source.data.production.creditTotal,3500);assert.equal(source.data.production.baseline.runId,baseline.id);
  const update=await upload(dataset([...Array.from({length:50},(_,i)=>i+1),71,72,73,74]));
  let preview=await(await f.req("/api/hub/kpi-count/result?id="+update.id,{cookie:ann})).json();assert.equal(preview.accounting.currentTotal,2700);assert.equal(preview.accounting.creditTotal,3700);assert.equal(preview.accounting.addedTotal,200);
  assert.equal((await confirm(other,update,source.revision)).status,403);assert.equal((await confirm(ann,update,0)).status,409);assert.equal((await confirm(ann,update,source.revision)).status,200);
  assert.deepEqual(await f.app.hub.rows("daily"),before);
  const body={date:"2026-10-26",submit:true,lines:[{taskId,endId:"24",productionMethod:"datumaro-baseline-v1",minutes:120,quantity:999999,rework:999}]};
  let response=await f.req("/api/hub/daily",{method:"POST",cookie:ann,body:{...body,lines:[{...body.lines[0],productionMethod:"legacy"}]}});assert.equal(response.status,200,await response.clone().text());let report=await f.app.hub.get((await response.json()).id);assert.equal(report.data.lines[0].productionMethod,"datumaro-baseline-v1");assert.equal(report.data.lines[0].quantity,1200);assert.equal(report.data.lines[0].keyframeSnapshot.baseline,1200);assert.equal(report.data.lines[0].keyframeSnapshot.added,0);assert.equal(report.data.lines[0].productionFactor,undefined);
  const repeat=await upload(dataset([...Array.from({length:50},(_,i)=>i+1),71,72,73,74]));source=await f.app.hub.get(source.id);assert.equal((await confirm(ann,repeat,source.revision)).status,200);source=await f.app.hub.get(source.id);assert.equal(source.data.production.creditTotal,3700);assert.equal(source.data.production.baseline.runId,baseline.id);
  assert.equal((await confirm(lead,baseline,source.revision)).status,409);
  response=await f.req("/api/hub/daily",{method:"POST",cookie:ann,body:{...body,id:report.id,revision:report.revision,lines:[{...body.lines[0],issue:"Ghi chú mới"}]}});assert.equal(response.status,200,await response.clone().text());report=await f.app.hub.get(report.id);assert.equal(report.data.lines[0].quantity,1200);assert.equal(report.data.lines[0].keyframeSnapshot.runId,update.id);
  const excel=await f.req("/api/hub/kpi-count/export?id="+repeat.id,{cookie:ann});assert.equal(excel.status,200);assert.deepEqual([...new Uint8Array(await excel.arrayBuffer()).slice(0,2)],[80,75]);
  const empty=await upload(dataset([]));source=await f.app.hub.get(source.id);assert.equal((await confirm(ann,empty,source.revision)).status,200);source=await f.app.hub.get(source.id);assert.equal(source.data.production.creditTotal,3700);assert.equal(source.data.production.currentTotal,0);
  for(const old of before)assert.deepEqual(await f.app.hub.get(old.id),old);
 }finally{await f.close();}
});

test("weekly summary is generated directly from Daily Reports with private member scope and readable Excel",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-24T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC"));
  const response=await f.req("/api/hub/weekly-summary?week=2026-10-24&member=team",{cookie:lead});assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.equal(data.rows.length,10);assert.equal(data.start,"2026-10-19");assert.equal(data.end,"2026-10-25");assert.equal(data.totals.quantity,16800);assert.equal(data.rows.find(r=>r.memberId==="member-1").quantity,2040);
  assert.equal((await f.req("/api/hub/weekly-summary?week=2026-10-19&member=team",{cookie:ann})).status,403);assert.equal((await f.req("/api/hub/weekly-summary?week=2026-10-19&member=member-1",{cookie:qa})).status,403);assert.equal((await f.req("/api/hub/export?kind=weekly-summary&format=xlsx&week=2026-10-19&member=team",{cookie:qa})).status,403);
  const own=await(await f.req("/api/hub/weekly-summary?week=2026-10-19",{cookie:ann})).json();assert.equal(own.rows.length,1);assert.equal(own.rows[0].memberId,"member-1");assert.ok(own.work.every(r=>r.memberId==="member-1"));
  const excel=await f.req("/api/hub/export?kind=weekly-summary&format=xlsx&week=2026-10-19&member=team",{cookie:lead});assert.equal(excel.status,200);assert.match(excel.headers.get("Content-Disposition"),/2026-10-19_2026-10-25/);assert.deepEqual([...new Uint8Array(await excel.arrayBuffer()).slice(0,2)],[80,75]);
 }finally{await f.close();}
});

test("keyframe file counting includes outside, protects files, reconciles daily ID ranges and never recalculates saved KPI",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-24T02:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),other=await activate(f,await invite(f,lead,3)),qa=await activate(f,await invite(f,lead,2,"QA/QC")),template=(await f.app.hub.rows("task"))[0],taskId="keyframe-http-job";
  await f.app.store.batch([f.app.hub.insert("task",taskId,{...template.data,assigneeId:"member-1",reviewerId:"member-2",jobId:"987600",frameCount:3,quantity:null},{project_id:template.project_id})]);
  const native={tags:[],shapes:[],tracks:Array.from({length:3},(_,i)=>({id:8000+i,label:"vehicle",shapes:[{type:"cuboid",frame:0,outside:false},{type:"cuboid",frame:1,outside:true},...(i===0?[{type:"cuboid",frame:2,outside:false,keyframe:false}]:[])]}))};
  const upload=async(session,value=native,index="")=>{const body=new FormData();body.set("taskId",taskId);body.set("trackOffset","1");body.set("jobIndex",index);body.set("file",new File([JSON.stringify(value)],"annotations.json"));return f.req("/api/hub/kpi-count/run",{method:"POST",cookie:session,body});};
  assert.equal((await upload(other)).status,403);assert.equal((await f.req("/api/hub/kpi-count/result?id=unknown")).status,401);
  const oldReports=await f.app.hub.rows("daily"),response=await upload(ann,[native]);assert.equal(response.status,202,await response.clone().text());const run=await waitBasic(f,(await response.json()).id);assert.equal(run.status,"ready",run.data.error);assert.equal(run.data.summary.totals.keyframes,6);assert.equal(run.data.summary.totals.outside,3);assert.equal(run.data.summary.totals.interpolated,1);assert.equal(run.data.summary.usable,true);
  assert.deepEqual(await f.app.hub.rows("daily"),oldReports);
  const result=await f.req("/api/hub/kpi-count/result?id="+run.id,{cookie:qa});assert.equal(result.status,200);assert.deepEqual((await result.json()).ids.map(r=>[r.id,r.keyframes,r.outside]),[[1,2,1],[2,2,1],[3,2,1]]);
  assert.equal((await f.req("/api/hub/kpi-count/result?id="+run.id,{cookie:other})).status,403);assert.equal((await f.req("/api/hub/file/"+run.data.inputFileId,{cookie:other})).status,403);assert.equal((await f.req("/api/hub/kpi-count/export?id="+run.id,{cookie:other})).status,403);
  assert.equal((await f.req("/api/hub/kpi-count/confirm",{method:"POST",cookie:ann,body:{id:run.id,matched:false}})).status,400);
  assert.equal((await f.req("/api/hub/kpi-count/confirm",{method:"POST",cookie:ann,body:{id:run.id,matched:true}})).status,200);
  const source=(await f.app.hub.rows("kpi-source"))[0];assert.ok(source.data.fileHash);assert.ok((await f.app.hub.visible((await f.app.hub.members()).find(m=>m.id==="member-1"))).some(r=>r.id===source.id));assert.ok(!(await f.app.hub.visible((await f.app.hub.members()).find(m=>m.id==="member-3"))).some(r=>r.id===source.id));
  let daily=await f.req("/api/hub/daily",{method:"POST",cookie:lead,body:{memberId:"member-1",date:"2026-10-23",submit:true,lines:[{taskId,endId:"1",quantity:111,minutes:120,rework:0}]}});assert.equal(daily.status,200,await daily.clone().text());
  const body={date:"2026-10-24",submit:true,lines:[{taskId,endId:"3",quantity:99999,rework:99,minutes:120,productionMethod:"keyframe-v1",countSourceId:source.id}]};daily=await f.req("/api/hub/daily",{method:"POST",cookie:ann,body});assert.equal(daily.status,200,await daily.clone().text());const saved=await f.app.hub.get((await daily.json()).id);assert.equal(saved.data.lines[0].quantity,4);assert.equal(saved.data.lines[0].keyframeSnapshot.start,2);assert.equal(saved.data.lines[0].keyframeSnapshot.outside,2);
  const excel=await f.req("/api/hub/kpi-count/export?id="+run.id,{cookie:ann});assert.equal(excel.status,200);const buffer=Buffer.from(await excel.arrayBuffer());assert.deepEqual([...buffer.subarray(0,2)],[80,75]);
  const sheets=JSON.parse(execFileSync(resolve("self-host/.runtime/qc-python/python.exe"),["-I","-c","import io,sys,json,openpyxl; w=openpyxl.load_workbook(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({'names':w.sheetnames,'headers':[c.value for c in w.worksheets[0][1]],'qty':w.worksheets[1]['I2'].value}))"],{input:buffer,windowsHide:true}).toString());assert.equal(sheets.names.length,3);assert.ok(sheets.headers.includes("Keyframe outside"));assert.equal(sheets.qty,4);
  const updated=structuredClone(native);updated.tracks[2].shapes.push({type:"cuboid",frame:2,outside:true});const more=await upload(ann,[updated]);assert.equal(more.status,202);const next=await waitBasic(f,(await more.json()).id);assert.equal(next.status,"ready",next.data.error);assert.equal((await f.req("/api/hub/kpi-count/confirm",{method:"POST",cookie:qa,body:{id:next.id,matched:true}})).status,200);
  daily=await f.req("/api/hub/daily",{method:"POST",cookie:ann,body:{...body,id:saved.id,revision:saved.revision,lines:[{...body.lines[0],quantity:99999,issue:"Note edit"}]}});assert.equal(daily.status,200,await daily.clone().text());const unchanged=await f.app.hub.get(saved.id);assert.equal(unchanged.data.lines[0].quantity,4);assert.equal(unchanged.data.lines[0].keyframeSnapshot.fileHash,run.data.fileHash);
  const compared=await(await f.req("/api/hub/kpi-count/result?id="+next.id,{cookie:ann})).json();assert.equal(compared.comparisons[0].quantity,5);assert.equal(compared.comparisons[0].savedQuantity,4);assert.equal(compared.comparisons[0].difference,1);
  assert.deepEqual((await f.app.hub.rows("daily")).filter(r=>oldReports.some(o=>o.id===r.id)),oldReports);
  const snapshot=await(await f.req("/api/hub/backup",{cookie:lead})).json();const restored=await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot}});assert.equal(restored.status,200,await restored.clone().text());assert.equal((await f.app.hub.get(source.id)).data.runId,next.id);
 }finally{await f.close();}
});

test("Datumaro with missing Object IDs cannot activate a baseline, and multi-Job backup requires explicit selection",async()=>{
 const f=await fixture();try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),task=(await f.app.hub.rows("task")).find(r=>r.data.assigneeId==="member-1");
  const upload=async(content,index="")=>{const form=new FormData();form.set("taskId",task.id);form.set("file",new File([JSON.stringify(content)],"annotations.json"));form.set("jobIndex",index);return f.req("/api/hub/kpi-count/run",{method:"POST",cookie:ann,body:form});};
  const data=basicDataset();for(const item of data.items)for(const ann of item.annotations)ann.attributes.keyframe=true;
  let response=await upload(data),run=await waitBasic(f,(await response.json()).id);assert.equal(run.status,"ready",run.data.error);assert.equal(run.data.summary.completeOutside,false);assert.equal(run.data.summary.usable,false);assert.equal(run.data.summary.totals.outside,1);assert.equal((await f.req("/api/hub/kpi-count/confirm",{method:"POST",cookie:lead,body:{id:run.id,matched:true,sourceRevision:0}})).status,409);assert.equal((await f.app.hub.rows("kpi-source")).length,0);
  const native={tags:[],shapes:[],tracks:[{label:"vehicle",shapes:[{type:"cuboid",frame:0,outside:true}]}]};
  response=await upload([native,native]);run=await waitBasic(f,(await response.json()).id);assert.equal(run.status,"failed");assert.match(run.data.error,/2 Job/);
  response=await upload([native,native],"2");run=await waitBasic(f,(await response.json()).id);assert.equal(run.status,"ready",run.data.error);assert.equal(run.data.summary.jobIndex,2);assert.equal(run.data.summary.totals.keyframes,1);assert.equal(run.data.summary.usable,true);
 }finally{await f.close();}
});

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
  assert.equal((await post("qc-job-start",{id:assignmentId},qa)).status,409);await finishBasic(f,qa,assignmentId);
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

test("Tool_QC checks the supplied six rules, separates outside boxes from KPI, and gates detailed QC only once",async()=>{
 const f=await fixture({now:()=>new Date("2026-10-24T01:00:00Z")});try{
  const lead=await setupLead(f),ann=await activate(f,await invite(f,lead,1)),qa=await activate(f,await invite(f,lead,2,"QA/QC")),other=await activate(f,await invite(f,lead,8,"QA/QC"));
  const source=(await f.app.hub.rows("daily")).find(r=>r.owner_id==="member-1"&&r.date==="2026-10-21"),taskId=source.data.lines[0].taskId;
  const assigned=await f.req("/api/hub/qc-job-assign",{method:"POST",cookie:lead,body:{taskId,reviewerId:"member-2"}});assert.equal(assigned.status,200);const assignmentId=(await assigned.json()).id;
  const before=(await f.app.hub.rows()).filter(r=>["daily","review","manual-rework"].includes(r.kind));
  assert.equal((await basicRun(f,ann,assignmentId)).status,403);assert.equal((await basicRun(f,other,assignmentId)).status,403);
  const started=await basicRun(f,qa,assignmentId);assert.equal(started.status,202,await started.clone().text());const id=(await started.json()).id;
  assert.equal((await basicRun(f,qa,assignmentId)).status,409);const run=await waitBasic(f,id);assert.equal(run.status,"ready",run.data.error);
  assert.equal(run.data.summary.outsideCuboids,1);assert.equal(run.data.summary.cuboids,4);for(const key of ["scale","size","z","rot","overlap","dist","data"])assert.ok(run.data.summary.counts[key]>0,key);
  assert.deepEqual((await f.app.hub.rows()).filter(r=>["daily","review","manual-rework"].includes(r.kind)),before);
  const result=await f.req("/api/hub/qc-basic/result?id="+id,{cookie:qa});assert.equal(result.status,200);assert.ok((await result.json()).rows.some(r=>r.track==="1"));
  const outside=await(await f.req("/api/hub/qc-basic/result?id="+id+"&track=3",{cookie:ann})).json();assert.equal(outside.total,0);
  const distance=await(await f.req("/api/hub/qc-basic/result?id="+id+"&check=dist&frame=1",{cookie:qa})).json();assert.equal(distance.total,1);assert.equal(distance.rows[0].track,"1");
  assert.equal((await f.req("/api/hub/qc-basic/result?id="+id,{cookie:other})).status,403);assert.equal((await f.req("/api/hub/file/"+run.data.excelFileId,{cookie:other})).status,403);
  const excel=await f.req("/api/hub/file/"+run.data.excelFileId,{cookie:ann});assert.equal(excel.status,200);assert.deepEqual([...new Uint8Array(await excel.arrayBuffer()).slice(0,2)],[80,75]);
  assert.equal((await f.req("/api/hub/qc-basic/complete",{method:"POST",cookie:qa,body:{id,reviewed:false}})).status,400);
  assert.equal((await f.req("/api/hub/qc-basic/complete",{method:"POST",cookie:ann,body:{id,reviewed:true}})).status,403);
  assert.equal((await f.req("/api/hub/qc-basic/complete",{method:"POST",cookie:qa,body:{id,reviewed:true}})).status,200);
  assert.equal((await basicRun(f,qa,assignmentId)).status,403);assert.equal((await basicRun(f,lead,assignmentId)).status,400);
  const detail=await f.req("/api/hub/qc-job-start",{method:"POST",cookie:qa,body:{id:assignmentId}});assert.equal(detail.status,200,await detail.clone().text());
  const snapshot=await(await f.req("/api/hub/backup",{cookie:lead})).json();assert.ok(snapshot.records.some(r=>r.kind==="qc-basic"&&r.id===id));
  const restored=await f.req("/api/hub/restore",{method:"POST",cookie:lead,body:{confirm:"KHOI PHUC",snapshot}});assert.equal(restored.status,200,await restored.clone().text());
  assert.equal((await f.app.hub.get(id)).status,"completed");
 }finally{await f.close();}
});

test("Tool_QC rejects malformed input cleanly and reads the Datumaro JSON inside a ZIP",async()=>{
 const f=await fixture();try{
  const lead=await setupLead(f),qa=await activate(f,await invite(f,lead,2,"QA/QC"));
  const assigned=await f.req("/api/hub/qc-job-assign",{method:"POST",cookie:lead,body:{taskId:"import-task-1241",reviewerId:"member-2"}}),assignmentId=(await assigned.json()).id;
  const bad=await basicRun(f,qa,assignmentId,{content:'{"items":',name:"broken.json"});assert.equal(bad.status,202);const failed=await waitBasic(f,(await bad.json()).id);assert.equal(failed.status,"failed");assert.ok(failed.data.error);
  const python=resolve("self-host/.runtime/qc-python/python.exe"),zip=execFileSync(python,["-I","-c","import io,zipfile,sys; b=io.BytesIO(); z=zipfile.ZipFile(b,'w'); z.writestr('annotations/default.json',sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())"],{input:JSON.stringify(basicDataset()),windowsHide:true});
  const response=await basicRun(f,qa,assignmentId,{content:zip,name:"job.zip"});assert.equal(response.status,202);const ready=await waitBasic(f,(await response.json()).id);assert.equal(ready.status,"ready",ready.data.error);assert.equal(ready.data.summary.outsideCuboids,1);
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
