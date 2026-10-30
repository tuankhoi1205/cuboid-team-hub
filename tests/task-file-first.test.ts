import {test} from "node:test";
import assert from "node:assert/strict";
import {datumaroTaskScope,datumaroTaskIdentity,previewMatchesTask} from "../lib/task-datumaro-scope.ts";
test("entering identifiers and counted fields does not remount the upload while changing the project or edited task does",()=>{
 const empty={projectId:"p",code:"",jobId:""},filled={...empty,code:"123",jobId:"456",frameCount:60,quantity:1200,assigneeId:"ann"};
 assert.equal(datumaroTaskScope(empty),datumaroTaskScope(filled));assert.notEqual(datumaroTaskIdentity(empty),datumaroTaskIdentity(filled));
 assert.notEqual(datumaroTaskScope(empty),datumaroTaskScope({...empty,projectId:"other"}));assert.notEqual(datumaroTaskScope(empty),datumaroTaskScope({...empty,id:"edited"}));
 assert.equal(datumaroTaskIdentity(filled),datumaroTaskIdentity({...filled,code:" 123 ",jobId:"456 "}));
});
test("unbound file previews can be attached to identifiers later while captured identifiers, project and edited task stay protected",()=>{
 const form={projectId:"p",code:"123",jobId:"456"};assert.equal(previewMatchesTask({projectId:"p",taskCode:"",jobId:""},form),true);
 assert.equal(previewMatchesTask({projectId:"other"},form),false);assert.equal(previewMatchesTask({projectId:"p",jobId:"999"},form),false);assert.equal(previewMatchesTask({projectId:"p",taskCode:"999"},form),false);
 assert.equal(previewMatchesTask({projectId:"p",editTaskId:"a"},form),false);assert.equal(previewMatchesTask({projectId:"p",editTaskId:"a"},{...form,id:"a"}),true);
});
