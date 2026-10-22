import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Hub, today, weekStart, localTime } from "../lib/domain.ts";
import { csv, xlsx } from "../lib/export.ts";

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
test("seed imports reconcile and never invent hours, QC, dates or task quotas", async()=>{const {hub}=await fixture();const data=await hub.rows();assert.equal(data.filter(r=>r.kind==="daily").length,18);assert.equal(data.filter(r=>r.kind==="task").length,9);assert.equal(data.filter(r=>r.kind==="attendance").length,27);for(const d of ["2026-10-20","2026-10-21"]){const reports=data.filter(r=>r.kind==="daily"&&r.date===d);assert.equal(reports.flatMap(r=>r.data.lines).reduce((n,l)=>n+l.quantity,0),d.endsWith("20")?5520:11280);}assert.ok(data.filter(r=>r.kind==="attendance").every(r=>r.date!<"2026-11-01"&&!r.data.checkIn));assert.ok(data.filter(r=>r.kind==="daily").every(r=>r.data.lines[0].minutes===null));assert.ok(data.filter(r=>r.kind==="task").every(r=>r.data.quantity===null&&r.data.deadline===null));assert.equal(data.filter(r=>r.kind==="review").length,0);});
test("authorization: identity binding, invitations, disabled accounts and all three roles",async()=>{const {hub,lead,ann,qa,other}=await fixture();await assert.rejects(()=>hub.setup({userId:"bad",email:"bad@example.com"}),/Chỉ email Lead/);await assert.rejects(()=>hub.activate({userId:"bad",email:other.email}),/Lời mời/);for(const actor of [ann,qa]){await assert.rejects(()=>hub.mutate(actor,"member",{name:"X",email:"x@example.com",role:"Lead",state:"invited"}),/Chỉ Lead/);await assert.rejects(()=>hub.mutate(actor,"settings",{}),/Chỉ Lead/);await assert.rejects(()=>hub.aggregate(actor,other.id,"2026-10-19"),/Không có quyền/);}const visible=await hub.visible(ann);assert.ok(visible.filter(r=>r.kind==="daily").every(r=>r.owner_id===ann.id));assert.equal(visible.filter(r=>r.kind==="import"||r.kind==="legacy").length,0);await hub.mutate(lead,"member",{...ann,state:"disabled"});await assert.rejects(()=>hub.current({userId:ann.auth_id!,email:ann.email}),/vô hiệu hóa/);await assert.rejects(()=>hub.mutate(lead,"member",{...lead,role:"Annotator"}),/Cần giữ tài khoản Lead/);});
test("full workflow: assignment, annotation, daily, QC return, resubmit, completion, weekly",async()=>{
 const {hub,lead,ann,qa,other}=await fixture();
 const p=await hub.mutate(lead,"project",{name:"Dự án kiểm thử",unit:"frame",target:null});
 const result=await hub.mutate(lead,"task",{code:"TEST-001",title:"Batch kiểm thử",projectId:p.id,assigneeId:ann.id,reviewerId:qa.id,assignedDate:"2026-10-22",deadline:"2026-10-23",priority:"normal",quantity:10});const taskId=result.id!;
 await assert.rejects(()=>hub.mutate(other,"progress",{id:taskId,status:"doing",completed:1}),/người khác/);
 await hub.mutate(ann,"progress",{id:taskId,status:"doing",completed:10});
 const report={date:"2026-10-22",lines:[{taskId,minutes:120,quantity:10,rework:0,work:"Làm 10 frame",activity:"annotation"}],submit:true};
 const d=await hub.mutate(ann,"daily",report);await assert.rejects(()=>hub.mutate(ann,"daily",report),/Lead mở lại/);
 await hub.mutate(ann,"progress",{id:taskId,status:"qa",completed:10});
 const review={taskId,checked:10,passed:8,failed:2,scope:"full",verdict:"changes",errors:[{type:"Sai vị trí",severity:"major",description:"Sửa vị trí"}]};
 await assert.rejects(()=>hub.mutate(ann,"review",review),/Chỉ QA/);await assert.rejects(()=>hub.mutate(other,"review",review),/Chỉ QA/);
 await hub.mutate(qa,"review",review);await hub.mutate(ann,"progress",{id:taskId,status:"recheck",completed:10});await hub.mutate(qa,"review",{...review,passed:10,failed:0,verdict:"passed",errors:[]});
 assert.equal((await hub.get(taskId)).status,"done");await assert.rejects(()=>hub.mutate(ann,"progress",{id:taskId,status:"doing",completed:10}),/đã được khóa/);
 await hub.mutate(lead,"report-decision",{id:d.id,decision:"approve"});await assert.rejects(()=>hub.mutate(ann,"daily",report),/Lead mở lại/);
 await hub.mutate(lead,"report-decision",{id:d.id,decision:"reopen",reason:"Bổ sung mô tả"});await hub.mutate(ann,"daily",report);
 const agg=await hub.aggregate(lead,ann.id,"2026-10-22");assert.equal(agg.products.find((x:any)=>x.projectId===p.id).quantity,10);assert.equal(agg.firstPass[p.id!].passed,8);assert.equal(agg.firstPass[p.id!].checked,10);assert.equal(agg.minutes,120);assert.equal(agg.products.length,2); // frame and imported cuboid remain separate
 const w=await hub.mutate(ann,"weekly",{date:"2026-10-22",highlights:"Hoàn thành",submit:true});assert.equal((await hub.get(w.id!)).data.snapshot.products.find((x:any)=>x.projectId===p.id).quantity,10);
 const qaRows=await hub.visible(qa);const scoped=qaRows.find(r=>r.id===d.id);assert.equal(scoped?.data.scoped,true);assert.equal(scoped?.data.blockers,undefined);assert.equal(scoped?.data.lines.length,1);
});
test("QA/QC can annotate and report QC separately, without production duplication",async()=>{const {hub,lead,ann,qa}=await fixture();const p=await hub.mutate(lead,"project",{name:"Dual role",unit:"scene"});const create=async(code:string,owner:string)=>hub.mutate(lead,"task",{code,title:code,projectId:p.id,assigneeId:owner,reviewerId:qa.id,assignedDate:"2026-10-22",deadline:"2026-10-23",priority:"normal",quantity:5});const a=await create("QA-ANN",qa.id),q=await create("QC-OTHER",ann.id);await hub.mutate(qa,"progress",{id:a.id,completed:2,status:"doing"});await hub.mutate(qa,"daily",{date:"2026-10-22",submit:true,lines:[{taskId:a.id,activity:"annotation",minutes:240,quantity:2,rework:0,work:"Annotation"},{taskId:q.id,activity:"qc",minutes:240,quantity:0,rework:0,work:"Kiểm tra"}]});const agg=await hub.aggregate(qa,qa.id,"2026-10-22");assert.equal(agg.minutes,480);assert.equal(agg.products.find((x:any)=>x.projectId===p.id).quantity,2);});
test("only Khoi can mark attendance, late minutes and conduct; adjustments stay audited",async()=>{
 const {hub,lead,ann,qa,other}=await fixture();
 for(const m of [ann,qa,other]) { await assert.rejects(()=>hub.mutate(m,"checkin",{}),/không tự check/); await assert.rejects(()=>hub.mutate(m,"checkout",{}),/không tự check/); await assert.rejects(()=>hub.mutate(m,"attendance-mark",{}),/Chỉ Nguyễn Tuấn Khôi/); }
 const mark={memberId:ann.id,date:"2026-10-22",status:"late",lateMinutes:13,conduct:"Đúng quy định",note:"Đã xác minh"};
 await hub.mutate(lead,"attendance-mark",mark);await hub.mutate(lead,"attendance-mark",{...mark,lateMinutes:15});
 const rows=(await hub.rows("attendance")).filter(r=>r.owner_id===ann.id&&r.date==="2026-10-22");assert.equal(rows.length,1);assert.equal(rows[0].data.lateMinutes,15);assert.equal(rows[0].data.markedBy,lead.id);assert.equal(rows[0].data.conduct,"Đúng quy định");
 await assert.rejects(()=>hub.mutate(lead,"attendance-mark",{...mark,checkOut:"2026-10-22T01:00:00Z"}),/trước check-in/);
 const req=await hub.mutate(ann,"request",{type:"correction",date:"2026-10-22",endDate:"2026-10-22",reason:"Bổ sung giờ công",checkIn:"2026-10-22T00:30:00Z",checkOut:"2026-10-22T01:20:00Z"});await assert.rejects(()=>hub.mutate(qa,"request-decision",{id:req.id,approved:true,reason:"Đúng"}),/Chỉ Nguyễn Tuấn Khôi/);await hub.mutate(lead,"request-decision",{id:req.id,approved:true,reason:"Đã xác minh"});assert.ok((await hub.rows("attendance")).find(r=>r.owner_id===ann.id&&r.date==="2026-10-22")?.data.adjustedBy);
});
test("optimistic concurrency rolls back stale writes and their audit",async()=>{const {hub,lead,db}=await fixture();const before=await hub.get("settings");await hub.commit(lead,"Change",before,"settings",{...before.data,lateGrace:5});const count=db.sql.prepare("SELECT COUNT(*) as n FROM audit").get()!.n;await assert.rejects(()=>hub.commit(lead,"Stale",before,"settings",before.data),/NOT NULL/);assert.equal(db.sql.prepare("SELECT COUNT(*) as n FROM audit").get()!.n,count);assert.equal((await hub.get("settings")).data.lateGrace,5);});
test("exports quote CSV injection safely and generate an OOXML zip",()=>{assert.match(csv([["=SUM(A1)","a,b"]]),/"'=SUM\(A1\)"/);const out=xlsx([["Họ tên","Sản lượng"],["Khôi",12]]);assert.equal(new DataView(out.buffer).getUint32(0,true),0x04034b50);});
test("CVAT Task/Job pairs create canonical URLs and allow different jobs in one task",async()=>{
 const {hub,lead,ann}=await fixture();const p=await hub.mutate(lead,"project",{name:"CVAT",unit:"cuboid"});
 const b={code:"9001",jobId:"9002",title:"CVAT job",projectId:p.id,assigneeId:ann.id,reviewerId:lead.id,assignedDate:"2026-10-22",deadline:"2026-10-23",priority:"normal",quantity:100,link:"https://example.com/ignored"};
 const first=await hub.mutate(lead,"task",b);assert.equal((await hub.get(first.id!)).data.link,"https://cvat-test.vantixapps.net/tasks/9001/jobs/9002");
 await hub.mutate(lead,"task",{...b,jobId:"9003"});await assert.rejects(()=>hub.mutate(lead,"task",b),/Cặp Task ID/);
 const team=await hub.aggregate(lead,"team","2026-10-22");assert.equal(team.products.find((p:any)=>p.unit==="cuboid").quantity,16800);assert.equal(team.missingTimeLines,18);
});

