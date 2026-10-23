import type {Row} from "./domain.ts";
import {qcIdKey} from "./qc-table.ts";
import {qcDay} from "./qc.ts";
import {taskFrameCount} from "./task-frames.ts";

export function pendingRepairWork(memberId:string,records:Row[],asOf:string){
 const tasks=new Map(records.filter(r=>r.kind==="task").map(r=>[r.id,r]));
 const reviews=records.filter(r=>r.kind==="review"&&(qcDay(r.data.checkedAt)||r.date||"")<=asOf);
 const successors=new Set(reviews.flatMap(r=>(r.data.errors||[]).filter((e:any)=>e.originReviewId).map((e:any)=>e.originReviewId+":"+e.originErrorIndex)));
 const byTask=new Map<string,Set<string>>();let unidentifiedLogs=0;
 for(const review of reviews){
  const task=tasks.get(review.task_id||"");
  if(!task||(review.data.fixerId||task.data.assigneeId)!==memberId||!records.some(p=>p.id===task.project_id&&p.kind==="project"&&p.data.unit==="cuboid"))continue;
  for(const [index,error] of (review.data.errors||[]).entries()){
   if(error.verification==="passed"||successors.has(review.id+":"+index)||error.fixed&&error.verification!=="failed")continue;
   if(!/^\d{1,30}$/.test(String(error.objectId??""))){unidentifiedLogs++;continue;}
   const ids=byTask.get(task.id)||new Set<string>();ids.add(qcIdKey(String(error.objectId)));byTask.set(task.id,ids);
  }
 }
 const jobs=[...byTask].map(([taskId,ids])=>{const task=tasks.get(taskId)!,frames=taskFrameCount(task);return{taskId,jobId:task.data.jobId||"",idCount:ids.size,frames,cuboids:frames==null?0:ids.size*frames};});
 return{jobs,idCount:jobs.reduce((n,j)=>n+j.idCount,0),cuboids:jobs.reduce((n,j)=>n+j.cuboids,0),missingFrameIds:jobs.filter(j=>j.frames==null).reduce((n,j)=>n+j.idCount,0),unidentifiedLogs};
}

export function repairProgress(quantity:number,target:number,pendingCuboids:number){
 return{filledPercent:target>0?Math.max(0,Math.min(100,quantity/target*100)):0,pendingPercent:quantity>0?Math.max(0,Math.min(100,pendingCuboids/quantity*100)):0};
}
