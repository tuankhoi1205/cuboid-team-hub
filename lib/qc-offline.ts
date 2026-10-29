import {z} from "zod";
const id=z.string().min(1).max(200),objectId=z.string().regex(/^\d{1,30}$/),frame=z.number().int().min(0).max(100000000),stamp=z.string().datetime({offset:true});
export const offlineLogSchema=z.object({id,frameStart:frame,frameEnd:frame,description:z.string().trim().min(1).max(2000),solution:z.string().trim().max(2000).default("")}).refine(l=>l.frameEnd>=l.frameStart,"Frame kết thúc phải từ frame bắt đầu");
const frames=z.array(frame).min(1).max(2000),name=z.string().min(1).max(255);
export const offlineSourceSchema=z.union([
 z.object({kind:z.literal("datumaro").optional(),name,sha256:z.string().regex(/^[a-f0-9]{64}$/),trackOffset:z.union([z.literal(0),z.literal(1)]),frames}),
 z.object({kind:z.literal("blank"),name,jobId:objectId,idCount:z.number().int().positive().max(5000),trackOffset:z.literal(1),frames})
]);
export const offlineResultSchema=z.object({
 format:z.literal("cuboid-qc-result-v1"),id:z.string().uuid(),appVersion:z.string().max(30),
 source:offlineSourceSchema,
 startedAt:stamp,completedAt:stamp,
 checks:z.array(z.object({objectId,label:z.string().max(200),present:z.array(frame).min(1).max(2000),doneAt:stamp,logs:z.array(offlineLogSchema).max(2000)})).min(1).max(5000)
 ,marks:z.array(z.object({objectId,frame,codes:z.string().regex(/^[SKZHOD!]{1,7}$/)})).max(100000).optional()
}).superRefine((v,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:"custom",message}),ids=v.checks.map(c=>/^\d{1,30}$/.test(c.objectId)?BigInt(c.objectId).toString():c.objectId),frames=new Set(v.source.frames),logs=v.checks.flatMap(c=>c.logs);
 if(new Set(ids).size!==ids.length)fail("Mỗi ID chỉ có một dòng kiểm tra");
 if(frames.size!==v.source.frames.length)fail("Danh sách frame bị trùng");
 if(logs.length>2000||new Set(logs.map(l=>l.id)).size!==logs.length)fail("Tối đa 2.000 log, mỗi log có mã riêng");
 if(v.checks.reduce((n,c)=>n+c.present.length,0)>500000)fail("Ma trận vượt 500.000 ô");
 if(Date.parse(v.completedAt)<Date.parse(v.startedAt))fail("Thời gian hoàn tất không hợp lệ");
 if(v.marks?.some(m=>!ids.includes(/^\d{1,30}$/.test(m.objectId)?BigInt(m.objectId).toString():m.objectId)||!frames.has(m.frame)))fail("Cảnh báo không thuộc ID/frame trong bảng QC");
 if(v.source.kind==="blank"){
  if(v.source.frames.some((f,i)=>f!==i))fail("Bảng trắng phải có frame liên tục từ 0");
  if(v.checks.length!==v.source.idCount||Number.isSafeInteger(v.source.idCount)&&Array.from({length:Math.min(v.source.idCount,5000)},(_,i)=>String(i+1)).some(id=>!ids.includes(id)))fail("Bảng trắng phải kiểm đủ từng ID đã tạo");
  if(v.checks.some(c=>c.present.length!==v.source.frames.length))fail("Bảng trắng phải kiểm đủ frame của mỗi ID");
 }
 for(const c of v.checks){
  if(c.present.some(f=>!frames.has(f))||new Set(c.present).size!==c.present.length)fail("Frame của ID không thuộc bảng QC");
  if(Date.parse(c.doneAt)<Date.parse(v.startedAt)||Date.parse(c.doneAt)>Date.parse(v.completedAt))fail("Thời điểm kiểm ID không hợp lệ");
  for(const l of c.logs)if(!frames.has(l.frameStart)||!frames.has(l.frameEnd)||!c.present.some(f=>f>=l.frameStart&&f<=l.frameEnd))fail("Log phải nằm trong frame xuất hiện của ID");
 }
});
export type OfflineLog=z.infer<typeof offlineLogSchema>;
export type OfflineResult=z.infer<typeof offlineResultSchema>;
export type OfflineCheck=OfflineResult["checks"][number];
export type OfflineContext={taskCode:string;jobId:string;assigneeName:string;reviewerName:string};
export function offlineCsv(result:OfflineResult,context?:OfflineContext){
 const cell=(v:unknown)=>{let s=String(v??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const rows:unknown[][]=[["Nguồn QC","Task","Job","Annotator","QA/QC","ID","Nhãn","Từ frame","Đến frame","Kết quả","Giải thích lỗi","Hướng giải quyết","Thời điểm kiểm"]];
 for(const c of result.checks){const base=[result.source.name,context?.taskCode||"",context?.jobId||(result.source.kind==="blank"?result.source.jobId:""),context?.assigneeName||"",context?.reviewerName||"",c.objectId,c.label];if(c.logs.length)for(const l of c.logs)rows.push([...base,l.frameStart,l.frameEnd,"Có lỗi",l.description,l.solution,c.doneAt]);else rows.push([...base,"","","Đã QC · Đạt","","",c.doneAt]);}
 return "\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n");
}
