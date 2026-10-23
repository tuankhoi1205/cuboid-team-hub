import type { Row } from "./domain.ts";
import {reportEndId} from "./report-progress.ts";
export const qcDay=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value)):"";
export function reworkDays(reviews:Row[]){return [...new Set(reviews.filter(r=>r.status==="changes"||r.data.verdict==="changes").map(r=>qcDay(r.data.checkedAt)||r.date).filter((d):d is string=>!!d))].sort();}
export function pendingQcErrors(records:Row[],taskId:string){return records.filter(r=>r.kind==="review"&&r.data.mode==="daily"&&r.task_id===taskId).flatMap(r=>(r.data.errors||[]).flatMap((e:any,index:number)=>e.verification?[]:[{key:r.id+":"+index,reviewId:r.id,index,date:r.date,description:e.description,type:e.type,severity:e.severity,objectId:e.objectId||"",frameId:e.frameId||"",evidence:e.evidence||"",fixed:!!e.fixed,fixedAt:e.fixedAt||null,fixNote:e.fixNote||""}]));}
export function qcCandidates(records:Row[],productionDate:string){
 const tasks=new Map(records.filter(r=>r.kind==="task").map(r=>[r.id,r]));
 return records.filter(r=>r.kind==="daily"&&r.date===productionDate&&["submitted","approved","imported"].includes(r.status)).flatMap(report=>(report.data.lines||[]).filter((l:any)=>l.activity!=="qc"&&tasks.has(l.taskId)).map((line:any)=>({key:report.id+":"+line.taskId,report,task:tasks.get(line.taskId)!,line:{...line,endId:reportEndId(line)},memberId:report.owner_id!})));
}
