import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import {createRoot} from "react-dom/client";
import {offlineLogSchema,offlineResultSchema,type OfflineResult} from "../lib/qc-offline";
import {blankDraft,createBlankWorkspace,nextUnchecked} from "./workspace";
import type {MenuAction,Workspace,RecentJob} from "./types";
import "./styles.css";

const api=window.qcDesktop;
const empty=():Workspace=>({version:1,source:null,tool:null,checks:[],cursor:0,startedAt:"",exportId:crypto.randomUUID(),completedAt:"",draft:blankDraft()});
const hasDraft=(w:Workspace)=>!!(w.draft.description.trim()||w.draft.solution.trim()||w.draft.logId);
type Drag={index:number;anchor:number;end:number;pointerId:number;element:HTMLButtonElement;x:number;y:number;raf:number|null};

function App(){
 const [w,setW]=useState<Workspace>(empty),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[saved,setSaved]=useState(false);
 const [compact,setCompact]=useState(false),[editor,setEditor]=useState(false),[offset,setOffset]=useState<0|1>(1),[query,setQuery]=useState(""),[page,setPage]=useState(0),[framePage,setFramePage]=useState(0),[filter,setFilter]=useState("all");
 const [blankForm,setBlankForm]=useState(false),[blank,setBlank]=useState({jobId:"",frameCount:"60",idCount:""});
 const [recent,setRecent]=useState<RecentJob[]>([]),[showRecent,setShowRecent]=useState(false);
 const live=useRef(w),description=useRef<HTMLInputElement>(null),matrixRef=useRef<HTMLDivElement>(null),stripRef=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null),saving=useRef(false),blockedSave=useRef(false),autoTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const menuActionRef=useRef<((choice:MenuAction)=>Promise<void>)|null>(null);
 live.current=w;
 const current=w.checks[w.cursor],done=w.checks.filter(c=>c.doneAt).length,logs=w.checks.reduce((n,c)=>n+c.logs.length,0);
 function errorText(e:unknown){if(e&&typeof e==="object"&&"issues" in e)return (e as {issues:{message:string}[]}).issues[0]?.message||"Dữ liệu không hợp lệ";return e instanceof Error?e.message:String(e);}
 const persist=async(state:Workspace)=>{
  if(autoTimer.current)clearTimeout(autoTimer.current);
  try{await api.save(state);setSaved(true);blockedSave.current=false;return true;}
  catch(e){blockedSave.current=true;setSaved(false);setError("Chưa lưu được nháp: "+errorText(e));return false;}
 };
 useEffect(()=>{
  void api.load().then(state=>{
   if(state){setW(state);setOffset(state.source?.trackOffset??1);setEditor(hasDraft(state));setMessage("Đã khôi phục nháp trên máy.");if(state.checks.length)void api.window({compact:false});}
  }).catch(e=>{blockedSave.current=true;setError(errorText(e));}).finally(()=>setReady(true));
 },[]);
 useEffect(()=>{
  if(!ready||blockedSave.current)return;
  setSaved(false);autoTimer.current=setTimeout(()=>void persist(live.current),300);
  return()=>{if(autoTimer.current)clearTimeout(autoTimer.current);};
 },[w,ready]);
 useEffect(()=>{
  const handler=(event:BeforeUnloadEvent)=>{if(!saved||busy){event.preventDefault();event.returnValue="";}};
  window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);
 },[saved,busy]);
 useEffect(()=>{
  const strip=stripRef.current;if(!compact||!strip)return;
  const wheel=(event:WheelEvent)=>{
   const scroll=matrixRef.current;if(event.ctrlKey||!scroll||scroll.scrollWidth<=scroll.clientWidth)return;
   const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
   event.preventDefault();scroll.scrollLeft+=delta*(event.deltaMode===1?38:event.deltaMode===2?scroll.clientWidth:1);
  };
  strip.addEventListener("wheel",wheel,{passive:false});return()=>strip.removeEventListener("wheel",wheel);
 },[compact,ready]);
 useEffect(()=>{
  const handler=(event:KeyboardEvent)=>{
   if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||busy||!current)return;
   const target=event.target as HTMLElement;
   if(event.key==="Escape"&&editor){event.preventDefault();void cancelEditor();return;}
   if(target.closest("input,textarea,select")||target.closest("button:not([data-frame])"))return;
   if(!editor&&event.key==="Enter"){event.preventDefault();void openEditor();}
   else if(!editor&&event.key.toLowerCase()==="l"){event.preventDefault();void openEditor();}
   else if(compact&&!editor&&event.key==="ArrowRight"){event.preventDefault();if(w.cursor+1<w.checks.length)void jump(w.cursor+1);}
   else if(compact&&!editor&&event.key==="ArrowLeft"){event.preventDefault();if(w.cursor)void jump(w.cursor-1);}
  };
  window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);
 },[compact,editor,w,busy]);
 async function action(fn:()=>Promise<void>){setError("");setBusy(true);try{await fn();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
 function changed(state:Workspace){return{...state,exportId:crypto.randomUUID(),completedAt:""};}
 async function install(state:Workspace){
  if(!await persist(state))return;
  setW(state);setEditor(hasDraft(state));setPage(0);setFramePage(0);setQuery("");setFilter("all");setBlankForm(false);setShowRecent(false);
  await api.window({compact:false});setCompact(false);
 }
 async function openDatumaro(){await action(async()=>{
  if(!await persist(live.current))return;
  const result=await api.datumaro(offset);if(!result)return;
  if(result.tool.matrix.tracks.some(t=>!/^\d{1,30}$/.test(t.id)))throw new Error("File có cuboid thiếu ID hoặc ID không hợp lệ. Sửa trên CVAT rồi xuất Datumaro lại.");
  const tracks=[...result.tool.matrix.tracks].filter(t=>t.present.length).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
  if(!tracks.length)throw new Error("File không có ID cuboid để QC.");
  const checks=tracks.map(t=>({objectId:t.id,label:t.label,present:t.present,doneAt:"",logs:[]}));
  await install({...empty(),source:result.source,tool:result.tool,checks,startedAt:new Date().toISOString(),draft:blankDraft(checks[0])});
  setMessage("Đã mở "+checks.length+" ID. Kéo chọn frame hoặc bấm ID để chọn cả hàng.");
 });}
 async function makeBlank(){await action(async()=>{
  const state=createBlankWorkspace(blank);
  if(!await persist(live.current))return;
  await install(state);setMessage("Job "+blank.jobId+" · ID 1–"+blank.idCount+" · Frame 0–"+(Number(blank.frameCount)-1));
 });}
 async function restore(){await action(async()=>{
  if(!await persist(live.current))return;
  const state=await api.importDraft();if(state){await install(state);setOffset(state.source?.trackOffset??1);setMessage("Đã mở nháp.");}
 });}
 async function startAnother(){await action(async()=>{
  if(!await persist(live.current))return;
  const state=empty();if(!await persist(state))return;
  setW(state);setEditor(false);setCompact(false);setBlankForm(false);setShowRecent(false);setMessage("Bài trước đã lưu trong Bài gần đây. Mở Datumaro hoặc tạo bảng trắng để làm bài tiếp theo.");
  await api.window({compact:false,home:true});
 });}
 async function viewRecent(){await action(async()=>{
  if(!await persist(live.current))return;
  setRecent(await api.history());setShowRecent(true);setBlankForm(false);
  await api.window({compact:false});setCompact(false);
 });}
 async function restoreRecent(key:string){await action(async()=>{
  if(!await persist(live.current))return;
  const state=await api.historyOpen(key);await install(state);setOffset(state.source?.trackOffset??1);setMessage("Đã mở lại bài cùng tiến độ và log đã lưu.");
 });}
 async function jump(index:number){
  if(busy)return;
  if(hasDraft(w)){setError("Lưu hoặc hủy nội dung đang nhập trước khi chuyển ID.");return;}
  const state={...w,cursor:index,draft:blankDraft(w.checks[index])};
  if(await persist(state)){setW(state);setEditor(false);if(compact)await api.window({compact:true,editor:false});}
 }
 function selectRange(index:number,start:number,end:number){
  const state=live.current;
  if(busy||!state.checks[index])return false;
  if(index!==state.cursor&&hasDraft(state)){setError("Lưu hoặc hủy nội dung đang nhập trước khi chọn ID khác.");return false;}
  setW(value=>({...value,cursor:index,draft:{...(index===value.cursor?value.draft:blankDraft(value.checks[index])),frameStart:String(Math.min(start,end)),frameEnd:String(Math.max(start,end))}}));
  return true;
 }
 function selectWhole(index:number){
  const row=w.checks[index];if(row&&selectRange(index,row.present[0],row.present.at(-1)!))matrixRef.current?.focus({preventScroll:true});
 }
 function stopDrag(){
  const d=drag.current;if(!d)return;drag.current=null;
  if(d.raf!==null)cancelAnimationFrame(d.raf);
  if(d.element.hasPointerCapture(d.pointerId))d.element.releasePointerCapture(d.pointerId);
 }
 function finishDrag(){const d=drag.current;stopDrag();if(d)void openEditor();}
 function dragTick(){
  const d=drag.current,scroll=matrixRef.current;if(!d||!scroll)return;d.raf=null;
  const bounds=scroll.getBoundingClientRect(),left=bounds.left+244;
  const dx=d.x>bounds.right-24?18:d.x<left+20?-18:0;
  if(dx)scroll.scrollLeft+=dx;
  const target=document.elementFromPoint(d.x,d.y)?.closest<HTMLButtonElement>("button[data-frame][data-row-index]");
  if(target&&Number(target.dataset.rowIndex)===d.index){
   const frame=Number(target.dataset.frame);
   if(frame!==d.end&&!target.disabled){d.end=frame;selectRange(d.index,d.anchor,frame);}
  }
  const canScroll=dx>0?scroll.scrollLeft+scroll.clientWidth<scroll.scrollWidth:scroll.scrollLeft>0;
  if(dx&&canScroll&&drag.current===d)d.raf=requestAnimationFrame(dragTick);
 }
 function startDrag(event:ReactPointerEvent<HTMLButtonElement>,index:number,frame:number){
  if(event.button!==0||busy)return;event.preventDefault();
  const anchor=event.shiftKey&&w.cursor===index&&w.draft.frameStart!==""?Number(w.draft.frameStart):frame;
  if(!selectRange(index,anchor,frame))return;
  matrixRef.current?.focus({preventScroll:true});
  event.currentTarget.setPointerCapture(event.pointerId);
  drag.current={index,anchor,end:frame,pointerId:event.pointerId,element:event.currentTarget,x:event.clientX,y:event.clientY,raf:null};
 }
 function moveDrag(event:ReactPointerEvent<HTMLButtonElement>){
  const d=drag.current;if(!d)return;d.x=event.clientX;d.y=event.clientY;
  if(d.raf!==null)cancelAnimationFrame(d.raf);dragTick();
 }
 async function openEditor(){
  if(!current||busy)return;setError("");setEditor(true);
  try{if(compact)await api.window({compact:true,editor:true});requestAnimationFrame(()=>description.current?.focus());}
  catch(e){setError(errorText(e));}
 }
 async function cancelEditor(){
  const state={...live.current,draft:{...live.current.draft,description:"",solution:"",logId:""}};
  if(!await persist(state))return;setW(state);setEditor(false);setError("");
  if(compact)await api.window({compact:true,editor:false});
  matrixRef.current?.focus({preventScroll:true});
 }
 async function commit(finishId=false){
  if(!current||busy||saving.current)return;stopDrag();saving.current=true;setError("");
  try{
   const form=w.draft,hasText=!!form.description.trim();
   if(!finishId&&!hasText)throw new Error("Nhập giải thích lỗi để lưu log. Chọn Done ID → khi đã kiểm xong ID.");
   if(!hasText&&(form.solution.trim()||form.logId))throw new Error("Nhập giải thích lỗi hoặc hủy sửa log.");
   const row={...current,logs:[...current.logs],doneAt:finishId?new Date().toISOString():""};
   if(hasText){
    const log=offlineLogSchema.parse({id:form.logId||crypto.randomUUID(),frameStart:Number(form.frameStart),frameEnd:Number(form.frameEnd),description:form.description,solution:form.solution});
    if(!/^\d+$/.test(form.frameStart)||!/^\d+$/.test(form.frameEnd)||!w.source?.frames.includes(log.frameStart)||!w.source.frames.includes(log.frameEnd)||!row.present.some(f=>f>=log.frameStart&&f<=log.frameEnd))throw new Error("Chọn phạm vi frame có ID xuất hiện.");
    if(form.logId){if(!row.logs.some(l=>l.id===form.logId))throw new Error("Không tìm thấy log đang sửa.");row.logs=row.logs.map(l=>l.id===form.logId?log:l);}
    else{if(logs>=2000)throw new Error("Mỗi kết quả tối đa 2.000 log.");row.logs.push(log);}
   }
   const checks=w.checks.map((c,i)=>i===w.cursor?row:c),cursor=finishId?nextUnchecked(checks,w.cursor):w.cursor,state=changed({...w,checks,cursor,draft:finishId?blankDraft(checks[cursor]):{...blankDraft(row),frameStart:form.frameStart,frameEnd:form.frameEnd}});
   if(await persist(state)){
    setW(state);setEditor(false);setMessage(finishId?"ID "+current.objectId+" · Done":"Đã lưu log ID "+current.objectId+". Chọn frame khác để ghi thêm; Done ID khi đã kiểm xong.");
    if(compact)await api.window({compact:true,editor:false});
    matrixRef.current?.focus({preventScroll:true});
   }
  }catch(e){setError(errorText(e));if(compact){setEditor(true);await api.window({compact:true,editor:true});}}
  finally{saving.current=false;}
 }
 async function removeLog(logId:string,edit=false){
  if(!current)return;const log=current.logs.find(l=>l.id===logId);if(!log)return;
  if(edit){
   if(hasDraft(w)){setError("Lưu hoặc hủy nội dung đang nhập trước.");return;}
   const state={...w,draft:{frameStart:String(log.frameStart),frameEnd:String(log.frameEnd),description:log.description,solution:log.solution,logId:log.id}};
   if(await persist(state)){setW(state);await openEditor();}
  }else{
   if(hasDraft(w)){setError("Lưu hoặc hủy nội dung đang nhập trước khi xóa log.");return;}
   const checks=w.checks.map((c,i)=>i===w.cursor?{...c,doneAt:"",logs:c.logs.filter(l=>l.id!==logId)}:c),state=changed({...w,checks});
   if(await persist(state)){setW(state);setMessage("Đã xóa log. Chọn Done ID khi đã kiểm xong ID.");}
  }
 }
 async function setMode(value:boolean,dock?:"top"|"bottom"){
  await action(async()=>{if(!await persist(w))return;const showEditor=editor||hasDraft(w);await api.window({compact:value,editor:showEditor,dock});setCompact(value);setEditor(showEditor);});
 }
 async function exportResult(){let exported=false;await action(async()=>{
  if(!w.source)throw new Error("Chưa có dữ liệu QC.");
  if(hasDraft(w))throw new Error("Lưu hoặc hủy log đang nhập trước khi xuất.");
  if(done!==w.checks.length)throw new Error("Còn ID chưa QC. Chọn Done ID → khi kiểm xong từng ID trước khi xuất.");
  const marks=[...warningMap].map(([key,codes])=>{const split=key.lastIndexOf(":");return{objectId:key.slice(0,split),frame:Number(key.slice(split+1)),codes};}).filter(m=>w.checks.some(c=>c.objectId===m.objectId&&c.present.includes(m.frame)));
  const completedAt=w.completedAt||new Date().toISOString(),result:OfflineResult=offlineResultSchema.parse({format:"cuboid-qc-result-v1",id:w.exportId,appVersion:"1.1.2",source:w.source,startedAt:w.startedAt,completedAt,checks:w.checks,...(marks.length?{marks}:{})});
  const state={...w,completedAt};if(!await persist(state))return;setW(state);
  if(await api.exportResult(result)){exported=true;setMessage("Đã xuất Excel gồm ma trận, log và minh chứng QC. Tải chính file này lên web.");}
 });return exported;}
 async function finishJob(){if(await exportResult())await startAnother();}
 async function menuAction(choice:MenuAction){
  if(choice==="log")await openEditor();
  else if(choice==="done")await commit(true);
  else if(choice==="previous"&&w.cursor)await jump(w.cursor-1);
  else if(choice==="next"&&w.cursor+1<w.checks.length)await jump(w.cursor+1);
  else if(choice==="expand")await setMode(false);
  else if(choice==="top"||choice==="bottom")await setMode(true,choice);
  else if(choice==="export")await exportResult();
  else if(choice==="finish")await finishJob();
  else if(choice==="new")await startAnother();
  else if(choice==="recent")await viewRecent();
  else if(choice==="close")await action(async()=>{if(await persist(live.current))await api.close();});
 }
 async function showMenu(){
  if(busy||!current)return;
  try{
   const choice=await api.menu({previous:w.cursor>0,next:w.cursor+1<w.checks.length,export:done===w.checks.length,progress:("ID "+current.objectId+" · "+(w.cursor+1)+"/"+w.checks.length+" · "+done+" đã QC").slice(0,120)});
   if(choice)await menuActionRef.current?.(choice);
  }catch(e){setError(errorText(e));}
 }
 menuActionRef.current=menuAction;
 const allFrames=w.source?.frames||[],shownFrames=compact?allFrames:allFrames.slice(framePage*60,framePage*60+60),framePages=Math.max(1,Math.ceil(allFrames.length/60));
 const filtered=w.checks.map((c,index)=>({c,index})).filter(({c})=>(c.objectId+" "+c.label).toLowerCase().includes(query.toLowerCase())&&(filter==="all"||filter==="open"&&!c.doneAt||filter==="errors"&&c.logs.length)),pages=Math.max(1,Math.ceil(filtered.length/35));
 const {warningDetails,warningMap}=useMemo(()=>{
  const warningDetails=new Map<string,string[]>(),warningMap=new Map<string,string>();
  for(const r of w.tool?.rows||[])if(r.track!==null&&r.track!==undefined&&r.track!==""){
   const key=String(r.track)+":"+r.frame,old=warningMap.get(key)||"";if(!old.includes(r.code))warningMap.set(key,old+r.code);
   const details=warningDetails.get(key)||[];details.push(r.detail);warningDetails.set(key,details);
  }return{warningDetails,warningMap};
 },[w.tool]);
 const matrix=(rows:{c:typeof current;index:number}[])=> <div ref={matrixRef} className="matrix-scroll" tabIndex={0} aria-label="Ma trận QC" onContextMenu={event=>{
  event.preventDefault();const target=event.target as HTMLElement,cell=target.closest<HTMLButtonElement>("button[data-frame][data-row-index]"),id=target.closest<HTMLButtonElement>("button[data-whole-id]");
  if(cell){const frame=Number(cell.dataset.frame),index=Number(cell.dataset.rowIndex);if(index!==w.cursor||frame<Number(w.draft.frameStart)||frame>Number(w.draft.frameEnd))selectRange(index,frame,frame);}
  else if(id)selectWhole(Number(id.dataset.wholeId));
  void showMenu();
 }}>
  <table className="matrix"><thead><tr><th className="sticky-id strip-drag" title="Kéo tiêu đề để di chuyển thanh nổi">Object ID</th><th className="sticky-label"><span className="strip-drag">Nhãn · Trạng thái</span>{compact&&<button className="strip-menu" aria-label="Tùy chọn QC" title="Ghi log, Done, chuyển ID, ghim thanh…" disabled={busy} onClick={()=>void showMenu()}>…</button>}</th>{shownFrames.map(f=><th key={f}>{f}</th>)}</tr></thead>
  <tbody>{rows.map(({c,index})=><tr key={c.objectId} className={index===w.cursor?"active-row":""}>
   <th className="sticky-id"><button data-whole-id={index} aria-label={"Chọn toàn bộ ID "+c.objectId} title="Bấm để chọn toàn bộ frame của ID này" disabled={busy} onClick={()=>selectWhole(index)}>ID {c.objectId}</button></th>
   <td className="sticky-label">{c.label&&<span className="row-label">{c.label}</span>}<span className={c.doneAt?(c.logs.length?"status-error":"status-done"):"status-open"}>{c.doneAt?(c.logs.length?c.logs.length+" log":"✓ Done"):c.logs.length?c.logs.length+" log · Đang QC":"Chưa QC"}</span>{compact&&<span className={"save-indicator "+(error?"failed":saved?"saved":"")} title={error||(saved?"Đã lưu trên máy":"Đang lưu…")}>●</span>}</td>
   {shownFrames.map(f=>{
    const present=c.present.includes(f),rowLogs=c.logs.filter(l=>f>=l.frameStart&&f<=l.frameEnd),codes=warningMap.get(c.objectId+":"+f)||"",selected=present&&index===w.cursor&&f>=Number(w.draft.frameStart)&&f<=Number(w.draft.frameEnd);
    const title=rowLogs.length?rowLogs.map(l=>l.description).join("; "):codes?"Cảnh báo tool "+codes+" · Frame "+f+": "+(warningDetails.get(c.objectId+":"+f)||[]).join("; "):"Frame "+f+(present?" · Có object":" · Không xuất hiện");
    return<td key={f}><button data-frame={f} data-row-index={index} aria-label={"ID "+c.objectId+" frame "+f} className={[present?"present":"absent",codes?"warning":"",rowLogs.length?"issue":"",selected?"selected":""].join(" ")} disabled={!present||busy} title={title}
     onPointerDown={e=>startDrag(e,index,f)} onPointerMove={moveDrag} onPointerUp={finishDrag} onLostPointerCapture={stopDrag}
     onClick={e=>{if(e.detail===0&&selectRange(index,f,f))void openEditor();}}>{rowLogs.length?"L":codes||(present?"·":"")}</button></td>;
   })}
  </tr>)}</tbody></table>
 </div>;
 const frameNav=<div className="frame-nav"><button disabled={framePage===0} onClick={()=>setFramePage(framePage-1)}>← Frame</button><span>{shownFrames[0]??"—"}–{shownFrames.at(-1)??"—"} · {framePage+1}/{framePages}</span><button disabled={framePage+1>=framePages} onClick={()=>setFramePage(framePage+1)}>Frame →</button></div>;
 const logForm=current&&<form className="log-form" onSubmit={e=>{e.preventDefault();void commit();}} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing){e.preventDefault();void commit();}}}>
  <div className="range-inputs"><label>Từ frame<input aria-label="Từ frame" inputMode="numeric" value={w.draft.frameStart} onChange={e=>setW({...w,draft:{...w.draft,frameStart:e.target.value}})}/></label><label>Đến frame<input aria-label="Đến frame" inputMode="numeric" value={w.draft.frameEnd} onChange={e=>setW({...w,draft:{...w.draft,frameEnd:e.target.value}})}/></label></div>
  <label className="description">Giải thích lỗi<input ref={description} autoFocus aria-label="Giải thích lỗi" maxLength={2000} value={w.draft.description} placeholder="Giải thích lỗi…" onChange={e=>setW({...w,draft:{...w.draft,description:e.target.value}})}/></label>
  <label className="solution">Hướng giải quyết · tùy chọn<input aria-label="Hướng giải quyết" maxLength={2000} value={w.draft.solution} placeholder="Có thể bỏ trống" onChange={e=>setW({...w,draft:{...w.draft,solution:e.target.value}})}/></label>
  <button className="primary" type="submit" disabled={busy}>Enter ↵ · Lưu</button><button type="button" disabled={busy} onClick={()=>void cancelEditor()}>Hủy</button>
 </form>;
 const blankFields=<form className="blank-form" onSubmit={e=>{e.preventDefault();void makeBlank();}}>
  <div className="blank-fields"><label>Job ID<input aria-label="Job ID" required autoFocus inputMode="numeric" pattern="[0-9]+" maxLength={30} value={blank.jobId} onChange={e=>setBlank({...blank,jobId:e.target.value})}/></label>
  <label>Số frame<input aria-label="Số frame" required type="number" min={1} max={2000} step={1} value={blank.frameCount} onChange={e=>setBlank({...blank,frameCount:e.target.value})}/></label>
  <label>Số ID<input aria-label="Số ID" required type="number" min={1} max={5000} step={1} value={blank.idCount} onChange={e=>setBlank({...blank,idCount:e.target.value})}/></label></div>
  <div className="button-row"><button type="button" disabled={busy} onClick={()=>setBlankForm(false)}>Quay lại</button><button className="primary" disabled={busy} type="submit">Tạo bảng QC</button></div>
 </form>;
 const recentList=showRecent&&<section className="card recent-jobs"><div className="review-head"><h2>Bài gần đây</h2><button onClick={()=>setShowRecent(false)}>Đóng danh sách</button></div>{recent.length?recent.map(job=><button key={job.key} disabled={busy} onClick={()=>void restoreRecent(job.key)}><b>{job.title}</b><span>{job.done}/{job.total} ID · {job.done===job.total?"Đã hoàn tất":"Đang QC"}</span></button>):<p>Chưa có bài đã lưu trên máy.</p>}</section>;
 if(!ready)return<div className="loading">Đang mở nháp…</div>;
 return<div className={compact?"app compact":"app"}>
  {!compact&&<><header className="titlebar"><div className="brand"><span className="brand-mark">QC</span><b>CUBOID <span>OFFLINE</span></b></div><div className="title-job">{w.source?.name||"Datumaro hoặc bảng trắng → QC"}</div><nav>{current&&<><span className="progress-small">{done}/{w.checks.length} ID</span><button disabled={busy} onClick={()=>void setMode(true)}>Thanh nổi</button></>}<button disabled={busy} aria-label="Đóng app" onClick={()=>void action(async()=>{if(await persist(live.current))await api.close();})}>×</button></nav></header>
  <div className="feedback" aria-live="polite"><span className={error?"error":""} role={error?"alert":undefined}>{error||(busy?"Đang xử lý…":message||"Mở Datumaro hoặc tạo bảng trắng để bắt đầu.")}</span><small className={saved?"saved":""}>{saved?"● Đã lưu trên máy":"○ Chưa lưu"}</small></div></>}
  {compact&&current?<>
   <div className="strip-matrix" ref={stripRef}>{matrix([{c:current,index:w.cursor}])}<div className="strip-actions"><button className="strip-previous" disabled={busy||!w.cursor||hasDraft(w)} title="Quay về ID trước" onClick={()=>void jump(w.cursor-1)}>← ID trước</button><button className="strip-done primary" disabled={busy||done===w.checks.length&&!hasDraft(w)} title={"Xác nhận Done ID "+current.objectId+" và chuyển đến ID chưa QC tiếp theo"} onClick={()=>void commit(true)}>{done===w.checks.length&&!hasDraft(w)?"Đã xong ✓":"Done ID →"}</button></div></div>
   {editor&&<section className="strip-editor"><div className="editor-title"><b>Ghi log · ID {current.objectId}</b><small>Enter lưu log · Done ID để chuyển</small></div>{logForm}{error&&<p className="error" role="alert">{error}</p>}</section>}
  </>:<main className="simple-main">
   {recentList}
   {!current?<section className="empty-state"><h1>QC offline</h1>{blankForm?blankFields:<><p>Mở Datumaro hoặc tạo bảng trắng, không cần mạng.</p><div className="button-row"><button className="primary" disabled={busy} onClick={()=>void openDatumaro()}>Mở Datumaro</button><button disabled={busy} onClick={()=>setBlankForm(true)}>Tạo bảng trắng</button><button disabled={busy} onClick={()=>void viewRecent()}>Bài gần đây</button><button disabled={busy} onClick={()=>void restore()}>Mở nháp</button></div><label className="offset-option">ID hiển thị<select value={offset} disabled={busy} onChange={e=>setOffset(Number(e.target.value) as 0|1)}><option value={1}>CVAT · +1</option><option value={0}>Datumaro gốc · 0</option></select></label></>}</section>:<>
    <div className="simple-toolbar"><div className="button-row"><button disabled={busy} onClick={()=>void startAnother()}>Mở bài khác</button><button disabled={busy} onClick={()=>void viewRecent()}>Bài gần đây</button><button disabled={busy} onClick={()=>setBlankForm(!blankForm)}>Bảng trắng mới</button><button disabled={busy} onClick={()=>void action(async()=>{await api.exportDraft(w);})}>Lưu nháp ra file</button>{w.source?.kind!=="blank"&&<button disabled={busy} onClick={()=>void action(async()=>{if(w.source&&w.source.kind!=="blank")await api.exportTool(w.source.sha256,w.source.trackOffset);})}>Excel Tool_QC</button>}</div><div className="button-row"><button disabled={busy||done!==w.checks.length} onClick={()=>void exportResult()}>Xuất Excel ↓</button><button className="primary" disabled={busy||done!==w.checks.length} onClick={()=>void finishJob()}>Hoàn tất & mở bài khác</button></div></div>
    {blankForm&&<section className="card new-blank">{blankFields}</section>}
    <section className="card review-card"><div className="review-head"><div><h2>Đang QC · ID {current.objectId}</h2><p>{w.source?.kind==="blank"?"Job "+w.source.jobId+" · ":current.label?current.label+" · ":""}{current.logs.length} log · {done}/{w.checks.length} ID xong</p></div><div className="button-row"><button disabled={busy} className="primary" onClick={()=>void openEditor()}>Ghi log</button><button disabled={busy} onClick={()=>void commit(true)}>Done ID →</button><button disabled={!w.cursor||busy} onClick={()=>void jump(w.cursor-1)}>← ID trước</button><button disabled={w.cursor+1>=w.checks.length||busy} onClick={()=>void jump(w.cursor+1)}>ID sau →</button></div></div>{editor&&logForm}
    {current.logs.length>0&&<div className="current-logs">{current.logs.map(l=><article key={l.id}><b>Frame {l.frameStart}–{l.frameEnd}</b><p>{l.description}{l.solution&&<><br/><strong>Hướng giải quyết:</strong> {l.solution}</>}</p><div><button disabled={busy} onClick={()=>void removeLog(l.id,true)}>Sửa</button><button disabled={busy} onClick={()=>void removeLog(l.id)}>Xóa</button></div></article>)}</div>}</section>
    <section className="card matrix-card"><div className="matrix-toolbar"><input aria-label="Tìm ID" placeholder="Tìm ID hoặc nhãn…" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><select aria-label="Lọc trạng thái" value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">Tất cả ID</option><option value="open">Chưa QC</option><option value="errors">Có log lỗi</option></select>{frameNav}</div>{matrix(filtered.slice(Math.min(page,pages-1)*35,Math.min(page,pages-1)*35+35))}<div className="pagination"><small>{logs} log{w.tool?" · "+(w.tool.summary.warnings||0)+" cảnh báo tool":" · Bảng trắng"}</small><button disabled={!page} onClick={()=>setPage(page-1)}>← Trang</button><span>{Math.min(page+1,pages)}/{pages}</span><button disabled={page+1>=pages} onClick={()=>setPage(page+1)}>Trang →</button></div></section>
    <p className="hint">Kéo chọn frame · Bấm tên ID để chọn cả hàng · Chuột phải / … → Ghi log (L) · Enter chỉ lưu log · Done ID chuyển ID · Kéo tiêu đề để di chuyển thanh nổi.</p>
   </>}
  </main>}
 </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);
