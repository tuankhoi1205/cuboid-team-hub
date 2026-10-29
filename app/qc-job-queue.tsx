"use client";
import {useState,type FormEvent} from "react";
import {Plus,X,Play} from "lucide-react";
import type {Row} from "../lib/domain";
import {qcJobState} from "../lib/qc-jobs";
import {taskFrameCount} from "../lib/task-frames";
import BasicQcStep from "./qc-basic-step";
import KeyframeTool from "./keyframe-tool";
import {basicQcState} from "../lib/qc-basic";
import type {MatrixSelection} from "./qc-matrix";
const date=(v:string|null|undefined)=>v?v.split("-").reverse().join("/"):"—";
export default function QcJobQueue({records,members,me,today,memberFilter,reviewerFilter,onChanged,onOpen}:{records:Row[];members:any[];me:any;today:string;memberFilter:string;reviewerFilter:string;onChanged:()=>Promise<void>;onOpen:(mode:"result"|"log",id:string,selection?:MatrixSelection)=>void}){
 const lead=me.role==="Lead",tasks=records.filter(r=>r.kind==="task"),assignments=records.filter(r=>r.kind==="qc-assignment"&&r.status==="active");
 const [modal,setModal]=useState<{type:"assign"|"start";row?:Row;selection?:MatrixSelection}|null>(null),[form,setForm]=useState<any>({}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const name=(id:string)=>members.find(m=>m.id===id)?.name||"Thành viên",task=tasks.find(t=>t.id===form.taskId),startState=modal?.row?qcJobState(records,modal.row,today):null;
 function assign(row?:Row){const t=tasks.find(t=>t.id===row?.task_id);setError("");setForm({taskId:t?.id||"",reviewerId:row?.data.reviewerId||me.id,frameCount:taskFrameCount(t)??"",note:row?.data.note||""});setModal({type:"assign",row});}
 function start(row:Row,selection?:MatrixSelection){const state=qcJobState(records,row,today);setError("");setForm({rangeStart:state.rangeStart});setModal({type:"start",row,selection});}
 async function submit(e:FormEvent){e.preventDefault();if(!modal)return;setBusy(true);setError("");try{
  const action=modal.type==="assign"?"qc-job-assign":"qc-job-start",body=modal.type==="assign"?{...form,frameCount:form.frameCount===""?null:Number(form.frameCount)}:{id:modal.row!.id,rangeStart:form.rangeStart};
  const response=await fetch("/api/hub/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),value:any=await response.json();if(!response.ok)throw new Error(value.error);await onChanged();setModal(null);if(action==="qc-job-start")onOpen("result",value.id,modal.selection);
 }catch(e){setError(e instanceof Error?e.message:"Không lưu được");}finally{setBusy(false);}}
 return <>
  <section className="panel"><div className="panel-head"><div><h3>Phân công QC theo Job</h3><p>Giao một lần. Bước 1 chạy Tool_QC lần đầu; bước 2 kiểm chi tiết theo ID của báo cáo hôm qua.</p></div>{lead&&<button className="btn primary small-btn" onClick={()=>assign()}><Plus size={14}/>Giao QC cho Job</button>}</div>
   <div className="table-scroll"><table><thead><tr>{["Task / Job","Annotator","Người QC","QC và sửa xong tới","ID cuối theo báo cáo","Phần QC tiếp theo","1 · Kiểm tra cơ bản","2 · QC chi tiết",""] .map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {assignments.filter(a=>(!memberFilter||a.data.assigneeId===memberFilter)&&(!reviewerFilter||a.data.reviewerId===reviewerFilter)).map(a=>{
     const s=qcJobState(records,a,today),basic=basicQcState(records,a),canCheck=lead||me.role==="QA/QC"&&a.data.reviewerId===me.id;
     return <tr key={a.id}><td><b>Task {s.task?.data.code||"—"} · Job {s.task?.data.jobId||"—"}</b><small>{taskFrameCount(s.task)??"Chưa nhập số"} frame</small></td><td>{name(a.data.assigneeId)}</td><td>{name(a.data.reviewerId)}</td><td>ID {s.through}<small>{s.pending.filter(p=>!p.fixed).length} log còn cần sửa</small>{s.pending.some(p=>p.fixed)&&<small>{s.pending.filter(p=>p.fixed).length} log chờ kiểm lại</small>}</td><td>{s.endId?"ID "+s.endId:"Chờ Daily Report"}<small>{s.source?"Báo cáo "+date(s.source.report.date):"Chưa có báo cáo ngày trước"}</small></td><td>{s.active?<>{s.active.data.rangeStart||"1"} → {s.active.data.endId}<small>Phạm vi lượt đang QC</small></>:s.source?<>{s.rangeStart} → {s.endId}</>:"—"}</td><td><BasicQcStep assignment={a} records={records} me={me} onChanged={onChanged} canContinue={!!s.active||s.canStart} onContinue={selection=>{if(s.active)onOpen("result",s.active.id,selection);else if(s.canStart)start(a,selection);}}/></td><td><span className={"badge "+(s.active?"b-doing":s.canStart?"b-todo":"b-approved")}>{s.active?"Đang QC":!s.source?"Chờ báo cáo":s.canStart?"Có phần cần QC":"Đã QC / sửa xong"}</span></td><td><div className="qc-row-actions"><KeyframeTool taskId={a.task_id!} records={records} onChanged={onChanged} isLead={lead}/>
      {canCheck&&s.active&&<button className="btn primary small-btn" onClick={()=>onOpen("result",s.active!.id)}>Ghi kết quả</button>}
      {canCheck&&s.canStart&&basic.canDetail&&<button className="btn primary small-btn" onClick={()=>start(a)}><Play size={13}/>Bắt đầu QC</button>}
      {s.last&&<button className="text-link" onClick={()=>onOpen("log",s.last!.id)}>Xem log</button>}
      {lead&&<button className="text-link" onClick={()=>assign(a)}>Sửa phân công</button>}
     </div></td></tr>;
    })}
   </tbody></table>{!assignments.length&&<div className="empty"><h3>Chưa phân công QC</h3><p>Lead chọn Job và người kiểm tra một lần; những ngày sau chỉ bắt đầu phần QC mới.</p></div>}</div>
  </section>
  {modal&&<div className="modal-backdrop" onClick={()=>!busy&&setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-label="Phân công QC theo Job" onClick={e=>e.stopPropagation()}><header><h2>{modal.type==="assign"?"Giao QC cho Job":"Bắt đầu phần QC tiếp theo"}</h2><button aria-label="Đóng phân công QC" className="icon-btn" disabled={busy} onClick={()=>setModal(null)}><X size={18}/></button></header><form onSubmit={e=>void submit(e)}><div className="modal-content"><div className="form-grid">
   {modal.type==="assign"?<>
    <label className="field full"><span>Job cần QC</span><select value={form.taskId} disabled={!!modal.row} required onChange={e=>{const t=tasks.find(t=>t.id===e.target.value);setForm({...form,taskId:e.target.value,frameCount:taskFrameCount(t)??""});}}><option value="">Chọn Task / Job</option>{tasks.filter(t=>t.id===modal.row?.task_id||!assignments.some(a=>a.task_id===t.id)).map(t=><option value={t.id} key={t.id}>Task {t.data.code||"—"} · Job {t.data.jobId||"—"} · {name(t.data.assigneeId)}</option>)}</select></label>
    {task&&<div className="notice full">Annotator: {name(task.data.assigneeId)}. Không cần phân công lại mỗi ngày.</div>}
    <label className="field"><span>Người QA/QC được giao</span><select value={form.reviewerId} required onChange={e=>setForm({...form,reviewerId:e.target.value})}>{members.filter(m=>m.state==="active"&&["Lead","QA/QC"].includes(m.role)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label className="field"><span>Số frame của Job</span><input type="number" min="1" max="100000000" step="1" value={form.frameCount} onChange={e=>setForm({...form,frameCount:e.target.value})}/></label>
    <label className="field full"><span>Ghi chú phân công</span><textarea value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
   </>:<>
    <div className="notice full">Đã QC và sửa xong tới ID {startState?.through}. Báo cáo ngày {date(startState?.source?.report.date)} đã làm tới ID {startState?.endId}. Lỗi cũ sẽ được kiểm lại trong lượt này.</div>
    <label className="field"><span>ID bắt đầu kiểm</span><input value={form.rangeStart} inputMode="numeric" pattern="[0-9]+" maxLength={30} required onChange={e=>setForm({...form,rangeStart:e.target.value})}/></label>
    <div className="readonly-field"><small>ID cuối theo Daily Report</small><b>{startState?.endId||"—"}</b></div>
   </>}
  </div>{error&&<div className="error-box" role="alert">{error}</div>}</div><footer><button type="button" className="btn secondary" disabled={busy} onClick={()=>setModal(null)}>Đóng</button><button className="btn primary" disabled={busy}>{busy?"Đang lưu…":modal.type==="assign"?"Lưu phân công":"Bắt đầu QC"}</button></footer></form></section></div>}
 </>;
}
