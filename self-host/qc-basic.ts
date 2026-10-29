import {spawn,execFile,type ChildProcess} from "node:child_process";
import {readFile,writeFile,mkdir,mkdtemp,rm} from "node:fs/promises";
import {existsSync} from "node:fs";
import {resolve,join,sep} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {Hub,ensure,today,type Member,type Row} from "../lib/domain.ts";
import {basicQcState} from "../lib/qc-basic.ts";
import {matrixPage,type MatrixPresence} from "../lib/qc-matrix.ts";
import {qcMatrixSheets} from "../lib/qc-matrix-export.ts";
import {qcIdRows} from "../lib/qc-table.ts";
import {xlsx} from "../lib/export.ts";

const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
const bounded=async(req:Request,limit:number)=>{ensure(Number(req.headers.get("Content-Length")||0)<=limit,"Tệp quá lớn",413);const reader=req.body?.getReader();ensure(reader,"Thiếu tệp dữ liệu");let size=0;const chunks:Uint8Array[]=[];for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit){await reader.cancel();ensure(false,"Tệp tối đa 25 MB",413);}chunks.push(r.value);}return Buffer.concat(chunks);};
export class BasicQcService{
 private jobs=new Map<string,{child?:ChildProcess;promise?:Promise<void>}>();
 private matrices=new Map<string,Promise<MatrixPresence>>();
 constructor(private makeHub:()=>Hub,private dataDir:string,private qcRoot:string){}
 private python(){return process.env.HUB_QC_PYTHON||join(this.qcRoot,".runtime/qc-python",process.platform==="win32"?"python.exe":"bin/python");}
 private busy(){return [...this.jobs.values()].some(v=>!v.child||v.child.exitCode===null&&v.child.signalCode===null);}
 async initialize(){const hub=this.makeHub();for(const row of await hub.rows("qc-basic"))if(row.status==="running")await hub.db.batch([hub.replace(row,{...row.data,error:"Máy chủ đã khởi động lại khi đang kiểm tra. Có thể tải lại file để chạy lại."},"failed")]);}
 private async assignment(m:Member,id:string,write=false){const hub=this.makeHub(),assignment=await hub.get(id,"qc-assignment"),task=await hub.get(assignment.task_id!,"task");const checker=m.role==="Lead"||m.role==="QA/QC"&&assignment.data.reviewerId===m.id;ensure(checker||!write&&assignment.data.assigneeId===m.id,"Không có quyền kiểm tra Job này",403);if(write)ensure(task.data.assigneeId===assignment.data.assigneeId,"Lead cần cập nhật người làm trong phân công trước",409);return{hub,assignment,task};}
 private async presence(run:Row,result:any):Promise<MatrixPresence>{
  if(result.matrix)return result.matrix;
  if(this.matrices.has(run.id))return this.matrices.get(run.id)!;
  const promise=(async()=>{
   const file=await this.makeHub().get(run.data.excelFileId,"file");ensure(/^files\/[a-f0-9-]{36}$/.test(file.data.key),"Không tìm thấy Excel ma trận",409);
   const key="matrix-"+run.id;
   try{return await new Promise<MatrixPresence>((done,reject)=>{const child=execFile(this.python(),["-I","-X","utf8",join(this.qcRoot,"tool-qc/matrix_reader.py"),join(this.dataDir,file.data.key)],{windowsHide:true,timeout:20000,maxBuffer:12*1024*1024,encoding:"utf8"},(error,stdout,stderr)=>{if(error){reject(new Error((stderr||"Không đọc được Matrix trong Excel cũ.").slice(0,1000)));return;}try{done(JSON.parse(stdout));}catch{reject(new Error("Ma trận cũ không hợp lệ."));}});this.jobs.set(key,{child});});}finally{this.jobs.delete(key);}
  })();
  this.matrices.set(run.id,promise);if(this.matrices.size>3)this.matrices.delete(this.matrices.keys().next().value!);
  void promise.catch(()=>this.matrices.delete(run.id));return promise;
 }
 async handle(req:Request,m:Member){
  const url=new URL(req.url),action=url.pathname.split("/qc-basic/")[1];
  if(action==="matrix-export"&&req.method==="GET"){
   const hub=this.makeHub(),session=await hub.get(url.searchParams.get("sessionId")||"","qc-session"),checker=m.role==="Lead"||m.role==="QA/QC"&&session.data.reviewerId===m.id;
   ensure(checker||session.status==="completed"&&session.data.assigneeId===m.id,"Chỉ người QC được giao hoặc Lead được xuất nháp; annotator xem kết quả đã hoàn tất của mình",403);
   ensure(["in_progress","completed"].includes(session.status),"Chưa bắt đầu lượt QC này",409);
   const review=session.data.reviewId?await hub.get(session.data.reviewId,"review"):undefined;
   const assignment=(await hub.rows("qc-assignment")).find(r=>r.task_id===session.task_id&&r.data.assigneeId===session.data.assigneeId),runId=review?.data.matrixRunId||session.data.matrixRunId||assignment?.data.basicCompletedRunId;
   let presence:MatrixPresence|null=null,warnings:any[]=[];
   if(runId){const run=await hub.get(runId,"qc-basic");ensure(run.task_id===session.task_id&&run.owner_id===session.data.assigneeId,"File không thuộc lượt QC này",403);ensure(/^files\/[a-f0-9-]{36}$/.test(run.data.resultKey||""),"Kết quả chưa sẵn sàng",409);const result=JSON.parse(await readFile(join(this.dataDir,run.data.resultKey),"utf8"));presence=await this.presence(run,result);warnings=result.rows;}
   let sheets;try{const source=!review&&!session.data.draft?{...session,data:{...session.data,draft:{idChecks:qcIdRows(session.data.rangeStart,session.data.endId,"Khác")}}}:session;sheets=qcMatrixSheets(source,review,presence,warnings);}catch(e){ensure(false,e instanceof Error?e.message:"Không xuất được ma trận");}
   const bytes=xlsx(sheets!);return new Response(bytes as BodyInit,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="QC_Matrix_${String(session.data.jobId||"Job").replace(/[^a-zA-Z0-9_-]/g,"_")}_${session.date}${review?"":"_draft"}.xlsx"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }
  if(action==="environment"&&req.method==="GET")return json({ready:existsSync(this.python())&&existsSync(join(this.qcRoot,"tool-qc/web_runner.py"))});
  if(["result","matrix"].includes(action)&&req.method==="GET"){
   const hub=this.makeHub(),run=await hub.get(url.searchParams.get("id")||"","qc-basic");await this.assignment(m,run.data.assignmentId);ensure(run.data.resultKey,"Kết quả chưa sẵn sàng",409);
   ensure(/^files\/[a-f0-9-]{36}$/.test(run.data.resultKey),"Mã tệp kết quả không hợp lệ");const result=JSON.parse(await readFile(join(this.dataDir,run.data.resultKey),"utf8"));
   if(action==="matrix"){const presence=await this.presence(run,result);try{return json(matrixPage(presence,result.rows,url.searchParams));}catch(e){ensure(false,e instanceof Error?e.message:"Bộ lọc ma trận không hợp lệ");}}
   const check=url.searchParams.get("check")||"",track=(url.searchParams.get("track")||"").trim(),frame=(url.searchParams.get("frame")||"").trim();
   const from=url.searchParams.get("fromFrame"),to=url.searchParams.get("toFrame"),primary=url.searchParams.get("primary")==="1";
   ensure((!from||/^\d{1,9}$/.test(from))&&(!to||/^\d{1,9}$/.test(to))&&(!from||!to||Number(from)<=Number(to)),"Phạm vi frame không hợp lệ");
   const filtered=result.rows.filter((r:any)=>(!check||r.check===check)&&(!track||String(r.track)===track||!primary&&String(r.other)===track)&&(!frame||String(r.frame)===frame)&&(!from||r.frame>=Number(from))&&(!to||r.frame<=Number(to)));
   const requested=Number(url.searchParams.get("page")||1),page=Math.min(Math.max(1,Number.isSafeInteger(requested)?requested:1),Math.max(1,Math.ceil(filtered.length/25)));
   return json({summary:result.summary,config:result.config,rows:filtered.slice((page-1)*25,page*25),total:filtered.length,page,pages:Math.max(1,Math.ceil(filtered.length/25))});
  }
  if(action==="complete"&&req.method==="POST"){
   const body=JSON.parse((await bounded(req,16384)).toString("utf8")),hub=this.makeHub(),run=await hub.get(String(body.id||""),"qc-basic"),{assignment}=await this.assignment(m,run.data.assignmentId,true);
   ensure(run.status==="ready"&&assignment.data.basicRunId===run.id,"Chọn kết quả mới nhất đã chạy xong",409);ensure(body.reviewed===true,"Cần xác nhận đã xem kết quả trước khi QC chi tiết");ensure(typeof(body.note||"")==="string"&&(body.note||"").length<=10000,"Nhận xét tối đa 10.000 ký tự");
   await hub.commit(m,"Hoàn tất bước Tool_QC cơ bản",run,"qc-basic",{...run.data,reviewedBy:m.id,reviewedAt:hub.stamp(),note:body.note||""},{status:"completed"},[hub.replace(assignment,{...assignment.data,basicCompletedRunId:run.id})]);return json({ok:true});
  }
  if(action==="run"&&req.method==="POST"){
   ensure(!this.busy(),"Tool_QC đang xử lý một file khác. Chờ hoàn tất rồi thử lại.",409);
   const bytes=await bounded(req,26*1024*1024),form=await new Response(bytes,{headers:{"Content-Type":req.headers.get("Content-Type")||""}}).formData(),{hub,assignment,task}=await this.assignment(m,String(form.get("assignmentId")||""),true);
   const file=form.get("file") as File,offset=Number(form.get("trackOffset")??1),reason=String(form.get("reason")||"").trim();ensure(file&&typeof file.arrayBuffer==="function"&&file.size>0&&file.size<=25*1024*1024&&/\.(json|zip)$/i.test(file.name),"Chọn file Datumaro .json hoặc .zip, tối đa 25 MB");ensure([0,1].includes(offset),"Offset Track ID chỉ nhận 0 hoặc 1");
   const state=basicQcState(await hub.rows(),assignment);ensure(!state.latest||state.latest.status!=="running","Job đang chạy Tool_QC",409);if(state.runs.some(r=>["ready","completed"].includes(r.status))){hub.lead(m);ensure(reason.length>=3&&reason.length<=1000,"Lead cần ghi lý do chạy lại (3–1.000 ký tự)");}
   ensure(existsSync(this.python()),"Máy host chưa cài bộ chạy Tool_QC. Lead xem hướng dẫn cài Python/openpyxl.",503);
   const id=randomUUID(),input=Buffer.from(await file.arrayBuffer()),name=file.name.replace(/[\\/\u0000-\u001f]/g,"_").slice(0,180),data={assignmentId:assignment.id,assigneeId:assignment.data.assigneeId,reviewerId:assignment.data.reviewerId,taskCode:task.data.code||"",jobId:task.data.jobId||"",fileName:name,fileHash:createHash("sha256").update(input).digest("hex"),trackOffset:offset,requestedBy:m.id,startedAt:hub.stamp(),reason};
   // Claim before awaiting I/O so two requests cannot start concurrent processes.
   ensure(!this.busy(),"Tool_QC đang bận",409);this.jobs.set(id,{});
   try{await hub.db.batch([hub.insert("qc-basic",id,data,{owner_id:assignment.data.assigneeId,task_id:task.id,project_id:task.project_id,date:today(hub.now),status:"running"}),hub.replace(assignment,{...assignment.data,basicRunId:id}),hub.audit(m.id,"Chạy Tool_QC cơ bản lần đầu",id,null,{assignmentId:assignment.id,fileHash:data.fileHash,fileName:name,reason})]);}
   catch(e){this.jobs.delete(id);throw e;}
   const promise=this.execute(id,input,m,task);this.jobs.get(id)!.promise=promise;void promise.finally(()=>this.jobs.delete(id));return json({ok:true,id},202);
  }
  return json({error:"Không tìm thấy"},404);
 }
 private async execute(id:string,input:Buffer,actor:Member,task:Row){
  const workRoot=resolve(this.dataDir,"qc-work");let dir="";
  try{
   await mkdir(workRoot,{recursive:true,mode:0o700});dir=await mkdtemp(join(workRoot,"run-"));await writeFile(join(dir,"input"),input,{mode:0o600});const run=await this.makeHub().get(id,"qc-basic");
   await new Promise<void>((done,reject)=>{const child=spawn(this.python(),["-I","-X","utf8",join(this.qcRoot,"tool-qc/web_runner.py"),join(dir,"input"),join(dir,"result.json"),join(dir,"report.xlsx"),String(run.data.trackOffset)],{windowsHide:true,shell:false,stdio:["ignore","pipe","pipe"]});this.jobs.get(id)!.child=child;let error="";child.stderr?.on("data",v=>{if(error.length<4000)error+=v.toString();});child.stdout?.resume();const timeout=setTimeout(()=>{child.kill();reject(new Error("Kiểm tra vượt 120 giây. Hãy chia nhỏ dữ liệu rồi thử lại."));},120000);child.once("error",reject);child.once("close",code=>{clearTimeout(timeout);code===0?done():reject(new Error(error.trim()||"Tool_QC không xử lý được file. Kiểm tra định dạng Datumaro."));});});
   const hub=this.makeHub(),result=await readFile(join(dir,"result.json")),excel=await readFile(join(dir,"report.xlsx")),parsed=JSON.parse(result.toString("utf8")),current=await hub.get(id,"qc-basic"),statements=[],keys=[];
   await mkdir(join(this.dataDir,"files"),{recursive:true,mode:0o700});
   for(const [bytes,name] of [[input,current.data.fileName],[result,"tool-qc-result.json"],[excel,`Tool_QC_Job_${current.data.jobId||task.id}.xlsx`]] as [Buffer,string][]){const fileId=randomUUID(),key="files/"+fileId;await writeFile(join(this.dataDir,key),bytes,{flag:"wx",mode:0o600});keys.push({id:fileId,key});statements.push(hub.insert("file",fileId,{name,size:bytes.length,key,entityId:task.id,basicRunId:id},{owner_id:current.owner_id,task_id:task.id,project_id:task.project_id}));}
   await hub.commit(actor,"Tool_QC đã xử lý xong",current,"qc-basic",{...current.data,completedAt:hub.stamp(),summary:parsed.summary,inputFileId:keys[0].id,resultFileId:keys[1].id,resultKey:keys[1].key,excelFileId:keys[2].id},{status:"ready"},statements);
  }catch(e){try{const hub=this.makeHub(),run=await hub.get(id,"qc-basic");await hub.commit(actor,"Tool_QC không hoàn tất",run,"qc-basic",{...run.data,error:(e instanceof Error?e.message:"Không xử lý được file").slice(0,2000)},{status:"failed"});}catch(error){console.error("Cannot save Tool_QC failure",error instanceof Error?error.message:"unknown");}}
  finally{if(dir&&dir.startsWith(workRoot+sep))await rm(dir,{recursive:true,force:true}).catch(()=>{});}
 }
 async close(){for(const value of this.jobs.values())value.child?.kill();await Promise.allSettled([...this.jobs.values()].map(v=>v.promise));}
}
