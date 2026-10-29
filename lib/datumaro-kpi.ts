import type {Row} from "./domain.ts";
import type {CountId,KeyframeProduction} from "./keyframe-kpi.ts";
import {keyframeRange} from "./keyframe-kpi.ts";
import {kpiDayTarget} from "./kpi.ts";
import {reportEndId} from "./report-progress.ts";

export const DATUMARO_METHOD="datumaro-baseline-v1";
export const countedMethod=(method:unknown)=>method===DATUMARO_METHOD||method==="keyframe-v1";
export type CreditId=CountId&{cuboids:number;credit:number;baselineCount:number;addedCount:number;currentCount:number};
export type DatumaroLedger=KeyframeProduction&{
 basis:typeof DATUMARO_METHOD;ids:CreditId[];scopeFrames:number[];
 baseline:{runId:string;fileHash:string;fileName:string;total:number};
 creditTotal:number;baselineTotal:number;addedTotal:number;currentTotal:number;
};

// A baseline is immutable. For a new ID, retain the largest observed count until
// it has been reported complete. Saved Daily Reports retain their own snapshot.
export function datumaroLedger(incoming:KeyframeProduction,reference:{runId:string;fileHash:string;fileName:string},old?:DatumaroLedger,reportedThrough=-1):DatumaroLedger{
 if(incoming.format!=="datumaro"||!incoming.datumaroUsable)throw new Error("Cần Datumaro hợp lệ, có track_id và frame. "+(incoming.countIssues||[]).join(" "));
 if(old&&(incoming.offset!==old.offset||JSON.stringify(incoming.scopeFrames)!==JSON.stringify(old.scopeFrames)))throw new Error("File khác offset hoặc phạm vi frame của file ban đầu. Chọn đúng bản xuất của cùng Job.");
 const before=new Map<number,CreditId>((old?.ids||[]).map(r=>[r.id,r as CreditId])),now=new Map(incoming.ids.map(r=>[r.id,r]));
 const maxBefore=Math.max(-1,...before.keys());
 if(new Set([...before.keys(),...now.keys()]).size>5000)throw new Error("Tối đa 5.000 Object ID trong bảng tích lũy của Job.");
 for(const row of incoming.ids){
  if(!Number.isSafeInteger(row.cuboids)||row.cuboids!<0)throw new Error("File thiếu tổng cuboid theo ID; tải lại file để đếm.");
  if(old&&!before.has(row.id)&&row.id<=maxBefore)throw new Error(`ID ${row.id} mới xuất hiện trong khoảng ID cũ. Cần đối chiếu lại Object ID; chưa tự cộng vì có thể đã đánh lại số ID.`);
  if(before.has(row.id)&&before.get(row.id)!.label!==row.label)throw new Error(`Class của ID ${row.id} khác file trước. Cần đối chiếu định danh trước khi dùng tính KPI.`);
 }
 const ids=[...new Set([...before.keys(),...now.keys()])].sort((a,b)=>a-b).map(id=>{
  const prev=before.get(id),cur=now.get(id),raw=cur||prev!;
  const baselineCount=old?prev?.baselineCount||0:cur!.cuboids!;
  const addedCount=old?prev?.baselineCount?0:prev&&id<=reportedThrough?prev.addedCount:Math.max(prev?.addedCount||0,cur?.cuboids||0):0;
  return {...raw,cuboids:cur?.cuboids||0,credit:baselineCount+addedCount,baselineCount,addedCount,currentCount:cur?.cuboids||0};
 });
 const sum=(key:"credit"|"baselineCount"|"addedCount"|"currentCount")=>ids.reduce((n,r)=>n+r[key],0);
 if(sum("credit")>100000000)throw new Error("Khối lượng vượt giới hạn 100.000.000 cuboid.");
 return {...incoming,usable:true,basis:DATUMARO_METHOD,scopeFrames:incoming.scopeFrames||[],ids,baseline:old?.baseline||{...reference,total:sum("baselineCount")},creditTotal:sum("credit"),baselineTotal:sum("baselineCount"),addedTotal:sum("addedCount"),currentTotal:sum("currentCount")};
}

export function completedThrough(records:Row[],owner:string,task:string){
 return Math.max(-1,...records.filter(r=>r.kind==="daily"&&r.owner_id===owner&&["submitted","approved","imported"].includes(r.status)).flatMap(r=>(r.data.lines||[]).filter((l:any)=>l.taskId===task&&l.activity!=="qc").map((l:any)=>/^\d+$/.test(reportEndId(l))?Number(reportEndId(l)):-1)));
}

export function suggestDailyEnd(records:Row[],owner:string,task:string,day:string,production:KeyframeProduction|undefined,otherQuantity=0,reportId?:string){
 const target=kpiDayTarget(day,owner,records),needed=Math.max(0,target-otherQuantity);
 const range=keyframeRange(records,owner,task,day,"",reportId,production?.offset);
 const base={target,needed,previousEnd:range.previousEnd,start:range.start};
 if(!target)return {...base,status:"excluded" as const,endId:null,quantity:0,shortfall:0,error:"Ngày này không tính KPI."};
 if(!needed)return {...base,status:"met" as const,endId:null,quantity:0,shortfall:0,error:"Các bài khác đã đủ KPI ngày."};
 const error=range.baselineUnknown||(!production?.usable?"Chờ bảng cuboid theo ID đã xác nhận để gợi ý mốc KPI.":"");
 if(error)return {...base,status:"pending" as const,endId:null,quantity:0,shortfall:needed,error};
 const ids=production!.ids.filter(r=>r.id>=range.start).sort((a,b)=>a.id-b.id);
 let quantity=0;
 for(const row of ids){quantity+=production!.basis===DATUMARO_METHOD?row.credit||0:row.keyframes;if(quantity>=needed)return {...base,status:"ready" as const,endId:row.id,quantity,shortfall:0,error:""};}
 return {...base,status:"insufficient" as const,endId:ids.at(-1)?.id??null,quantity,shortfall:Math.max(0,needed-quantity),error:"Bảng đếm chưa đủ khối lượng để đạt KPI; cần bổ sung file hoặc bài được giao."};
}
