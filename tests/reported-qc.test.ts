import {test} from "node:test";
import assert from "node:assert/strict";
import {reportedQc,reportedQcStats} from "../lib/reported-qc.ts";
import {dailyKpi,weeklyKpi} from "../lib/kpi.ts";
import {buildWeeklySummary,weeklyDayProgress,weeklySummarySheets} from "../lib/weekly-summary.ts";
import {buildTeamEvaluation} from "../lib/evaluation.ts";
const activity=(extra:any={})=>({version:1,verifiedBy:"member-0",jobs:null,jobIds:[],cuboids:660,kpiCuboids:660,checkedIds:null,note:"",...extra});
const member:any={id:"qa",name:"QA",email:"qa@example.test",role:"QA/QC",state:"active"};
const report=(data:any):any=>({id:"d",kind:"daily",owner_id:"qa",date:"2026-10-28",status:"imported",data:{lines:[{taskId:"",activity:"qc",quantity:0,minutes:null,rework:0}],...data}});
test("only Lead-verified QC cuboids count toward KPI; raw QC, scoped reports and invalid credits do not",()=>{
 const d=report({qcActivity:activity()});assert.equal(dailyKpi(d,[]).quantity,660);assert.equal(dailyKpi(d,[]).applicable,true);assert.equal(weeklyKpi("qa",[d],"2026-10-29").quantity,660);
 for(const qcActivity of [undefined,activity({verifiedBy:"qa"}),activity({kpiCuboids:1000}),activity({jobs:-1}),activity({cuboids:-1})])assert.equal(dailyKpi(report({qcActivity}),[]).quantity,0);
 assert.equal(dailyKpi(report({qcActivity:activity(),scoped:true}),[]).quantity,0);assert.equal(reportedQcStats(d,[]).jobs,null);
});
test("reported QC jobs merge with actual results without counting the same jobs twice or inventing results",()=>{
 const d=report({qcActivity:activity({jobs:2,jobIds:["1230"],cuboids:null,kpiCuboids:0})});
 assert.equal(reportedQcStats(d,[]).jobs,2);assert.equal(reportedQcStats(d,[]).rounds,2);
 assert.equal(reportedQcStats(d,["1230","1230"]).jobs,2);assert.equal(reportedQcStats(d,["1230","1230"]).rounds,3);
 assert.equal(reportedQcStats(d,["1230","1199"]).rounds,2);
 const known=report({qcActivity:activity({jobs:1,jobIds:["1230"],cuboids:null,kpiCuboids:0})});assert.equal(reportedQcStats(known,["1199"]).jobs,2);assert.equal(reportedQcStats(known,["1199"]).rounds,2);
});
test("QC-only credits agree across Daily Report, weekly Excel and evaluation while quality/unknown IDs remain blank",()=>{
 const d=report({qcActivity:activity()}),summary=buildWeeklySummary([member],[d],"2026-10-26","2026-10-29"),row=summary.rows[0],day=row.daily.find(d=>d.date==="2026-10-28")!,evaluation=buildTeamEvaluation([member],[d],"2026-10-26","2026-10-29")[0];
 assert.equal(row.quantity,660);assert.equal(day.quantity,660);assert.equal(weeklyDayProgress(row,day),"660/—");assert.equal(row.qcRounds,0);assert.equal(row.quality,null);assert.equal(evaluation.quantity,660);assert.equal(evaluation.qcPerformed,0);assert.equal(summary.qcEvents.length,0);assert.equal(summary.qcReported[0].cuboids,660);
 const sheets=weeklySummarySheets(summary);assert.equal(sheets[0].rows[1][5],"660/—");assert.equal(sheets[0].rows[1][8],660);assert.ok(sheets[2].rows[1].includes("QC theo báo cáo"));assert.equal(reportedQc(d)!.checkedIds,null);
});
