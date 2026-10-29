import type {Row} from "./domain.ts";
export type WeeklySnapshotTotals={quantity:number;target:number;daysMet:number;kpiDays:number;qcRounds:number;reworkCount:number;offEquivalent:number;lateDays:number;conductBad:number;quality:number|null;qualityBasis:string;qualityPassed:number|null};
export function weeklySnapshot(records:Row[],memberId:string,start:string,cutoff:string){return records.find(r=>r.kind==="weekly-snapshot"&&r.owner_id===memberId&&r.date===start&&r.status==="approved"&&r.data.asOf<=cutoff);}
