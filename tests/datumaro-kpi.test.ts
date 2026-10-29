import {test} from "node:test";
import assert from "node:assert/strict";
import {datumaroLedger,DATUMARO_METHOD,suggestDailyEnd} from "../lib/datumaro-kpi.ts";
import {keyframeQuantity,keyframeRange,type KeyframeProduction} from "../lib/keyframe-kpi.ts";
const raw=(counts:Record<number,number>):KeyframeProduction=>({version:1,format:"datumaro",datumaroUsable:true,completeOutside:false,usable:false,mapping:"track_id + 1",issues:[],duplicates:0,frames:60,scopeFrames:[0,1,2],offset:1,totals:{keyframes:0,visible:0,outside:0,interpolated:0,unknown:0},ids:Object.entries(counts).map(([id,cuboids])=>({id:Number(id),label:"vehicle",cuboids,visible:cuboids,outside:0,keyframes:cuboids,interpolated:0,unknown:0,firstFrame:0,lastFrame:2}))});
const ref=(id:string)=>({runId:id,fileHash:id,fileName:id+".json"});
const prior=(end:string,date="2026-10-24"):any=>({id:"prior",kind:"daily",owner_id:"ann",date,status:"submitted",data:{lines:[{taskId:"job",endId:end,quantity:999,activity:"annotation"}]}});

test("Datumaro retains baseline 3500 plus 200 new despite current file total 2700, and repeated uploads never add twice",()=>{
 const base=datumaroLedger(raw({1:500,2:1000,3:2000}),ref("base"));
 const update=datumaroLedger(raw({1:500,2:700,3:1300,4:200}),ref("update"),base);
 assert.equal(update.currentTotal,2700);assert.equal(update.baselineTotal,3500);assert.equal(update.addedTotal,200);assert.equal(update.creditTotal,3700);assert.equal(update.baseline.runId,"base");
 const again=datumaroLedger(raw({1:300,4:100}),ref("again"),update);assert.equal(again.creditTotal,3700);assert.equal(again.ids.find(r=>r.id===3)!.credit,2000);
 const grown=datumaroLedger(raw({1:500,2:700,3:1300,4:250,5:50}),ref("grow"),again);assert.equal(grown.creditTotal,3800);
 const frozen=datumaroLedger(raw({1:500,2:700,3:1300,4:300,5:100}),ref("freeze"),grown,4);assert.equal(frozen.ids.find(r=>r.id===4)!.credit,250);assert.equal(frozen.ids.find(r=>r.id===5)!.credit,100);
 const outside=datumaroLedger(raw({}),ref("outside"),update);assert.equal(outside.currentTotal,0);assert.equal(outside.creditTotal,3700);
 const count=keyframeQuantity(update,keyframeRange([prior("2")],"ann","job","2026-10-26","4"));assert.equal(count.quantity,2200);assert.equal(count.baseline,2000);assert.equal(count.added,200);assert.equal(count.countedIds,2);
});

test("Datumaro rejects incompatible frame scopes, offsets, malformed counts and ambiguous renumbering",()=>{
 const base=datumaroLedger(raw({1:50,3:60}),ref("base"));
 assert.throws(()=>datumaroLedger({...raw({1:20}),scopeFrames:[0,1]},ref("bad"),base),/phạm vi frame/);
 assert.throws(()=>datumaroLedger({...raw({1:20}),offset:0},ref("bad"),base),/offset/);
 assert.throws(()=>datumaroLedger(raw({1:20,2:20,3:20}),ref("bad"),base),/đánh lại số ID/);
 assert.throws(()=>datumaroLedger({...raw({1:20}),datumaroUsable:false},ref("bad"),base),/Datumaro hợp lệ/);
 assert.throws(()=>datumaroLedger(raw({1:-1}),ref("bad")),/thiếu tổng/);
 const changed=raw({1:20});changed.ids[0].label="pedestrian";assert.throws(()=>datumaroLedger(changed,ref("bad"),base),/Class/);
});

test("Daily milestone recommendation sums actual per-ID credits, dated personal KPI, other Jobs, gaps and calendar exclusions",()=>{
 const production=datumaroLedger(raw({1:100,2:200,4:400,5:500,6:600,7:300}),ref("base"));
 const records:any[]=[prior("2"),{kind:"kpi-rate",owner_id:"ann",date:"2026-10-26",status:"active",data:{quantity:600}}];
 let guide=suggestDailyEnd(records,"ann","job","2026-10-26",production);assert.equal(guide.target,600);assert.equal(guide.endId,5);assert.equal(guide.quantity,900);assert.equal(guide.start,3);
 guide=suggestDailyEnd(records,"ann","job","2026-10-27",production,300);assert.equal(guide.endId,4);assert.equal(guide.needed,300);
 assert.equal(suggestDailyEnd(records,"other","job","2026-10-26",production).endId,5); // 100+200+400+500=1200
 records.push({kind:"kpi-rate",owner_id:"ann",date:"2026-10-27",status:"active",data:{quantity:1800}});
 guide=suggestDailyEnd(records,"ann","job","2026-10-27",production);assert.equal(guide.status,"ready");assert.equal(guide.endId,7);
 records.at(-1).data.quantity=2000;guide=suggestDailyEnd(records,"ann","job","2026-10-27",production);assert.equal(guide.status,"insufficient");assert.equal(guide.shortfall,200);assert.equal(guide.endId,7);
 records.push({kind:"kpi-exclusion",owner_id:"ann",date:"2026-10-26",status:"active",data:{}});assert.equal(suggestDailyEnd(records,"ann","job","2026-10-26",production).status,"excluded");
 assert.equal(suggestDailyEnd([],"ann","job","2026-11-01",production).status,"excluded");
 assert.equal(suggestDailyEnd([],"ann","job","2026-10-26",undefined).status,"pending");
 const unknown=prior("");assert.match(suggestDailyEnd([unknown],"ann","job","2026-10-26",production).error,/thiếu mốc ID/);
 assert.equal(production.basis,DATUMARO_METHOD);
});
