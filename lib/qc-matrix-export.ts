import type {Row} from "./domain.ts";
import type {ExportSheet} from "./export.ts";
import {qcIdKey,qcLogRows,type QcIdCheck} from "./qc-table.ts";
import {inFrameRange,matrixCodes,rowFrameLogs,type MatrixPresence} from "./qc-matrix.ts";
import {BASIC_CHECKS} from "./qc-basic.ts";
export function qcMatrixSheets(session:Row,review:Row|undefined,presence:MatrixPresence|null,warnings:any[]):ExportSheet[]{
 const checks:QcIdCheck[]=review?qcLogRows(review.data).map(r=>({...r.check,objectId:r.objectId,result:r.errors.length?"changes":r.check?.result||"passed",frameId:r.check?.frameId||"",type:r.check?.type||"",severity:r.check?.severity||"minor",description:r.check?.description||"",evidence:r.check?.evidence||""})):(session.data.draft?.idChecks||[]);
 const frames=presence?.frames||Array.from({length:Math.min(2000,session.data.frameCount||60)},(_,i)=>i),tracks=new Map((presence?.tracks||[]).map(t=>[qcIdKey(t.id),t]));
 if(!presence&&session.data.frameCount>2000)throw new Error("Ma trận hỗ trợ tối đa 2.000 frame khi chưa có file đối chiếu; hãy chia nhỏ lượt QC.");
 if(frames.length*checks.length>500000)throw new Error("Ma trận vượt 500.000 ô; hãy xuất từng lượt QC nhỏ hơn.");
 const byId=new Map<string,any[]>();for(const w of warnings){const id=qcIdKey(String(w.track??""));if(!byId.has(id))byId.set(id,[]);byId.get(id)!.push(w);}
 const logs=review?(review.data.errors||[]):checks.flatMap(c=>rowFrameLogs(c).map(l=>({...l,objectId:c.objectId})));
 const styles:number[][]=[],rows:unknown[][]=[];
 for(const c of checks){const id=qcIdKey(c.objectId),track=tracks.get(id),present=new Set(track?.present||[]),issues=byId.get(id)||[],own=logs.filter((l:any)=>qcIdKey(l.objectId||"")===id),cells=new Map<number,string[]>();for(const w of issues){if(!cells.has(w.frame))cells.set(w.frame,[]);cells.get(w.frame)!.push(BASIC_CHECKS.find(b=>b.key===w.check)?.code||w.code||"!");}
  const row:unknown[]=[c.objectId,track?.label||"",issues.length],color=[0,0,2];
  for(const f of frames){const manual=own.filter((l:any)=>inFrameRange(l,f)),value=matrixCodes([...(cells.get(f)||[]),...manual.map((l:any)=>l.code||"L")]),fixed=manual.length&&manual.every((l:any)=>l.fixed||l.verification==="passed");row.push(value);color.push(manual.length?(value.length>1?fixed?15:13:fixed?14:12):value?value.length>1?10:9:presence?present.has(f)?8:0:11);}
  rows.push(row);styles.push(color);
 }
 return [{name:"Matrix",rows:[["Object ID","Class","Tổng issue Tool",...frames.map(String)],...rows],widths:[14,20,18,...frames.map(()=>6)],freezeColumns:3,matrixStyle:(r,c)=>styles[r]?.[c]},
 {name:"Log QC",rows:[["Object ID","Từ frame","Đến frame","Mã","Loại lỗi","Mức độ","Nội dung log","Annotator sửa","QC kiểm lại","Ghi chú sửa"],...logs.map((l:any)=>[l.objectId,l.frameId===""||l.frameId==null?"":Number(l.frameId),l.frameEnd?Number(l.frameEnd):l.frameId===""||l.frameId==null?"":Number(l.frameId),l.code||"L",l.type,({minor:"Nhẹ",major:"Nặng",critical:"Nghiêm trọng"} as any)[l.severity]||l.severity,l.description,review?l.fixed?"Đã sửa":"Chưa sửa":"Nháp",l.verification==="passed"?"Sửa đúng":l.verification==="failed"?"Vẫn sai":review?"Chưa xác minh":"Nháp",l.fixNote||""])]},
 {name:"QC tung ID",rows:[["Object ID","Kết quả người QC","Số log QC","Ghi chú ID"],...checks.map(c=>[c.objectId,c.result==="changes"?"Có lỗi":c.result==="passed"?"Đạt":"Chưa kiểm",logs.filter((l:any)=>qcIdKey(l.objectId||"")===qcIdKey(c.objectId)).length,c.description||""])]},
 {name:"Huong dan",rows:[["Nội dung","Chi tiết"],["Job / ngày QC",`${session.data.jobId||"—"} / ${session.date||"—"}`],["Trạng thái",review?"Kết quả QC đã hoàn tất":"NHÁP đã lưu; chưa gửi cho annotator"],["Ghi chú QC",review?.data.note||session.data.draft?.note||""],["Log phạm vi","Một dòng Log QC là một log cho toàn bộ Từ frame–Đến frame; không nhân thành nhiều lỗi."],...BASIC_CHECKS.map(c=>[c.code,c.name]),["L","Log lỗi khác do người QC ghi"],["Nền xanh nhạt","Có box trong file; không có cảnh báo tool. Vẫn cần QC thủ công."],["Nền trắng","Không có box trong dữ liệu file; không tự suy ra outside."],["Nền xám","Chưa có file đối chiếu hiện diện."],["Nền vàng / cam","Một / nhiều mã cảnh báo hoặc log QC."],["Viền đỏ / xanh dương","Log chưa sửa / annotator đã xác nhận sửa hoặc QC xác minh sửa đúng."],["Tổng issue Tool","Số cảnh báo tự động của ID. Số log QC xem từng dòng ở tab Log QC."],["KPI / rework","Xuất file không thay đổi KPI. Cảnh báo tool không tự cộng rework."]] }];
}
