import {test} from "node:test";
import assert from "node:assert/strict";
import {matrixPage,replaceFrameLogs,qcFrameRange,inFrameRange} from "../lib/qc-matrix.ts";
import {qcIdRows} from "../lib/qc-table.ts";
test("matrix keeps frame zero and gaps, combines codes, paginates and canonicalizes IDs",()=>{
 const presence={version:1 as const,frames:Array.from({length:125},(_,i)=>i),tracks:Array.from({length:70},(_,i)=>({id:String(i),label:"vehicle",present:[0,2,124]}))},warnings=[{track:"0",frame:0,check:"size"},{track:"0",frame:0,check:"scale"},{track:"0",frame:0,check:"scale"}];
 const first=matrixPage(presence,warnings,new URLSearchParams());assert.equal(first.rows.length,50);assert.equal(first.shownFrames.length,60);assert.equal(first.rows[0].cells[0].codes,"SK");assert.equal(first.rows[0].total,3);assert.deepEqual(first.rows[0].present,[0,2]);
 const last=matrixPage(presence,warnings,new URLSearchParams("page=2&framePage=3"));assert.equal(last.rows.length,20);assert.deepEqual(last.shownFrames,[120,121,122,123,124]);
 const one=matrixPage(presence,warnings,new URLSearchParams("ids=000&issuesOnly=1&check=size"));assert.equal(one.rows.length,1);assert.equal(one.rows[0].id,"0");
 assert.throws(()=>matrixPage(presence,warnings,new URLSearchParams("ids=bad")),/50 Object/);
});
test("one range log stays one record with inclusive frame matching; deleting it requires another QC verdict",()=>{
 const row=qcIdRows("1","1","Khác")[0],log={id:"range-1",frameId:"12",frameEnd:"28",code:"K",type:"Khác",severity:"minor" as const,description:"Sửa kích thước",evidence:""},changed=replaceFrameLogs(row,[log]);
 assert.equal(changed.result,"changes");assert.equal(changed.frameLogs?.length,1);assert.equal(qcFrameRange(log),"12–28");assert.ok(inFrameRange(log,12)&&inFrameRange(log,28));assert.ok(!inFrameRange(log,11));assert.equal(replaceFrameLogs(changed,[]).result,"");
});
