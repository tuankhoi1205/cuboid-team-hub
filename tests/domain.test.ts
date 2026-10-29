import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Hub, today, weekStart, localTime } from "../lib/domain.ts";
import { csv, xlsx } from "../lib/export.ts";
import { dailyKpi,cumulativeKpi,weeklyKpi,kpiDayTarget,dailyRate,previousWorkday,nextWorkday } from "../lib/kpi.ts";
import { reportSheets } from "../lib/report-export.ts";
import { qcIdRange,qcIdRows,qcLogRows } from "../lib/qc-table.ts";
import { dailyReportRows,dailyReportWritable,dailyReportCompletion } from "../lib/daily-reports.ts";
import { attendanceSummary } from "../lib/attendance-summary.ts";
import { taskActivity,taskActivityTitle } from "../lib/task-activity.ts";
import { buildTeamEvaluation,evaluationSheets,evaluationTotals } from "../lib/evaluation.ts";
import {reportEndId} from "../lib/report-progress.ts";
import {dailyQcApproved,reportQcKey,reportQcApprovalStatements} from "../lib/report-qc.ts";
import {taskFrameCount} from "../lib/task-frames.ts";
import {pendingRepairWork,repairProgress} from "../lib/repair-progress.ts";
import {cuboidsFromIds} from "../lib/report-production.ts";
import {qcJobState,qcClearedThrough} from "../lib/qc-jobs.ts";
import {keyframeRange,keyframeQuantity,keyframeComparisons} from "../lib/keyframe-kpi.ts";
import {buildWeeklySummary,weeklySummarySheets} from "../lib/weekly-summary.ts";

test("weekly KPI resets on Monday, sums dated personal rates/exclusions, and excludes prior weeks, drafts, future production and QC",async()=>{
 const {hub,ann}=await fixture(),all=await hub.rows(),task=all.find(r=>r.kind==="task"&&r.data.assigneeId===ann.id)!;
 const report=(id:string,date:string,quantity:number,status="submitted"):any=>({id,kind:"daily",owner_id:ann.id,date,status,data:{lines:[{taskId:task.id,activity:"annotation",quantity,rework:4000},{taskId:task.id,activity:"qc",quantity:9000}]}});
 const rows:any[]=[...all,report("prior-week","2026-10-24",9999),report("monday","2026-10-26",1000),report("thursday","2026-10-29",700),report("draft","2026-10-28",8888,"draft"),report("future","2026-10-30",9999),{kind:"kpi-rate",owner_id:ann.id,date:"2026-10-27",status:"active",data:{quantity:600}},{kind:"kpi-rate",owner_id:ann.id,date:"2026-10-30",status:"active",data:{quantity:900}},{kind:"kpi-exclusion",owner_id:ann.id,date:"2026-10-28",status:"active",data:{}}];
 const k=weeklyKpi(ann.id,rows,"2026-10-29");assert.equal(k.start,"2026-10-26");assert.equal(k.end,"2026-11-01");assert.equal(k.quantity,1700);assert.equal(k.target,3300);assert.equal(k.targetToDate,2400);assert.equal(k.days,4);assert.equal(k.currentRate,600);assert.equal(k.remaining,1600);
 assert.equal(weeklyKpi(ann.id,rows,"2026-11-02").quantity,0);assert.equal(weeklyKpi(ann.id,rows,"2026-11-02").target,5400); // Working Saturday 07/11, 6 × 900.
 const sheets=reportSheets("daily",rows.filter(r=>r.kind==="daily"),rows,await hub.members(),{}, {kpiMembers:[ann],kpiPeriod:"weekly",asOf:"2026-10-29"});
 assert.ok(!sheets.some(s=>s.name==="KPI luy ke"));const row=sheets.find(s=>s.name==="KPI tuan")!.rows[1];assert.equal((row[6] as any).value,1700);assert.equal((row[7] as any).value,3300);assert.equal(sheets.find(s=>s.name==="Lich KPI")!.rows.length,8);
});

test("KPI summaries expose weekly totals to members and reserve cumulative totals for Lead",async()=>{
 const {hub,lead,ann,qa}=await fixture();
 for(const actor of [ann,qa]){
  const result=await hub.kpiSummary(actor);assert.equal(result.period,"weekly");assert.deepEqual(result.rows.map(r=>r.memberId),[actor.id]);
  await assert.rejects(()=>hub.kpiSummary(actor,"cumulative"),/Chỉ Lead/);await assert.rejects(()=>hub.kpiSummary(actor,"weekly","team"),/bản thân/);
  const state=await hub.state({userId:actor.auth_id!,email:actor.email});assert.equal(state.kpiSummary!.period,"weekly");
 }
 assert.equal((await hub.kpiSummary(lead)).period,"cumulative");assert.equal((await hub.kpiSummary(lead)).start,"2026-10-20");assert.equal((await hub.kpiSummary(lead,"weekly",ann.id)).rows.length,1);
});

test("weekly report rolls Daily Reports into personal daily KPI, unique QC Jobs, rework dates, half-day leave and first-pass ID quality",async()=>{
 const {hub,lead,ann,qa,other}=await fixture();await hub.mutate(lead,"kpi-rate",{memberId:qa.id,date:"2026-10-22",quantity:600});
 await hub.mutate(lead,"attendance-mark",{memberId:qa.id,date:"2026-10-21",status:"leave",lateMinutes:0,conduct:"Đúng quy định"});await hub.mutate(lead,"attendance-mark",{memberId:qa.id,date:"2026-10-22",status:"half",lateMinutes:0,conduct:"Đúng quy định"});
 const task=(await hub.rows("task")).find(t=>t.data.assigneeId===ann.id)!,review=(id:string,day:string,checks:any[],errors:any[])=>hub.insert("review",id,{mode:"daily",fixerId:ann.id,checkedAt:day+"T03:00:00Z",idChecks:checks,errors,verdict:errors.length?"changes":"passed",first:false},{owner_id:qa.id,task_id:task.id,project_id:task.project_id,date:day,status:errors.length?"changes":"passed"});
 await hub.db.batch([review("weekly-qc-1","2026-10-20",[{objectId:"1",result:"changes"},{objectId:"2",result:"passed"}],[{objectId:"1",description:"Error"}]),review("weekly-qc-2","2026-10-21",[{objectId:"1",result:"passed"},{objectId:"2",result:"passed"},{objectId:"3",result:"passed"}],[]),hub.insert("manual-rework","weekly-manual",{},{owner_id:ann.id,date:"2026-10-22",status:"active"}),hub.insert("qc-session","weekly-assigned-only",{reviewerId:qa.id},{task_id:"unstarted-job",status:"assigned",date:"2026-10-22"}),hub.insert("daily","weekly-draft",{lines:[{taskId:task.id,activity:"annotation",quantity:99999}]},{owner_id:ann.id,date:"2026-10-22",status:"draft"})]);
 const data=buildWeeklySummary(await hub.members(),await hub.rows(),"2026-10-24","2026-10-24"),a=data.rows.find(r=>r.memberId===ann.id)!,q=data.rows.find(r=>r.memberId===qa.id)!;
 assert.equal(data.start,"2026-10-19");assert.equal(data.end,"2026-10-25");assert.equal(a.quantity,2040);assert.equal(a.target,6000);assert.equal(q.target,4200);assert.equal(q.daily.find(d=>d.date==="2026-10-21")!.target,1200);assert.equal(q.daily.find(d=>d.date==="2026-10-22")!.target,600);assert.equal(a.daily.find(d=>d.date==="2026-10-25")!.result,"Chưa đến ngày");
 assert.equal(q.qcJobs,1);assert.equal(q.qcRounds,2);assert.equal(q.offEquivalent,1.5);assert.equal(a.reworkCount,2);assert.equal(a.qualityIdChecked,3);assert.equal(a.qualityIdPassed,2);assert.equal(a.quality,2/3);assert.equal(q.quality,null);assert.equal(a.daysMet,1);assert.equal(a.missingReports,3);
 const sheets=weeklySummarySheets(data);assert.equal(sheets.length,5);assert.ok(sheets[0].rows[0].includes("Nghỉ quy đổi (ngày)"));assert.ok(sheets.every(s=>s.rows.every(row=>row.length===s.rows[0].length)));
 await assert.rejects(()=>hub.weeklySummary(qa,"team","2026-10-19"),/Chỉ Lead/);await assert.rejects(()=>hub.weeklySummary(qa,other.id,"2026-10-19"),/Chỉ Lead/);const mine=await hub.weeklySummary(qa,qa.id,"2026-10-19");assert.equal(mine.rows.length,1);assert.equal(mine.rows[0].memberId,qa.id);
});

test("keyframe KPI counts only newly completed IDs, includes outside, freezes reports and preserves legacy quantities",async()=>{
 const {hub,lead,ann,other}=await fixture(),template=(await hub.rows("task"))[0],taskId="keyframe-unit-job";
 await hub.db.batch([hub.insert("task",taskId,{...template.data,assigneeId:ann.id,jobId:"7654321",quantity:null},{project_id:template.project_id})]);
 const production={version:1,format:"cvat-backup-json",offset:1,completeOutside:true,usable:true,mapping:"ordinal",issues:[],duplicates:0,frames:3,totals:{keyframes:12,visible:6,outside:6,interpolated:0,unknown:0},ids:Array.from({length:6},(_,i)=>({id:i+1,label:"vehicle",visible:1,outside:1,keyframes:2,interpolated:0,unknown:0,firstFrame:0,lastFrame:1}))};
 await hub.db.batch([hub.insert("kpi-source","unit-count-source",{capturedDate:"2026-10-22",fileHash:"old-hash",runId:"unit-run",production},{owner_id:ann.id,task_id:taskId,project_id:template.project_id,status:"active"})]);
 await hub.mutate(lead,"daily",{memberId:ann.id,date:"2026-10-21",submit:true,lines:[{taskId,endId:"2",minutes:120,quantity:300,rework:0}]});
 const body={memberId:ann.id,date:"2026-10-22",submit:true,lines:[{taskId,endId:"4",productionMethod:"keyframe-v1",countSourceId:"unit-count-source",minutes:120,quantity:99999,rework:1000}]};
 const result=await hub.mutate(ann,"daily",body),saved=await hub.get(result.id!);let line=saved.data.lines[0];
 assert.equal(line.quantity,4);assert.equal(line.idCount,2);assert.equal(line.productionFactor,undefined);assert.equal(line.keyframeSnapshot.start,3);assert.equal(line.keyframeSnapshot.end,4);assert.equal(line.keyframeSnapshot.outside,2);assert.equal(line.keyframeSnapshot.fileHash,"old-hash");
 const prior=(await hub.rows("daily")).find(r=>r.date==="2026-10-21"&&r.owner_id===ann.id)!;assert.equal(prior.data.lines[0].quantity,300);
 const source=await hub.get("unit-count-source");await hub.db.batch([hub.replace(source,{...source.data,fileHash:"new-hash",production:{...production,ids:production.ids.map(r=>({...r,keyframes:9,visible:8}))}})]);
 await hub.mutate(ann,"daily",{...body,id:saved.id,revision:saved.revision,lines:[{...body.lines[0],quantity:12345,issue:"Only change note"}]});
 line=(await hub.get(saved.id)).data.lines[0];assert.equal(line.quantity,4);assert.equal(line.keyframeSnapshot.fileHash,"old-hash");
 await assert.rejects(()=>hub.mutate(ann,"daily",{...body,id:saved.id,lines:[{...body.lines[0],endId:"1"}]}),/thấp hơn/);
 await assert.rejects(()=>hub.mutate(ann,"daily",{...body,id:saved.id,lines:[{...body.lines[0],endId:"5",countRunId:"old-file-version"}]}),/Bảng đếm đã được cập nhật/);
 await assert.rejects(()=>hub.mutate(other,"daily",{...body,memberId:other.id}),/nhân sự báo cáo/);
 await assert.rejects(()=>hub.mutate(lead,"daily",{...body,date:"2026-10-21",lines:[{...body.lines[0],endId:"2"}]}),/KPI cũ/);
 const current=await hub.get("unit-count-source");await hub.db.batch([hub.replace(current,{...current.data,capturedDate:"2026-10-23",production})]);
 const tomorrow=new Hub(hub.db,hub.leadEmail,new Date("2026-10-23T01:00:00Z"));await tomorrow.mutate(ann,"daily",{...body,date:"2026-10-23",lines:[{...body.lines[0],endId:"6"}]});
 const next=(await hub.rows("daily")).find(r=>r.owner_id===ann.id&&r.date==="2026-10-23")!;assert.equal(next.data.lines[0].quantity,4);assert.equal(next.data.lines[0].keyframeSnapshot.start,5);
 await assert.rejects(()=>hub.mutate(lead,"daily",{memberId:ann.id,date:"2026-10-21",submit:true,lines:[{taskId,endId:"3",minutes:120,quantity:300,rework:0}]}),/chồng lên/);
 await assert.rejects(()=>hub.mutate(lead,"daily",{...body,id:saved.id,lines:[{...body.lines[0],endId:"6"}]}),/chồng lên/);
 const checks=keyframeComparisons(await hub.rows(),ann.id,taskId,production);assert.equal(checks[0].start,5);assert.equal(checks.find(r=>r.date==="2026-10-21")!.savedQuantity,300);
});

