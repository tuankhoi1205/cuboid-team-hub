import type {Row} from "./domain.ts";

type Report=Pick<Row,"data">&Partial<Pick<Row,"status"|"date"|"owner_id"|"id">>;
const amount=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=100000000;
// Historical summaries confirmed by Lead are separate from inspection results.
// The normal Daily Report API cannot create this metadata from client input.
export function reportedQc(report:Report|undefined){
 const data=report?.data.qcActivity;
 if(!data||report?.data.scoped||data.version!==1||data.verifiedBy!=="member-0")return null;
 if(data.jobs!==null&&(!Number.isSafeInteger(data.jobs)||data.jobs<0||data.jobs>1000))return null;
 if(data.cuboids!==null&&!amount(data.cuboids))return null;
 if(!amount(data.kpiCuboids)||data.kpiCuboids>(data.cuboids||0))return null;
 const jobIds=[...new Set((Array.isArray(data.jobIds)?data.jobIds:[]).filter((id:unknown)=>typeof id==="string"&&/^\d{1,30}$/.test(id)))] as string[];
 return {jobs:data.jobs as number|null,jobIds,cuboids:data.cuboids as number|null,kpiCuboids:data.kpiCuboids as number,checkedIds:amount(data.checkedIds)?data.checkedIds as number:null,note:typeof data.note==="string"?data.note:""};
}
export function reportedQcStats(report:Report|undefined,actualJobIds:string[],actualRounds=actualJobIds.length){
 const activity=reportedQc(report),actual=new Set(actualJobIds.filter(Boolean)),known=new Set([...actual,...(activity?.jobIds||[])]),count=Math.max(known.size,activity?.jobs||0);
 const unknown=!!activity&&activity.jobs===null&&!known.size;
 return {jobs:unknown?null:count,rounds:actualRounds+Math.max(0,count-actual.size),cuboids:activity?.cuboids??null,kpiCuboids:activity?.kpiCuboids||0,activity};
}
export function reportedQcLabel(report:Report){
 const qc=reportedQc(report);if(!qc)return "";const n=(value:number)=>value.toLocaleString("vi-VN");
 return ["QC đã báo cáo",qc.jobs===null?"Chưa ghi số bài":n(qc.jobs)+" bài",qc.jobIds.length?"Job "+qc.jobIds.join(", "):"Chưa ghi Job ID",qc.checkedIds!==null?n(qc.checkedIds)+" ID đã kiểm":"",qc.cuboids!==null?n(qc.cuboids)+" cuboid QC":"",qc.kpiCuboids?n(qc.kpiCuboids)+" cuboid được tính KPI":"",qc.note].filter(Boolean).join(" · ");
}
