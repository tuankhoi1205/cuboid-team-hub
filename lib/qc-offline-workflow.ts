import {z} from "zod";
import {ensure,today,type Hub,type Member,type Row} from "./domain.ts";
import {offlineResultSchema} from "./qc-offline.ts";
import {pendingQcErrors} from "./qc.ts";
const uploadSchema=z.object({assignmentId:z.string().min(1).max(200),revision:z.number().int().positive(),result:offlineResultSchema});
export async function importOfflineQc(hub:Hub,actor:Member,input:unknown){
 const {assignmentId,revision,result}=uploadSchema.parse(input),assignment=await hub.get(assignmentId,"qc-assignment");
 ensure(actor.role==="Lead"||actor.role==="QA/QC"&&assignment.data.reviewerId===actor.id,"Chỉ người QA/QC được giao hoặc Lead được xử lý",403);
 ensure(assignment.status==="active","Phân công đã ngừng hoạt động",409);
 const rows=await hub.rows(),old=rows.find(r=>r.kind==="qc-session"&&r.natural_key==="offline:"+result.id);
 if(old){ensure(old.task_id===assignment.task_id&&old.data.offlineResult&&JSON.stringify(old.data.offlineResult)===JSON.stringify(result),"Mã kết quả đã tồn tại ở Job khác hoặc với nội dung khác",409);return{ok:true,id:old.id};}
 ensure(assignment.revision===revision,"Phân công hoặc kết quả Job đã thay đổi; làm mới trước khi tải lên",409);
 const task=await hub.get(assignment.task_id!,"task");
 ensure(result.source.kind!=="blank"||result.source.jobId===task.data.jobId,"Job ID của bảng trắng không trùng Job đã chọn",409);
 ensure(task.data.assigneeId===assignment.data.assigneeId,"Annotator đã đổi; Lead cần cập nhật phân công",409);
 ensure(!rows.some(r=>r.kind==="qc-session"&&r.task_id===task.id&&r.status==="in_progress"),"Còn phiên QC web đang mở; Lead chuyển phiên cũ sang app trước",409);
 const pending=pendingQcErrors(rows,task.id),changed=new Map<string,Row>();
 const errors=result.checks.flatMap(c=>c.logs.map(l=>({objectId:c.objectId,frameId:String(l.frameStart),frameEnd:String(l.frameEnd),description:l.description,solution:l.solution,fixed:false,originReviewId:undefined as string|undefined,originErrorIndex:undefined as number|undefined})));
 // Reinspection verifies earlier logs only on IDs and frames present in this file.
 let rechecked=0;
 for(const p of pending){
  const c=result.checks.find(c=>BigInt(c.objectId).toString()===p.objectId.replace(/^0+(?=\d)/,""));if(!c)continue;
  if(p.frameId&&!c.present.some(f=>f>=Number(p.frameId)&&f<=Number(p.frameEnd||p.frameId)))continue;
  const repeated=errors.find(e=>e.objectId===c.objectId&&(!p.frameId||Number(e.frameId)<=Number(p.frameEnd||p.frameId)&&Number(e.frameEnd)>=Number(p.frameId)));
  const previous=changed.get(p.reviewId)||rows.find(r=>r.id===p.reviewId)!;
  changed.set(previous.id,{...previous,data:{...previous.data,errors:previous.data.errors.map((e:any,i:number)=>i===p.index?{...e,verification:repeated?"failed":"passed",verifiedBy:actor.id,verifiedAt:hub.stamp(),verificationNote:"Kiểm lại qua file QC offline "+result.id}:e)}});
  if(repeated&&!repeated.originReviewId){repeated.originReviewId=p.reviewId;repeated.originErrorIndex=p.index;}rechecked++;
 }
 const members=await hub.members(),name=(id:string)=>members.find(m=>m.id===id)?.name||id;
 const context={taskCode:task.data.code||"",jobId:task.data.jobId||"",assigneeId:assignment.data.assigneeId,assigneeName:name(assignment.data.assigneeId),reviewerId:assignment.data.reviewerId,reviewerName:name(assignment.data.reviewerId)};
 const sorted=[...result.checks].sort((a,b)=>BigInt(a.objectId)<BigInt(b.objectId)?-1:1),rangeStart=sorted[0].objectId,endId=sorted.at(-1)!.objectId;
 const idChecks=result.checks.map(c=>({objectId:c.objectId,result:c.logs.length?"changes":"passed",frameId:"",description:c.logs.map(l=>l.description).join("; "),frameLogs:c.logs.map(l=>({id:l.id,frameId:String(l.frameStart),frameEnd:String(l.frameEnd),description:l.description,solution:l.solution}))}));
 const sessionId=crypto.randomUUID(),reviewId=crypto.randomUUID(),verdict=errors.length?"changes":"passed",checkedAt=hub.stamp();
 // Standalone results prove inspected IDs; production/KPI approval stays with Lead.
 const reviewData={mode:"daily",offline:true,sourceKind:result.source.kind||"datumaro",sessionId,fixerId:context.assigneeId,taskCode:context.taskCode,jobId:context.jobId,rangeStart,endId,startedAt:result.startedAt,checkedAt,round:rows.filter(r=>r.kind==="review"&&r.task_id===task.id).length+1,first:false,scope:"daily",verdict,errors,idChecks,idCheckedCount:idChecks.length,idPassedCount:idChecks.filter(c=>c.result==="passed").length,idFailedCount:idChecks.filter(c=>c.result==="changes").length,repairStatus:errors.length?"pending":"none",offlineResultId:result.id,sourceHash:result.source.kind==="blank"?null:result.source.sha256};
 await hub.commit(actor,"Tải kết quả QC offline",assignment,"qc-assignment",{...assignment.data,lastSessionId:sessionId},{},[
  hub.insert("qc-session",sessionId,{assignmentId:assignment.id,...context,rangeStart,endId,startedAt:result.startedAt,completedAt:checkedAt,completedBy:actor.id,reviewId,errorCount:errors.length,newErrorCount:errors.length,recheckedCount:rechecked,idCheckedCount:idChecks.length,offline:true,offlineResult:result,offlineContext:context},{owner_id:context.assigneeId,task_id:task.id,project_id:task.project_id,date:today(hub.now),status:"completed",natural_key:"offline:"+result.id}),
  hub.insert("review",reviewId,reviewData,{owner_id:context.reviewerId,task_id:task.id,project_id:task.project_id,date:today(hub.now),status:verdict}),hub.replace(task,task.data),
  ...[...changed.values()].map(r=>hub.replace(rows.find(v=>v.id===r.id)!,r.data)),
  hub.notify(context.assigneeId,errors.length?"QC offline có log cần sửa":"Đã nhận kết quả QC offline","Job "+context.jobId+" · "+idChecks.length+" ID · "+errors.length+" log","qa")
 ]);
 return {ok:true,id:sessionId};
}
