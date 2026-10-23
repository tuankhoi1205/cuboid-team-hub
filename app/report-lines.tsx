"use client";
import {Plus,Trash2} from "lucide-react";
import type {Row} from "../lib/domain";
import {taskFrameCount} from "../lib/task-frames";
import {cuboidsFromIds} from "../lib/report-production";
export default function ReportLines({lines,tasks,projects,memberId,canQc,isLead=false,allowManualQuantity=false,onChange}:{lines:any[];tasks:Row[];projects:Row[];memberId:string;canQc:boolean;isLead?:boolean;allowManualQuantity?:boolean;onChange:(lines:any[])=>void}) {
 const blank=()=>({taskId:"",activity:"annotation",idCount:"",endId:"",minutes:"",quantity:0,rework:0,work:"",issue:"",evidence:""});
 return <div className="report-lines full">{lines.map((l,i)=>{
  const t=tasks.find(t=>t.id===l.taskId),unit=projects.find(p=>p.id===t?.project_id)?.data.unit||"cuboid",qc=l.activity==="qc",cuboid=unit==="cuboid";
  const frames=l.frameCountAtReport??taskFrameCount(t),hasIds=l.idCount!=null&&l.idCount!=="",quantity=hasIds?cuboidsFromIds(Number(l.idCount),frames):null,legacy=!!l.legacyQuantity&&!hasIds;
  const update=(key:string,value:string)=>onChange(lines.map((line,j)=>{
   if(j!==i)return line;const next={...line,[key]:value};
   if(key==="activity"||key==="taskId")Object.assign(next,{...(key==="activity"?{taskId:""}:{}),endId:"",idCount:"",quantity:0,rework:0,frameCountAtReport:undefined,legacyQuantity:false});
   if(key==="idCount")Object.assign(next,{quantity:value===""&&line.legacyQuantity?line.quantity:cuboidsFromIds(Number(value),frames)??0,legacyQuantity:value===""?line.legacyQuantity:false});
   return next;
  }));
  return <div className="report-line" key={i}><div className="report-line-title"><b>Bài làm {i+1}</b>{lines.length>1&&<button type="button" className="icon-btn" aria-label="Xóa dòng" onClick={()=>onChange(lines.filter((_,j)=>j!==i))}><Trash2 size={16}/></button>}</div><div className="form-grid">
   <label className="field"><span>Hoạt động</span><select value={l.activity||"annotation"} onChange={e=>update("activity",e.target.value)}><option value="annotation">Annotation</option>{canQc&&<option value="qc">QC (chỉ ghi thời gian)</option>}</select></label>
   <label className="field"><span>Bài được giao</span><select required value={l.taskId} onChange={e=>update("taskId",e.target.value)}><option value="">Chọn Task / Job</option>{tasks.filter(t=>qc?(isLead||t.data.reviewerId===memberId):t.data.assigneeId===memberId).map(t=><option value={t.id} key={t.id}>Task {t.data.code||"—"} · Job {t.data.jobId||"chưa có"}</option>)}</select></label>
   <div className="readonly-field"><small>Task ID</small><b>{t?.data.code||"—"}</b></div><div className="readonly-field"><small>Job ID</small><b>{t?.data.jobId||"Chưa được Lead bổ sung"}</b></div>
   {!qc&&<>
    {cuboid&&<><div className="readonly-field"><small>Số frame của Job</small><b>{frames??"Chưa nhập"}</b></div><label className="field"><span>Số ID làm trong ngày{!legacy&&" *"}</span><input type="number" min="0" step="1" max="100000000" required={!legacy} value={l.idCount??""} onChange={e=>update("idCount",e.target.value)}/></label></>}
    <label className="field"><span>ID đã làm tới *</span><input inputMode="numeric" pattern="[0-9]+" maxLength={30} value={l.endId||""} required onChange={e=>update("endId",e.target.value)}/>{t?.data.latestEndId&&<small>Lần báo cáo gần nhất: ID {t.data.latestEndId}</small>}</label>
    {cuboid&&!legacy?<label className="field"><span>Số cuboid làm trong ngày (tự tính)</span><input readOnly value={quantity==null?"":quantity.toLocaleString("vi-VN",{maximumFractionDigits:2})}/><small>{hasIds?l.idCount:"Số ID"} × {frames??"số frame"} × 0,85{frames==null?" · Lead cần nhập số frame của Job":""}</small></label>:<label className="field"><span>Số {unit} làm trong ngày *</span><input type="number" min="0" step="0.01" required readOnly={cuboid&&!allowManualQuantity} value={l.quantity??0} onChange={e=>update("quantity",e.target.value)}/>{legacy&&<small>Giữ sản lượng đã ghi. Chỉ tính lại theo công thức mới nếu nhập số ID trong ngày.</small>}</label>}
    <label className="field"><span>Khối lượng sửa lỗi ({unit})</span><input type="number" min="0" step="0.01" value={l.rework??0} onChange={e=>update("rework",e.target.value)}/></label>
   </>}
   <label className="field"><span>Thời gian thực tế (phút) *</span><input type="number" min="1" max="1440" required value={l.minutes??""} onChange={e=>update("minutes",e.target.value)}/></label>
   <label className="field full"><span>Vướng mắc / cần hỏi</span><input value={l.issue||""} onChange={e=>update("issue",e.target.value)}/></label>
  </div></div>;
 })}<button type="button" className="btn secondary" onClick={()=>onChange([...lines,blank()])}><Plus size={16}/>Thêm bài làm</button></div>;
}
