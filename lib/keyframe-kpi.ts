import type {Row} from "./domain.ts";
import {reportEndId} from "./report-progress.ts";

export type CountId={id:number;label:string;visible:number;outside:number;keyframes:number;interpolated:number;unknown:number;firstFrame:number;lastFrame:number;serverId?:number|null;cuboids?:number;credit?:number;baselineCount?:number;addedCount?:number;currentCount?:number};
export type KeyframeProduction={version:number;format:string;completeOutside:boolean;usable:boolean;mapping:string;issues:string[];duplicates:number;frames:number;offset?:number;totals:{keyframes:number;visible:number;outside:number;interpolated:number;unknown:number};ids:CountId[];basis?:string;datumaroUsable?:boolean;countIssues?:string[];scopeFrames?:number[];cuboidTotal?:number};
const known=(value:string)=>/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=100000000?Number(value):null;
export function keyframeRange(records:Row[],owner:string,task:string,day:string,endId:string,excludeId?:string,offset=1){
 const end=known(endId),before=records.filter(r=>r.kind==="daily"&&r.id!==excludeId&&r.owner_id===owner&&r.date!<day&&["submitted","approved","imported"].includes(r.status)).flatMap(report=>(report.data.lines||[]).filter((l:any)=>l.taskId===task&&l.activity!=="qc").map((line:any)=>({reportId:report.id,date:report.date,end:known(reportEndId(line))}))).filter((r:any)=>r.end!==null).sort((a:any,b:any)=>b.end-a.end||b.date.localeCompare(a.date));
 const previous=before[0],start=(previous?.end??(offset===0?-1:0))+1;
 const incomplete=records.filter(r=>r.kind==="daily"&&r.id!==excludeId&&r.owner_id===owner&&r.date!<day&&(!previous||r.date!>previous.date!)&&["submitted","approved","imported"].includes(r.status)&&(r.data.lines||[]).some((line:any)=>line.taskId===task&&line.activity!=="qc"&&!reportEndId(line)&&Number(line.quantity)>0)).sort((a,b)=>b.date!.localeCompare(a.date!))[0];
 return {start,end,previousEnd:start-1,previousReportId:previous?.reportId||null,previousDate:previous?.date||null,baselineUnknown:incomplete?`Báo cáo ngày ${incomplete.date} thiếu mốc ID. Lead cần bổ sung mốc cũ để tránh cộng lại sản lượng.`:"",error:end===null?"Nhập ID đã làm tới hợp lệ (tối đa 100.000.000).":end<start-1?"ID đã làm tới thấp hơn mốc đã báo cáo trước đó. Không tính lại ID cũ.":""};
}
export function keyframeQuantity(production:KeyframeProduction,range:ReturnType<typeof keyframeRange>){
 const rows=range.end===null?[]:production.ids.filter(r=>r.id>=range.start&&r.id<=range.end!);
 const total=(key:"keyframes"|"visible"|"outside"|"unknown")=>rows.reduce((n,r)=>n+r[key],0);
 const maxId=Math.max(range.previousEnd,...production.ids.map(r=>r.id));
 const error=range.error||range.baselineUnknown||(!production.usable?"File chưa đủ dữ liệu keyframe/outside để chốt KPI.":range.end!>maxId?`File chỉ có Object ID tới ${maxId}; tải bản annotation mới hơn.`:"");
 const baseline=rows.reduce((n,r)=>n+(r.baselineCount||0),0),added=rows.reduce((n,r)=>n+(r.addedCount||0),0);
 return {...range,quantity:production.basis==="datumaro-baseline-v1"?baseline+added:total("keyframes"),baseline,added,visible:total("visible"),outside:total("outside"),unknown:total("unknown"),countedIds:rows.length,error};
}
export function keyframeComparisons(records:Row[],owner:string,task:string,production:KeyframeProduction){
 return records.filter(r=>r.kind==="daily"&&r.owner_id===owner&&["submitted","approved","imported"].includes(r.status)&&(r.data.lines||[]).some((l:any)=>l.taskId===task&&l.activity!=="qc")).sort((a,b)=>b.date!.localeCompare(a.date!)).map(report=>{
  const line=report.data.lines.find((l:any)=>l.taskId===task&&l.activity!=="qc"),range=keyframeRange(records,owner,task,report.date!,reportEndId(line),report.id,production.offset);
  const count=keyframeQuantity(production,range),saved=Number(line.quantity)||0;
  return {reportId:report.id,date:report.date,endId:reportEndId(line),...count,savedQuantity:saved,difference:count.quantity-saved,method:line.productionMethod||"legacy",snapshot:line.keyframeSnapshot||null};
 });
}
