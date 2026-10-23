"use client";
import type { Row } from "../lib/domain";
import { cumulativeKpi } from "../lib/kpi";
import {pendingRepairWork,repairProgress} from "../lib/repair-progress";
const num=(n:number)=>n.toLocaleString("vi-VN",{maximumFractionDigits:2});
export default function KpiPanel({records,members,me,today,onExclude,onRate}:{records:Row[];members:any[];me:any;today:string;onExclude?:()=>void;onRate?:(member:any)=>void}) {
 const team=members.filter(m=>m.state==="active"&&(m.role!=="Lead"||records.some(r=>r.kind==="daily"&&r.owner_id===m.id))&&(me.role==="Lead"||m.id===me.id));
 const start=records.find(r=>r.id==="settings")?.data.kpiStartDate||"2026-10-20";
 return <section className="panel"><div className="panel-head"><div><h3>Cuboid đã làm / KPI lũy kế</h3><p>Từ {start.split("-").reverse().join("/")} đến {today.split("-").reverse().join("/")} · Mức KPI theo từng người</p></div>{onExclude&&<button className="btn secondary small-btn" onClick={onExclude}>Không tính KPI ngày…</button>}</div><div className="table-scroll"><table><thead><tr>{["Nhân sự","Cuboid đã làm / KPI","Ngày tính KPI","KPI ngày hiện tại","Còn thiếu","Kết quả"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{team.map(m=>{
  const k=cumulativeKpi(m.id,records,today),repair=pendingRepairWork(m.id,records,today),bar=repairProgress(k.quantity,k.target,repair.cuboids);
  const formula=repair.jobs.map(j=>`Job ${j.jobId||"—"}: ${num(j.idCount)} ID × ${j.frames==null?"chưa nhập số":num(j.frames)} frame`).join("; ");
  return <tr key={m.id}><td><b>{m.name}</b><small>{m.role}</small></td><td><b>{num(k.quantity)} / {num(k.target)}</b>
   <div className="kpi-track" role="img" aria-label={`Đã làm ${num(k.quantity)} cuboid trên KPI ${num(k.target)}; cần sửa ${num(repair.cuboids)} cuboid`} title={formula||"Chưa có ID cần sửa"}><i style={{width:bar.filledPercent+"%"}}>{repair.cuboids>0&&<span className="kpi-repair-fill" style={{width:bar.pendingPercent+"%"}}/>}</i></div>
   {repair.cuboids>0&&<small className="kpi-repair-note" title={formula}><span className="kpi-color repair"/>Cần sửa: {num(repair.cuboids)} cuboid · {num(repair.idCount-repair.missingFrameIds)} ID</small>}
   {repair.missingFrameIds>0&&<small className="kpi-repair-note">{num(repair.missingFrameIds)} ID cần sửa: chưa có số frame của Job</small>}
   {repair.unidentifiedLogs>0&&<small className="kpi-repair-note">{num(repair.unidentifiedLogs)} log cần sửa chưa ghi ID</small>}
  </td><td>{k.days} ngày</td><td>{num(k.currentRate)} cuboid</td><td>{num(k.remaining)} cuboid</td><td><span className={"badge "+(k.remaining?"b-changes":"b-approved")}>{k.result}</span>{k.ratio!=null&&<small>{num(k.ratio*100)}%</small>}{onRate&&<button className="text-link" onClick={()=>onRate(m)}>Chỉnh KPI</button>}</td></tr>;
 })}</tbody></table></div><div className="panel-foot"><div className="kpi-legend"><span><i className="kpi-color produced"/>Cuboid đã làm</span><span><i className="kpi-color repair"/>Phần cần sửa = số ID còn lỗi × số frame của từng Job; mỗi ID chỉ tính một lần trong Job.</span></div>Thứ Hai–thứ Sáu và thứ Bảy cách tuần; Chủ nhật không tính. Các ngày được Khôi loại trừ có KPI bằng 0. Sản lượng lấy từ báo cáo đã gửi.</div></section>;
}
