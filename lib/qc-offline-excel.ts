import {strFromU8,strToU8,unzipSync,zipSync} from "fflate/browser";
import {xlsx,type ExportSheet} from "./export.ts";
import {offlineResultSchema,type OfflineContext,type OfflineResult} from "./qc-offline.ts";
const META="__QC_DATA",MARKER="CUBOID_QC_RESULT_V1";
const key=(s:string)=>/^\d+$/.test(s)?BigInt(s).toString():s;
function encode(value:string){const bytes=strToU8(value),parts:string[]=[];for(let i=0;i<bytes.length;i+=12288)parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+12288))));return parts.join("");}
function decode(value:string){const binary=atob(value);return strFromU8(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
export function offlineWorkbookSheets(input:OfflineResult,context?:OfflineContext):ExportSheet[]{
 const result=offlineResultSchema.parse(input),frames=result.source.frames,marks=new Map((result.marks||[]).map(m=>[key(m.objectId)+":"+m.frame,m.codes]));
 const styles:number[][]=[],rows:unknown[][]=[];
 for(const c of result.checks){
  const present=new Set(c.present),style=[0,0,c.logs.length?6:5],row:unknown[]=[c.objectId,c.label,c.logs.length?"Có lỗi":"Đạt"];
  for(const f of frames){const warning=marks.get(key(c.objectId)+":"+f)||"",logged=c.logs.some(l=>f>=l.frameStart&&f<=l.frameEnd);row.push(warning+(logged?"L":""));style.push(logged?(warning?13:12):warning?(warning.length>1?10:9):present.has(f)?8:0);}
  rows.push(row);styles.push(style);
 }
 const job=context?.jobId||(result.source.kind==="blank"?result.source.jobId:""),date=new Date(result.completedAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});
 const metadata=encode(JSON.stringify(result)),chunks=Array.from({length:Math.ceil(metadata.length/30000)},(_,i)=>[metadata.slice(i*30000,(i+1)*30000)]);
 return[
  {name:"Matrix",rows:[["Object ID","Nhãn","Trạng thái",...frames.map(String)],...rows],widths:[14,20,18,...frames.map(()=>6)],freezeColumns:3,matrixStyle:(r,c)=>styles[r]?.[c]},
  {name:"Log QC",rows:[["Object ID","Từ frame","Đến frame","Giải thích lỗi","Hướng giải quyết"],...result.checks.flatMap(c=>c.logs.map(l=>[c.objectId,l.frameStart,l.frameEnd,l.description,l.solution]))],widths:[14,12,12,90,80],freezeColumns:1,maxRowHeight:409},
  {name:"QC tung ID",rows:[["Object ID","Kết quả QC","Số log","Thời điểm QC"],...result.checks.map(c=>[c.objectId,c.logs.length?"Có lỗi":"Đạt",c.logs.length,new Date(c.doneAt).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})])],widths:[14,20,12,26],freezeColumns:1},
  {name:"Huong dan",rows:[["Nội dung","Chi tiết"],["Job ID",job||"Chọn Job khi tải kết quả lên web"],["Annotator",context?.assigneeName||""],["Người QC",context?.reviewerName||""],["Nguồn",result.source.kind==="blank"?"Bảng trắng":result.source.name],["Hoàn tất QC",date],["Số ID / log",result.checks.length+" ID / "+result.checks.reduce((n,c)=>n+c.logs.length,0)+" log"],["Log phạm vi","Mỗi dòng Log QC áp dụng cho toàn bộ Từ frame–Đến frame."],["L","Log lỗi do người QC ghi."],["S / K / Z / H / O / D","Cảnh báo scale, kích thước, cao độ, hướng, chồng lấn và khoảng cách."],["Nền xanh nhạt","Object xuất hiện ở frame; không có cảnh báo."],["Nền vàng / cam","Cảnh báo tự động cần người QC đối chiếu."],["Viền đỏ","Frame đã có log QC."],["Minh chứng","Tải chính file Excel này lên Job tương ứng trên web."]],widths:[25,90]},
  {name:META,rows:[[MARKER],...chunks],widths:[30],hidden:true}
 ];
}
export function offlineWorkbook(result:OfflineResult,context?:OfflineContext){
 return zipSync(unzipSync(xlsx(offlineWorkbookSheets(result,context))),{level:6});
}
const unescapeXml=(s:string)=>s.replace(/&(#x[\da-f]+|#\d+|lt|gt|amp|quot|apos);/gi,(_all,name:string)=>name[0]==="#"?String.fromCodePoint(name[1].toLowerCase()==="x"?parseInt(name.slice(2),16):parseInt(name.slice(1),10)):({lt:"<",gt:">",amp:"&",quot:'"',apos:"'"} as Record<string,string>)[name.toLowerCase()]);
const decodeCell=(s:string)=>unescapeXml(s).replace(/_x([\da-f]{4})_/gi,(_m,n)=>String.fromCharCode(parseInt(n,16)));
function attrs(s:string){const values:Record<string,string>={};for(const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))values[m[1]]=unescapeXml(m[2]??m[3]);return values;}
function blocks(s:string,name:string){return [...s.matchAll(new RegExp("<(?:[\\w.-]+:)?"+name+"\\b(?![^>]*\\/>)([^>]*)>([\\s\\S]*?)</(?:[\\w.-]+:)?"+name+">","g"))];}
const text=(s:string)=>blocks(s,"t").map(m=>decodeCell(m[2])).join("");
function xml(bytes:Uint8Array|undefined){if(!bytes)throw new Error("Excel thiếu dữ liệu QC cần thiết.");const s=strFromU8(bytes);if(/<!DOCTYPE|<!ENTITY/i.test(s))throw new Error("XML của file Excel không hợp lệ.");return s;}
function extract(bytes:Uint8Array,names:Set<string>){
 let size=0;return unzipSync(bytes,{filter:file=>{if(!names.has(file.name))return false;size+=file.originalSize;if(size>64*1024*1024)throw new Error("Nội dung Excel vượt giới hạn xử lý.");return true;}});
}
function sheetRows(content:string,strings:string[]){
 return blocks(content,"row").map(row=>{
  const cells:Record<string,string>={};
  for(const cell of blocks(row[2],"c")){
   if(/<(?:[\w.-]+:)?f(?:\s|>)/.test(cell[2]))throw new Error("Không dùng công thức trong các ô log QC.");
   const a=attrs(cell[1]),column=a.r?.match(/^[A-Z]+/)?.[0];if(!column)continue;
   const value=blocks(cell[2],"v")[0]?.[2]||"";
   cells[column]=a.t==="s"?strings[Number(value)]??"":a.t==="inlineStr"?text(cell[2]):a.t==="str"?decodeCell(value):unescapeXml(value);
  }
  return{number:Number(attrs(row[1]).r),cells};
 }).sort((a,b)=>a.number-b.number);
}
/** Reads native Excel values, including shared strings after saving in Excel/LibreOffice. */
export function readOfflineWorkbook(bytes:Uint8Array):OfflineResult{
 if(bytes.length>30*1024*1024)throw new Error("File Excel vượt 30 MB.");
 const header=extract(bytes,new Set(["xl/workbook.xml","xl/_rels/workbook.xml.rels"])),book=xml(header["xl/workbook.xml"]),relations=xml(header["xl/_rels/workbook.xml.rels"]);
 const targets=new Map([...relations.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*?)\/?>/g)].map(m=>{const a=attrs(m[1]);return[a.Id,a.Target];}));
 const sheets=new Map<string,string>();
 for(const m of book.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*?)\/?>/g)){
  const a=attrs(m[1]),id=a["r:id"]||Object.entries(a).find(([k])=>k.endsWith(":id"))?.[1],target=id&&targets.get(id);if(!target)continue;
  const path=target.startsWith("/")?target.slice(1):"xl/"+target;
  if(path.includes("..")||!path.startsWith("xl/worksheets/"))throw new Error("Đường dẫn worksheet không hợp lệ.");
  sheets.set(a.name,path);
 }
 if(!sheets.has(META)||!sheets.has("Log QC")||!sheets.has("QC tung ID"))throw new Error("Cần file Excel kết quả xuất từ app QC.");
 const names=new Set([sheets.get(META)!,sheets.get("Log QC")!,sheets.get("QC tung ID")!,"xl/sharedStrings.xml"]),files=extract(bytes,names);
 const strings=files["xl/sharedStrings.xml"]?blocks(xml(files["xl/sharedStrings.xml"]),"si").map(m=>text(m[2])):[];
 const metadata=sheetRows(xml(files[sheets.get(META)!]),strings);
 if(metadata[0]?.cells.A!==MARKER)throw new Error("Excel không có minh chứng QC hợp lệ.");
 const encoded=metadata.slice(1).map(r=>r.cells.A||"").join("");if(encoded.length>24*1024*1024)throw new Error("Minh chứng QC quá lớn.");
 const result=offlineResultSchema.parse(JSON.parse(decode(encoded)));
 const checked=sheetRows(xml(files[sheets.get("QC tung ID")!]),strings).slice(1).filter(r=>r.cells.A?.trim()),seen=new Set<string>();
 for(const row of checked){const id=key(row.cells.A.trim());if(seen.has(id)||!result.checks.some(c=>key(c.objectId)===id))throw new Error("Danh sách ID trong Excel đã thay đổi.");seen.add(id);if(!["Đạt","Có lỗi","Done"].includes(row.cells.B?.trim()))throw new Error("Excel còn ID chưa được QC.");}
 if(seen.size!==result.checks.length)throw new Error("Excel phải giữ đủ danh sách ID đã QC.");
 const original=result.checks.flatMap(c=>c.logs),checks=result.checks.map(c=>({...c,logs:[] as typeof c.logs})),byId=new Map(checks.map(c=>[key(c.objectId),c])),used=new Set<string>();
 const logRows=sheetRows(xml(files[sheets.get("Log QC")!]),strings).slice(1);
 for(const [i,row] of logRows.entries()){
  const c=row.cells;if(!Object.values(c).some(v=>v.trim()))continue;
  const id=key((c.A||"").trim()),check=byId.get(id);if(!check)throw new Error("Log Excel có Object ID không thuộc bảng QC.");
  const start=(c.B||"").trim(),end=(c.C||start).trim();if(!/^\d+$/.test(start)||!/^\d+$/.test(end))throw new Error("Frame của log phải là số nguyên.");
  let logId=original[i]?.id||"excel-"+result.id+"-"+row.number;if(used.has(logId))logId="excel-"+result.id+"-"+row.number;used.add(logId);
  check.logs.push({id:logId,frameStart:Number(start),frameEnd:Number(end),description:c.D||"",solution:c.E||""});
 }
 return offlineResultSchema.parse({...result,checks});
}