test("keyframe source must be complete, fresh and cover the final ID; zero new IDs means zero cuboids",()=>{
 const production:any={usable:true,ids:[{id:1,keyframes:2,visible:1,outside:1,unknown:0}],offset:1};
 let range=keyframeRange([],"a","job","2026-10-24","0");assert.equal(keyframeQuantity(production,range).quantity,0);assert.equal(keyframeQuantity(production,range).error,"");
 range=keyframeRange([],"a","job","2026-10-24","2");assert.match(keyframeQuantity(production,range).error,/chỉ có/);
 assert.match(keyframeQuantity({...production,usable:false},keyframeRange([],"a","job","2026-10-24","1")).error,/chưa đủ/);
 const draft:any={id:"draft",kind:"daily",date:"2026-10-23",owner_id:"a",status:"draft",data:{lines:[{taskId:"job",endId:"100"}]}};
 assert.equal(keyframeRange([draft],"a","job","2026-10-24","1").start,1);
 assert.equal(keyframeRange([],"a","job","2026-10-24","0",undefined,0).start,0);
 const unknown:any={...draft,id:"old-unknown",status:"imported",data:{lines:[{taskId:"job",quantity:900}]}};
 assert.match(keyframeQuantity(production,keyframeRange([unknown],"a","job","2026-10-24","1")).error,/thiếu mốc ID/);
});

test("progress can be submitted while waiting for keyframe file, then settled without rewriting historical reports",async()=>{
 const {hub,lead,ann}=await fixture(),template=(await hub.rows("task"))[0],taskId="pending-keyframe-job";
 await hub.db.batch([hub.insert("task",taskId,{...template.data,assigneeId:ann.id,quantity:null},{project_id:template.project_id})]);
 const body={date:"2026-10-22",submit:true,lines:[{taskId,endId:"1",productionMethod:"keyframe-v1",minutes:120,quantity:9999,rework:0}]};
 const saved=await hub.mutate(ann,"daily",body),pending=await hub.get(saved.id!);assert.equal(pending.data.lines[0].quantity,0);assert.equal(pending.data.lines[0].productionPending,true);assert.equal(dailyKpi(pending,await hub.rows()).result,"Chờ bảng đếm");
 const evaluation=buildTeamEvaluation(await hub.members(),await hub.rows(),"2026-10-22","2026-10-22").find(r=>r.memberId===ann.id)!;assert.equal(evaluation.kpiResult,"Chờ bảng đếm");assert.equal(evaluation.ratio,null);assert.equal(evaluationTotals([evaluation]).ratio,null);
 const production={version:1,format:"cvat-backup-json",offset:1,usable:true,completeOutside:true,ids:[{id:1,visible:1,outside:1,keyframes:2,unknown:0}]};
 await hub.db.batch([hub.insert("kpi-source","pending-count-source",{capturedDate:"2026-10-22",fileHash:"verified",runId:"r",production},{owner_id:ann.id,task_id:taskId,status:"active"})]);
 const later=new Hub(hub.db,hub.leadEmail,new Date("2026-10-22T10:00:00Z"));
 await assert.rejects(()=>later.mutate(ann,"daily",{...body,id:pending.id,lines:[{...body.lines[0],countSourceId:"pending-count-source"}]}),/17:00/);
 await later.mutate(lead,"daily",{...body,memberId:ann.id,id:pending.id,lines:[{...body.lines[0],countSourceId:"pending-count-source"}]});
 const settled=await hub.get(pending.id);assert.equal(settled.data.lines[0].quantity,2);assert.equal(settled.data.lines[0].productionPending,undefined);assert.equal(settled.data.lines[0].keyframeSnapshot.outside,1);
});

