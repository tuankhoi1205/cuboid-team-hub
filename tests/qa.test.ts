import {test} from "node:test";
import assert from "node:assert/strict";
import {qaSearch,qaAnswers,qaStatus} from "../lib/qa.ts";
import type {Row} from "../lib/domain.ts";
const question=(id:string,data:any={},extra:any={}):Row=>({id,kind:"qa-question",natural_key:id,owner_id:"ann",project_id:null,task_id:null,date:null,status:"open",revision:1,created_at:"2026-10-27T02:00:00Z",updated_at:"2026-10-27T02:00:00Z",data:{title:"Hướng xoay object",content:"Cách xử lý?",category:"Annotation",context:"Job 1261 · ID 20",...data},...extra});
test("Q&A search matches unaccented Vietnamese, answers and context, with category/status/owner filters",()=>{
 const q=question("one"),a={...question("a"),kind:"qa-answer",data:{questionId:q.id,content:"Đánh outside khi không còn xuất hiện"}},other=question("two",{title:"KPI hôm nay",category:"KPI / Báo cáo",context:""},{owner_id:"other"}),rows=[q,a,other];
 assert.deepEqual(qaSearch(rows,"HUONG XOAY").map(r=>r.id),["one"]);assert.deepEqual(qaSearch(rows,"danh outside").map(r=>r.id),["one"]);assert.deepEqual(qaSearch(rows,"1261").map(r=>r.id),["one"]);assert.equal(qaSearch(rows,"","Annotation","answered").length,1);assert.equal(qaSearch(rows,"","","waiting").length,1);assert.equal(qaSearch(rows,"","","resolved").length,0);assert.equal(qaSearch(rows,"","","frequent").length,0);assert.equal(qaSearch(rows,"","","","other")[0].id,"two");assert.equal(qaSearch(rows,"outside khong-co").length,0);assert.equal(qaStatus(q,qaAnswers(rows,q.id)),"answered");assert.equal(qaStatus(other,qaAnswers(rows,other.id)),"waiting");
});
test("Q&A prioritizes curated FAQs and recent discussion without changing stored data",()=>{
 const old=question("faq",{frequent:true},{status:"resolved"}),newer=question("recent",{}, {updated_at:"2026-10-27T04:00:00Z"}),discussion=question("discussion"),answer={...question("new-answer"),kind:"qa-answer",updated_at:"2026-10-27T05:00:00Z",data:{questionId:"discussion",content:"Trả lời mới"}},rows=[newer,old,discussion,answer],before=JSON.stringify(rows);
 assert.deepEqual(qaSearch(rows,"").map(r=>r.id),["faq","discussion","recent"]);assert.equal(qaSearch(rows,"","","resolved")[0].id,"faq");assert.equal(qaSearch(rows,"","","frequent")[0].id,"faq");assert.equal(JSON.stringify(rows),before);
});
