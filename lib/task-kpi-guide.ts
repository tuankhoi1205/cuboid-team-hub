import type {Row} from "./domain.ts";
import type {KeyframeProduction} from "./keyframe-kpi.ts";
import {suggestDailyEnd} from "./datumaro-kpi.ts";
import {reportEndId} from "./report-progress.ts";
export function taskDailyGuide(records:Row[],owner:string,taskId:string,day:string,production?:KeyframeProduction){
 const report=records.find(r=>r.kind==="daily"&&r.owner_id===owner&&r.date===day&&["submitted","approved","imported"].includes(r.status)),cuboidProjects=new Set(records.filter(r=>r.kind==="project"&&r.data.unit==="cuboid").map(r=>r.id)),cuboidTasks=new Set(records.filter(r=>r.kind==="task"&&cuboidProjects.has(r.project_id||"")).map(r=>r.id));
 const otherQuantity=(report?.data.lines||[]).filter((l:any)=>l.taskId!==taskId&&l.activity!=="qc"&&!l.productionPending&&cuboidTasks.has(l.taskId)).reduce((n:number,l:any)=>n+(Number(l.quantity)||0),0),line=(report?.data.lines||[]).find((l:any)=>l.taskId===taskId&&l.activity!=="qc");
 const source=records.find(r=>r.kind==="kpi-source"&&r.task_id===taskId&&r.owner_id===owner&&r.status==="active"),count=production||source?.data.production;
 return {...suggestDailyEnd(records,owner,taskId,day,count,otherQuantity,report?.id),otherQuantity,reportedQuantity:line&&!line.productionPending?Number(line.quantity)||0:0,reportedEnd:line?reportEndId(line):"",reportSent:!!report};
}
