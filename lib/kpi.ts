import type { Row } from "./domain";
import {reportedQc} from "./reported-qc.ts";

export const DAILY_CUBOID_TARGET = 1200;
export const KPI_START_DATE="2026-10-20",WORKING_SATURDAY="2026-10-24";
export const vietnamToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const add=(d:string,n:number)=>{const v=new Date(d+"T12:00:00Z");v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10);};
export function scheduledWorkday(day:string,settings:Record<string,any>={}) {
 const weekday=new Date(day+"T12:00:00Z").getUTCDay();
 return weekday!==0&&(weekday!==6||Math.abs(Math.round((Date.parse(day)-Date.parse(settings.kpiWorkingSaturday||WORKING_SATURDAY))/86400000/7))%2===0);
}
export function previousWorkday(day:string,settings:Record<string,any>={}) {let d=add(day,-1);while(!scheduledWorkday(d,settings))d=add(d,-1);return d;}
export function nextWorkday(day:string,settings:Record<string,any>={}) {let d=add(day,1);while(!scheduledWorkday(d,settings))d=add(d,1);return d;}
export function dailyRate(memberId:string|null|undefined,day:string,records:Row[]) {
 const rate=records.filter(r=>r.kind==="kpi-rate"&&r.owner_id===memberId&&r.status==="active"&&r.date!<=day).sort((a,b)=>b.date!.localeCompare(a.date!))[0];
 return rate?Number(rate.data.quantity):DAILY_CUBOID_TARGET;
}
export function kpiDayPolicy(day:string,memberId:string|null|undefined,records:Row[]) {
 const rules=records.filter(r=>r.kind==="kpi-exclusion"&&r.date===day&&(!r.owner_id||r.owner_id===memberId));
 const personal=memberId?rules.find(r=>r.owner_id===memberId&&r.data.policyVersion===2):undefined;
 if(personal)return {includeTarget:!personal.data.enabled,includeProduction:!personal.data.excludeProduction};
 const active=rules.filter(r=>r.status==="active");
 return {includeTarget:!active.some(r=>r.data.enabled!==false),includeProduction:!active.some(r=>r.data.excludeProduction===true)};
}
export function kpiDayTarget(day:string,memberId:string|null|undefined,records:Row[],settings:Record<string,any>={}) {
  const config=Object.keys(settings).length?settings:records.find(r=>r.id==="settings")?.data||{};
  if(day<(config.kpiStartDate||KPI_START_DATE)||!scheduledWorkday(day,config))return 0;
  if(!kpiDayPolicy(day,memberId,records).includeTarget)return 0;
  return dailyRate(memberId,day,records);
}
export function dailyKpi(report: Pick<Row,"data"> & Partial<Pick<Row,"date"|"owner_id">>, records: Row[]) {
  const lines=(report.data.lines||[]).filter((l:any)=>l.activity!=="qc");
  const cuboid=lines.filter((l:any)=>{const task=records.find(t=>t.kind==="task"&&t.id===l.taskId);return records.some(p=>p.kind==="project"&&p.id===task?.project_id&&p.data.unit==="cuboid");});
  const qcCredit=reportedQc(report)?.kpiCuboids||0;
  const quantity=cuboid.reduce((n:number,l:any)=>n+(Number(l.quantity)||0),0)+qcCredit,applicable=(cuboid.length>0||qcCredit>0)&&!report.data.scoped,day=report.date||report.data.date;
  const target=day?kpiDayTarget(day,report.owner_id,records):DAILY_CUBOID_TARGET,pending=cuboid.some((l:any)=>l.productionPending);
  return {quantity,target,remaining:applicable&&!pending?Math.max(0,target-quantity):null,ratio:applicable&&target&&!pending?quantity/target:null,result:pending?"Chờ bảng đếm":!applicable?(report.data.scoped?"Chỉ xem một phần":"Không áp dụng"):target===0?"Không tính KPI":quantity>=target?"Đạt":"Chưa đạt",applicable,pending};
}
export function cumulativeKpi(memberId:string,records:Row[],end=vietnamToday()) {
 const config=records.find(r=>r.id==="settings")?.data||{},start=config.kpiStartDate||KPI_START_DATE;
 let target=0,days=0;for(let d=start;d<=end;d=add(d,1)){const value=kpiDayTarget(d,memberId,records,config);target+=value;if(value)days++;}
 const reports=records.filter(r=>r.kind==="daily"&&r.owner_id===memberId&&r.date!>=start&&r.date!<=end&&["submitted","approved","imported"].includes(r.status)&&!r.data.scoped&&kpiDayPolicy(r.date!,memberId,records).includeProduction);
 const quantity=reports.reduce((n,r)=>n+dailyKpi(r,records).quantity,0),pendingReports=reports.filter(r=>dailyKpi(r,records).pending).length;
 return {start,end,target,days,quantity,pendingReports,currentRate:dailyRate(memberId,end,records),remaining:Math.max(0,target-quantity),ratio:target&&!pendingReports?quantity/target:null,result:pendingReports?"Chờ bảng đếm":!target?"Không tính KPI":quantity>=target?"Đạt":"Chưa đạt"};
}
export function weeklyKpi(memberId:string,records:Row[],asOf=vietnamToday()) {
 const day=new Date(asOf+"T12:00:00Z"),start=add(asOf,-((day.getUTCDay()+6)%7)),end=add(start,6);
 let target=0,days=0,targetToDate=0;
 for(let d=start;d<=end;d=add(d,1)){const value=kpiDayTarget(d,memberId,records);target+=value;if(value)days++;if(d<=asOf)targetToDate+=value;}
 const reports=records.filter(r=>r.kind==="daily"&&r.owner_id===memberId&&r.date!>=start&&r.date!<=asOf&&["submitted","approved","imported"].includes(r.status)&&!r.data.scoped&&kpiDayPolicy(r.date!,memberId,records).includeProduction);
 const quantity=reports.reduce((n,r)=>n+dailyKpi(r,records).quantity,0),pendingReports=reports.filter(r=>dailyKpi(r,records).pending).length;
 return {start,end,asOf,target,targetToDate,days,quantity,pendingReports,currentRate:dailyRate(memberId,asOf,records),remaining:Math.max(0,target-quantity),ratio:target&&!pendingReports?quantity/target:null,result:pendingReports?"Chờ bảng đếm":!target?"Không tính KPI":quantity>=target?"Đạt":"Chưa đạt"};
}
export type KpiSummary={period:"weekly"|"cumulative";start:string;end:string;asOf:string;rows:{memberId:string;kpi:ReturnType<typeof cumulativeKpi>|ReturnType<typeof weeklyKpi>}[]};
