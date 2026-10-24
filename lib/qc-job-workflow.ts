import {z} from "zod";
import {ensure,today,type Hub,type Member} from "./domain.ts";
import {qcJobState} from "./qc-jobs.ts";
import {reportQcKey} from "./report-qc.ts";
import {taskFrameCount} from "./task-frames.ts";
import {reportEndId} from "./report-progress.ts";
import {basicQcState} from "./qc-basic.ts";
const id=z.string().min(1).max(200),frames=z.coerce.number().int().positive().max(100000000).nullable().optional();

export async function ensureQcAssignments(hub:Hub){
 const rows=await hub.rows(),tasks=rows.filter(r=>r.kind==="task"),statements=[];
 for(const task of tasks){
  if(rows.some(r=>r.kind==="qc-assignment"&&r.task_id===task.id))continue;
  const sessions=rows.filter(r=>r.kind==="qc-session"&&r.task_id===task.id).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)),last=sessions.find(r=>r.status==="in_progress")||sessions[0];if(!last)continue;
  const data={reviewerId:last.data.reviewerId,assigneeId:task.data.assigneeId,assignedBy:last.data.assignedBy,assignedAt:last.data.assignedAt,note:last.data.assignmentNote||"",lastSessionId:last.id,migrated:true},stamp=hub.stamp();
  statements.push(hub.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,'qc-assignment',?,?,?,?,?,'active',1,?,?,?) ON CONFLICT(kind,natural_key) DO NOTHING").bind("qc-job-"+task.id,"qc-job:"+task.id,task.data.assigneeId,task.project_id,task.id,last.date,JSON.stringify(data),stamp,stamp));
 }
 if(statements.length){const results=await hub.db.batch(statements),count=results.reduce((n,r)=>n+(r.meta?.changes||0),0);if(count)await hub.db.batch([hub.audit("system:qc-jobs","Gộp phân công QC theo Job","qc-jobs",null,{jobs:count})]);}
}

export async function qcJobAction(hub:Hub,m:Member,action:string,b:any){
 if(action==="qc-job-assign"){
  hub.lead(m);const data=z.object({taskId:id,reviewerId:id,frameCount:frames,note:z.string().max(10000).default("")}).parse(b),task=await hub.get(data.taskId,"task"),members=await hub.members(),rows=await hub.rows();
  ensure(members.some(v=>v.id===data.reviewerId&&v.state==="active"&&["Lead","QA/QC"].includes(v.role)),"Chọn Lead hoặc QA/QC đang hoạt động");
  const old=rows.find(r=>r.kind==="qc-assignment"&&r.task_id===task.id);
  ensure(!old||old.data.reviewerId===data.reviewerId||!rows.some(r=>r.kind==="qc-session"&&r.task_id===task.id&&r.status==="in_progress"),"Hoàn tất phiên QC đang mở trước khi đổi người kiểm tra",409);
  return hub.commit(m,"Giao / cập nhật người QC cho Job",old||null,"qc-assignment",{...old?.data,reviewerId:data.reviewerId,assigneeId:task.data.assigneeId,assignedBy:old?.data.assignedBy||m.id,assignedAt:old?.data.assignedAt||hub.stamp(),updatedBy:m.id,note:data.note},{owner_id:task.data.assigneeId,project_id:task.project_id,task_id:task.id,date:today(hub.now),natural_key:"qc-job:"+task.id,status:"active"},[hub.replace(task,{...task.data,reviewerId:data.reviewerId,...(data.frameCount!==undefined?{frameCount:data.frameCount}:{})})]);
 }
 if(action==="qc-job-start"){
  const data=z.object({id,rangeStart:z.string().regex(/^\d*$/).max(30).optional()}).parse(b),assignment=await hub.get(data.id,"qc-assignment");
  ensure(m.role==="Lead"||m.role==="QA/QC"&&assignment.data.reviewerId===m.id,"Chỉ người QA/QC được giao hoặc Lead được xử lý",403);
  const rows=await hub.rows(),state=qcJobState(rows,assignment,today(hub.now));if(state.active)return{ok:true,id:state.active.id};
  ensure(state.task&&state.task.data.assigneeId===assignment.data.assigneeId,"Người làm Job đã đổi; Lead cần cập nhật phân công",409);ensure(state.source,"Chưa có Daily Report của ngày trước để QC");
  ensure(state.canStart,"Chưa có ID mới hoặc lỗi cần kiểm lại cho Job này",409);
  ensure(basicQcState(rows,assignment).canDetail,"Hoàn tất kiểm tra cơ bản bằng Tool_QC một lần trước khi QC chi tiết",409);
  const {report,line}=state.source,endId=line.endId,rangeStart=data.rangeStart||state.rangeStart;
  ensure(/^\d+$/.test(rangeStart)&&BigInt(rangeStart)<=BigInt(endId),"ID bắt đầu phải nhỏ hơn hoặc bằng ID cuối");
  const sessionId=crypto.randomUUID(),task=state.task,pending=state.pending;
  const coveredReports=rows.filter(r=>r.kind==="daily"&&r.owner_id===assignment.data.assigneeId&&r.date!<=report.date!&&["submitted","approved","imported"].includes(r.status)&&(r.data.lines||[]).some((l:any)=>l.taskId===task.id&&l.activity!=="qc"&&reportEndId(l))).map(r=>({sourceReportId:r.id,sourceReportRevision:r.revision,sourceQcKey:reportQcKey(r),productionDate:r.date}));
  const value={assignmentId:assignment.id,reviewerId:assignment.data.reviewerId,assigneeId:assignment.data.assigneeId,assignedBy:assignment.data.assignedBy,assignedAt:assignment.data.assignedAt,assignmentNote:assignment.data.note||"",sourceReportId:report.id,sourceReportRevision:report.revision,sourceQcKey:reportQcKey(report),coveredReports,productionDate:report.date,taskCode:task.data.code,jobId:task.data.jobId||"",reportedEndId:endId,endId,rangeStart,previousEndId:state.through,quantity:line.quantity??null,frameCount:taskFrameCount(task),startedAt:hub.stamp(),startedBy:m.id,pendingErrorKeys:pending.map(e=>e.key)};
  await hub.commit(m,"Bắt đầu lượt QC trong phân công Job",assignment,"qc-assignment",{...assignment.data,lastSessionId:sessionId},{},[hub.insert("qc-session",sessionId,value,{owner_id:assignment.data.assigneeId,task_id:task.id,project_id:task.project_id,date:today(hub.now),natural_key:assignment.id+":"+sessionId,status:"in_progress"}),hub.replace(task,task.data),...rows.filter(r=>r.kind==="qc-session"&&r.task_id===task.id&&r.status==="assigned").map(r=>hub.replace(r,{...r.data,supersededBy:sessionId},"superseded"))]);
  return{ok:true,id:sessionId};
 }
 return null;
}
