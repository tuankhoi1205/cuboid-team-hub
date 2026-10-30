import {spawn,type ChildProcess} from "node:child_process";
import {readFile,writeFile,mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve,join,sep} from "node:path";
import {createHash,randomUUID} from "node:crypto";
import {Hub,ensure,today,type Member,type Row} from "../lib/domain.ts";
import {keyframeComparisons,type KeyframeProduction} from "../lib/keyframe-kpi.ts";
import {xlsx} from "../lib/export.ts";
import {datumaroLedger,completedThrough,DATUMARO_METHOD,type DatumaroLedger} from "../lib/datumaro-kpi.ts";
import {taskDailyGuide} from "../lib/task-kpi-guide.ts";
import {qcPython,qcPythonEnvironment} from "./python-runtime.ts";
import {previewMatchesTask} from "../lib/task-datumaro-scope.ts";

const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
async function bytes(req:Request,limit:number){ensure(Number(req.headers.get("Content-Length")||0)<=limit,"Tệp quá lớn",413);const reader=req.body?.getReader();ensure(reader,"Thiếu dữ liệu");const chunks:Uint8Array[]=[];let size=0;for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>limit){await reader.cancel();ensure(false,"Tệp tối đa 25 MB",413);}chunks.push(r.value);}return Buffer.concat(chunks);}
export class KpiCountService{
 private jobs=new Map<string,{child?:ChildProcess;promise?:Promise<void>}>();
 private busy(){return [...this.jobs.values()].some(job=>!job.child||job.child.exitCode===null&&job.child.signalCode===null);}
 constructor(private makeHub:()=>Hub,private dataDir:string,private root:string){}
 private python(){return qcPython(this.root);}
 async initialize(){const hub=this.makeHub();for(const run of await hub.rows("kpi-count"))if(run.status==="running")await hub.db.batch([hub.replace(run,{...run.data,error:"Máy chủ khởi động lại; tải lại file để đếm tiếp."},"failed")]);}
 private async task(m:Member,id:string){const hub=this.makeHub(),task=await hub.get(id,"task");ensure(task.data.assigneeId===m.id||m.role==="Lead"||m.role==="QA/QC"&&(task.data.reviewerId===m.id||(await hub.rows("qc-assignment")).some(r=>r.task_id===id&&r.data.reviewerId===m.id)),"Không có quyền xem hoặc đếm Job này",403);return{hub,task};}
 private async result(run:Row){ensure(/^files\/[a-f0-9-]{36}$/.test(run.data.resultKey||""),"Kết quả chưa sẵn sàng",409);return JSON.parse(await readFile(join(this.dataDir,run.data.resultKey),"utf8"));}
 async handle(req:Request,m:Member){
  const url=new URL(req.url),action=url.pathname.split("/kpi-count/")[1];
  if(["result","export"].includes(action)&&req.method==="GET"){
   const hub=this.makeHub(),run=await hub.get(url.searchParams.get("id")||"");ensure(["kpi-count","qc-basic"].includes(run.kind),"Sai loại kết quả");const preview=!!run.data.assignmentPreview&&!run.task_id;
   let task:Row;if(preview){hub.lead(m);task={...run,id:run.data.editTaskId||"preview-"+run.id,data:{code:run.data.taskCode,jobId:run.data.jobId,assigneeId:run.owner_id}};if(!["ready","completed"].includes(run.status)){ensure(action!=="export","File chưa sẵn sàng",409);return json({status:run.status,error:run.data.error||""});}}else{task=(await this.task(m,run.task_id!)).task;ensure(run.owner_id===task.data.assigneeId,"Kết quả thuộc người làm trước của Job",409);}
   const result=await this.result(run),production:KeyframeProduction=result.production;ensure(production,"Kết quả cũ chưa có thống kê keyframe; tải file vào bộ đếm mới",409);
   const records=await hub.rows(),source=preview?undefined:records.find(r=>r.kind==="kpi-source"&&r.task_id===task.id&&r.owner_id===run.owner_id&&r.status==="active");
   let ledger:DatumaroLedger|undefined,ledgerError="";
   if(production.format==="datumaro")try{ensure(!source||source.data.production.basis===DATUMARO_METHOD,"Job đang dùng cách đếm khác; không tự thay mốc tính KPI",409);ledger=datumaroLedger(production,{runId:run.id,fileHash:run.data.fileHash,fileName:run.data.fileName},source?.data.production,completedThrough(records,run.owner_id!,task.id));}catch(e){ledgerError=e instanceof Error?e.message:"Không đối chiếu được file";}
   const counted=ledger||production,comparisons=keyframeComparisons(records,run.owner_id!,task.id,counted);
   if(action==="export")return new Response(xlsx([
    ledger?{name:"Cuboid theo ID",rows:[["Object ID","Class / Label","Mốc ban đầu","ID mới được tính","Cuboid tính KPI","Cuboid trong file hiện tại"],...ledger.ids.map(r=>[r.id,r.label,r.baselineCount,r.addedCount,r.credit,r.currentCount])]}:{name:"Cuboid theo ID",rows:[["Object ID","Class / Label","Keyframe hiện","Keyframe outside","Tổng cuboid keyframe","Nội suy không tính","Thiếu cờ","Frame đầu","Frame cuối"],...production.ids.map(r=>[r.id,r.label,r.visible,r.outside,r.keyframes,r.interpolated,r.unknown,r.firstFrame,r.lastFrame])]},
    {name:"Doi chieu Daily Report",rows:[["Ngày","Job ID","Mốc trước","ID làm tới","Từ ID","Đến ID","Số ID có trong file","Cuboid đã lưu","Keyframe theo file","Trong đó outside","Chênh lệch","Kết quả","File lúc lưu KPI"],...comparisons.map(r=>[r.date,task.data.jobId,r.previousEnd,r.endId,r.start,r.end,r.countedIds,r.savedQuantity,r.quantity,r.outside,r.difference,r.error||(!r.difference?"Khớp":"Cần đối chiếu"),r.snapshot?.fileHash||""])]},
    {name:"Luu y",rows:[["Nội dung","Chi tiết"],["File",run.data.fileName],["SHA-256",run.data.fileHash],["Định dạng",production.format],["Object ID",production.mapping],["KPI cũ","Chỉ đối chiếu, không tự sửa sản lượng đã lưu"],["Cách tính",ledger?"Giữ số cuboid/ID ở file ban đầu + số cuboid của ID mới. File sau giảm do outside không trừ mốc ban đầu. ID mới lấy số lớn nhất đã thấy trước khi báo hoàn thành; không cộng trùng qua các file.":"1 cặp Object ID/frame keyframe = 1 cuboid; gồm outside, bỏ nội suy, không nhân hệ số"],["Định danh","Cần cùng Job, cùng phạm vi frame và Object ID ổn định. Không tự nhận diện việc đánh lại số ID."],["Prelabel","Đếm khối lượng ID khai hoàn thành, không chứng minh ai chỉnh box"],["Đối chiếu",ledgerError||"Đã đọc file"],...production.issues.map(s=>["Cần kiểm tra",s])]},
   ]) as any,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="Keyframe_KPI_Job_${String(task.data.jobId||"job").replace(/\D/g,"")}.xlsx"`,"Cache-Control":"private, no-store"}});
   const track=(url.searchParams.get("track")||"").trim(),ids=counted.ids.filter(r=>!track||String(r.id)===track),pages=Math.max(1,Math.ceil(ids.length/25)),requested=Number(url.searchParams.get("page")||1),page=Math.min(pages,Math.max(1,Number.isSafeInteger(requested)?requested:1));
   const {ids:_,...summary}=production;
   const accounting=ledger?{...((({ids:_,...rest})=>rest)(ledger)),idCount:ledger.ids.length}:null;
   let guide=null;if(preview&&ledger){const owner=url.searchParams.get("memberId"),day=url.searchParams.get("day")||today(hub.now);ensure(/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day,"Ngày gợi ý không hợp lệ");if(owner){ensure((await hub.members()).some(v=>v.id===owner&&v.state!=="disabled"),"Thành viên không hợp lệ");guide=taskDailyGuide(records,owner,task.id,day,ledger);}}
   return json({status:run.status,guide,assignmentContext:preview?{projectId:run.project_id,taskCode:run.data.taskCode||"",jobId:run.data.jobId||"",editTaskId:run.data.editTaskId||""}:undefined,production:{...summary,idCount:production.ids.length},accounting,ledgerError,sourceRevision:source?.revision||0,ids:ids.slice((page-1)*25,page*25),total:ids.length,page,pages,comparisons});
  }
  if(action==="assign"&&req.method==="POST"){
   const hub=this.makeHub();hub.lead(m);const body=JSON.parse((await bytes(req,65536)).toString("utf8")),run=await hub.get(String(body.runId||""),"kpi-count"),input=body.task;
   ensure(run.data.assignmentPreview&&!run.task_id&&run.owner_id===m.id,"Chọn file xem trước do Lead tải khi giao task",403);ensure(body.matched===true,"Cần xác nhận file ban đầu đúng Job và Object ID trước khi giao");ensure(input&&typeof input==="object","Thiếu thông tin phân công");
   const assignmentHash=createHash("sha256").update(JSON.stringify(input)).digest("hex");if(run.data.assignedTaskId){ensure(run.data.assignmentHash===assignmentHash,"File này đã gắn vào task. Mở task đã lưu để cập nhật.",409);await hub.get(run.data.assignedTaskId,"task");return json({ok:true,id:run.data.assignedTaskId,reused:true});}
   ensure(run.status==="ready","Chờ đếm file xong trước khi giao task",409);ensure(previewMatchesTask({projectId:run.project_id,taskCode:run.data.taskCode,jobId:run.data.jobId,editTaskId:run.data.editTaskId},input),"Thông tin Task/Job đã đổi sau khi tải file. Đếm lại file đúng bài trước khi lưu.",409);
   try{
   const {production:raw}=await this.result(run) as {production:KeyframeProduction},assignedRunId=randomUUID();let production:DatumaroLedger;try{production=datumaroLedger(raw,{runId:assignedRunId,fileHash:run.data.fileHash,fileName:run.data.fileName});}catch(e){ensure(false,e instanceof Error?e.message:"File Datumaro không hợp lệ",409);}
   ensure(production.creditTotal>0,"File chưa có cuboid để giao");const plan=await hub.planTask(m,{...input,quantity:production.creditTotal,frameCount:production.scopeFrames.length||production.frames});
   ensure(!(await hub.rows("kpi-source")).some(r=>r.task_id===plan.id&&r.owner_id===plan.data.assigneeId&&r.status==="active"),"Job đã có file ban đầu. Dùng cập nhật ID mới để giữ mốc cũ.",409);
   const statements=[...plan.statements],fileIds:string[]=[];
   for(const sourceId of [run.data.inputFileId,run.data.resultFileId,run.data.excelFileId]){const file=await hub.get(sourceId,"file"),fileId=randomUUID();fileIds.push(fileId);statements.push(hub.insert("file",fileId,{...file.data,entityId:plan.id,countRunId:assignedRunId},{owner_id:plan.data.assigneeId,task_id:plan.id,project_id:plan.projectId}));}
   const assignedData={...run.data,assignmentPreview:false,editTaskId:undefined,taskCode:plan.data.code,jobId:plan.data.jobId,inputFileId:fileIds[0],resultFileId:fileIds[1],excelFileId:fileIds[2],appliedSourceRevision:1,appliedAt:hub.stamp()};
   statements.push(hub.insert("kpi-count",assignedRunId,assignedData,{owner_id:plan.data.assigneeId,task_id:plan.id,project_id:plan.projectId,date:run.date,status:"ready"}),hub.insert("kpi-source",randomUUID(),{runId:assignedRunId,fileHash:run.data.fileHash,fileName:run.data.fileName,capturedDate:run.date,confirmedBy:m.id,confirmedAt:hub.stamp(),production},{owner_id:plan.data.assigneeId,task_id:plan.id,project_id:plan.projectId,natural_key:plan.id+":"+plan.data.assigneeId,status:"active"}),hub.replace(run,{...run.data,assignedTaskId:plan.id,assignmentHash,assignedRunId},"completed"),hub.audit(m.id,"Gắn file Datumaro ban đầu khi giao task",plan.id,null,{runId:assignedRunId,fileHash:run.data.fileHash,idCount:production.ids.length,cuboids:production.creditTotal}));
   await hub.db.batch(statements);return json({ok:true,id:plan.id});
   }catch(error){const current=await hub.get(run.id,"kpi-count");if(current.data.assignedTaskId){ensure(current.data.assignmentHash===assignmentHash,"File đã được dùng trong một phân công khác. Làm mới trước khi lưu.",409);return json({ok:true,id:current.data.assignedTaskId,reused:true});}if(/constraint|UNIQUE|NOT NULL/i.test(error instanceof Error?error.message:""))ensure(false,"Phân công đã thay đổi. Làm mới và kiểm tra task đã lưu trước khi thử lại.",409);throw error;}
  }
  if(action==="confirm"&&req.method==="POST"){
   const body=JSON.parse((await bytes(req,16384)).toString("utf8")),hub=this.makeHub(),run=await hub.get(String(body.id||""));ensure(["kpi-count","qc-basic"].includes(run.kind)&&["ready","completed"].includes(run.status),"Kết quả chưa sẵn sàng",409);const {task}=await this.task(m,run.task_id!);
   ensure(run.owner_id===task.data.assigneeId,"Người làm Job đã thay đổi",409);ensure(body.matched===true,"Cần đối chiếu Job và Object ID trong file với CVAT trước khi dùng tính KPI");
   const {production:raw}=await this.result(run) as {production:KeyframeProduction};
   const sources=(await hub.rows("kpi-source")).filter(r=>r.task_id===task.id&&r.owner_id===run.owner_id),old=sources[0];
   ensure(!run.data.appliedSourceRevision||old?.data.runId===run.id,"File này đã được dùng trước đây. Chọn bảng đang dùng hoặc tải file cập nhật mới.",409);
   const latest=(await hub.rows("kpi-count")).filter(r=>r.task_id===task.id&&r.owner_id===run.owner_id&&["ready","completed"].includes(r.status)).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
   ensure(!latest||latest.id===run.id||run.created_at>=latest.created_at,"Đã có file đếm mới hơn; chọn kết quả mới nhất",409);
   let production=raw;
   if(raw?.format==="datumaro"){
    ensure(body.sourceRevision===(old?.revision||0),"Mốc đếm đã đổi. Làm mới bảng đối chiếu trước khi xác nhận.",409);
    if(!old)ensure(m.role==="Lead","Chỉ Lead được xác nhận file ban đầu của Job",403);
    ensure(!old||old.data.production.basis===DATUMARO_METHOD,"Job đang dùng cách đếm khác; không tự thay mốc tính KPI",409);
    try{production=datumaroLedger(raw,{runId:run.id,fileHash:run.data.fileHash,fileName:run.data.fileName},old?.data.production,completedThrough(await hub.rows(),run.owner_id!,task.id));}catch(e){ensure(false,e instanceof Error?e.message:"Không đối chiếu được file",409);}
   }else{ensure(raw?.usable&&raw.completeOutside,"File chưa đủ dữ liệu outside/keyframe; chỉ dùng đối chiếu, không chốt KPI",409);ensure(!old||old.data.production.basis!==DATUMARO_METHOD,"Giữ file ban đầu Datumaro; không tự đổi cách tính KPI",409);}
   if(old?.data.runId===run.id)return json({ok:true,reused:true});
   const data={runId:run.id,fileHash:run.data.fileHash,fileName:run.data.fileName,capturedDate:run.date,confirmedBy:m.id,confirmedAt:hub.stamp(),production};
   await hub.commit(m,"Xác nhận bảng cuboid theo ID của Job",old||null,"kpi-source",data,{owner_id:run.owner_id,task_id:task.id,project_id:task.project_id,natural_key:task.id+":"+run.owner_id,status:"active"},[hub.replace(run,{...run.data,appliedSourceRevision:(old?.revision||0)+1,appliedAt:hub.stamp()})]);
   return json({ok:true});
  }
  if(["run","preview"].includes(action)&&req.method==="POST"){
   ensure(!this.busy(),"Bộ đếm đang xử lý file khác. Chờ hoàn tất rồi thử lại.",409);
   const form=await new Response(await bytes(req,26*1024*1024),{headers:{"Content-Type":req.headers.get("Content-Type")||""}}).formData(),hub=this.makeHub(),preview=action==="preview";let task:Row|null=null;
   if(preview)hub.lead(m);else task=(await this.task(m,String(form.get("taskId")||""))).task;
   const projectId=task?.project_id||String(form.get("projectId")||""),project=await hub.get(projectId,"project");ensure(project.data.unit==="cuboid"&&project.status==="active","Bộ đếm chỉ áp dụng cho dự án cuboid đang hoạt động");
   const taskCode=task?.data.code||String(form.get("code")||"").trim(),jobId=task?.data.jobId||String(form.get("jobId")||"").trim(),editTaskId=preview?String(form.get("editTaskId")||""):"";if(preview){ensure(taskCode.length<=500&&/^\d{0,30}$/.test(jobId),"Task ID / mã batch hoặc Job ID không hợp lệ");if(editTaskId){const old=await hub.get(editTaskId,"task");ensure(old.project_id===projectId&&old.data.code===taskCode&&(old.data.jobId||"")===jobId,"Task/Job không khớp bài đang sửa",409);}}
   const file=form.get("file") as File,offset=Number(form.get("trackOffset")??1),index=String(form.get("jobIndex")||"").trim();
   ensure(file&&typeof file.arrayBuffer==="function"&&file.size>0&&file.size<=25*1024*1024&&/\.(json|zip)$/i.test(file.name),"Chọn JSON/ZIP annotation tối đa 25 MB");ensure([0,1].includes(offset),"Offset chỉ nhận 0 hoặc 1");ensure(!index||/^\d{1,4}$/.test(index)&&Number(index)>0,"Thứ tự Job phải từ 1 đến 9.999");const runtime=await qcPythonEnvironment(this.root);ensure(runtime.ready,runtime.message,503);
   const input=Buffer.from(await file.arrayBuffer()),id=randomUUID(),data={taskCode,jobId,requestedBy:m.id,...(preview?{assignmentPreview:true,editTaskId}:{}),fileName:file.name.replace(/[\\/\u0000-\u001f]/g,"_").slice(0,180),fileHash:createHash("sha256").update(input).digest("hex"),trackOffset:offset,jobIndex:index,startedAt:hub.stamp()};
   ensure(!this.busy(),"Bộ đếm đang bận",409);this.jobs.set(id,{});
   try{await hub.db.batch([hub.insert("kpi-count",id,data,{owner_id:task?.data.assigneeId||m.id,task_id:task?.id||null,project_id:projectId,date:today(hub.now),status:"running"}),hub.audit(m.id,preview?"Xem file Datumaro trước khi giao task":"Đếm cuboid keyframe từ file",id,null,{taskId:task?.id||null,fileHash:data.fileHash})]);}catch(e){this.jobs.delete(id);throw e;}
   const promise=this.execute(id,input,m,task);this.jobs.get(id)!.promise=promise;void promise.finally(()=>this.jobs.delete(id));return json({ok:true,id},202);
  }
  return json({error:"Không tìm thấy"},404);
 }
 private async execute(id:string,input:Buffer,actor:Member,task:Row|null){
  const workRoot=resolve(this.dataDir,"kpi-work");let dir="";
  try{
   await mkdir(workRoot,{recursive:true,mode:0o700});dir=await mkdtemp(join(workRoot,"count-"));await writeFile(join(dir,"input"),input,{mode:0o600});const run=await this.makeHub().get(id);
   await new Promise<void>((done,reject)=>{const child=spawn(this.python(),["-I","-X","utf8",join(this.root,"tool-qc/count_runner.py"),join(dir,"input"),join(dir,"result.json"),join(dir,"counts.xlsx"),String(run.data.trackOffset),run.data.jobIndex],{windowsHide:true,shell:false,stdio:["ignore","pipe","pipe"]});this.jobs.get(id)!.child=child;let error="";child.stdout?.resume();child.stderr?.on("data",b=>{if(error.length<4000)error+=b.toString();});const timer=setTimeout(()=>{child.kill();reject(new Error("Đếm vượt 120 giây; chia nhỏ file theo Job."));},120000);child.once("error",reject);child.once("close",code=>{clearTimeout(timer);code===0?done():reject(new Error(error.trim()||"Không đọc được annotation."));});});
   const hub=this.makeHub(),current=await hub.get(id),result=await readFile(join(dir,"result.json")),excel=await readFile(join(dir,"counts.xlsx")),parsed=JSON.parse(result.toString("utf8")),statements=[],files=[];
   await mkdir(join(this.dataDir,"files"),{recursive:true,mode:0o700});
   for(const [data,name] of [[input,current.data.fileName],[result,"keyframe-count-result.json"],[excel,`Cuboid_Keyframe_Job_${current.data.jobId||task?.id||"preview"}.xlsx`]] as [Buffer,string][]){const fileId=randomUUID(),key="files/"+fileId;await writeFile(join(this.dataDir,key),data,{flag:"wx",mode:0o600});files.push({id:fileId,key});statements.push(hub.insert("file",fileId,{name,size:data.length,key,entityId:task?.id||current.id,countRunId:id},{owner_id:current.owner_id,task_id:task?.id||null,project_id:current.project_id}));}
   const {ids:_,...summary}=parsed.production;
   await hub.commit(actor,"Đếm keyframe hoàn tất",current,"kpi-count",{...current.data,summary,inputFileId:files[0].id,resultFileId:files[1].id,resultKey:files[1].key,excelFileId:files[2].id,completedAt:hub.stamp()},{status:"ready"},statements);
  }catch(e){try{const hub=this.makeHub(),run=await hub.get(id);await hub.commit(actor,"Không đếm được keyframe",run,"kpi-count",{...run.data,error:(e instanceof Error?e.message:"Không đọc được file").slice(0,2000)},{status:"failed"});}catch{console.error("Cannot save keyframe count failure");}}
  finally{if(dir&&dir.startsWith(workRoot+sep))await rm(dir,{recursive:true,force:true}).catch(()=>{});}
 }
 async close(){for(const job of this.jobs.values())job.child?.kill();await Promise.allSettled([...this.jobs.values()].map(job=>job.promise));}
}
