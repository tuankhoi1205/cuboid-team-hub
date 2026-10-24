import type {Row} from "./domain.ts";
export const BASIC_CHECKS=[{key:"scale",code:"S",name:"Scale không đồng bộ"},{key:"size",code:"K",name:"Kích thước"},{key:"z",code:"Z",name:"Cao độ Z"},{key:"rot",code:"H",name:"Hướng xoay"},{key:"overlap",code:"O",name:"Chồng lấn"},{key:"dist",code:"D",name:"Khoảng cách"},{key:"data",code:"!",name:"Cấu trúc dữ liệu"}];
export function basicQcState(records:Row[],assignment:Row){
 const runs=records.filter(r=>r.kind==="qc-basic"&&r.task_id===assignment.task_id&&r.owner_id===assignment.data.assigneeId).sort((a,b)=>b.created_at.localeCompare(a.created_at));
 const latest=runs.find(r=>r.id===assignment.data.basicRunId)||runs[0],done=runs.find(r=>r.status==="completed");
 const legacy=!runs.length&&records.some(r=>r.kind==="qc-session"&&r.task_id===assignment.task_id&&r.data.assigneeId===assignment.data.assigneeId&&["in_progress","completed"].includes(r.status));
 return{runs,latest,done,legacy,canDetail:!!done||legacy};
}
