import type {Row} from "./domain.ts";

export const QA_CATEGORIES=["Annotation","QA/QC","Tool / CVAT","KPI / Báo cáo","Khác"] as const;
export const qaText=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
export function qaAnswers(records:Row[],questionId:string){return records.filter(r=>r.kind==="qa-answer"&&r.data.questionId===questionId);}
export function qaStatus(question:Row,answers:Row[]){return question.status==="resolved"?"resolved":answers.length?"answered":"waiting";}
export function qaSearch(records:Row[],query:string,category="",status="",memberId=""){
 const terms=qaText(query.trim()).split(/\s+/).filter(Boolean);
 return records.filter(q=>q.kind==="qa-question").filter(q=>{
  const answers=qaAnswers(records,q.id),text=qaText([q.data.title,q.data.content,q.data.context,q.data.category,...answers.map(a=>a.data.content)].join(" "));
  const matchesStatus=!status||(status==="frequent"?!!q.data.frequent:qaStatus(q,answers)===status);
  return (!category||q.data.category===category)&&(!memberId||q.owner_id===memberId)&&matchesStatus&&terms.every(term=>text.includes(term));
 }).sort((a,b)=>Number(!!b.data.frequent)-Number(!!a.data.frequent)||latest(b).localeCompare(latest(a))||a.id.localeCompare(b.id));
 function latest(question:Row){return [question.updated_at,...qaAnswers(records,question.id).map(a=>a.updated_at)].sort().at(-1)||question.created_at;}
}
