import {BASIC_CHECKS} from "./qc-basic.ts";
import {qcIdKey,type QcIdCheck,type QcFrameLog} from "./qc-table.ts";
export type MatrixPresence={version:1;frames:number[];tracks:{id:string;label:string;present:number[]}[]};
export type MatrixCell={frame:number;codes:string;count:number};
export type MatrixRow={id:string;label:string;present:number[];cells:MatrixCell[];total:number};
const order="SKZHOD!L";
export function matrixCodes(codes:string[]){return [...new Set(codes)].sort((a,b)=>order.indexOf(a)-order.indexOf(b)).join("");}
export function qcFrameRange(log:{frameId?:string;frameEnd?:string}){return log.frameEnd&&log.frameEnd!==log.frameId?`${log.frameId}–${log.frameEnd}`:log.frameId||"—";}
export function inFrameRange(log:{frameId?:string;frameEnd?:string},frame:string|number){return /^\d+$/.test(log.frameId||"")&&/^\d+$/.test(String(frame))&&BigInt(frame)>=BigInt(log.frameId!)&&BigInt(frame)<=BigInt(log.frameEnd||log.frameId!);}
export function rowFrameLogs(row:QcIdCheck):QcFrameLog[]{
 if(row.frameLogs!==undefined)return row.frameLogs;
 return row.result==="changes"?[{id:"legacy-"+row.objectId,frameId:row.frameId,frameEnd:"",type:row.type,severity:row.severity,description:row.description,evidence:row.evidence,code:"L"}]:[];
}
export function replaceFrameLogs(row:QcIdCheck,logs:QcFrameLog[]):QcIdCheck{
 const first=logs[0];return {...row,frameLogs:logs,result:logs.length?"changes":row.result==="changes"?"":row.result,frameId:logs.length===1?first.frameId:"",type:first?.type||row.type,severity:first?.severity||row.severity,description:logs.length===1?first.description:logs.length?`${logs.length} log theo frame`:"",evidence:logs.length===1?first.evidence:""};
}
export function suggestedErrorType(code:string,types:string[]){
 const pattern:Record<string,RegExp>={S:/scale|kích thước/i,K:/kích thước/i,Z:/cao|tọa độ|vị trí/i,H:/hướng|xoay/i,O:/chồng|trùng|overlap/i,D:/xa|khoảng cách|vị trí/i};return types.find(t=>pattern[code]?.test(t))||types[0]||"Khác";
}
export function matrixPage(presence:MatrixPresence,warnings:any[],query:URLSearchParams){
 const integer=(key:string,fallback:number,max:number)=>{const n=Number(query.get(key)||fallback);return Number.isSafeInteger(n)&&n>0?Math.min(n,max):fallback;};
 const search=(query.get("q")||"").trim().toLowerCase(),check=query.get("check")||"",onlyIssues=query.get("issuesOnly")==="1",ids=query.get("ids"),wanted=ids?new Set(ids.split(",").map(qcIdKey)):null;
 if(wanted&&(wanted.size>50||[...wanted].some(id=>!/^\d{1,30}$/.test(id))))throw new Error("Chỉ chọn tối đa 50 Object ID hợp lệ mỗi trang.");
 const byTrack=new Map<string,any[]>();for(const issue of warnings){if(issue.track===null||issue.track===undefined||issue.track==="")continue;const id=qcIdKey(String(issue.track));if(!byTrack.has(id))byTrack.set(id,[]);byTrack.get(id)!.push(issue);}
 const sorted=[...presence.tracks].sort((a,b)=>/^\d+$/.test(a.id)&&/^\d+$/.test(b.id)?BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0:a.id.localeCompare(b.id));
 const rows=sorted.filter(r=>(!wanted||wanted.has(qcIdKey(r.id)))&&(!search||(r.id+" "+r.label).toLowerCase().includes(search))&&(!onlyIssues||(byTrack.get(qcIdKey(r.id))||[]).length>0)&&(!check||(byTrack.get(qcIdKey(r.id))||[]).some(i=>i.check===check)));
 const pages=Math.max(1,Math.ceil(rows.length/50)),page=Math.min(integer("page",1,10000),pages),framePages=Math.max(1,Math.ceil(presence.frames.length/60)),framePage=Math.min(integer("framePage",1,10000),framePages),shownFrames=presence.frames.slice((framePage-1)*60,framePage*60),frameSet=new Set(shownFrames);
 return {version:1,frames:presence.frames,shownFrames,framePage,framePages,page,pages,total:rows.length,rows:(wanted?rows:rows.slice((page-1)*50,page*50)).map(r=>{
  const issues=byTrack.get(qcIdKey(r.id))||[],cells=new Map<number,any[]>();for(const issue of issues)if(frameSet.has(issue.frame)){if(!cells.has(issue.frame))cells.set(issue.frame,[]);cells.get(issue.frame)!.push(issue);}
  return {id:r.id,label:r.label,present:r.present.filter(f=>frameSet.has(f)),total:issues.length,cells:[...cells].map(([frame,list])=>({frame,codes:matrixCodes(list.map(i=>BASIC_CHECKS.find(c=>c.key===i.check)?.code||i.code||"!")),count:list.length}))};
 })};
}
