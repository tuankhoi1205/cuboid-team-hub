import {execFile} from "node:child_process";
import {existsSync} from "node:fs";
import {join} from "node:path";

export function qcPython(root:string,env:Partial<NodeJS.ProcessEnv>=process.env,platform:NodeJS.Platform=process.platform){
 if(env.HUB_QC_PYTHON)return env.HUB_QC_PYTHON;
 const local=join(root,".runtime/qc-python",platform==="win32"?"python.exe":"bin/python");
 return existsSync(local)?local:platform==="win32"?"python":"python3";
}
type Runtime={ready:boolean;python?:string;openpyxl?:string;message:string};
const cache=new Map<string,{until:number;promise:Promise<Runtime>}>();
export async function qcPythonEnvironment(root:string):Promise<Runtime>{
 const python=qcPython(root),previous=cache.get(python);if(previous&&previous.until>Date.now())return previous.promise;
 const message="Máy host chưa có Python/openpyxl cho Tool_QC. Trên VPS chạy: python3 self-host/tool-qc/setup_runtime.py rồi khởi động lại dịch vụ web. Nếu đã cài, kiểm tra HUB_QC_PYTHON của dịch vụ.";
 const promise=new Promise<Runtime>(done=>{
  execFile(python,["-I","-X","utf8","-c","import sys,json,openpyxl,et_xmlfile; print(json.dumps({'python':sys.version.split()[0],'openpyxl':openpyxl.__version__}))"],{windowsHide:true,timeout:10000,maxBuffer:64*1024,encoding:"utf8"},(error,stdout)=>{
   if(error){done({ready:false,message});return;}
   try{const result=JSON.parse(stdout);done({ready:true,python:String(result.python),openpyxl:String(result.openpyxl),message:""});}catch{done({ready:false,message});}
  });
 });
 cache.set(python,{until:Date.now()+30000,promise});if(cache.size>16)cache.delete(cache.keys().next().value!);
 return promise;
}
