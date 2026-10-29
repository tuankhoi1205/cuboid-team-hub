"use client";
import type {Row} from "../lib/domain";
import {kpiDayPolicy} from "../lib/kpi";
import "./kpi-day-policy-form.css";
type Values={date:string;memberId:string;reason:string;enabled:boolean;excludeProduction:boolean};
export function kpiPolicyValues(date:string,memberId:string,records:Row[]):Values {
 const owner=memberId==="team"?null:memberId,policy=kpiDayPolicy(date,owner,records),saved=records.find(r=>r.kind==="kpi-exclusion"&&r.date===date&&(r.owner_id||null)===owner);
 return {date,memberId,reason:saved?.data.reason||"",enabled:!policy.includeTarget,excludeProduction:!policy.includeProduction};
}
export default function KpiDayPolicyForm({value,records,members,onChange}:{value:Values;records:Row[];members:any[];onChange:(value:Values)=>void}) {
 const select=(date:string,memberId:string)=>onChange(kpiPolicyValues(date,memberId,records));
 const saved=records.filter(r=>r.kind==="kpi-exclusion"&&(r.status==="active"||r.data.policyVersion===2)).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,20);
 const closed=records.some(r=>r.kind==="weekly-snapshot"&&r.status==="approved"&&r.date!<=value.date&&r.data.weekEnd>=value.date&&(value.memberId==="team"||r.owner_id===value.memberId));
 return <>
  <label className="field"><span>Ngày áp dụng</span><input type="date" value={value.date} required onChange={e=>select(e.target.value,value.memberId)}/></label>
  <label className="field"><span>Áp dụng cho</span><select value={value.memberId} onChange={e=>select(value.date,e.target.value)}><option value="team">Toàn team</option>{members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
  <label className="kpi-policy-option full"><input type="checkbox" checked={!value.enabled} onChange={e=>onChange({...value,enabled:!e.target.checked})}/><span><b>Tính mục tiêu KPI của ngày này</b><small>Cộng mức KPI riêng của người đó vào chỉ tiêu tuần, theo lịch làm việc.</small></span></label>
  <label className="kpi-policy-option full"><input type="checkbox" checked={!value.excludeProduction} onChange={e=>onChange({...value,excludeProduction:!e.target.checked})}/><span><b>Cộng sản lượng ngày này vào KPI tuần</b><small>Tắt để giữ Daily Report nhưng không cộng cuboid annotation, rework hoặc QC đã được duyệt tính KPI vào tổng tuần/lũy kế.</small></span></label>
  <label className="field full"><span>Ghi chú / lý do</span><textarea value={value.reason} onChange={e=>onChange({...value,reason:e.target.value})} rows={2}/></label>
  <div className="notice full">Có thể sửa ngày quá khứ và bật lại bất kỳ lúc nào. Daily Report, log QC và điểm danh vẫn được giữ; thành viên vẫn gửi báo cáo theo hạn hiện có. Thiết lập riêng một người được ưu tiên hơn toàn team.</div>
  {closed&&<div className="notice full">Tuần này có tổng đã chốt, chưa có phân bổ chính xác theo ngày. Quy tắc không tự chia hay trừ ước lượng từ tổng đã chốt; cần cập nhật tổng chốt nếu muốn thay số đó.</div>}
  {!!saved.length&&<div className="full"><h4>Quy tắc đã lưu</h4><div className="table-scroll"><table><thead><tr><th>Ngày</th><th>Áp dụng</th><th>Mục tiêu</th><th>Cộng sản lượng</th><th/></tr></thead><tbody>{saved.map(r=><tr key={r.id}><td>{r.date?.split("-").reverse().join("/")}</td><td>{r.owner_id?members.find(m=>m.id===r.owner_id)?.name||"Thành viên":"Toàn team"}</td><td>{r.status==="active"&&r.data.enabled!==false?"Không":"Có"}</td><td>{r.status==="active"&&r.data.excludeProduction?"Không":"Có"}</td><td><button className="text-link" type="button" onClick={()=>select(r.date!,r.owner_id||"team")}>Sửa</button></td></tr>)}</tbody></table></div></div>}
 </>;
}
