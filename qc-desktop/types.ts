import type {OfflineCheck,OfflineResult} from "../lib/qc-offline";
import type {MatrixPresence} from "../lib/qc-matrix";
export type ToolResult={summary:Record<string,any>;matrix:MatrixPresence;rows:any[]};
export type Workspace={version:1;source:OfflineResult["source"]|null;tool:ToolResult|null;checks:OfflineCheck[];cursor:number;startedAt:string;exportId:string;completedAt:string;draft:{frameStart:string;frameEnd:string;description:string;solution:string;logId?:string};};
export type MenuAction="log"|"done"|"previous"|"next"|"expand"|"top"|"bottom"|"export"|"finish"|"new"|"recent"|"close";
export type RecentJob={key:string;title:string;done:number;total:number;updatedAt:string};
export type DesktopApi={load():Promise<Workspace|null>;save(state:Workspace):Promise<void>;history():Promise<RecentJob[]>;historyOpen(key:string):Promise<Workspace>;datumaro(offset:0|1):Promise<{source:Extract<OfflineResult["source"],{sha256:string}>;tool:ToolResult}|null>;exportResult(result:OfflineResult):Promise<string|null>;exportDraft(state:Workspace):Promise<string|null>;importDraft():Promise<Workspace|null>;exportTool(hash:string,offset:0|1):Promise<string|null>;menu(options:{previous:boolean;next:boolean;export:boolean;progress:string}):Promise<MenuAction|null>;window(options:{compact:boolean;editor?:boolean;home?:boolean;dock?:"top"|"bottom"}):Promise<void>;close():Promise<void>};
declare global{interface Window{qcDesktop:DesktopApi}}
