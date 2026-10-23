import type {Hub,Member,Row,Statement} from "./domain.ts";
import {reportEndId} from "./report-progress.ts";

export function reportQcKey(report:Row){
 const lines=(report.data.lines||[]).filter((l:any)=>l.activity!=="qc").map((l:any)=>({taskId:l.taskId,endId:reportEndId(l),quantity:l.quantity??null})).sort((a:any,b:any)=>a.taskId.localeCompare(b.taskId));
 return JSON.stringify({owner:report.owner_id,date:report.date,token:report.data.qcContentToken||null,lines});
}
function sameVersion(review:Row,report:Row){return review.data.sourceQcKey?review.data.sourceQcKey===reportQcKey(report):review.data.sourceReportRevision===(report.data.qcBaseRevision??report.revision);}
function coversSource(review:Row,report:Row,records:Row[]){
 const session=records.find(r=>r.kind==="qc-session"&&r.id===review.data.sessionId);
 return [review.data,...(review.data.coveredReports||session?.data.coveredReports||[])].some(data=>data.sourceReportId===report.id&&sameVersion({...review,data},report));
}
function covers(intervals:{from:bigint;to:bigint}[],start:bigint,end:bigint){
 let next=start;for(const part of intervals.sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:0)){if(part.to<next)continue;if(part.from>next)return false;next=part.to+BigInt(1);if(next>end)return true;}return false;
}
export function dailyQcApproved(report:Row,records:Row[]):boolean {
 const lines=(report.data.lines||[]).filter((l:any)=>l.activity!=="qc");if(!lines.length)return false;
 const reviews=records.filter(r=>r.kind==="review"&&r.data.mode==="daily"),byId=new Map(reviews.map(r=>[r.id,r]));
 function origin(review:Row,index:number){let row=review,n=index;const seen=new Set<string>();while(row.data.errors?.[n]?.originReviewId){const error=row.data.errors[n],key=row.id+":"+n;if(seen.has(key))return null;seen.add(key);const previous=byId.get(error.originReviewId);if(!previous||previous.task_id!==review.task_id)return null;row=previous;n=error.originErrorIndex;}return {row,index:n};}
 const successors=new Set(reviews.flatMap(r=>(r.data.errors||[]).filter((e:any)=>e.originReviewId).map((e:any)=>e.originReviewId+":"+e.originErrorIndex)));
 return lines.every((line:any)=>{
  const end=reportEndId(line);if(!end)return false;const last=BigInt(end);
  const prior=records.filter(r=>r.kind==="daily"&&r.owner_id===report.owner_id&&r.date!<report.date!&&["submitted","approved","imported"].includes(r.status)).sort((a,b)=>b.date!.localeCompare(a.date!)).flatMap(r=>(r.data.lines||[]).filter((l:any)=>l.taskId===line.taskId&&l.activity!=="qc"&&reportEndId(l)).map((l:any)=>reportEndId(l)))[0];
  const first=prior&&BigInt(prior)<last?BigInt(prior)+BigInt(1):last===BigInt(0)?BigInt(0):BigInt(1);
  const matching=reviews.filter(r=>r.task_id===line.taskId&&r.data.fixerId===report.owner_id&&coversSource(r,report,records));
  const intervals=matching.flatMap(r=>/^\d+$/.test(r.data.endId||"")&&(!r.data.rangeStart||/^\d+$/.test(r.data.rangeStart))?[{from:r.data.rangeStart?BigInt(r.data.rangeStart):BigInt(r.data.endId)===BigInt(0)?BigInt(0):BigInt(1),to:BigInt(r.data.endId)}]:[]);
  if(!covers(intervals,first,last))return false;
  return !reviews.some(r=>r.task_id===line.taskId&&(r.data.errors||[]).some((e:any,index:number)=>{
   const source=origin(r,index),root=source?.row;if(!root||root.data.fixerId!==report.owner_id||!coversSource(root,report,records))return false;
   const objectId=root.data.errors?.[source!.index]?.objectId||e.objectId;if(/^\d+$/.test(objectId||"")&&(BigInt(objectId)<first||BigInt(objectId)>last))return false;
   if(e.verification==="passed")return false;
   if(e.verification==="failed")return !successors.has(r.id+":"+index);
   return !e.fixed;
  }));
 });
}
export function reportQcApprovalStatements(hub:Hub,actor:Member,records:Row[],overrides:Row[]=[]):Statement[]{
 const changed=new Map(overrides.map(r=>[r.id,r])),prospective=[...records.map(r=>changed.get(r.id)||r),...overrides.filter(r=>!records.some(v=>v.id===r.id))],statements:Statement[]=[];
 for(const report of records.filter(r=>r.kind==="daily"&&["submitted","imported","approved"].includes(r.status))){
  if(report.status==="approved"&&!report.data.autoQcApproved)continue;
  const approved=dailyQcApproved(report,prospective);if(approved===(report.status==="approved"))continue;
  const status=approved?"approved":report.data.qcPendingStatus||"submitted",data={...report.data,qcBaseRevision:report.data.qcBaseRevision??report.revision,autoQcApproved:approved,qcPendingStatus:report.data.qcPendingStatus||(report.status==="approved"?"submitted":report.status),qcApprovalUpdatedAt:hub.stamp(),...(approved?{reviewedAt:hub.stamp(),reviewedBy:actor.id}:{})};
  statements.push(hub.replace(report,data,status),hub.audit(actor.id,approved?"Tự duyệt báo cáo sau QC / sửa lỗi":"Bỏ duyệt báo cáo do còn lỗi QC",report.id,report,{data,status}));
 }
 return statements;
}
