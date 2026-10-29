import {z} from "zod";
import {offlineResultSchema,offlineLogSchema,type OfflineCheck} from "../lib/qc-offline.ts";
import type {Workspace} from "./types.ts";
const frame=z.number().int().nonnegative().max(100000000),id=z.string().regex(/^\d{1,30}$/);
const workspaceSchema=z.object({version:z.literal(1),source:offlineResultSchema.innerType().shape.source.nullable(),tool:z.object({summary:z.record(z.unknown()),rows:z.array(z.record(z.any())).max(100000),matrix:z.object({version:z.literal(1),frames:z.array(frame).max(2000),tracks:z.array(z.object({id,label:z.string().max(200),present:z.array(frame).max(2000)})).max(5000)})}).nullable(),checks:z.array(z.object({objectId:id,label:z.string().max(200),present:z.array(frame).min(1).max(2000),doneAt:z.union([z.literal(""),z.string().datetime({offset:true})]),logs:z.array(offlineLogSchema).max(2000)})).max(5000),cursor:z.number().int().min(0).max(5000),startedAt:z.string(),exportId:z.string().uuid(),completedAt:z.string(),draft:z.object({frameStart:z.string().max(30),frameEnd:z.string().max(30),description:z.string().max(2000),solution:z.string().max(2000),logId:z.string().max(200).optional()})});
export function parseWorkspace(input:unknown){const w=workspaceSchema.parse(input);if(w.checks.reduce((n,c)=>n+c.present.length,0)>500000)throw new Error("Ma trận vượt 500.000 ô");if(w.checks.length&&w.cursor>=w.checks.length)throw new Error("Vị trí ID trong nháp không hợp lệ");if(new Set(w.checks.map(c=>c.objectId)).size!==w.checks.length)throw new Error("Nháp có ID trùng");return w;}
export function blankDraft(check?:Pick<OfflineCheck,"present">){return{frameStart:check?String(check.present[0]):"",frameEnd:check?String(check.present[0]):"",description:"",solution:""};}
export function nextUnchecked(checks:OfflineCheck[],cursor:number){for(let step=1;step<=checks.length;step++){const i=(cursor+step)%checks.length;if(!checks[i].doneAt)return i;}return cursor;}
export function createBlankWorkspace(input:unknown):Workspace{
 const value=z.object({jobId:z.string().trim().regex(/^\d{1,30}$/, "Job ID chỉ gồm chữ số"),frameCount:z.coerce.number().int().min(1).max(2000),idCount:z.coerce.number().int().min(1).max(5000)}).parse(input);
 if(value.frameCount*value.idCount>500000)throw new Error("Bảng QC tối đa 500.000 ô ID × frame");
 const frames=Array.from({length:value.frameCount},(_,i)=>i),checks=Array.from({length:value.idCount},(_,i)=>({objectId:String(i+1),label:"",present:frames,doneAt:"",logs:[]}));
 return{version:1,source:{kind:"blank",name:"Job-"+value.jobId+"-bang-trang",jobId:value.jobId,idCount:value.idCount,trackOffset:1,frames},tool:null,checks,cursor:0,startedAt:new Date().toISOString(),exportId:crypto.randomUUID(),completedAt:"",draft:blankDraft(checks[0])};
}
