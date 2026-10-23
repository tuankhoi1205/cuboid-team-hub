import type {Member,Row} from "./domain";
export function taskActivity(task:Row,viewer:Pick<Member,"id"|"role">,records:Row[]):"QC"|"Annotation"{
 if(task.data.assigneeId===viewer.id)return "Annotation";
 const assigned=viewer.role==="QA/QC"&&task.data.reviewerId===viewer.id||records.some(r=>r.kind==="qc-session"&&r.task_id===task.id&&r.data.reviewerId===viewer.id);
 return assigned?"QC":"Annotation";
}
export function taskActivityTitle(task:Row,viewer:Pick<Member,"id"|"role">,records:Row[]){
 return taskActivity(task,viewer,records)==="QC"?"QC · "+(task.data.title||"").replace(/^Annotation\s*/i,""):task.data.title;
}
