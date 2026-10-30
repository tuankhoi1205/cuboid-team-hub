import {test} from "node:test";
import assert from "node:assert/strict";
import {resolve,join} from "node:path";
import {qcPython,qcPythonEnvironment} from "../self-host/python-runtime.ts";
test("Python resolution supports PATH overrides, local Windows runtime and Linux system Python fallback",()=>{
 assert.equal(qcPython("missing-root",{HUB_QC_PYTHON:"python3"},"linux"),"python3");
 assert.equal(qcPython("missing-root",{},"linux"),"python3");
 assert.equal(qcPython(resolve("self-host"),{},"win32"),join(resolve("self-host"),".runtime/qc-python/python.exe"));
});
test("runtime readiness verifies imports, not just interpreter file existence",async()=>{
 const previous=process.env.HUB_QC_PYTHON;try{
  process.env.HUB_QC_PYTHON=resolve("self-host/.runtime/qc-python/python.exe");let result=await qcPythonEnvironment(resolve("self-host"));assert.equal(result.ready,true);assert.equal(result.openpyxl,"3.1.5");
  process.env.HUB_QC_PYTHON=process.execPath;result=await qcPythonEnvironment(resolve("self-host"));assert.equal(result.ready,false);assert.match(result.message,/setup_runtime.py/);
  process.env.HUB_QC_PYTHON=resolve(".sites-runtime/missing-python-for-test");result=await qcPythonEnvironment(resolve("self-host"));assert.equal(result.ready,false);assert.match(result.message,/HUB_QC_PYTHON/);
 }finally{if(previous===undefined)delete process.env.HUB_QC_PYTHON;else process.env.HUB_QC_PYTHON=previous;}
});
