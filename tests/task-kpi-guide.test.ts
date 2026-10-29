import {test} from "node:test";
import assert from "node:assert/strict";
import {taskDailyGuide} from "../lib/task-kpi-guide.ts";
const row=(id:string,kind:string,data:any,extra:any={}):any=>({id,kind,data,...extra});
function fixture(){return [row("p","project",{unit:"cuboid"}),row("frames","project",{unit:"frame"}),row("a","task",{assigneeId:"ann"},{project_id:"p"}),row("b","task",{assigneeId:"ann"},{project_id:"p"}),row("f","task",{assigneeId:"ann"},{project_id:"frames"}),row("rate","kpi-rate",{quantity:600},{owner_id:"ann",date:"2026-10-27",status:"active"}),row("new-rate","kpi-rate",{quantity:300},{owner_id:"ann",date:"2026-10-28",status:"active"}),row("source","kpi-source",{production:{usable:true,basis:"datumaro-baseline-v1",offset:1,ids:Array.from({length:10},(_,i)=>({id:i+1,credit:i===2?400:i===3?200:60}))}},{owner_id:"ann",task_id:"a",status:"active"}),row("old","daily",{lines:[{taskId:"a",endId:"2",quantity:120}]},{owner_id:"ann",date:"2026-10-26",status:"submitted"}),row("today","daily",{lines:[{taskId:"a",endId:"4",quantity:600},{taskId:"b",quantity:150},{taskId:"b",activity:"qc",quantity:999},{taskId:"f",quantity:500}]},{owner_id:"ann",date:"2026-10-27",status:"submitted"})];}
test("daily task goals use dated personal KPI, carry yesterday's ID, and exclude QC, frames and drafts from other-job production",()=>{
 const records=fixture(),g=taskDailyGuide(records,"ann","a","2026-10-27");assert.equal(g.target,600);assert.equal(g.otherQuantity,150);assert.equal(g.previousEnd,2);assert.equal(g.start,3);assert.equal(g.endId,4);assert.equal(g.quantity,600);assert.equal(g.reportedEnd,"4");assert.equal(g.reportedQuantity,600);
 const next=taskDailyGuide(records,"ann","a","2026-10-28");assert.equal(next.target,300);assert.equal(next.previousEnd,4);assert.equal(next.start,5);assert.equal(next.endId,9);assert.equal(next.quantity,300);
 const draft=records.map(r=>r.id==="today"?{...r,status:"draft"}:r),pending=taskDailyGuide(draft,"ann","a","2026-10-27");assert.equal(pending.otherQuantity,0);assert.equal(pending.reportedQuantity,0);
 assert.equal(taskDailyGuide(records,"other","a","2026-10-27").status,"pending");
});
test("daily task goals respect alternating Saturdays and personal exclusions",()=>{
 const records=fixture();assert.equal(taskDailyGuide(records,"ann","a","2026-10-31").status,"excluded");assert.equal(taskDailyGuide(records,"ann","a","2026-11-01").status,"excluded");
 records.push(row("skip","kpi-exclusion",{},{owner_id:"ann",date:"2026-10-27",status:"active"}));const skipped=taskDailyGuide(records,"ann","a","2026-10-27");assert.equal(skipped.target,0);assert.equal(skipped.status,"excluded");assert.equal(skipped.endId,null);
});
