import { z } from "zod";
import { ensure,today,type Hub,type Member,type Statement,type Row } from "./domain.ts";
import { pendingQcErrors } from "./qc.ts";
import { MAX_QC_IDS,MAX_QC_LOGS,qcIdKey,qcIdRange } from "./qc-table.ts";
import {taskFrameCount} from "./task-frames.ts";
import {reportEndId} from "./report-progress.ts";
import {reportQcKey,reportQcApprovalStatements} from "./report-qc.ts";
const id=z.string().min(1).max(200),text=z.string().max(10000),objectId=z.string().max(30).regex(/^\d*$/,"ID chỉ gồm chữ số"),day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,"Ngày không hợp lệ");
const code=z.enum(["S","K","Z","H","O","D","L"]);
const newError=z.object({type:z.string().min(1).max(200),severity:z.enum(["minor","major","critical"]),description:text.min(1),objectId:objectId.default(""),frameId:objectId.default(""),frameEnd:objectId.default(""),code:code.optional(),evidence:z.string().max(2048).refine(v=>!v||/^https?:\/\//i.test(v),"Link minh chứng không hợp lệ").default("")});
const frameLog=z.object({id,frameId:objectId.default(""),frameEnd:objectId.default(""),code:code.default("L"),type:z.string().min(1).max(200),severity:newError.shape.severity,description:text.trim(),evidence:newError.shape.evidence});
const idCheck=z.object({objectId:objectId.min(1),result:z.enum(["","passed","changes"]),frameId:objectId.default(""),type:z.string().max(200).default(""),severity:z.enum(["minor","major","critical"]).default("minor"),description:text.trim().default(""),evidence:newError.shape.evidence,frameLogs:z.array(frameLog).max(MAX_QC_LOGS).optional()});
const resultSchema=z.object({id,revision:z.number().int().positive().optional(),matrixRunId:id.optional(),note:text.default(""),idChecks:z.array(idCheck).max(MAX_QC_IDS).optional(),errors:z.array(newError).max(MAX_QC_LOGS).default([]),rechecks:z.array(z.object({reviewId:id,errorIndex:z.number().int().min(0),result:z.enum(["passed","failed"]),note:text.default("")})).max(MAX_QC_LOGS).default([])});
export async function dailyQcAction(hub:Hub,m:Member,action:string,b:any){
 const canCheck=(r:any)=>ensure(m.role==="Lead"||(m.role==="QA/QC"&&r.data.reviewerId===m.id),"Chỉ người QA/QC được giao hoặc Lead được xử lý",403);
 if(action==="qc-assign"){
  hub.lead(m);const data=z.object({taskId:id,sourceReportId:id,reviewerId:id,frameCount:z.coerce.number().int().positive().max(100000000).nullable().optional(),date:day.default(today(hub.now)),note:text.default("")}).parse(b);
  const task=await hub.get(data.taskId,"task"),report=await hub.get(data.sourceReportId,"daily"),members=await hub.members();
  ensure(members.some(v=>v.id===data.reviewerId&&v.state==="active"&&["Lead","QA/QC"].includes(v.role)),"Chọn Lead hoặc QA/QC đang hoạt động");
  ensure(data.date>=today(hub.now)&&report.date!<data.date,"Ngày giao QC phải từ hôm nay và sau ngày sản lượng");
  const line=(report.data.lines||[]).find((l:any)=>l.taskId===task.id&&l.activity!=="qc");ensure(line&&report.owner_id===task.data.assigneeId&&["submitted","approved","imported"].includes(report.status),"Không có báo cáo annotation hợp lệ cho bài này");
  const key=data.date+":"+task.id+":"+report.id,old=(await hub.rows("qc-session")).find(r=>r.natural_key===key);ensure(!old||old.status==="assigned","Phiên đã bắt đầu hoặc hoàn tất; giữ nguyên người và log",409);
  return hub.commit(m,"Giao việc QA/QC theo ngày",old||null,"qc-session",{...old?.data,reviewerId:data.reviewerId,assigneeId:report.owner_id,sourceReportId:report.id,sourceReportRevision:report.revision,productionDate:report.date,taskCode:task.data.code,jobId:task.data.jobId||"",reportedEndId:reportEndId(line),quantity:line.quantity??null,frameCount:data.frameCount===undefined?taskFrameCount(task):data.frameCount,assignedBy:m.id,assignedAt:hub.stamp(),assignmentNote:data.note},{owner_id:report.owner_id,task_id:task.id,project_id:task.project_id,date:data.date,natural_key:key,status:"assigned"},[hub.replace(task,{...task.data,reviewerId:data.reviewerId,...(data.frameCount!==undefined?{frameCount:data.frameCount}:{})}),hub.notify(data.reviewerId,"Được giao QC",`Task ${task.data.code} · Job ${task.data.jobId||"—"} · sản lượng ${report.date}`,"qa")]);
 }
 if(action==="qc-start"){
  const data=z.object({id,endId:objectId.default(""),rangeStart:objectId.default(""),endIdNote:text.default("")}).parse(b),session=await hub.get(data.id,"qc-session");canCheck(session);
  ensure(session.date===today(hub.now),"Chỉ bắt đầu QC đúng ngày được giao");if(session.status==="in_progress")return{ok:true,id:session.id};ensure(session.status==="assigned","Phiên QC đã hoàn tất",409);
  const task=await hub.get(session.task_id!,"task"),report=await hub.get(session.data.sourceReportId,"daily"),line=(report.data.lines||[]).find((l:any)=>l.taskId===task.id&&l.activity!=="qc");
  ensure(report.owner_id===session.data.assigneeId&&task.data.assigneeId===session.data.assigneeId&&line&&["submitted","approved","imported"].includes(report.status),"Bài hoặc báo cáo nguồn đã thay đổi; Lead cần kiểm tra lại",409);
  const reportedEndId=reportEndId(line),endId=objectId.parse(reportedEndId||data.endId);ensure(endId,"Báo cáo chưa có ID cuối; nhập ID đã xác minh trước khi bắt đầu");ensure(reportedEndId||data.endIdNote.trim(),"Cần ghi nguồn xác minh khi bổ sung ID cuối còn thiếu");ensure(!data.rangeStart||BigInt(data.rangeStart)<=BigInt(endId),"ID bắt đầu phải nhỏ hơn hoặc bằng ID cuối");
  const all=await hub.rows();ensure(!all.some(r=>r.kind==="qc-session"&&r.task_id===task.id&&r.id!==session.id&&r.status==="in_progress"),"Bài đang có phiên QC khác; hoàn tất phiên đó trước",409);
  const pending=pendingQcErrors(all,task.id),previous=all.filter(r=>r.kind==="qc-session"&&r.task_id===task.id&&r.status==="completed").sort((a,b)=>(b.data.completedAt||"").localeCompare(a.data.completedAt||""))[0];
  return hub.commit(m,"Bắt đầu QA/QC",session,"qc-session",{...session.data,sourceReportRevision:report.revision,sourceQcKey:reportQcKey(report),reportedEndId:reportEndId(line),endId,rangeStart:data.rangeStart,previousEndId:previous?.data.endId||"",endIdNote:reportedEndId?"":data.endIdNote,quantity:line.quantity??null,frameCount:taskFrameCount(task),startedAt:hub.stamp(),startedBy:m.id,pendingErrorKeys:pending.map(e=>e.key)},{status:"in_progress"},[hub.replace(task,task.data)]);
 }
 if(action==="qc-result"||action==="qc-draft"){
  const data=resultSchema.parse(b);
  const session=await hub.get(data.id,"qc-session");canCheck(session);ensure(session.status==="in_progress","Cần bắt đầu QC và chưa ghi kết quả cho phiên này",409);
  if(data.revision!==undefined)ensure(data.revision===session.revision,"Nháp QC đã thay đổi ở nơi khác. Tải lại trước khi lưu để tránh ghi đè log.",409);
  if(data.matrixRunId){const run=await hub.get(data.matrixRunId,"qc-basic");ensure(run.task_id===session.task_id&&run.owner_id===session.data.assigneeId&&["ready","completed"].includes(run.status),"File ma trận không thuộc Job/người đang QC",403);ensure(!session.data.matrixRunId||session.data.matrixRunId===data.matrixRunId,"Giữ file ma trận đã chọn cho phiên QC này",409);}
  const task=await hub.get(session.task_id!,"task");ensure(task.data.assigneeId===session.data.assigneeId,"Người được giao bài đã đổi; Lead cần kiểm tra lại",409);
  if(data.idChecks){
   let expected:string[]=[];try{expected=qcIdRange(session.data.rangeStart,session.data.endId);}catch(e){ensure(false,e instanceof Error?e.message:"Phạm vi ID không hợp lệ");}
   const ids=new Set(data.idChecks.map(c=>qcIdKey(c.objectId)));
   ensure(ids.size===data.idChecks.length,"Mỗi Object ID chỉ được có một dòng trong bảng QC");
   ensure(expected.length===data.idChecks.length&&expected.every(id=>ids.has(id)),"Bảng QC phải có đủ từng ID trong phạm vi đã chốt");
   ensure(!data.errors.length,"Ghi lỗi trực tiếp vào từng dòng ID trong bảng QC");
   const logs=data.idChecks.flatMap(c=>c.frameLogs||[]);ensure(logs.length<=MAX_QC_LOGS,`Mỗi phiên tối đa ${MAX_QC_LOGS} log`);
   ensure(new Set(logs.map(l=>l.id)).size===logs.length,"Mỗi log ma trận cần một mã riêng");
   for(const c of data.idChecks)if(c.frameLogs){ensure(c.result==="changes"||!c.frameLogs.length,"ID có log lỗi không được đánh dấu Đạt");for(const log of c.frameLogs){ensure(log.frameId||!log.frameEnd,"Cần frame bắt đầu của log");if(log.frameId){const last=log.frameEnd||log.frameId;ensure(BigInt(last)>=BigInt(log.frameId)&&BigInt(last)-BigInt(log.frameId)<BigInt(2000),"Phạm vi một log phải từ 1 đến 2.000 frame");}}}
   if(action==="qc-result"){
    ensure(data.idChecks.every(c=>c.result),"Còn ID chưa kiểm; chọn Đạt hoặc Có lỗi cho từng ID trước khi hoàn tất");
    ensure(data.idChecks.every(c=>c.result!=="changes"||(c.frameLogs?c.frameLogs.length>0&&c.frameLogs.every(l=>l.description.trim()):c.description.trim())),"ID có lỗi phải ghi nội dung log lỗi");
   }
   data.errors=data.idChecks.filter(c=>c.result==="changes").flatMap(c=>c.frameLogs?c.frameLogs.map(l=>({type:l.type,severity:l.severity,description:l.description,objectId:c.objectId,frameId:l.frameId,frameEnd:l.frameEnd,code:l.code,evidence:l.evidence})):[{type:c.type,severity:c.severity,description:c.description,objectId:c.objectId,frameId:c.frameId,frameEnd:"",evidence:c.evidence}]);
  }
  if(action==="qc-draft"){
   ensure(data.idChecks,"Cần có bảng kiểm ID để lưu nháp");
   return hub.commit(m,"Lưu nháp bảng QC từng ID",session,"qc-session",{...session.data,...(data.matrixRunId?{matrixRunId:data.matrixRunId}:{}),draft:{idChecks:data.idChecks,note:data.note,rechecks:data.rechecks,updatedAt:hub.stamp(),updatedBy:m.id}});
  }
  const settings=await hub.settings();ensure(data.errors.every(e=>settings.errorTypes.includes(e.type)),"Loại lỗi không nằm trong danh mục");
  ensure(data.errors.every(e=>!e.frameEnd||!!e.frameId&&BigInt(e.frameEnd)>=BigInt(e.frameId)&&BigInt(e.frameEnd)-BigInt(e.frameId)<BigInt(2000)),"Phạm vi frame của log không hợp lệ");
  ensure(data.errors.every(e=>!e.objectId||(BigInt(e.objectId)<=BigInt(session.data.endId)&&(!session.data.rangeStart||BigInt(e.objectId)>=BigInt(session.data.rangeStart)))),"Object ID mới phải nằm trong phạm vi ID đã chốt");
  const all=await hub.rows(),reviews=all.filter(r=>r.kind==="review"&&r.task_id===task.id),changed=new Map<string,any>(),keys=new Set<string>(),repeated:any[]=[];
  for(const check of data.rechecks){
   const key=check.reviewId+":"+check.errorIndex;ensure(!keys.has(key),"Không kiểm trùng cùng một lỗi");keys.add(key);
   ensure(session.data.pendingErrorKeys.includes(key),"Lỗi không thuộc phạm vi kiểm lại của phiên này",409);
   const previous=reviews.find(r=>r.id===check.reviewId),error=previous?.data.errors?.[check.errorIndex];ensure(previous?.data.mode==="daily"&&error&&!error.verification,"Lỗi đã được kiểm lại hoặc không thuộc bài",409);ensure(check.result!=="passed"||error.fixed,"Annotator chưa xác nhận sửa lỗi này",409);
   const value=changed.get(previous!.id)||{...previous!.data,errors:previous!.data.errors.map((e:any)=>({...e}))};value.errors[check.errorIndex]={...error,verification:check.result,verifiedBy:m.id,verifiedAt:hub.stamp(),verificationNote:check.note,verifiedInSession:session.id};changed.set(previous!.id,value);
   if(check.result==="failed")repeated.push({type:error.type,severity:error.severity,description:error.description,objectId:error.objectId||"",frameId:error.frameId||"",frameEnd:error.frameEnd||"",...(error.code?{code:error.code}:{}),evidence:error.evidence||"",originReviewId:previous!.id,originErrorIndex:check.errorIndex,repeated:true,verificationNote:check.note});
  }
  ensure(keys.size===session.data.pendingErrorKeys.length,"Cần ghi kết quả kiểm lại cho từng lỗi cũ trước khi hoàn tất");
  const errors=[...data.errors,...repeated].map(e=>({...e,fixed:false}));ensure(errors.length<=MAX_QC_LOGS,`Mỗi phiên tối đa ${MAX_QC_LOGS} lỗi mới và lỗi cũ vẫn sai`);const verdict=errors.length?"changes":"passed",reviewId=crypto.randomUUID();
  const reviewData={mode:"daily",sessionId:session.id,matrixRunId:data.matrixRunId||session.data.matrixRunId||null,fixerId:session.data.assigneeId,productionDate:session.data.productionDate,sourceReportId:session.data.sourceReportId,sourceReportRevision:session.data.sourceReportRevision,sourceQcKey:session.data.sourceQcKey,coveredReports:session.data.coveredReports,frameCount:session.data.frameCount,taskCode:session.data.taskCode,jobId:session.data.jobId,rangeStart:session.data.rangeStart,endId:session.data.endId,startedAt:session.data.startedAt,checkedAt:hub.stamp(),round:reviews.length+1,first:false,scope:"daily",checked:null,passed:null,failed:null,verdict,note:data.note,errors,rechecks:data.rechecks,repairStatus:errors.length?"pending":"none",...(data.idChecks?{idChecks:data.idChecks,idCheckedCount:data.idChecks.length,idPassedCount:data.idChecks.filter(c=>c.result==="passed").length,idFailedCount:data.idChecks.filter(c=>c.result==="changes").length}:{})};
  const statements:Statement[]=[hub.insert("review",reviewId,reviewData,{owner_id:m.id,task_id:task.id,project_id:task.project_id,date:today(hub.now),status:verdict}),hub.replace(task,task.data),hub.notify(session.data.assigneeId,errors.length?"QC có lỗi cần sửa":"Đã ghi kết quả QC",`Task ${session.data.taskCode} · tới ID ${session.data.endId} · ${errors.length} lỗi`,"qa")];
  for(const [reviewId,value] of changed){const previous=reviews.find(r=>r.id===reviewId)!;statements.push(hub.replace(previous,value),hub.audit(m.id,"Kiểm lại lỗi cũ",reviewId,previous,{data:value}));}
  const reviewRow:Row={...session,id:reviewId,kind:"review",owner_id:m.id,date:today(hub.now),status:verdict,revision:1,data:reviewData};
  statements.push(...reportQcApprovalStatements(hub,m,all,[reviewRow,...[...changed].map(([id,data])=>({...reviews.find(r=>r.id===id)!,data}))]));
  return hub.commit(m,"Hoàn tất QA/QC và ghi log",session,"qc-session",{...session.data,matrixRunId:data.matrixRunId||session.data.matrixRunId||null,draft:null,completedAt:hub.stamp(),completedBy:m.id,reviewId,errorCount:errors.length,newErrorCount:data.errors.length,repeatedErrorCount:repeated.length,recheckedCount:data.rechecks.length,...(data.idChecks?{idCheckedCount:data.idChecks.length,idPassedCount:reviewData.idPassedCount,idFailedCount:reviewData.idFailedCount}:{}),note:data.note},{status:"completed"},statements);
 }
 return null;
}
