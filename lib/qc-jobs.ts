import type {Row} from "./domain.ts";
import {reportEndId} from "./report-progress.ts";
import {pendingQcErrors} from "./qc.ts";

export function qcJobSource(records:Row[],taskId:string,memberId:string,day:string){
 const reports=records.filter(r=>r.kind==="daily"&&r.owner_id===memberId&&r.date!<day&&["submitted","approved","imported"].includes(r.status)).sort((a,b)=>b.date!.localeCompare(a.date!)||b.updated_at.localeCompare(a.updated_at));
 for(const report of reports){const line=(report.data.lines||[]).find((l:any)=>l.taskId===taskId&&l.activity!=="qc");if(line&&reportEndId(line))return{report,line:{...line,endId:reportEndId(line)}};}
 return null;
}
export function qcClearedThrough(records:Row[],taskId:string){
 const reviews=records.filter(r=>r.kind==="review"&&r.task_id===taskId&&r.data.mode==="daily"&&/^\d+$/.test(r.data.endId||""));
 const nextErrors=new Set(reviews.flatMap(r=>(r.data.errors||[]).filter((e:any)=>e.originReviewId).map((e:any)=>e.originReviewId+":"+e.originErrorIndex)));
 const intervals=reviews.map(r=>({start:BigInt(r.data.rangeStart||"1"),end:BigInt(r.data.endId)})).sort((a,b)=>a.start<b.start?-1:a.start>b.start?1:0);
 let through=BigInt(0);for(const interval of intervals){if(interval.start>through+BigInt(1))break;if(interval.end>through)through=interval.end;}
 for(const r of reviews)for(const [index,error] of (r.data.errors||[]).entries()){
  if(error.verification==="passed"||nextErrors.has(r.id+":"+index)||error.fixed&&error.verification!=="failed")continue;
  const failed=/^\d+$/.test(error.objectId||"")?BigInt(error.objectId):BigInt(r.data.rangeStart||"1");
  if(failed<=through)through=failed>BigInt(0)?failed-BigInt(1):BigInt(0);
 }
 return through.toString();
}
export function qcJobState(records:Row[],assignment:Row,day:string){
 const task=records.find(r=>r.kind==="task"&&r.id===assignment.task_id),source=qcJobSource(records,assignment.task_id!,assignment.data.assigneeId,day);
 const sessions=records.filter(r=>r.kind==="qc-session"&&r.task_id===assignment.task_id).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
 const active=sessions.find(r=>r.status==="in_progress"),last=sessions.find(r=>r.status==="completed")||sessions[0],through=qcClearedThrough(records,assignment.task_id!),endId=source?.line.endId||"",pending=pendingQcErrors(records,assignment.task_id!);
 let rangeStart=BigInt(through)>BigInt(0)?through:endId==="0"?"0":"1";
 if(endId&&BigInt(rangeStart)>BigInt(endId))rangeStart=endId==="0"?"0":"1";
 const canStart=!!source&&!active&&(BigInt(endId)>BigInt(through)||pending.length>0||source.report.status!=="approved");
 return{task,source,active,last,through,rangeStart,endId,pending,canStart};
}