class SqliteD1 {
  sql = new DatabaseSync(":memory:");
  constructor() { this.sql.exec(readFileSync(new URL("../drizzle/0000_sweet_white_queen.sql", import.meta.url), "utf8")); }
  prepare(sql: string) {
    const db = this.sql;
    let args: any[] = [];
    return { bind(...a: any[]) { args = a; return this; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async first() { return db.prepare(sql).get(...args) || null; }, async run() { const result = db.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; } };
  }
  async batch(stmts: any[]) { this.sql.exec("BEGIN IMMEDIATE"); try { const results = []; for (const s of stmts) results.push(await s.run()); this.sql.exec("COMMIT"); return results; } catch(e) { this.sql.exec("ROLLBACK"); throw e; } }
}
async function fixture() {
  const db = new SqliteD1(); const hub = new Hub(db, "26ai.khoint2@vinuni.edu.vn", new Date("2026-10-22T01:25:00Z"));
  const identity = { userId: "lead-user", email: "26ai.khoint2@vinuni.edu.vn" };
  await hub.setup(identity); const lead = await hub.current(identity);
  const invite = async (n: number, role: string) => { const member = (await hub.members()).find(m=>m.id==="member-"+n)!; await hub.mutate(lead,"member",{...member,role,state:"invited"}); const i={userId:"user-"+n,email:member.email}; await hub.activate(i); return hub.current(i); };
  const ann = await invite(1,"Annotator"), qa = await invite(2,"QA/QC"), other = await invite(3,"Annotator");
  return {db,hub,lead,ann,qa,other,identity};
}
test("Vietnam date boundaries and Monday reporting week", () => { assert.equal(today(new Date("2026-10-21T18:00:00Z")),"2026-10-22"); assert.equal(localTime(new Date("2026-10-22T01:30:00Z")),"08:30"); assert.equal(weekStart("2026-10-25"),"2026-10-19"); });

test("daily report view includes only my reports and sorts by report date rather than import time",async()=>{
 const {hub,qa}=await fixture(),records=await hub.rows(),original=records.map(r=>r.id),own=records.find(r=>r.kind==="daily"&&r.owner_id===qa.id)!;
 records.push({...own,id:"later-production",date:"2026-10-22",created_at:"2026-10-01T00:00:00Z"});
 const rows=dailyReportRows(records,qa.id);assert.ok(rows.every(r=>r.owner_id===qa.id));assert.deepEqual(rows.map(r=>r.date),["2026-10-22","2026-10-21","2026-10-20"]);assert.equal(dailyReportRows(records,"member-0").length,0);assert.equal(dailyReportRows(records,"member-0",true).length,19);assert.deepEqual(records.slice(0,-1).map(r=>r.id),original);
});

test("attendance pulse scopes QA to their own attendance instead of visible task collaborators",async()=>{
 const {hub,lead,ann,qa,other}=await fixture(),members=[lead,ann,qa,other],visible=await hub.visible(qa);
 const personal=attendanceSummary(members,visible,"2026-10-22",qa);assert.equal(personal.total,1);assert.equal(personal.present,1);assert.equal(personal.unmarked,0);
 await hub.mutate(lead,"attendance-mark",{memberId:other.id,date:"2026-10-22",status:"half",conduct:"Đúng quy định",lateMinutes:0});
 const team=attendanceSummary(members,await hub.rows(),"2026-10-22",lead);assert.equal(team.total,4);assert.equal(team.present,2);assert.equal(team.half,1);assert.equal(team.unmarked,1);
 assert.equal(attendanceSummary(members.filter(m=>m.id!==qa.id),visible,"2026-10-22",qa).total,0);
});

test("assigned QC jobs show QC for the reviewer and Annotation for the annotator",async()=>{
 const {hub,lead,ann,qa}=await fixture(),tasks=await hub.rows("task"),mine=tasks.find(t=>t.data.assigneeId===qa.id)!,other={...tasks.find(t=>t.data.assigneeId===ann.id)!,data:{...tasks.find(t=>t.data.assigneeId===ann.id)!.data,reviewerId:qa.id}};
 assert.equal(taskActivity(mine,qa,[]),"Annotation");assert.equal(taskActivity(other,qa,[]),"QC");assert.match(taskActivityTitle(other,qa,[]),/^QC · /);assert.equal(taskActivity(other,ann,[]),"Annotation");assert.equal(taskActivity(other,lead,[]),"Annotation");
 const session={...other,id:"assigned-qc",kind:"qc-session",task_id:other.id,data:{reviewerId:lead.id}};assert.equal(taskActivity(other,lead,[session]),"QC");
});
test("seed imports reconcile and never invent hours, QC, dates or task quotas", async()=>{const {hub}=await fixture();const data=await hub.rows();assert.equal(data.filter(r=>r.kind==="daily").length,18);assert.equal(data.filter(r=>r.kind==="task").length,9);assert.equal(data.filter(r=>r.kind==="attendance").length,27);for(const d of ["2026-10-20","2026-10-21"]){const reports=data.filter(r=>r.kind==="daily"&&r.date===d);assert.equal(reports.flatMap(r=>r.data.lines).reduce((n,l)=>n+l.quantity,0),d.endsWith("20")?5520:11280);}assert.ok(data.filter(r=>r.kind==="attendance").every(r=>r.date!<"2026-11-01"&&!r.data.checkIn));assert.ok(data.filter(r=>r.kind==="daily").every(r=>r.data.lines[0].minutes===null));assert.ok(data.filter(r=>r.kind==="task").every(r=>r.data.quantity===null&&r.data.deadline===null));assert.equal(data.filter(r=>r.kind==="review").length,0);});
test("authorization: identity binding, invitations, disabled accounts and all three roles",async()=>{const {hub,lead,ann,qa,other}=await fixture();await assert.rejects(()=>hub.setup({userId:"bad",email:"bad@example.com"}),/Chỉ email Lead/);await assert.rejects(()=>hub.activate({userId:"bad",email:other.email}),/Lời mời/);for(const actor of [ann,qa]){await assert.rejects(()=>hub.mutate(actor,"member",{name:"X",email:"x@example.com",role:"Lead",state:"invited"}),/Chỉ Lead/);await assert.rejects(()=>hub.mutate(actor,"settings",{}),/Chỉ Lead/);await assert.rejects(()=>hub.aggregate(actor,other.id,"2026-10-19"),/Không có quyền/);}const visible=await hub.visible(ann);assert.ok(visible.filter(r=>r.kind==="daily").every(r=>r.owner_id===ann.id));assert.equal(visible.filter(r=>r.kind==="import"||r.kind==="legacy").length,0);await hub.mutate(lead,"member",{...ann,state:"disabled"});await assert.rejects(()=>hub.current({userId:ann.auth_id!,email:ann.email}),/vô hiệu hóa/);await assert.rejects(()=>hub.mutate(lead,"member",{...lead,role:"Annotator"}),/Cần giữ tài khoản Lead/);});
test("full workflow: assignment, annotation, daily, QC return, resubmit, completion, weekly",async()=>{
 const {hub,lead,ann,qa,other}=await fixture();
 const p=await hub.mutate(lead,"project",{name:"Dự án kiểm thử",unit:"frame",target:null});
 const result=await hub.mutate(lead,"task",{code:"TEST-001",title:"Batch kiểm thử",projectId:p.id,assigneeId:ann.id,reviewerId:qa.id,assignedDate:"2026-10-22",deadline:"2026-10-23",priority:"normal",quantity:10});const taskId=result.id!;
 await assert.rejects(()=>hub.mutate(other,"progress",{id:taskId,status:"doing",completed:1}),/người khác/);
 await hub.mutate(ann,"progress",{id:taskId,status:"doing",completed:10});
 const report={date:"2026-10-22",lines:[{taskId,endId:"10",minutes:120,quantity:10,rework:0,work:"Làm 10 frame",activity:"annotation"}],submit:true};
 const d=await hub.mutate(ann,"daily",report);await hub.mutate(ann,"daily",report);assert.equal((await hub.get(d.id!)).status,"submitted");
 await hub.mutate(ann,"progress",{id:taskId,status:"qa",completed:10});
 const review={taskId,checked:10,passed:8,failed:2,scope:"full",verdict:"changes",errors:[{type:"Sai vị trí",severity:"major",description:"Sửa vị trí"}]};
 await assert.rejects(()=>hub.mutate(ann,"review",review),/Chỉ QA/);await assert.rejects(()=>hub.mutate(other,"review",review),/Chỉ QA/);
 const feedback=await hub.mutate(qa,"review",review);await assert.rejects(()=>hub.mutate(other,"review-fix",{id:feedback.id,errorIndex:0,fixed:true}),/Chỉ annotator/);await assert.rejects(()=>hub.mutate(ann,"progress",{id:taskId,status:"recheck",completed:10}),/đánh dấu đã sửa/);await hub.mutate(ann,"review-fix",{id:feedback.id,errorIndex:0,fixed:true});assert.equal((await hub.get(feedback.id!)).status,"changes");await hub.mutate(ann,"progress",{id:taskId,status:"recheck",completed:10});await assert.rejects(()=>hub.mutate(ann,"review-fix",{id:feedback.id,errorIndex:0,fixed:false}),/không ở trạng thái sửa/);await hub.mutate(qa,"review",{...review,passed:10,failed:0,verdict:"passed",errors:[]});
 assert.equal((await hub.get(taskId)).status,"done");await assert.rejects(()=>hub.mutate(ann,"progress",{id:taskId,status:"doing",completed:10}),/đã được khóa/);
 await hub.mutate(lead,"report-decision",{id:d.id,decision:"approve"});await hub.mutate(ann,"daily",report);assert.equal((await hub.get(d.id!)).status,"submitted");
 await hub.mutate(lead,"report-decision",{id:d.id,decision:"reopen",reason:"Bổ sung mô tả"});await hub.mutate(ann,"daily",report);
 const agg=await hub.aggregate(lead,ann.id,"2026-10-22");assert.equal(agg.products.find((x:any)=>x.projectId===p.id).quantity,10);assert.equal(agg.firstPass[p.id!].passed,8);assert.equal(agg.firstPass[p.id!].checked,10);assert.equal(agg.minutes,120);assert.equal(agg.products.length,2); // frame and imported cuboid remain separate
 const w=await hub.mutate(ann,"weekly",{date:"2026-10-22",highlights:"Hoàn thành",submit:true});assert.equal((await hub.get(w.id!)).data.snapshot.products.find((x:any)=>x.projectId===p.id).quantity,10);
 const qaRows=await hub.visible(qa);const scoped=qaRows.find(r=>r.id===d.id);assert.equal(scoped?.data.scoped,true);assert.equal(scoped?.data.blockers,undefined);assert.equal(scoped?.data.lines.length,1);
});
test("QA/QC can annotate and report QC separately, without production duplication",async()=>{const {hub,lead,ann,qa}=await fixture();const p=await hub.mutate(lead,"project",{name:"Dual role",unit:"scene"});const create=async(code:string,owner:string)=>hub.mutate(lead,"task",{code,title:code,projectId:p.id,assigneeId:owner,reviewerId:qa.id,assignedDate:"2026-10-22",deadline:"2026-10-23",priority:"normal",quantity:5});const a=await create("QA-ANN",qa.id),q=await create("QC-OTHER",ann.id);await hub.mutate(qa,"progress",{id:a.id,completed:2,status:"doing"});await hub.mutate(qa,"daily",{date:"2026-10-22",submit:true,lines:[{taskId:a.id,endId:"2",activity:"annotation",minutes:240,quantity:2,rework:0,work:"Annotation"},{taskId:q.id,activity:"qc",minutes:240,quantity:0,rework:0,work:"Kiểm tra"}]});const agg=await hub.aggregate(qa,qa.id,"2026-10-22");assert.equal(agg.minutes,480);assert.equal(agg.products.find((x:any)=>x.projectId===p.id).quantity,2);});
test("only Khoi can mark attendance, late minutes and conduct; adjustments stay audited",async()=>{
 const {hub,lead,ann,qa,other}=await fixture();
 for(const m of [ann,qa,other]) { await assert.rejects(()=>hub.mutate(m,"checkin",{}),/không tự check/); await assert.rejects(()=>hub.mutate(m,"checkout",{}),/không tự check/); await assert.rejects(()=>hub.mutate(m,"attendance-mark",{}),/Chỉ Nguyễn Tuấn Khôi/); }
 const mark={memberId:ann.id,date:"2026-10-22",status:"late",lateMinutes:13,conduct:"Đúng quy định",note:"Đã xác minh"};
 await hub.mutate(lead,"attendance-mark",mark);await hub.mutate(lead,"attendance-mark",{...mark,lateMinutes:15});
 const rows=(await hub.rows("attendance")).filter(r=>r.owner_id===ann.id&&r.date==="2026-10-22");assert.equal(rows.length,1);assert.equal(rows[0].data.lateMinutes,15);assert.equal(rows[0].data.markedBy,lead.id);assert.equal(rows[0].data.conduct,"Đúng quy định");
 await assert.rejects(()=>hub.mutate(lead,"attendance-mark",{...mark,checkOut:"2026-10-22T01:00:00Z"}),/trước check-in/);
 const legacy={type:"correction",date:"2026-10-22",endDate:"2026-10-22",reason:"Bổ sung giờ công",checkIn:"2026-10-22T00:30:00Z",checkOut:"2026-10-22T01:20:00Z"};
 for(const actor of [ann,qa,other])for(const type of ["correction","leave"])await assert.rejects(()=>hub.mutate(actor,"request",{...legacy,type}),/Chỉ Nguyễn Tuấn Khôi/);
 const req={id:"legacy-correction-request"};await hub.db.batch([hub.insert("request",req.id,legacy,{owner_id:ann.id,date:legacy.date,status:"submitted"})]);await assert.rejects(()=>hub.mutate(qa,"request-decision",{id:req.id,approved:true,reason:"Đúng"}),/Chỉ Nguyễn Tuấn Khôi/);await hub.mutate(lead,"request-decision",{id:req.id,approved:true,reason:"Đã xác minh"});assert.ok((await hub.rows("attendance")).find(r=>r.owner_id===ann.id&&r.date==="2026-10-22")?.data.adjustedBy);
});
test("optimistic concurrency rolls back stale writes and their audit",async()=>{const {hub,lead,db}=await fixture();const before=await hub.get("settings");await hub.commit(lead,"Change",before,"settings",{...before.data,lateGrace:5});const count=db.sql.prepare("SELECT COUNT(*) as n FROM audit").get()!.n;await assert.rejects(()=>hub.commit(lead,"Stale",before,"settings",before.data),/NOT NULL/);assert.equal(db.sql.prepare("SELECT COUNT(*) as n FROM audit").get()!.n,count);assert.equal((await hub.get("settings")).data.lateGrace,5);});
test("exports quote CSV injection safely and generate an OOXML zip",()=>{assert.match(csv([["=SUM(A1)","a,b"]]),/"'=SUM\(A1\)"/);const out=xlsx([["Họ tên","Sản lượng"],["Khôi",12]]);assert.equal(new DataView(out.buffer).getUint32(0,true),0x04034b50);});
test("daily defaults preserve existing exceptions, run across Vietnam midnight and skip inactive accounts",async()=>{
 const {db,hub,lead,ann,qa,other}=await fixture(),history=(await hub.rows("attendance")).filter(r=>r.date!<"2026-10-22");
 await hub.mutate(lead,"attendance-mark",{memberId:ann.id,date:"2026-10-22",status:"half",lateMinutes:0,conduct:"Chưa đúng quy định",note:"Nghỉ chiều"});
 await hub.mutate(lead,"member",{...other,state:"disabled"});await hub.ensureAttendanceDefaults();
 const exception=(await hub.rows("attendance")).find(r=>r.owner_id===ann.id&&r.date==="2026-10-22")!;assert.equal(exception.status,"half");assert.equal(exception.data.conduct,"Chưa đúng quy định");
 assert.deepEqual((await hub.rows("attendance")).filter(r=>r.date!<"2026-10-22"),history);
 const next=new Hub(db,hub.leadEmail,new Date("2026-10-22T17:05:00Z"));await next.ensureAttendanceDefaults();
 const rows=(await next.rows("attendance")).filter(r=>r.date==="2026-10-23");assert.equal(rows.length,3);assert.ok(rows.every(r=>r.status==="present"&&r.data.conduct==="Đúng quy định"&&!r.data.checkIn&&!r.data.checkOut));assert.ok(!rows.some(r=>r.owner_id===other.id));
 const count=(await next.rows("attendance")).length,audits=db.sql.prepare("SELECT COUNT(*) n FROM audit").get()!.n;await next.ensureAttendanceDefaults();assert.equal((await next.rows("attendance")).length,count);assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM audit").get()!.n,audits);
 await next.mutate(lead,"attendance-mark",{memberId:qa.id,date:"2026-10-23",status:"absent",lateMinutes:0,conduct:"Chưa đánh giá",note:"Đã xác minh"});await next.ensureAttendanceDefaults();assert.equal((await next.rows("attendance")).find(r=>r.owner_id===qa.id&&r.date==="2026-10-23")!.status,"absent");
 const monday=new Hub(db,hub.leadEmail,new Date("2026-10-26T01:00:00Z"));await monday.ensureAttendanceDefaults();for(const d of ["2026-10-24","2026-10-26"])assert.equal((await monday.rows("attendance")).filter(r=>r.date===d).length,3);assert.equal((await monday.rows("attendance")).filter(r=>r.date==="2026-10-25").length,0);
});
test("daily cuboid KPI uses all annotation lines, excludes QC and rework, and has a 1200 boundary",async()=>{
 const {hub,ann}=await fixture(),all=await hub.rows(),t=all.find(r=>r.kind==="task"&&r.data.assigneeId===ann.id)!;
 const line={taskId:t.id,activity:"annotation",quantity:1199,rework:500};assert.equal(dailyKpi({data:{lines:[line]}},all).result,"Chưa đạt");
 assert.equal(dailyKpi({data:{lines:[{...line,quantity:1200}]}},all).result,"Đạt");assert.equal(dailyKpi({data:{lines:[{...line,quantity:1300}]}},all).remaining,0);
 assert.equal(dailyKpi({data:{lines:[{...line,quantity:600},{...line,quantity:600},{...line,activity:"qc",quantity:9000}]}},all).quantity,1200);
 assert.equal(dailyKpi({data:{lines:[line],scoped:true}},all).applicable,false);
});
test("daily IDs are validated and Task/Job context comes from the assigned task",async()=>{
 const {hub,lead,ann}=await fixture(),p=await hub.mutate(lead,"project",{name:"ID report",unit:"cuboid"});
 const t=await hub.mutate(lead,"task",{code:"1264",jobId:"1261",title:"ID report",projectId:p.id,assigneeId:ann.id,reviewerId:lead.id,assignedDate:"2026-10-22",deadline:"2026-10-23",quantity:3000,priority:"normal"});
 const line={taskId:t.id,taskCode:"fake",jobId:"fake",minutes:120,quantity:1200,rework:0,work:"Daily ID report"};
 await assert.rejects(()=>hub.mutate(ann,"daily",{date:"2026-10-22",lines:[line],submit:true}),/ID đã làm tới/);
 const d=await hub.mutate(ann,"daily",{date:"2026-10-22",lines:[{...line,endId:"0200"}],submit:true});const row=await hub.get(d.id!);assert.equal(row.data.lines[0].endId,"0200");assert.equal(row.data.lines[0].taskCode,"1264");assert.equal(row.data.lines[0].jobId,"1261");assert.equal((await hub.get(t.id!)).data.latestEndId,"0200");
});
test("simplified daily reports submit without removed fields and morning exports describe work from IDs and production",async()=>{
 const {hub,ann}=await fixture(),task=(await hub.rows("task")).find(r=>r.data.assigneeId===ann.id)!;
 const result=await hub.mutate(ann,"daily",{date:"2026-10-22",submit:true,nextPlan:"Làm tiếp Job được giao",lines:[{taskId:task.id,endId:"44",quantity:600,rework:0,minutes:120,issue:"Cần hướng dẫn xử lý nhóm người"}]});
 const row=await hub.get(result.id!);assert.equal(row.data.lines[0].work,"");assert.equal(row.data.lines[0].evidence,"");assert.equal(row.data.completed,"");assert.equal(row.data.blockers,"");assert.equal(row.data.support,"");
 const all=await hub.rows(),sheets=reportSheets("morning",[row],all,await hub.members(),{},{kpiMembers:[ann],morningDate:"2026-10-23",productionDate:"2026-10-22"}),summary=sheets[0].rows[1];
 assert.match(summary[4] as string,/Tới ID 44/);assert.match(summary[4] as string,/600 cuboid trong ngày/);assert.equal(summary[11],"Làm tiếp Job được giao");assert.equal(summary[12],"Cần hướng dẫn xử lý nhóm người");assert.equal(summary[13],"");
});
test("all six report exports have named columns and daily summaries retain numeric KPI formulas",async()=>{
 const {hub}=await fixture(),all=await hub.rows(),members=await hub.members();
 for(const kind of ["task","daily","weekly","attendance","review","target"])for(const sheet of reportSheets(kind,all.filter(r=>r.kind===kind),all,members)) {assert.ok(sheet.rows[0].length>5);assert.ok(!sheet.rows.flat().some(v=>typeof v==="string"&&(v.includes("Dữ liệu JSON")||v.startsWith('{"'))));assert.ok(xlsx([sheet]).length>1000);}
 const daily=reportSheets("daily",all.filter(r=>r.kind==="daily"),all,members);assert.equal(daily.length,4);assert.equal((daily[0].rows[1][7] as any).format,"percent");assert.equal((daily[0].rows[1][7] as any).formula,"E2/F2");assert.ok(daily[1].rows[0].includes("ID đã làm tới"));
});
test("KPI calendar alternates Saturdays and applies auditable whole-team or personal exclusions",async()=>{
 const {hub,lead,ann,qa}=await fixture();let all=await hub.rows();
 for(const [day,target] of [["2026-10-24",1200],["2026-10-25",0],["2026-10-31",0],["2026-11-07",1200]] as const)assert.equal(kpiDayTarget(day,ann.id,all),target);
 assert.equal(cumulativeKpi(ann.id,all,"2026-10-24").target,6000);assert.equal(cumulativeKpi(ann.id,all,"2026-10-25").target,6000);assert.equal(cumulativeKpi(ann.id,all,"2026-10-31").target,12000);assert.equal(cumulativeKpi(ann.id,all,"2026-11-07").target,19200);
 await assert.rejects(()=>hub.mutate(ann,"kpi-exclusion",{date:"2026-10-22",enabled:true}),/Chỉ Nguyễn Tuấn Khôi/);
 await hub.mutate(lead,"kpi-exclusion",{date:"2026-10-22",memberId:null,reason:"Đào tạo cả team"});await hub.mutate(lead,"kpi-exclusion",{date:"2026-10-23",memberId:ann.id,reason:"Không tính riêng"});all=await hub.rows();
 assert.equal(cumulativeKpi(ann.id,all,"2026-10-24").target,3600);assert.equal(cumulativeKpi(qa.id,all,"2026-10-24").target,4800);
 assert.equal((await hub.visible(qa)).filter(r=>r.kind==="kpi-exclusion").length,1);assert.equal((await hub.visible(ann)).filter(r=>r.kind==="kpi-exclusion").length,2);
 await hub.mutate(lead,"kpi-exclusion",{date:"2026-10-22",enabled:false});all=await hub.rows();assert.equal(cumulativeKpi(ann.id,all,"2026-10-24").target,4800);assert.equal(cumulativeKpi(qa.id,all,"2026-10-24").target,6000);
});
test("CVAT Task/Job pairs create canonical URLs and allow different jobs in one task",async()=>{
 const {hub,lead,ann}=await fixture();const p=await hub.mutate(lead,"project",{name:"CVAT",unit:"cuboid"});
 const b={code:"9001",jobId:"9002",title:"CVAT job",projectId:p.id,assigneeId:ann.id,reviewerId:lead.id,assignedDate:"2026-10-22",deadline:"2026-10-23",priority:"normal",quantity:100,link:"https://example.com/ignored"};
 const first=await hub.mutate(lead,"task",b);assert.equal((await hub.get(first.id!)).data.link,"https://cvat-test.vantixapps.net/tasks/9001/jobs/9002");
 await hub.mutate(lead,"task",{...b,jobId:"9003"});await assert.rejects(()=>hub.mutate(lead,"task",b),/Cặp Task ID/);
 const team=await hub.aggregate(lead,"team","2026-10-22");assert.equal(team.products.find((p:any)=>p.unit==="cuboid").quantity,16800);assert.equal(team.missingTimeLines,18);
});
test("a Job can be assigned without a Task ID, reported, and completed with a canonical link later",async()=>{
 const {hub,lead,ann}=await fixture();const p=await hub.mutate(lead,"project",{name:"Job without Task ID",unit:"cuboid"});
 const b={code:"",jobId:"1496",title:"Annotation Job 1496",projectId:p.id,assigneeId:ann.id,reviewerId:lead.id,assignedDate:"2026-10-22",deadline:"2026-10-23",priority:"normal",quantity:2000,link:"https://cvat-test.vantixapps.net/tasks/999/jobs/1496"};
 const created=await hub.mutate(lead,"task",b),task=await hub.get(created.id!);assert.equal(task.data.code,"");assert.equal(task.data.jobId,"1496");assert.equal(task.data.link,"");
 await assert.rejects(()=>hub.mutate(lead,"task",b),/Cặp Task ID/);await assert.rejects(()=>hub.mutate(lead,"task",{...b,jobId:""}),/Nhập Task ID/);await assert.rejects(()=>hub.mutate(ann,"task",b),/Chỉ Lead/);
 const daily=await hub.mutate(ann,"daily",{date:"2026-10-22",submit:true,lines:[{taskId:task.id,endId:"44",minutes:120,quantity:600,rework:0}]});
 const report=await hub.get(daily.id!),all=await hub.rows(),sheets=reportSheets("morning",[report],all,await hub.members(),{},{kpiMembers:[ann],morningDate:"2026-10-23",productionDate:"2026-10-22"});assert.equal(report.data.lines[0].taskCode,"");assert.equal(report.data.lines[0].jobId,"1496");assert.equal(sheets[0].rows[1][5],"");assert.equal(sheets[0].rows[1][6],"1496");assert.equal(sheets[0].rows[1][8],600);
 await hub.mutate(lead,"task",{...b,id:task.id,code:"2000"});assert.equal((await hub.get(task.id)).data.link,"https://cvat-test.vantixapps.net/tasks/2000/jobs/1496");
});

test("personal KPI rates preserve effective-date history, including 600 for QA/QC",async()=>{
 const {hub,lead,ann,qa}=await fixture();await assert.rejects(()=>hub.mutate(qa,"kpi-rate",{memberId:qa.id,date:"2026-10-22",quantity:600}),/Chỉ Nguyễn Tuấn Khôi/);
 await hub.mutate(lead,"kpi-rate",{memberId:qa.id,date:"2026-10-22",quantity:600});let all=await hub.rows();assert.equal(dailyRate(qa.id,"2026-10-21",all),1200);assert.equal(kpiDayTarget("2026-10-22",qa.id,all),600);assert.equal(cumulativeKpi(qa.id,all,"2026-10-22").target,3000);assert.equal(cumulativeKpi(ann.id,all,"2026-10-22").target,3600);
 await hub.mutate(lead,"kpi-rate",{memberId:qa.id,date:"2026-10-23",quantity:800});all=await hub.rows();assert.equal(cumulativeKpi(qa.id,all,"2026-10-24").target,4600);assert.equal(kpiDayTarget("2026-10-25",qa.id,all),0);
 const sheets=reportSheets("daily",all.filter(r=>r.kind==="daily"),all,await hub.members(),{}, {kpiMembers:[qa],asOf:"2026-10-24"});const row=sheets.find(s=>s.name==="KPI luy ke")!.rows[1];assert.equal((row[7] as any).value,4600);assert.match((row[7] as any).formula,/SUMIFS/);assert.equal(row[5],800);
 assert.ok(!(await hub.visible(ann)).some(r=>r.kind==="kpi-rate"));assert.equal((await hub.visible(qa)).filter(r=>r.kind==="kpi-rate").length,2);
});
test("morning reports combine yesterday's results, today's plans and issues with missing reports left empty",async()=>{
 const {hub,ann,lead}=await fixture(),all=await hub.rows(),members=await hub.members();const reports=all.filter(r=>r.kind==="daily"&&r.date==="2026-10-21").map(r=>r.owner_id===ann.id?{...r,data:{...r.data,nextPlan:"Làm Task 1241 hôm nay",blockers:"Chờ hướng dẫn",support:"Cần QA hỗ trợ"}}:r);
 const sheets=reportSheets("morning",reports,all,members,{}, {kpiMembers:members,morningDate:"2026-10-22",productionDate:"2026-10-21"});const data=sheets[0].rows;assert.equal(data.length,11);assert.equal(data.slice(1).reduce((n:number,r)=>n+Number(r[8]||0),0),11280);
 const row=data.find(r=>r[2]===ann.name)!;assert.equal(row[11],"Làm Task 1241 hôm nay");assert.equal(row[12],"Chờ hướng dẫn");assert.equal(row[13],"Cần QA hỗ trợ");const missing=data.find(r=>r[2]===lead.name)!;assert.equal(missing[8],null);assert.equal(sheets.length,2);assert.equal(data[0].length,14);assert.ok(sheets.every(s=>!s.rows[0].includes("Trạng thái báo cáo")&&s.rows.every(r=>r.length===s.rows[0].length)));
 assert.equal(previousWorkday("2026-10-26"),"2026-10-24");assert.equal(previousWorkday("2026-11-02"),"2026-10-30");assert.equal(nextWorkday("2026-10-24"),"2026-10-26");
});

test("morning error plans use the annotator's current-day KPI and yesterday's Vietnam QC date",async()=>{
 const {hub,lead,ann,qa,other}=await fixture();
 await hub.mutate(lead,"kpi-rate",{memberId:qa.id,date:"2026-10-22",quantity:900});
 await hub.mutate(lead,"kpi-rate",{memberId:qa.id,date:"2026-10-23",quantity:600});
 const all=await hub.rows(),members=await hub.members(),task=all.find(r=>r.kind==="task"&&r.data.assigneeId===ann.id)!;
 const review=(id:string,fixerId:string,checkedAt:string,errors:any[])=>({...task,id,kind:"review",owner_id:lead.id,task_id:task.id,date:"2026-10-21",status:errors.length?"changes":"passed",data:{fixerId,checkedAt,errors}});
 all.push(review("ann-errors",ann.id,"2026-10-21T18:00:00Z",[{description:"Sai vị trí"},{description:"Sai hướng"}]));
 all.push(review("qa-errors",qa.id,"2026-10-22T03:00:00Z",[{description:"Sai kích thước"}]));
 all.push(review("other-passed",other.id,"2026-10-22T03:00:00Z",[]));
 all.push(review("other-old",other.id,"2026-10-21T03:00:00Z",[{description:"Lỗi cũ"}]));
 all.push(review("other-future",other.id,"2026-10-23T03:00:00Z",[{description:"Lỗi ngày sau"}]));
 const reports=all.filter(r=>r.kind==="daily"&&r.date==="2026-10-21").map(r=>({...r,date:"2026-10-22",data:{...r.data,nextPlan:"Kế hoạch đã nhập"}}));
 const exported=()=>reportSheets("morning",reports,all,members,{}, {kpiMembers:[ann,qa,other,lead],morningDate:"2026-10-23",productionDate:"2026-10-22"})[0].rows;
 const plan=(id:string)=>exported().find(r=>r[2]===members.find(m=>m.id===id)!.name)![11];
 assert.equal(plan(ann.id),"sửa log hôm qua, làm 1200 cuboiz");assert.equal(plan(qa.id),"sửa log hôm qua, làm 600 cuboiz");assert.equal(plan(other.id),"Kế hoạch đã nhập");assert.equal(plan(lead.id),"Chưa cập nhật");
 await hub.mutate(lead,"kpi-exclusion",{memberId:qa.id,date:"2026-10-23",enabled:true});
 all.push(...(await hub.rows()).filter(r=>r.kind==="kpi-exclusion"));assert.equal(plan(qa.id),"sửa log hôm qua, làm 0 cuboiz");
 assert.ok(reports.every(r=>r.data.nextPlan==="Kế hoạch đã nhập"));
});


test("team evaluations authorize Lead, reconcile production, filter totals and apply personal KPI history",async()=>{
 const {hub,lead,ann,qa}=await fixture();
 for(const actor of [ann,qa])await assert.rejects(()=>hub.evaluation(actor,{member:actor.id}),/Chỉ Lead/);
 let result=await hub.evaluation(lead);assert.equal(result.rows.length,10);assert.equal(result.totals.quantity,16800);assert.equal(result.totals.target,32400);assert.equal(result.totals.undatedRework,2);assert.equal(result.totals.reworkCount,0);
 assert.equal(result.rows.find(r=>r.memberId===lead.id)!.kpiResult,"Không áp dụng");assert.ok(result.rows.every(r=>r.firstPassRatio===null));
 await hub.mutate(lead,"kpi-rate",{memberId:qa.id,date:"2026-10-21",quantity:600});await hub.mutate(lead,"kpi-exclusion",{memberId:ann.id,date:"2026-10-22",enabled:true});
 result=await hub.evaluation(lead);assert.equal(result.totals.target,30000);assert.equal(result.rows.find(r=>r.memberId===qa.id)!.target,2400);
 const one=await hub.evaluation(lead,{q:"26ai.minhnt3",from:"2026-10-21",to:"2026-10-21"});assert.equal(one.rows.length,1);assert.equal(one.rows[0].memberId,ann.id);assert.equal(one.totals.quantity,one.rows[0].quantity);assert.equal(one.totals.target,1200);
 assert.equal((await hub.evaluation(lead,{role:"QA/QC",state:"active"})).rows.length,1);assert.equal((await hub.evaluation(lead,{q:"No matching member"})).totals.target,0);
 await assert.rejects(()=>hub.evaluation(lead,{from:"2026-10-23",to:"2026-10-22"}),/khoảng ngày/);await assert.rejects(()=>hub.evaluation(lead,{to:"2026-10-23"}),/khoảng ngày/);await assert.rejects(()=>hub.evaluation(lead,{member:"unknown"}),/Không tìm thấy/);
 const sheets=evaluationSheets(result);assert.equal(sheets.length,4);assert.equal((sheets[0].rows[2][5] as any).formula,"D3/E3");assert.equal((sheets[0].rows[2][5] as any).value,result.rows[1].ratio);assert.ok(sheets.every(s=>s.rows.every(r=>r.length===s.rows[0].length)));assert.match(new TextDecoder().decode(xlsx(sheets)),/Danh gia tong hop/);
});

test("evaluation preserves repeated QC returns after fixes, attributes QA separately and counts completion by Vietnam day",async()=>{
 const {hub,lead,ann,qa}=await fixture();const p=await hub.mutate(lead,"project",{name:"Evaluation cuboid",unit:"cuboid"});const t=await hub.mutate(lead,"task",{code:"9191",jobId:"8181",title:"Job đánh giá",projectId:p.id,assigneeId:ann.id,reviewerId:qa.id,assignedDate:"2026-10-22",deadline:"2026-10-23",priority:"normal",quantity:10});
 await hub.mutate(ann,"progress",{id:t.id,completed:10,status:"doing"});await hub.mutate(ann,"progress",{id:t.id,completed:10,status:"qa"});
 for(let round=0;round<2;round++){
  const r=await hub.mutate(qa,"review",{taskId:t.id,productionDate:"2026-10-21",checked:10,passed:8+round,failed:2-round,scope:"full",verdict:"changes",errors:[{type:"Sai vị trí",severity:"major",description:"Điều chỉnh hộp"}]});
  await hub.mutate(ann,"review-fix",{id:r.id,errorIndex:0,fixed:true});await hub.mutate(ann,"progress",{id:t.id,completed:10,status:"recheck"});
 }
 await hub.mutate(qa,"review",{taskId:t.id,checked:10,passed:10,failed:0,scope:"full",verdict:"passed",errors:[]});
 const result=await hub.evaluation(lead,{from:"2026-10-22",to:"2026-10-22"}),a=result.rows.find(r=>r.memberId===ann.id)!,q=result.rows.find(r=>r.memberId===qa.id)!;
 assert.equal(a.completedTasks,1);assert.equal(a.completedTaskIds,1);assert.equal(a.reworkCount,1);assert.equal(a.returnLogs,2);assert.equal(a.reworkedJobs,1);assert.equal(a.firstPassRatio,0.8);assert.equal(a.sources.returns[0].fixed,1);assert.equal(a.quantity,0);assert.equal(q.reworkCount,0);assert.equal(q.qcPerformed,3);
 const all=await hub.rows(),task=all.find(r=>r.id===t.id)!;task.data.completedAt="2026-10-21T18:00:00Z";assert.equal(buildTeamEvaluation([ann],all,"2026-10-22","2026-10-22")[0].completedTasks,1);assert.equal(buildTeamEvaluation([ann],all,"2026-10-21","2026-10-21")[0].completedTasks,0);delete task.data.completedAt;const unknown=buildTeamEvaluation([ann],all,"2026-10-22","2026-10-22")[0];assert.equal(unknown.completedTasks,0);assert.equal(unknown.missingCompletionDate,1);
});

test("evaluation separates half days, leave, late unknown minutes and defaults; drafts, QC and rework are not new cuboids",async()=>{
 const {hub,ann}=await fixture(),all=await hub.rows(),template=all.find(r=>r.kind==="attendance")!,report=all.find(r=>r.kind==="daily"&&r.owner_id===ann.id)!;
 const records=all.filter(r=>!(["daily","attendance"].includes(r.kind)&&r.owner_id===ann.id));
 for(const [i,status] of ["present","late","late","half","leave","absent"].entries())records.push({...template,id:"att"+i,owner_id:ann.id,date:"2026-10-"+(19+i),status,data:{conduct:i===5?"Chưa đúng quy định":i===4?null:"Đúng quy định",lateMinutes:i===1?15:null,defaulted:i===0,conductDefault:i===0}});
 const line={...report.data.lines[0],quantity:100,rework:50,minutes:60};records.push({...report,id:"new",date:"2026-10-22",status:"submitted",data:{lines:[line,{...line,activity:"qc",quantity:500,rework:500}]}},{...report,id:"draft",date:"2026-10-23",status:"draft",data:{lines:[{...line,quantity:999}]}});
 const r=buildTeamEvaluation([ann],records,"2026-10-19","2026-10-24")[0];assert.equal(r.quantity,100);assert.equal(r.reworkQuantity,50);assert.equal(r.fullDays,3);assert.equal(r.halfDays,1);assert.equal(r.presenceEquivalent,3.5);assert.equal(r.lateDays,2);assert.equal(r.lateMinutes,15);assert.equal(r.missingLateMinutes,1);assert.equal(r.absentDays,1);assert.equal(r.leaveDays,1);assert.equal(r.conductBad,1);assert.equal(r.conductUnknown,1);assert.equal(r.defaultAttendanceDays,1);assert.equal(r.draftCount,1);assert.equal(r.qcMinutes,60);
});

test("daily QC assignment snapshots reported IDs, logs work, and rechecks old errors alongside new IDs the next day",async()=>{
 const {db,hub,lead,ann,qa,other}=await fixture();
 const h21=new Hub(db,lead.email,new Date("2026-10-21T01:00:00Z"));const p=await h21.mutate(lead,"project",{name:"QC mỗi ngày",unit:"cuboid"});
 const t=await h21.mutate(lead,"task",{code:"7771",jobId:"7772",title:"Daily QC job",projectId:p.id,assigneeId:ann.id,reviewerId:lead.id,assignedDate:"2026-10-21",deadline:"2026-10-25",priority:"normal",quantity:100});
 const report21=await h21.mutate(ann,"daily",{date:"2026-10-21",submit:true,lines:[{taskId:t.id,endId:"00020",activity:"annotation",quantity:10,rework:0,minutes:240,work:"ID 1 đến 20"}]});
 const assignment={taskId:t.id,sourceReportId:report21.id,reviewerId:qa.id,date:"2026-10-22",note:"Kiểm bài hôm qua"};
 await assert.rejects(()=>hub.mutate(qa,"qc-assign",assignment),/Chỉ Lead/);
 const s=await hub.mutate(lead,"qc-assign",assignment);assert.equal((await hub.get(s.id!)).status,"assigned");assert.equal((await hub.get(t.id!)).data.reviewerId,qa.id);
 await assert.rejects(()=>hub.mutate(other,"qc-start",{id:s.id}),/người QA/);await assert.rejects(()=>hub.mutate(qa,"qc-result",{id:s.id}),/Cần bắt đầu/);
 await hub.mutate(qa,"qc-start",{id:s.id,rangeStart:"1",endId:"999"});let session=await hub.get(s.id!);assert.equal(session.data.endId,"00020");assert.equal(session.status,"in_progress");assert.ok(session.data.startedAt);const originalRevision=session.revision;await hub.mutate(qa,"qc-start",{id:s.id});assert.equal((await hub.get(s.id!)).revision,originalRevision);
 const error={type:"Sai vị trí",severity:"major",description:"Hộp lệch",objectId:"10",frameId:"7"};
 await assert.rejects(()=>hub.mutate(qa,"qc-result",{id:s.id,errors:[{...error,objectId:"21"}]}),/phạm vi ID/);
 await hub.mutate(qa,"qc-result",{id:s.id,errors:[error,{...error,objectId:"11",description:"Hộp thừa"}]});session=await hub.get(s.id!);const r22=await hub.get(session.data.reviewId);assert.equal(session.status,"completed");assert.equal(session.data.errorCount,2);assert.equal(r22.data.mode,"daily");assert.notEqual((await hub.get(t.id!)).status,"done");assert.equal((await hub.evaluation(lead,{from:"2026-10-22",to:"2026-10-22",member:ann.id})).rows[0].reworkCount,1);
 await assert.rejects(()=>hub.mutate(qa,"qc-result",{id:s.id}),/Cần bắt đầu/);await assert.rejects(()=>hub.mutate(lead,"qc-assign",assignment),/Phiên đã/);
 await assert.rejects(()=>hub.mutate(other,"review-fix",{id:r22.id,errorIndex:0,fixed:true}),/Chỉ annotator/);
 assert.equal((await hub.get(report21.id!)).status,"submitted");
 await hub.mutate(ann,"review-fix",{id:r22.id,errorIndex:0,fixed:true,note:"Đã chỉnh hộp"});assert.equal((await hub.get(report21.id!)).status,"submitted");await hub.mutate(ann,"review-fix",{id:r22.id,errorIndex:1,fixed:true});assert.equal((await hub.get(report21.id!)).status,"approved");
 await hub.mutate(ann,"review-fix",{id:r22.id,errorIndex:0,fixed:false});assert.equal((await hub.get(report21.id!)).status,"submitted");await hub.mutate(ann,"review-fix",{id:r22.id,errorIndex:0,fixed:true});assert.equal((await hub.get(report21.id!)).status,"approved");
 const report22=await hub.mutate(ann,"daily",{date:"2026-10-22",submit:true,lines:[{taskId:t.id,endId:"40",activity:"annotation",quantity:10,rework:2,minutes:240,work:"ID mới và sửa lỗi"}]});
 const h23=new Hub(db,lead.email,new Date("2026-10-23T01:00:00Z")),s23=await h23.mutate(lead,"qc-assign",{...assignment,date:"2026-10-23",sourceReportId:report22.id});await h23.mutate(qa,"qc-start",{id:s23.id,rangeStart:"21"});assert.equal((await h23.get(s23.id!)).data.previousEndId,"00020");
 await h23.mutate(qa,"qc-result",{id:s23.id,errors:[{...error,objectId:"35",description:"Lỗi ở ID mới"}],rechecks:[{reviewId:r22.id,errorIndex:0,result:"failed",note:"Vẫn lệch"},{reviewId:r22.id,errorIndex:1,result:"passed"}]});
 assert.equal((await h23.get(report21.id!)).status,"submitted");assert.equal((await h23.get(report22.id!)).status,"submitted");
 const old=await h23.get(r22.id),newSession=await h23.get(s23.id!),newReview=await h23.get(newSession.data.reviewId);assert.equal(old.data.errors[0].fixed,true);assert.equal(old.data.errors[0].verification,"failed");assert.equal(old.data.errors[1].verification,"passed");assert.equal(newReview.data.errors.length,2);assert.equal(newReview.data.errors[1].originReviewId,r22.id);assert.equal(newReview.data.errors[1].fixed,false);assert.equal(newSession.data.repeatedErrorCount,1);
 await assert.rejects(()=>h23.mutate(ann,"review-fix",{id:r22.id,errorIndex:0,fixed:false}),/đã được QC kiểm lại/);await h23.mutate(ann,"review-fix",{id:newReview.id,errorIndex:1,fixed:true});
 assert.equal((await h23.get(report21.id!)).status,"approved");assert.equal((await h23.get(report22.id!)).status,"submitted");
 await h23.mutate(ann,"review-fix",{id:newReview.id,errorIndex:0,fixed:true});assert.equal((await h23.get(report22.id!)).status,"approved");
 const ev=await h23.evaluation(lead,{from:"2026-10-22",to:"2026-10-23",member:ann.id});assert.equal(ev.rows[0].reworkCount,2);assert.deepEqual(ev.rows[0].reworkDates,["2026-10-22","2026-10-23"]);assert.equal(ev.rows[0].firstPassRatio,null);
 assert.ok((await h23.visible(qa)).some(r=>r.id===s.id));assert.ok((await h23.visible(ann)).some(r=>r.id===newReview.id));assert.ok(!(await h23.visible(other)).some(r=>r.id===s.id||r.id===newReview.id));
 const all=await h23.rows(),sheets=reportSheets("qc-session",all.filter(r=>r.kind==="qc-session"),all,await h23.members());assert.equal(sheets.length,5);assert.ok(sheets.every(s=>s.rows.every(r=>r.length===s.rows[0].length)));assert.equal(sheets[0].rows.length,3);assert.equal(sheets[1].rows.length,5);assert.equal(sheets[2].rows.length,3);
});

test("daily QC requires a recorded source for missing IDs and one rework per person/date across multiple jobs",async()=>{
 const {hub,lead,ann,qa}=await fixture(),reports=(await hub.rows("daily")).filter(r=>r.owner_id===ann.id&&r.date==="2026-10-21"),source=reports[0],taskId=source.data.lines[0].taskId;
 await hub.db.batch([hub.replace(source,{...source.data,lines:source.data.lines.map((l:any)=>({...l,sourceIds:undefined,sourceRange:undefined}))})]);
 const s=await hub.mutate(lead,"qc-assign",{taskId,sourceReportId:source.id,reviewerId:qa.id});await assert.rejects(()=>hub.mutate(qa,"qc-start",{id:s.id}),/chưa có ID cuối/);await assert.rejects(()=>hub.mutate(qa,"qc-start",{id:s.id,endId:"25"}),/nguồn xác minh/);await hub.mutate(qa,"qc-start",{id:s.id,endId:"25",endIdNote:"Đối chiếu CVAT"});
 const errors=Array.from({length:10},(_,i)=>({type:"Sai vị trí",severity:"minor",description:"Lỗi "+i,objectId:String(i+1)}));await hub.mutate(qa,"qc-result",{id:s.id,errors});
 const all=await hub.rows(),memberTask=all.find(r=>r.id===taskId)!,review=all.find(r=>r.id===(all.find(r=>r.id===s.id)!).data.reviewId)!;
 const copy={...review,id:"another-job-same-day",task_id:"job-copy",data:{...review.data,errors:[errors[0]],taskCode:"other"}};all.push({...memberTask,id:"job-copy"},copy);
 const r=buildTeamEvaluation([ann],all,"2026-10-22","2026-10-22")[0];assert.equal(r.reworkCount,1);assert.equal(r.returnLogs,2);assert.equal(r.reworkedJobs,2);
});

test("QC table saves drafts, requires each ID exactly once, and preserves per-ID results and repairs",async()=>{
 const {hub,lead,ann,qa,other}=await fixture(),source=(await hub.rows("daily")).find(r=>r.owner_id===ann.id&&r.date==="2026-10-21")!;
 await hub.db.batch([hub.replace(source,{...source.data,lines:source.data.lines.map((l:any)=>({...l,endId:"5"}))})]);
 const assigned=await hub.mutate(lead,"qc-assign",{taskId:source.data.lines[0].taskId,sourceReportId:source.id,reviewerId:qa.id});
 await hub.mutate(qa,"qc-start",{id:assigned.id,endId:"5",rangeStart:"1",endIdNote:"Đối chiếu CVAT"});
 const rows=qcIdRows("1","5","Sai vị trí");rows[1]={...rows[1],result:"changes",description:"Lệch tâm",frameId:"12"};
 await assert.rejects(()=>hub.mutate(other,"qc-draft",{id:assigned.id,idChecks:rows}),/Chỉ người QA/);
 await hub.mutate(qa,"qc-draft",{id:assigned.id,idChecks:rows,note:"Đang kiểm từng ID"});
 let session=await hub.get(assigned.id!);assert.equal(session.status,"in_progress");assert.equal((await hub.rows("review")).length,0);assert.equal(session.data.draft.updatedBy,qa.id);assert.deepEqual(qcIdRows("1","5","Sai vị trí",session.data.draft.idChecks),rows);
 await assert.rejects(()=>hub.mutate(qa,"qc-result",{id:session.id,idChecks:rows}),/Còn ID chưa kiểm/);
 const complete=rows.map(r=>({...r,result:r.result||"passed"}));complete[3]={...complete[3],result:"changes",description:"Sai hướng"};
 await assert.rejects(()=>hub.mutate(qa,"qc-result",{id:session.id,idChecks:complete.slice(1)}),/có đủ từng ID/);
 await assert.rejects(()=>hub.mutate(qa,"qc-result",{id:session.id,idChecks:complete.map((r,i)=>i===0?{...r,objectId:"0002"}:r)}),/chỉ được có một dòng/);
 await assert.rejects(()=>hub.mutate(qa,"qc-result",{id:session.id,idChecks:complete.map((r,i)=>i===0?{...r,objectId:"6"}:r)}),/có đủ từng ID/);
 await assert.rejects(()=>hub.mutate(qa,"qc-result",{id:session.id,idChecks:complete.map((r,i)=>i===1?{...r,description:"  "}:r)}),/phải ghi nội dung/);
 await hub.mutate(qa,"qc-result",{id:session.id,idChecks:complete,note:"Đã kiểm 5 ID"});
 session=await hub.get(session.id);const review=await hub.get(session.data.reviewId);assert.equal(session.status,"completed");assert.equal(session.data.draft,null);assert.equal(session.data.idCheckedCount,5);assert.equal(review.data.idPassedCount,3);assert.equal(review.data.idFailedCount,2);assert.equal(review.data.checked,null);assert.equal(review.data.first,false);assert.equal(review.owner_id,qa.id);assert.equal(review.data.fixerId,ann.id);assert.equal(review.data.errors.length,2);assert.equal(review.data.errors[0].objectId,"2");
 await hub.mutate(ann,"review-fix",{id:review.id,errorIndex:0,fixed:true,note:"Đã chỉnh tâm"});
 const repaired=await hub.get(review.id),log=qcLogRows(repaired.data);assert.equal(log.length,5);assert.equal(log[1].errors[0].error.fixed,true);assert.equal(log[0].check?.result,"passed");
 await assert.rejects(()=>hub.mutate(qa,"qc-draft",{id:session.id,idChecks:rows}),/chưa ghi kết quả/);
 const all=await hub.rows(),sheets=reportSheets("qc-session",[session],all,await hub.members()),byId=sheets.find(s=>s.name==="QC tung ID")!;assert.equal(byId.rows.length,6);assert.equal(byId.rows.filter(r=>r[7]==="Có lỗi").length,2);assert.equal(byId.rows.filter(r=>r[7]==="Đạt").length,3);assert.ok(sheets.every(s=>s.rows.every(r=>r.length===s.rows[0].length)));
 const evaluation=await hub.evaluation(lead,{member:ann.id,from:"2026-10-22",to:"2026-10-22"});assert.equal(evaluation.rows[0].reworkCount,1);assert.equal(evaluation.rows[0].firstPassRatio,null);
});

test("QC ID ranges preserve large integer IDs and legacy error logs group one row per object",()=>{
 assert.deepEqual(qcIdRange("9007199254740993","9007199254740995"),["9007199254740993","9007199254740994","9007199254740995"]);
 assert.deepEqual(qcIdRange("","0003"),["1","2","3"]);assert.deepEqual(qcIdRange("0","0"),["0"]);assert.throws(()=>qcIdRange("1","2001"),/tối đa/);assert.throws(()=>qcIdRange("4","3"),/nhỏ hơn/);
 const legacy=qcLogRows({errors:[{objectId:"0002",description:"Một lỗi"},{objectId:"2",description:"Lỗi khác"},{objectId:"",description:"Chưa có ID"}]});assert.equal(legacy.length,2);assert.equal(legacy.find(r=>r.objectId==="0002")!.errors.length,2);assert.ok(legacy.every(r=>!r.check));
});

test("manual historical rework counts one day without creating QC logs, production or duplicate returns",async()=>{
 const {hub,lead,ann,qa,other}=await fixture(),reason="Lead đã xử lý rework thủ công",body={memberId:ann.id,date:"2026-10-21",reason};
 const before=await hub.rows();for(const member of [qa,ann])await assert.rejects(()=>hub.mutate(member,"manual-rework",body),/Chỉ Lead/);
 await assert.rejects(()=>hub.mutate(lead,"manual-rework",{...body,date:"2026-10-23"}),/tương lai/);
 const created=await hub.mutate(lead,"manual-rework",body),again=await hub.mutate(lead,"manual-rework",body);assert.equal(again.id,created.id);assert.equal((await hub.rows("manual-rework")).length,1);await assert.rejects(()=>hub.mutate(lead,"manual-rework",{...body,reason:"Lượt khác"}),/không cộng trùng/);
 let result=await hub.evaluation(lead,{member:ann.id,from:"2026-10-21",to:"2026-10-21"}),row=result.rows[0];assert.equal(row.reworkCount,1);assert.equal(row.manualReworkCount,1);assert.equal(row.reviewCount,0);assert.equal(row.qcPerformed,0);assert.equal(row.firstPassRatio,null);assert.equal(row.sources.manualReworks[0].reason,reason);assert.equal(result.totals.reworkCount,1);
 const after=await hub.rows();assert.deepEqual(after.filter(r=>r.kind!=="manual-rework"),before);assert.ok((await hub.visible(ann)).some(r=>r.id===created.id));assert.ok(!(await hub.visible(other)).some(r=>r.id===created.id));
 const task=after.find(r=>r.kind==="task"&&r.data.assigneeId===ann.id)!;after.push({...task,id:"manual-overlap-test",kind:"review",owner_id:qa.id,task_id:task.id,date:"2026-10-21",status:"changes",data:{fixerId:ann.id,verdict:"changes",errors:[]}});
 assert.equal(buildTeamEvaluation([ann],after,"2026-10-21","2026-10-21")[0].reworkCount,1);
 assert.equal((await hub.evaluation(lead,{member:ann.id,from:"2026-10-22",to:"2026-10-22"})).rows[0].reworkCount,0);
 const sheets=evaluationSheets(result);assert.ok(sheets[0].rows[1].includes(1));assert.doesNotMatch(String(sheets[0].rows[1][17]),/rework thủ công/);
});

test("historical end IDs use original progress, including explicit rework notes, without inferring from cuboids",async()=>{
 const {hub,qa}=await fixture(),records=await hub.rows(),reports=records.filter(r=>r.kind==="daily");
 assert.deepEqual(reports.filter(r=>r.owner_id===qa.id).sort((a,b)=>a.date!.localeCompare(b.date!)).map(r=>reportEndId(r.data.lines[0])),["20","39"]);
 for(const [memberId,expected] of [["member-4","17"],["member-5","11"]])assert.equal(reportEndId(reports.find(r=>r.owner_id===memberId&&r.date==="2026-10-20")!.data.lines[0]),expected);
 assert.equal(reportEndId({endId:"0000",sourceIds:99,sourceRange:"A1"}),"0000");assert.equal(reportEndId({quantity:1200}),"");assert.equal(reportEndId({sourceIds:20}),"");assert.equal(reportEndId({sourceIds:Number.MAX_SAFE_INTEGER+1,sourceRange:"A1"}),"");
 const detail=reportSheets("daily",reports.filter(r=>r.owner_id===qa.id),records,await hub.members()).find(s=>s.name==="Chi tiet cong viec")!;
 assert.deepEqual(detail.rows.slice(1).map(r=>r[5]),["39","20"]);
});

test("clean daily QC approves only its source and resubmission requires fresh QC",async()=>{
 const {hub,lead,ann,qa}=await fixture(),source=(await hub.rows("daily")).find(r=>r.owner_id===ann.id&&r.date==="2026-10-21")!,taskId=source.data.lines[0].taskId;
 const session=await hub.mutate(lead,"qc-assign",{taskId,sourceReportId:source.id,reviewerId:qa.id});
 await hub.mutate(qa,"qc-start",{id:session.id});assert.equal((await hub.get(session.id!)).data.endId,"34");
 await hub.mutate(qa,"qc-result",{id:session.id,idChecks:qcIdRows("1","34","Sai vị trí").map(r=>({...r,result:"passed"}))});
 let report=await hub.get(source.id);assert.equal(report.status,"approved");assert.equal(report.data.autoQcApproved,true);
 assert.equal((await hub.rows("daily")).filter(r=>r.status==="approved").length,1);
 assert.equal((await hub.get(taskId)).status,"doing");
 await hub.mutate(lead,"report-decision",{id:source.id,decision:"reopen",reason:"Bổ sung sản lượng"});report=await hub.get(source.id);
 assert.equal(report.status,"changes");assert.equal(reportQcApprovalStatements(hub,qa,await hub.rows()).length,0);
 await assert.rejects(()=>hub.mutate(ann,"daily",{date:source.date,submit:true,lines:[{taskId,endId:"35",quantity:1260,rework:0,minutes:240}]}),/trong ngày báo cáo/);
 await hub.mutate(lead,"daily",{memberId:ann.id,date:source.date,submit:true,lines:[{taskId,endId:"35",quantity:1260,rework:0,minutes:240}]});
 report=await hub.get(source.id);assert.equal(report.status,"submitted");assert.equal(dailyQcApproved(report,await hub.rows()),false);
 await hub.mutate(lead,"report-decision",{id:source.id,decision:"approve"});assert.equal(reportQcApprovalStatements(hub,qa,await hub.rows()).length,0);
});

test("daily approval requires every job and continuous ID coverage for the same report version",async()=>{
 const {hub,ann,qa}=await fixture(),template=(await hub.rows("daily")).find(r=>r.owner_id===ann.id)!;
 const report={...template,id:"multi-job",date:"2026-10-22",status:"submitted",data:{qcContentToken:"v1",lines:[{taskId:"a",endId:"10",quantity:100},{taskId:"b",endId:"5",quantity:100},{taskId:"qc-only",activity:"qc",minutes:30}]}};
 const review=(id:string,taskId:string,start:string,end:string)=>({...template,id,kind:"review",task_id:taskId,owner_id:qa.id,status:"passed",data:{mode:"daily",fixerId:ann.id,sourceReportId:report.id,sourceQcKey:reportQcKey(report),rangeStart:start,endId:end,errors:[]}});
 const a=review("a1","a","1","4"),a2=review("a2","a","6","10"),b=review("b","b","1","5"),rows=[report,a,a2,b];
 assert.equal(dailyQcApproved(report,rows),false);a2.data.rangeStart="5";assert.equal(dailyQcApproved(report,rows),true);
 assert.equal(dailyQcApproved(report,rows.filter(r=>r!==b)),false);
 b.data.sourceReportId="other-report";assert.equal(dailyQcApproved(report,rows),false);b.data.sourceReportId=report.id;
 const changed={...report,data:{...report.data,qcContentToken:"v2"}};assert.equal(dailyQcApproved(changed,rows),false);
 const zero={...report,data:{lines:[{taskId:"a",endId:"0"}]}};a.data.sourceQcKey=reportQcKey(zero);a.data.rangeStart="0";a.data.endId="0";assert.equal(dailyQcApproved(zero,[zero,a]),true);
});

test("Lead records integer frame counts on task and QC assignment, preserving legacy counts",async()=>{
 const {hub,lead,ann,qa}=await fixture(),p=await hub.mutate(lead,"project",{name:"Frame count",unit:"cuboid"});
 const body={code:"",jobId:"8765",title:"Frame count test",projectId:p.id,assigneeId:ann.id,reviewerId:qa.id,assignedDate:"2026-10-22",deadline:"2026-10-25",priority:"normal",quantity:10000};
 for(const frameCount of [0,-1,2.5,100000001])await assert.rejects(()=>hub.mutate(lead,"task",{...body,frameCount}));
 const created=await hub.mutate(lead,"task",{...body,frameCount:80});assert.equal(taskFrameCount(await hub.get(created.id!)),80);
 await hub.mutate(lead,"task",{...body,id:created.id});assert.equal(taskFrameCount(await hub.get(created.id!)),80);
 const source=(await hub.rows("daily")).find(r=>r.owner_id===ann.id&&r.date==="2026-10-21")!,taskId=source.data.lines[0].taskId;
 const legacy=await hub.get(taskId);await hub.db.batch([hub.replace(legacy,{...legacy.data,sourceFrames:60})]);assert.equal(taskFrameCount(await hub.get(taskId)),60);
 const assign={taskId,sourceReportId:source.id,reviewerId:qa.id,frameCount:90};
 await assert.rejects(()=>hub.mutate(qa,"qc-assign",assign),/Chỉ Lead/);await assert.rejects(()=>hub.mutate(lead,"qc-assign",{...assign,frameCount:0}));
 const session=await hub.mutate(lead,"qc-assign",assign);assert.equal((await hub.get(session.id!)).data.frameCount,90);assert.equal(taskFrameCount(await hub.get(taskId)),90);
 await hub.mutate(qa,"qc-start",{id:session.id});await hub.mutate(qa,"qc-result",{id:session.id,errors:[]});assert.equal((await hub.rows("review"))[0].data.frameCount,90);
 const rows=await hub.rows(),sheet=reportSheets("task",rows.filter(r=>r.kind==="task"),rows,await hub.members())[0];assert.ok(sheet.rows[0].includes("Số frame của Job"));assert.ok(sheet.rows.every(r=>r.length===sheet.rows[0].length));
 assert.equal(taskFrameCount({data:{sourceFrames:60,frameCount:null}}),null);
});

test("repair cuboids count unique unresolved IDs per Job, follow repeated logs, and use each Job's frames",async()=>{
 const {hub,ann,qa}=await fixture(),records=await hub.rows(),a=records.find(r=>r.kind==="task"&&r.data.assigneeId===ann.id)!;
 a.data.sourceFrames=60;const b={...a,id:"second-job",data:{...a.data,jobId:"999",frameCount:30}};records.push(b);
 const make=(id:string,taskId:string,errors:any[])=>({...a,id,kind:"review",task_id:taskId,owner_id:qa.id,date:"2026-10-22",data:{mode:"daily",fixerId:ann.id,errors}});
 const original=make("old",a.id,[{objectId:"0002",fixed:false},{objectId:"2",fixed:false},{objectId:"3",fixed:true},{objectId:"4",fixed:false,verification:"passed"},{objectId:"5",fixed:true,verification:"failed"},{objectId:"6",fixed:true,verification:"failed"},{objectId:"",fixed:false}]);
 const repeated=make("again",a.id,[{objectId:"6",originReviewId:"old",originErrorIndex:5,fixed:false},{objectId:"2",fixed:false}]);
 const second=make("other-job",b.id,[{objectId:"2",fixed:false}]);records.push(original,repeated,second,{...make("future",a.id,[{objectId:"9",fixed:false}]),date:"2026-10-23"});
 let value=pendingRepairWork(ann.id,records,"2026-10-22");assert.equal(value.idCount,4);assert.equal(value.cuboids,210);assert.equal(value.unidentifiedLogs,1);assert.equal(value.missingFrameIds,0);assert.equal(pendingRepairWork(qa.id,records,"2026-10-22").cuboids,0);
 repeated.data.errors[0].fixed=true;original.data.errors[4].verification="passed";assert.equal(pendingRepairWork(ann.id,records,"2026-10-22").cuboids,90);
 original.data.errors[0].fixed=true;assert.equal(pendingRepairWork(ann.id,records,"2026-10-22").cuboids,90);
 original.data.errors[1].fixed=true;repeated.data.errors[1].fixed=true;assert.equal(pendingRepairWork(ann.id,records,"2026-10-22").cuboids,30);
 b.data.frameCount=null as any;value=pendingRepairWork(ann.id,records,"2026-10-22");assert.equal(value.cuboids,0);assert.equal(value.missingFrameIds,1);
});

test("yellow pending work stays inside blue production and does not change KPI quantities",()=>{
 assert.deepEqual(repairProgress(1200,2400,120),{filledPercent:50,pendingPercent:10});
 assert.deepEqual(repairProgress(3000,2400,120),{filledPercent:100,pendingPercent:4});
 assert.deepEqual(repairProgress(100,1200,500),{filledPercent:100/1200*100,pendingPercent:100});
 assert.deepEqual(repairProgress(0,0,60),{filledPercent:0,pendingPercent:0});
});

test("daily reports allow own edits before 17:00 Vietnam time and reserve all late or historical entry for Lead",async()=>{
 const {db,hub,lead,ann,qa,other}=await fixture(),task=(await hub.rows("task")).find(r=>r.data.assigneeId===ann.id)!;
 const before=new Hub(db,lead.email,new Date("2026-10-22T09:59:59Z")),after=new Hub(db,lead.email,new Date("2026-10-22T10:00:00Z"));
 const body={date:"2026-10-22",submit:true,lines:[{taskId:task.id,endId:"50",quantity:1000,minutes:120,rework:0}]};
 const created=await before.mutate(ann,"daily",body);await before.mutate(ann,"daily",{...body,lines:[{...body.lines[0],quantity:1100}]});assert.equal((await before.get(created.id!)).status,"submitted");
 for(const actor of [ann,qa])await assert.rejects(()=>after.mutate(actor,"daily",{...body,submit:false}),/trước 17:00/);
 await assert.rejects(()=>before.mutate(ann,"daily",{...body,date:"2026-10-21"}),/trong ngày báo cáo/);
 await assert.rejects(()=>before.mutate(ann,"daily",{...body,memberId:other.id}),/Chỉ Lead/);
 const stale=await after.get(created.id!);await after.mutate(lead,"daily",{...body,memberId:ann.id,id:created.id,revision:stale.revision,lines:[{...body.lines[0],quantity:1200}]});
 const updated=await after.get(created.id!);assert.equal(updated.owner_id,ann.id);assert.equal(updated.data.lastEditedBy,lead.id);assert.equal(updated.data.createdBy,ann.id);assert.equal(updated.data.lines[0].quantity,1200);assert.notEqual(updated.data.qcContentToken,stale.data.qcContentToken);
 await assert.rejects(()=>after.mutate(lead,"daily",{...body,memberId:ann.id,id:created.id,revision:stale.revision}),/người khác cập nhật/);
 const otherTask=(await hub.rows("task")).find(r=>r.data.assigneeId===other.id)!;
 const written=await after.mutate(lead,"daily",{...body,memberId:other.id,lines:[{...body.lines[0],taskId:otherTask.id}]});assert.equal((await after.get(written.id!)).owner_id,other.id);assert.equal((await after.get(written.id!)).data.createdBy,lead.id);
 assert.equal((await after.rows("daily")).filter(r=>r.owner_id===ann.id&&r.date===body.date).length,1);
 assert.equal(dailyReportWritable(ann,ann.id,body.date,new Date("2026-10-22T09:59:59Z")),true);assert.equal(dailyReportWritable(ann,ann.id,body.date,new Date("2026-10-22T10:00:00Z")),false);
 assert.equal(dailyReportWritable(lead,ann.id,"2026-10-21",new Date("2026-10-22T18:00:00Z")),true);
});

test("Lead can remove a report line and task totals no longer retain its production or final ID",async()=>{
 const {hub,lead,ann}=await fixture(),project=await hub.mutate(lead,"project",{name:"Editable reports",unit:"cuboid"});
 const task=async(jobId:string)=>hub.mutate(lead,"task",{jobId,title:jobId,projectId:project.id,assigneeId:ann.id,reviewerId:lead.id,assignedDate:"2026-10-22",deadline:"2026-10-25",priority:"normal",quantity:10000});
 const a=await task("8761"),b=await task("8762"),line=(id:string)=>({taskId:id,endId:"10",quantity:600,minutes:60,rework:0});
 const r=await hub.mutate(ann,"daily",{date:"2026-10-22",submit:true,lines:[line(a.id!),line(b.id!)]});
 await hub.mutate(lead,"daily",{id:r.id,memberId:ann.id,date:"2026-10-22",submit:true,lines:[{...line(a.id!),quantity:700}]});
 assert.equal((await hub.get(a.id!)).data.reportedTotal,700);assert.equal((await hub.get(b.id!)).data.reportedTotal,0);assert.equal((await hub.get(b.id!)).data.latestEndId,"");
});

test("today's missing reports include drafts, exclude inactive members, and ignore other dates",async()=>{
 const {hub,lead,ann,qa,other}=await fixture(),records=await hub.rows(),base=records.find(r=>r.kind==="daily")!;
 records.push({...base,id:"sent-today",owner_id:ann.id,date:"2026-10-22",status:"submitted"},{...base,id:"draft-today",owner_id:other.id,date:"2026-10-22",status:"draft"});
 const completion=dailyReportCompletion(records,[lead,ann,qa,other,{...other,id:"disabled",state:"disabled"}],"2026-10-22");
 assert.deepEqual(completion.sent.map(m=>m.id),[ann.id]);assert.deepEqual(completion.missing.map(m=>m.id),[lead.id,qa.id,other.id]);
});

test("legacy settings move the Daily Report deadline to 17:00 once and preserve later Lead settings",async()=>{
 const {hub}=await fixture(),row=await hub.get("settings");await hub.db.batch([hub.replace(row,{...row.data,reportDeadline:"18:00",dailyPolicyVersion:undefined})]);
 assert.equal((await hub.settings()).reportDeadline,"17:00");const upgraded=await hub.get("settings");await hub.settings();assert.equal((await hub.get("settings")).revision,upgraded.revision);
 await hub.db.batch([hub.replace(upgraded,{...upgraded.data,reportDeadline:"16:30"})]);assert.equal((await hub.settings()).reportDeadline,"16:30");
});

test("new cuboid production is IDs times Job frames times 0.85; stored and imported production never changes with Job frame edits",async()=>{
 const {hub,lead,ann}=await fixture(),task=(await hub.rows("task")).find(r=>r.data.assigneeId===ann.id)!;
 await hub.db.batch([hub.replace(task,{...task.data,frameCount:60})]);
 const before=await hub.rows("daily"),body={date:"2026-10-22",submit:true,lines:[{taskId:task.id,idCount:20,endId:"54",quantity:999999,minutes:120,rework:0}]};
 const report=await hub.mutate(ann,"daily",body);let saved=await hub.get(report.id!);assert.equal(saved.data.lines[0].quantity,1020);assert.equal(saved.data.lines[0].frameCountAtReport,60);assert.equal(saved.data.lines[0].productionFactor,0.85);
 let currentTask=await hub.get(task.id);await hub.db.batch([hub.replace(currentTask,{...currentTask.data,frameCount:80})]);assert.equal((await hub.get(report.id!)).data.lines[0].quantity,1020);
 await hub.mutate(ann,"daily",{...body,nextPlan:"Chỉ bổ sung kế hoạch"});saved=await hub.get(report.id!);assert.equal(saved.data.lines[0].quantity,1020);assert.equal(saved.data.lines[0].frameCountAtReport,60);
 assert.deepEqual((await hub.rows("daily")).filter(r=>r.id!==report.id),before);
 currentTask=await hub.get(task.id);await hub.db.batch([hub.replace(currentTask,{...currentTask.data,frameCount:null})]);
 await assert.rejects(()=>hub.mutate(lead,"daily",{...body,date:"2026-10-21",memberId:ann.id}),/nhập số frame/);
 assert.deepEqual((await hub.rows("daily")).filter(r=>r.id!==report.id),before);
 assert.equal(cuboidsFromIds(1,61),51.85);assert.equal(cuboidsFromIds(1,90),76.5);assert.equal(cuboidsFromIds(0,60),0);assert.equal(cuboidsFromIds(10,null),null);assert.equal(cuboidsFromIds(1.5,60),null);assert.equal(cuboidsFromIds(100000000,100000000),null);
});

test("an extended QC session covers older report snapshots and applies errors only to their production ID ranges",async()=>{
 const {hub,ann,qa}=await fixture(),base=(await hub.rows("daily")).find(r=>r.owner_id===ann.id)!;
 const old={...base,id:"covered-old",date:"2026-10-22",data:{lines:[{taskId:"extended-job",endId:"56",quantity:1200}]}};
 const latest={...base,id:"covered-new",date:"2026-10-23",data:{qcContentToken:"new",lines:[{taskId:"extended-job",endId:"80",quantity:1152}]}};
 const session={...base,id:"extended-session",kind:"qc-session",task_id:"extended-job",data:{coveredReports:[old,latest].map(r=>({sourceReportId:r.id,sourceQcKey:reportQcKey(r)}))}};
 const review={...base,id:"extended-review",kind:"review",task_id:"extended-job",owner_id:qa.id,data:{mode:"daily",fixerId:ann.id,sessionId:session.id,sourceReportId:latest.id,sourceQcKey:reportQcKey(latest),rangeStart:"1",endId:"80",errors:[{objectId:"70",fixed:false}]}};
 const rows=[old,latest,session,review];assert.equal(dailyQcApproved(old,rows),true);assert.equal(dailyQcApproved(latest,rows),false);
 review.data.errors[0].fixed=true;assert.equal(dailyQcApproved(latest,rows),true);
 old.data.lines[0].quantity=1300;assert.equal(dailyQcApproved(old,rows),false);
});

test("one Job assignment persists across daily QC cycles; yesterday's latest ID extends the range from the cleared milestone",async()=>{
 const {db,hub,lead,ann,qa,other}=await fixture(),h21=new Hub(db,lead.email,new Date("2026-10-21T01:00:00Z"));
 const project=await h21.mutate(lead,"project",{name:"Rolling QC",unit:"cuboid"}),task=await h21.mutate(lead,"task",{jobId:"7711",frameCount:60,title:"Rolling QC Job",projectId:project.id,assigneeId:ann.id,reviewerId:qa.id,assignedDate:"2026-10-21",deadline:"2026-10-30",priority:"normal",quantity:20000});
 const assignment=await h21.mutate(lead,"qc-job-assign",{taskId:task.id,reviewerId:qa.id,frameCount:60}),repeat=await h21.mutate(lead,"qc-job-assign",{taskId:task.id,reviewerId:qa.id,frameCount:60});assert.equal(repeat.id,assignment.id);
 await assert.rejects(()=>h21.mutate(ann,"qc-job-assign",{taskId:task.id,reviewerId:qa.id}),/Chỉ Lead/);await assert.rejects(()=>h21.mutate(qa,"qc-job-start",{id:assignment.id}),/Chưa có Daily Report/);
 await h21.mutate(ann,"daily",{date:"2026-10-21",submit:true,lines:[{taskId:task.id,idCount:20,endId:"20",quantity:0,rework:0,minutes:240}]});
 await assert.rejects(()=>hub.mutate(other,"qc-job-start",{id:assignment.id}),/Chỉ người QA/);
 await assert.rejects(()=>hub.mutate(qa,"qc-job-start",{id:assignment.id}),/Tool_QC/);
 await hub.db.batch([hub.insert("qc-basic","unit-basic-completed",{assignmentId:assignment.id,reviewedBy:qa.id},{owner_id:ann.id,task_id:task.id,status:"completed"})]);
 const cycle=await hub.mutate(qa,"qc-job-start",{id:assignment.id});assert.equal((await hub.get(cycle.id!)).data.endId,"20");assert.equal((await hub.mutate(qa,"qc-job-start",{id:assignment.id})).id,cycle.id);
 await hub.mutate(qa,"qc-result",{id:cycle.id,idChecks:qcIdRows("1","20","Sai vị trí").map(r=>({...r,result:r.objectId==="5"?"changes":"passed",description:r.objectId==="5"?"Hộp lệch":""}))});
 assert.equal(qcClearedThrough(await hub.rows(),task.id!),"4");const review=await hub.get((await hub.get(cycle.id!)).data.reviewId);await hub.mutate(ann,"review-fix",{id:review.id,errorIndex:0,fixed:true});assert.equal(qcClearedThrough(await hub.rows(),task.id!),"20");
 await hub.mutate(ann,"daily",{date:"2026-10-22",submit:true,lines:[{taskId:task.id,idCount:60,endId:"80",quantity:0,rework:0,minutes:240}]});
 const h23=new Hub(db,lead.email,new Date("2026-10-23T01:00:00Z")),record=await h23.get(assignment.id!),state=qcJobState(await h23.rows(),record,"2026-10-23");assert.equal(state.rangeStart,"20");assert.equal(state.endId,"80");assert.equal(state.source?.report.date,"2026-10-22");
 const next=await h23.mutate(qa,"qc-job-start",{id:assignment.id});assert.notEqual(next.id,cycle.id);assert.equal((await h23.get(next.id!)).data.rangeStart,"20");
 await h23.mutate(qa,"qc-result",{id:next.id,idChecks:qcIdRows("20","80","Sai vị trí").map(r=>({...r,result:"passed"})),rechecks:[{reviewId:review.id,errorIndex:0,result:"passed"}]});
 assert.equal(qcClearedThrough(await h23.rows(),task.id!),"80");assert.equal(qcJobState(await h23.rows(),await h23.get(assignment.id!),"2026-10-23").last?.id,next.id);assert.equal((await h23.rows("qc-assignment")).filter(r=>r.task_id===task.id).length,1);assert.equal((await h23.rows("review")).filter(r=>r.task_id===task.id).length,2);assert.notEqual((await h23.get(task.id!)).status,"done");
 await assert.rejects(()=>h23.mutate(qa,"qc-job-start",{id:assignment.id}),/Chưa có ID mới/);
 await h23.mutate(ann,"daily",{date:"2026-10-23",submit:true,lines:[{taskId:task.id,idCount:20,endId:"100",quantity:0,rework:0,minutes:240}]});
 const day24=new Hub(db,lead.email,new Date("2026-10-24T01:00:00Z")),current=qcJobState(await day24.rows(),await day24.get(assignment.id!),"2026-10-24");assert.equal(current.rangeStart,"80");assert.equal(current.endId,"100");
 await day24.mutate(ann,"daily",{date:"2026-10-24",submit:true,lines:[{taskId:task.id,idCount:30,endId:"130",quantity:0,rework:0,minutes:240}]});assert.equal(qcJobState(await day24.rows(),await day24.get(assignment.id!),"2026-10-24").endId,"100");
});

test("legacy daily QC assignments become one persistent Job assignment without changing sessions or reports",async()=>{
 const {hub,lead,ann,qa,identity}=await fixture(),source=(await hub.rows("daily")).find(r=>r.owner_id===ann.id&&r.date==="2026-10-21")!,taskId=source.data.lines[0].taskId;
 await hub.mutate(lead,"qc-assign",{taskId,sourceReportId:source.id,reviewerId:qa.id});await hub.ensureAttendanceDefaults();const before=await hub.rows();await hub.state(identity);await hub.state(identity);
 const after=await hub.rows();assert.equal(after.filter(r=>r.kind==="qc-assignment").length,1);assert.deepEqual(after.filter(r=>r.kind!=="qc-assignment"),before);
 assert.ok((await hub.visible(qa)).some(r=>r.kind==="qc-assignment"));assert.ok((await hub.visible(ann)).some(r=>r.kind==="qc-assignment"));
});
