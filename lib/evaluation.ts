import type { Member,Row } from "./domain.ts";
import { dailyKpi,dailyRate,kpiDayTarget,kpiDayPolicy,scheduledWorkday,KPI_START_DATE } from "./kpi.ts";
import type { ExportSheet,FormulaCell } from "./export.ts";
import { reworkDays } from "./qc.ts";
import {reportedQc,reportedQcStats} from "./reported-qc.ts";

export const EVALUATION_RULES=[
 ["Sản lượng","Chỉ cộng cuboid annotation trong báo cáo đã gửi, đã duyệt hoặc dữ liệu lịch sử đang giữ. Nháp không được tính. QC và sửa lỗi không tự cộng sản lượng mới; các khối lượng được Lead xác nhận tính KPI giữ đúng số đã duyệt."],
 ["KPI","Cộng mục tiêu từng ngày trong kỳ theo lịch công ty, mức riêng và ngày miễn KPI. Lead không có bài annotation hoặc mức KPI riêng hiển thị Không áp dụng."],
 ["Task/Job hoàn thành","Mỗi cặp Task ID/Job ID được giao là một bài. Chỉ tính bài đã đạt QC và có thời điểm hoàn thành trong kỳ (UTC+7)."],
 ["Rework","Mỗi người mỗi ngày có lỗi cộng 1 rework. Cùng ngày chỉ tính 1 dù nhiều lỗi, nhiều Job hoặc nhiều log. Hôm sau còn lỗi cũ thì cộng 1 cho ngày hôm sau. Tính theo ngày QC (UTC+7), không theo ngày sản lượng."],
 ["Chất lượng","Tỷ lệ đạt lần đầu = cuboid đạt / cuboid đã kiểm ở lượt QC đầu tiên trong kỳ. Không cộng lượt kiểm lại hoặc trộn frame/scene với cuboid."],
 ["Chuyên cần","Đi trễ, vắng, nghỉ phép và nghỉ nửa ngày tách riêng. Có mặt quy đổi = có mặt đủ ngày + đi trễ + 0,5 × nửa ngày. Không dùng để tự tính lương hoặc điểm đánh giá."],
 ["Thiếu dữ liệu","Không suy ra phút trễ, giờ công hoặc ngày hoàn thành còn thiếu. Rework chưa có ngày không được cộng vào kỳ. Điểm danh/tác phong mặc định được ghi rõ trong phần chi tiết."],
];
const inRange=(day:string|null|undefined,from:string,to:string)=>!!day&&day>=from&&day<=to;
const dayOf=(s:unknown)=>{if(typeof s!=="string"||!Number.isFinite(Date.parse(s)))return "";return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(s));};
const next=(day:string)=>{const d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
const numeric=(v:unknown)=>typeof v==="number"&&Number.isFinite(v);
const n=(v:unknown)=>numeric(v)?v as number:0;
const sum=(values:number[])=>values.reduce((s,v)=>s+v,0);
const REPORT_STATES=["submitted","approved","imported"];

export function buildTeamEvaluation(members:Member[],records:Row[],from:string,to:string) {
 const settings=records.find(r=>r.id==="settings")?.data||{},taskMap=new Map(records.filter(r=>r.kind==="task").map(r=>[r.id,r])),projectMap=new Map(records.filter(r=>r.kind==="project").map(r=>[r.id,r]));
 const dated=records.filter(r=>["attendance","daily"].includes(r.kind)&&r.date).map(r=>r.date!);
 const trackingStart=[settings.kpiStartDate||KPI_START_DATE,...dated].sort()[0];
 const days:string[]=[];for(let day=from;day<=to;day=next(day))days.push(day);
 return members.map(member=>{
  const jobs=[...taskMap.values()].filter(r=>r.data.assigneeId===member.id);
  const reports=records.filter(r=>r.kind==="daily"&&r.owner_id===member.id&&inRange(r.date,from,to)&&REPORT_STATES.includes(r.status));
  const cuboidLines=reports.flatMap(r=>r.data.lines||[]).filter((l:any)=>l.activity!=="qc"&&projectMap.get(taskMap.get(l.taskId)?.project_id||"")?.data.unit==="cuboid");
  const kpiReports=reports.filter(r=>!r.data.scoped&&kpiDayPolicy(r.date!,member.id,records).includeProduction);
  const pendingKeyframeReports=kpiReports.filter(r=>(r.data.lines||[]).some((l:any)=>l.activity!=="qc"&&l.productionPending)).length;
  const quantity=sum(kpiReports.map(r=>dailyKpi(r,records).quantity)),missingQuantityLines=cuboidLines.filter((l:any)=>!numeric(l.quantity)).length;
  const kpiApplicable=member.role!=="Lead"||jobs.some(t=>projectMap.get(t.project_id||"")?.data.unit==="cuboid")||records.some(r=>r.kind==="kpi-rate"&&r.owner_id===member.id&&r.status==="active"&&r.date!<=to);
  const targets=days.map(day=>kpiApplicable?kpiDayTarget(day,member.id,records):0),target=sum(targets),kpiDays=targets.filter(t=>t>0).length;
  const complete=jobs.filter(t=>t.status==="done"&&inRange(dayOf(t.data.completedAt),from,to));
  const reviewDate=(r:Row)=>dayOf(r.data.checkedAt)||r.date;
  const reviews=records.filter(r=>r.kind==="review"&&(r.data.fixerId||taskMap.get(r.task_id||"")?.data.assigneeId)===member.id&&inRange(reviewDate(r),from,to));
  const returns=reviews.filter(r=>r.status==="changes"||r.data.verdict==="changes");
  const manualReworks=records.filter(r=>r.kind==="manual-rework"&&r.status==="active"&&r.owner_id===member.id&&inRange(r.date,from,to));
  const reworkDates=[...new Set([...reworkDays(returns),...manualReworks.map(r=>r.date!)])].sort();
  const first=reviews.filter(r=>r.data.first&&projectMap.get(r.project_id||"")?.data.unit==="cuboid"),checked=sum(first.map(r=>n(r.data.checked))),passed=sum(first.map(r=>n(r.data.passed)));
  const attendance=records.filter(r=>r.kind==="attendance"&&r.owner_id===member.id&&inRange(r.date,from,to));
  const fullDays=attendance.filter(r=>["present","late"].includes(r.status)).length,halfDays=attendance.filter(r=>r.status==="half").length;
  const late=attendance.filter(r=>r.status==="late"),lateMinutes=sum(late.map(r=>n(r.data.lateMinutes))),missingLateMinutes=late.filter(r=>!numeric(r.data.lateMinutes)||r.data.lateMinutes<=0).length;
  const lines=reports.flatMap(r=>r.data.lines||[]),annotationMinutes=sum(lines.filter((l:any)=>l.activity!=="qc").map((l:any)=>n(l.minutes))),qcMinutes=sum(lines.filter((l:any)=>l.activity==="qc").map((l:any)=>n(l.minutes)));
  const undatedRework=sum(records.filter(r=>r.kind==="legacy").flatMap(r=>r.data.rows||[]).filter((r:any)=>r.memberId===member.id).map((r:any)=>n(r.reworkTasks)));
  const missingCompletionDate=jobs.filter(t=>t.status==="done"&&!dayOf(t.data.completedAt)).length,missingTimeLines=lines.filter((l:any)=>!numeric(l.minutes)).length,missingReworkLines=cuboidLines.filter((l:any)=>!numeric(l.rework)).length;
  const expectedDays=days.filter(day=>day>=trackingStart&&scheduledWorkday(day,settings));
  const reportDays=new Set(reports.map(r=>r.date)),attendanceDays=new Set(attendance.map(r=>r.date));
  const missingReportDays=expectedDays.filter(d=>!reportDays.has(d)).length,missingAttendanceDays=expectedDays.filter(d=>!attendanceDays.has(d)).length;
  const notes=[pendingKeyframeReports?`${pendingKeyframeReports} báo cáo chờ bảng đếm, chưa kết luận KPI`:"",!reviews.length?"Chưa có log QC trong hệ thống ở kỳ này":"",undatedRework?`${undatedRework} ghi nhận rework chưa có ngày, chưa cộng vào kỳ`:"",missingLateMinutes?`${missingLateMinutes} lượt trễ thiếu số phút`:"",missingCompletionDate?`${missingCompletionDate} bài hoàn thành thiếu ngày`:"",missingTimeLines?`${missingTimeLines} dòng thiếu thời gian`:"",missingReworkLines?`${missingReworkLines} dòng thiếu khối lượng sửa lỗi`:"",missingQuantityLines?`${missingQuantityLines} dòng thiếu sản lượng`:"",missingReportDays?`${missingReportDays} ngày chưa có báo cáo (gồm hôm nay nếu chưa gửi)`:"",missingAttendanceDays?`${missingAttendanceDays} ngày chưa có điểm danh`:""].filter(Boolean);
  return {
   memberId:member.id,name:member.name,username:member.email.split("@")[0],role:member.role,state:member.state,
   quantity,target,kpiApplicable,kpiDays,pendingKeyframeReports,currentRate:kpiApplicable?dailyRate(member.id,to,records):null,remaining:Math.max(0,target-quantity),ratio:target&&!pendingKeyframeReports?quantity/target:null,kpiResult:pendingKeyframeReports?"Chờ bảng đếm":!kpiApplicable?"Không áp dụng":!target?"Không tính KPI":missingQuantityLines?"Thiếu dữ liệu":quantity>=target?"Đạt":"Chưa đạt",
   completedTasks:complete.length,completedTaskIds:new Set(complete.map(t=>String(t.data.code||t.id))).size,missingCompletionDate,
   reworkCount:reworkDates.length,reworkDates,manualReworkCount:manualReworks.length,returnLogs:returns.length,reworkedJobs:new Set(returns.map(r=>r.task_id)).size,reviewCount:reviews.length,firstPassChecked:checked,firstPassPassed:passed,firstPassRatio:checked?passed/checked:null,
   qcPerformed:days.reduce((total,day)=>{const actual=records.filter(r=>r.kind==="review"&&r.owner_id===member.id&&reviewDate(r)===day);return total+reportedQcStats(reports.find(r=>r.date===day),actual.map(r=>String(r.data.jobId||taskMap.get(r.task_id||"")?.data.jobId||r.task_id||r.id)),actual.length).rounds;},0),
   reworkQuantity:sum(cuboidLines.map((l:any)=>n(l.rework))),missingReworkLines,undatedRework,missingQuantityLines,
   fullDays,halfDays,presenceEquivalent:fullDays+halfDays*0.5,lateDays:late.length,lateMinutes,missingLateMinutes,absentDays:attendance.filter(r=>r.status==="absent").length,leaveDays:attendance.filter(r=>r.status==="leave").length,
   conductGood:attendance.filter(r=>r.data.conduct==="Đúng quy định").length,conductBad:attendance.filter(r=>r.data.conduct==="Chưa đúng quy định").length,conductUnknown:attendance.filter(r=>!["Đúng quy định","Chưa đúng quy định"].includes(r.data.conduct)).length,
   defaultAttendanceDays:attendance.filter(r=>r.data.defaulted).length,defaultConductDays:attendance.filter(r=>r.data.conductDefault||r.data.defaulted).length,
   missingAttendanceDays,reportCount:reports.length,missingReportDays,
   draftCount:records.filter(r=>r.kind==="daily"&&r.owner_id===member.id&&r.status==="draft"&&inRange(r.date,from,to)).length,annotationMinutes,qcMinutes,missingTimeLines,
   issueReports:reports.filter(r=>r.data.blockers||(r.data.lines||[]).some((l:any)=>l.issue)).length,notes,
   sources:{
    reports:reports.map(r=>({id:r.id,date:r.date,status:r.status,quantity:dailyKpi(r,records).quantity,pending:dailyKpi(r,records).pending})).sort((a,b)=>(b.date||"").localeCompare(a.date||"")),
    completed:complete.map(t=>({id:t.id,code:t.data.code,jobId:t.data.jobId||"",date:dayOf(t.data.completedAt)})),
    returns:returns.map(r=>{const t=taskMap.get(r.task_id||"");return {id:r.id,code:t?.data.code||"",jobId:t?.data.jobId||"",date:reviewDate(r),productionDate:r.data.productionDate,round:r.data.round,failed:r.data.failed,errors:(r.data.errors||[]).length,fixed:(r.data.errors||[]).filter((e:any)=>e.fixed).length};}),
    manualReworks:manualReworks.map(r=>({id:r.id,date:r.date!,reason:r.data.reason,recordedBy:members.find(m=>m.id===r.data.recordedBy)?.name||"Lead",recordedAt:r.data.recordedAt})).sort((a,b)=>b.date.localeCompare(a.date)),
    attendance:attendance.map(r=>({id:r.id,date:r.date,status:r.status,lateMinutes:r.data.lateMinutes??null,conduct:r.data.conduct||"Chưa đánh giá",note:r.data.note||"",defaulted:!!r.data.defaulted,conductDefault:!!r.data.conductDefault})).sort((a,b)=>(b.date||"").localeCompare(a.date||"")),
   },
  };
 });
}
export type EvaluationMember=ReturnType<typeof buildTeamEvaluation>[number];
export function evaluationTotals(rows:EvaluationMember[]) {
 const quantity=sum(rows.map(r=>r.quantity)),target=sum(rows.map(r=>r.target)),pendingKeyframeReports=sum(rows.map(r=>r.pendingKeyframeReports));
 return {members:rows.length,quantity,target,pendingKeyframeReports,ratio:target&&!pendingKeyframeReports?quantity/target:null,completedTasks:sum(rows.map(r=>r.completedTasks)),reworkCount:sum(rows.map(r=>r.reworkCount)),lateDays:sum(rows.map(r=>r.lateDays)),lateMinutes:sum(rows.map(r=>r.lateMinutes)),missingLateMinutes:sum(rows.map(r=>r.missingLateMinutes)),absentDays:sum(rows.map(r=>r.absentDays)),leaveDays:sum(rows.map(r=>r.leaveDays)),halfDays:sum(rows.map(r=>r.halfDays)),conductBad:sum(rows.map(r=>r.conductBad)),undatedRework:sum(rows.map(r=>r.undatedRework))};
}
export type EvaluationData={from:string;to:string;rows:EvaluationMember[];totals:ReturnType<typeof evaluationTotals>};
const percent=(formula:string,value:number):FormulaCell=>({formula,value,format:"percent"});
export function evaluationSheets(data:EvaluationData):ExportSheet[] {
 const d=(s:string)=>new Date(s+"T00:00:00Z"),status=(s:string)=>({active:"Hoạt động",pending:"Chờ kích hoạt",invited:"Đã mời",disabled:"Vô hiệu hóa"}[s]||s);
 return [
  {name:"Danh gia tong hop",rows:[["Nhân sự","Tên đăng nhập","Vai trò","Cuboid đã làm","KPI trong kỳ","Hoàn thành KPI (%)","Còn thiếu (cuboid)","Task/Job hoàn thành","Rework (ngày có lỗi)","Đi trễ (lần)","Phút trễ đã biết","Trễ thiếu phút (lần)","Vắng (ngày)","Nghỉ phép (ngày)","Nửa ngày (lần)","Tác phong chưa đúng (ngày)","Kết quả KPI","Ghi chú dữ liệu","Từ ngày","Đến ngày"],...data.rows.map((r,i)=>[r.name,r.username,r.role,r.quantity,r.kpiApplicable?r.target:null,r.ratio==null?null:percent(`D${i+2}/E${i+2}`,r.ratio),r.kpiApplicable?r.remaining:null,r.completedTasks,r.reworkCount,r.lateDays,r.lateMinutes,r.missingLateMinutes,r.absentDays,r.leaveDays,r.halfDays,r.conductBad,r.kpiResult,r.notes.join("; "),d(data.from),d(data.to)])]},
  {name:"Cong viec va QC",rows:[["Nhân sự","Vai trò","Trạng thái tài khoản","Ngày tính KPI","KPI ngày cuối kỳ","Task/Job hoàn thành","Task ID có Job hoàn thành","Bài hoàn thành thiếu ngày","Lượt QC nhận được","Rework (ngày có lỗi)","Số Job từng bị trả sửa","Cuboid kiểm lần đầu","Cuboid đạt lần đầu","Đạt lần đầu (%)","Lượt QC đã thực hiện","Khối lượng sửa (cuboid) đã biết","Dòng thiếu khối lượng sửa","Rework chưa có ngày","Daily đã gửi / duyệt","Ngày chưa có báo cáo","Báo cáo nháp","Annotation (phút) đã biết","QC (phút) đã biết","Dòng thiếu thời gian","Báo cáo có vướng mắc"],...data.rows.map((r,i)=>[r.name,r.role,status(r.state),r.kpiDays,r.currentRate,r.completedTasks,r.completedTaskIds,r.missingCompletionDate,r.reviewCount,r.reworkCount,r.reworkedJobs,r.firstPassChecked,r.firstPassPassed,r.firstPassRatio==null?null:percent(`M${i+2}/L${i+2}`,r.firstPassRatio),r.qcPerformed,r.reworkQuantity,r.missingReworkLines,r.undatedRework,r.reportCount,r.missingReportDays,r.draftCount,r.annotationMinutes,r.qcMinutes,r.missingTimeLines,r.issueReports])]},
  {name:"Chuyen can",rows:[["Nhân sự","Có mặt đủ ngày (gồm đi trễ)","Nửa ngày (lần)","Có mặt quy đổi (ngày)","Đi trễ (lần)","Phút trễ đã biết","Lượt trễ thiếu phút","Vắng (ngày)","Nghỉ phép (ngày)","Đúng tác phong (ngày)","Chưa đúng tác phong (ngày)","Tác phong chưa đánh giá (ngày)","Điểm danh mặc định (ngày)","Tác phong mặc định (ngày)","Ngày chưa có điểm danh"],...data.rows.map(r=>[r.name,r.fullDays,r.halfDays,r.presenceEquivalent,r.lateDays,r.lateMinutes,r.missingLateMinutes,r.absentDays,r.leaveDays,r.conductGood,r.conductBad,r.conductUnknown,r.defaultAttendanceDays,r.defaultConductDays,r.missingAttendanceDays])]},
  {name:"Cach tinh",rows:[["Chỉ số","Cách tính / phạm vi"],["Kỳ đánh giá",`${data.from.split("-").reverse().join("/")} – ${data.to.split("-").reverse().join("/")} (UTC+7)`],...EVALUATION_RULES]},
 ];
}
