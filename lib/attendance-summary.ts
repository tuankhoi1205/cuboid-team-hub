import type {Member,Row} from "./domain";
export function attendanceSummary(members:Pick<Member,"id"|"state">[],records:Row[],day:string,viewer:Pick<Member,"id"|"role">){
 const people=members.filter(m=>m.state==="active"&&(viewer.role==="Lead"||m.id===viewer.id)),ids=new Set(people.map(m=>m.id));
 const rows=records.filter(r=>r.kind==="attendance"&&r.date===day&&ids.has(r.owner_id||""));
 return {total:people.length,present:rows.filter(r=>["present","late"].includes(r.status)).length,half:rows.filter(r=>r.status==="half").length,onLeave:rows.filter(r=>r.status==="leave").length,absent:rows.filter(r=>r.status==="absent").length,unmarked:people.filter(m=>!rows.some(r=>r.owner_id===m.id)).length};
}
