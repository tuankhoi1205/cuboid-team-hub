import type {Row} from "./domain";
export const DAILY_REPORT_DEADLINE="17:00";
export function dailyReportWritable(actor:{id:string;role:string}|undefined,ownerId:string,day:string,now=new Date(),deadline=DAILY_REPORT_DEADLINE){
 if(!actor)return false;if(actor.role==="Lead")return true;if(actor.id!==ownerId)return false;
 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
 const time=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
 return day===date&&time<deadline;
}
export function dailyReportCompletion<T extends {id:string;state:string}>(records:Row[],members:T[],day:string){
 const sent=new Set(records.filter(r=>r.kind==="daily"&&r.date===day&&["submitted","approved","imported"].includes(r.status)&&!r.data.scoped).map(r=>r.owner_id));
 return {sent:members.filter(m=>m.state==="active"&&sent.has(m.id)),missing:members.filter(m=>m.state==="active"&&!sent.has(m.id))};
}
export function dailyReportRows(records:Row[],memberId:string,team=false){
 return records.filter(r=>r.kind==="daily"&&(team||r.owner_id===memberId)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
}
