import {test} from "node:test";
import assert from "node:assert/strict";
import {kpiDayPolicy,kpiDayTarget,dailyKpi,weeklyKpi,cumulativeKpi} from "../lib/kpi.ts";
import {buildWeeklySummary,weeklySummarySheets} from "../lib/weekly-summary.ts";
import {buildTeamEvaluation} from "../lib/evaluation.ts";
const member:any={id:"ann",name:"Annotator",email:"ann@example.test",role:"Annotator",state:"active"};
const record=(id:string,kind:string,data:any,extra:any={}):any=>({id,kind,data,created_at:"2026-10-29T02:00:00Z",...extra});
const policy=(day:string,includeTarget:boolean,includeProduction:boolean,owner_id:string|null="ann")=>record("policy-"+(owner_id||"team")+day,"kpi-exclusion",{enabled:!includeTarget,excludeProduction:!includeProduction,policyVersion:2},{owner_id,date:day,status:includeTarget&&includeProduction?"disabled":"active"});
function fixture(){return [record("p","project",{unit:"cuboid"}),record("t","task",{assigneeId:"ann",jobId:"100"},{project_id:"p"}),...[["2026-10-26",1200],["2026-10-27",600]].map(([date,quantity])=>record("daily-"+date,"daily",{lines:[{taskId:"t",activity:"annotation",quantity,rework:0,minutes:420}]},{owner_id:"ann",date,status:"submitted"})),record("qc","daily",{lines:[{taskId:"t",activity:"qc",quantity:0}],qcActivity:{version:1,verifiedBy:"member-0",jobs:2,jobIds:[],cuboids:660,kpiCuboids:660,checkedIds:null,note:""}},{owner_id:"ann",date:"2026-10-28",status:"imported"})];}

test("all four past-day choices independently affect targets and credited quantity without modifying Daily Reports",()=>{
 for(const includeTarget of [true,false])for(const includeProduction of [true,false]){
  const records=fixture(),before=JSON.stringify(records),rules=[...records,policy("2026-10-26",includeTarget,includeProduction)],expectedQuantity=1260+(includeProduction?1200:0),expectedTarget=4800+(includeTarget?1200:0);
  const kpi=weeklyKpi("ann",rules,"2026-10-29"),summary=buildWeeklySummary([member],rules,"2026-10-26","2026-10-29"),row=summary.rows[0],day=row.daily.find(d=>d.date==="2026-10-26")!;
  assert.equal(kpi.quantity,expectedQuantity);assert.equal(kpi.target,expectedTarget);assert.equal(row.quantity,expectedQuantity);assert.equal(row.target,expectedTarget);
  assert.equal(day.quantity,1200);assert.equal(day.includeProduction,includeProduction);assert.equal(day.includeTarget,includeTarget);assert.equal(dailyKpi(records[2],rules).quantity,1200);
  assert.equal(cumulativeKpi("ann",rules,"2026-10-29").quantity,expectedQuantity);assert.equal(buildTeamEvaluation([member],rules,"2026-10-26","2026-10-29")[0].quantity,expectedQuantity);
  assert.equal(JSON.stringify(records),before);
 }
});
test("personal include rules override team exclusions; other members remain excluded, and QC credit follows the production switch",()=>{
 const records=[...fixture(),policy("2026-10-26",false,false,null),policy("2026-10-26",true,true),policy("2026-10-28",true,false)];
 assert.deepEqual(kpiDayPolicy("2026-10-26","ann",records),{includeTarget:true,includeProduction:true});
 assert.deepEqual(kpiDayPolicy("2026-10-26","other",records),{includeTarget:false,includeProduction:false});
 assert.equal(kpiDayTarget("2026-10-26","ann",records),1200);assert.equal(weeklyKpi("ann",records,"2026-10-29").quantity,1800);
 assert.equal(dailyKpi(records.find(r=>r.id==="qc")!,records).quantity,660);
});
test("legacy goal-only exclusions preserve production; disabling a new production exclusion restores totals",()=>{
 const records=[...fixture(),record("old","kpi-exclusion",{enabled:true},{date:"2026-10-26",owner_id:"ann",status:"active"})];
 assert.deepEqual(kpiDayPolicy("2026-10-26","ann",records),{includeTarget:false,includeProduction:true});assert.equal(weeklyKpi("ann",records,"2026-10-29").quantity,2460);
 records[records.length-1]=policy("2026-10-26",true,false);assert.equal(weeklyKpi("ann",records,"2026-10-29").quantity,1260);
 records[records.length-1]=policy("2026-10-26",true,true);assert.equal(weeklyKpi("ann",records,"2026-10-29").quantity,2460);
});
test("Excel keeps daily actual production and marks the quantity excluded from weekly totals",()=>{
 const summary=buildWeeklySummary([member],[...fixture(),policy("2026-10-26",false,false)],"2026-10-26","2026-10-29"),sheets=weeklySummarySheets(summary),daySheet=sheets.find(s=>s.name==="KPI tung ngay")!,headers=daySheet.rows[0],day=daySheet.rows[1];
 assert.equal(sheets[0].rows[1][3],1200);assert.equal(sheets[0].rows[1][8],1260);assert.match(String(sheets[0].rows[1].at(-1)),/1200 cuboid không cộng KPI/);
 assert.equal(day[headers.indexOf("Cuboid đã làm")],1200);assert.equal(day[headers.indexOf("Tính mục tiêu KPI")],"Không");assert.equal(day[headers.indexOf("Cộng sản lượng KPI")],"Không");assert.equal(day[headers.indexOf("Cuboid cộng KPI")],0);
 assert.ok(sheets.every(sheet=>sheet.rows.every(row=>row.length===sheet.rows[0].length)));
});
test("a pending report excluded from credit does not block the weekly result but remains available",()=>{
 const records=fixture();records[2].data.lines[0].productionPending=true;
 const summary=buildWeeklySummary([member],[...records,policy("2026-10-26",true,false)],"2026-10-26","2026-10-29");
 assert.equal(weeklyKpi("ann",[...records,policy("2026-10-26",true,false)],"2026-10-29").pendingReports,0);
 assert.notEqual(summary.rows[0].result,"Chờ bảng đếm");assert.equal(summary.rows[0].daily[0].pending,true);
});
