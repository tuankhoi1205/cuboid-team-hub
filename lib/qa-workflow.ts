import {z} from "zod";
import {ensure,type Hub,type Member,type Row} from "./domain.ts";
import {QA_CATEGORIES} from "./qa.ts";

const id=z.string().min(1).max(100),revision=z.number().int().positive();
const questionSchema=z.object({id:id.optional(),revision:revision.optional(),title:z.string().trim().min(5,"Tiêu đề cần ít nhất 5 ký tự").max(200),content:z.string().trim().min(3,"Mô tả rõ vấn đề cần hỏi").max(10000),category:z.enum(QA_CATEGORIES).default("Annotation"),context:z.string().trim().max(300).default("")});
const answerSchema=z.object({id:id.optional(),revision:revision.optional(),questionId:id,content:z.string().trim().min(1,"Nhập câu trả lời").max(10000)});
const sameRevision=(row:Row,value:number|undefined)=>ensure(row.revision===value,"Nội dung đã thay đổi. Làm mới và kiểm tra lại trước khi lưu.",409);
const canEdit=(actor:Member,row:Row)=>ensure(actor.role==="Lead"||row.owner_id===actor.id,"Chỉ tác giả hoặc Lead được chỉnh sửa nội dung này",403);
const reopened=(question:Row)=>({...question.data,acceptedAnswerId:null,frequent:false});

export async function qaAction(hub:Hub,actor:Member,action:string,input:any){
 if(!["qa-question","qa-answer","qa-accept","qa-frequent"].includes(action))return null;
 ensure(actor.state==="active","Tài khoản chưa hoạt động",403);
 if(action==="qa-question"){
  const data=questionSchema.parse(input),old=data.id?await hub.get(data.id,"qa-question"):null;
  if(old){canEdit(actor,old);sameRevision(old,data.revision);}
  const content={title:data.title,content:data.content,category:data.category,context:data.context};
  if(old&&Object.entries(content).every(([key,value])=>old.data[key]===value))return{ok:true,id:old.id};
  return hub.commit(actor,old?"Sửa câu hỏi":"Đăng câu hỏi",old,"qa-question",{...content,acceptedAnswerId:null,frequent:false},{owner_id:old?.owner_id||actor.id,status:"open"});
 }
 if(action==="qa-answer"){
  const data=answerSchema.parse(input),question=await hub.get(data.questionId,"qa-question"),old=data.id?await hub.get(data.id,"qa-answer"):null;
  if(old){canEdit(actor,old);sameRevision(old,data.revision);ensure(old.data.questionId===question.id,"Không được chuyển câu trả lời sang câu hỏi khác");if(old.data.content===data.content)return{ok:true,id:old.id};}
  const extras=old&&question.data.acceptedAnswerId===old.id?[hub.replace(question,reopened(question),"open")]:[];
  return hub.commit(actor,old?"Sửa câu trả lời":"Trả lời câu hỏi",old,"qa-answer",{questionId:question.id,content:data.content},{owner_id:old?.owner_id||actor.id,status:"active"},extras);
 }
 if(action==="qa-accept"){
  const data=z.object({id,revision,answerId:id.nullable()}).parse(input),question=await hub.get(data.id,"qa-question");
  canEdit(actor,question);sameRevision(question,data.revision);
  if(data.answerId){const answer=await hub.get(data.answerId,"qa-answer");ensure(answer.data.questionId===question.id,"Câu trả lời không thuộc câu hỏi này");}
  return hub.commit(actor,data.answerId?"Chọn câu trả lời giải đáp":"Mở lại câu hỏi",question,"qa-question",{...question.data,acceptedAnswerId:data.answerId,frequent:data.answerId?!!question.data.frequent:false},{status:data.answerId?"resolved":"open"});
 }
 hub.lead(actor);
 const data=z.object({id,revision,frequent:z.boolean()}).parse(input),question=await hub.get(data.id,"qa-question");sameRevision(question,data.revision);
 if(data.frequent){ensure(question.status==="resolved"&&question.data.acceptedAnswerId,"Chọn câu trả lời giải đáp trước khi đánh dấu thường gặp");const answer=await hub.get(question.data.acceptedAnswerId,"qa-answer");ensure(answer.data.questionId===question.id,"Câu trả lời không thuộc câu hỏi này");}
 return hub.commit(actor,data.frequent?"Đánh dấu câu hỏi thường gặp":"Bỏ đánh dấu thường gặp",question,"qa-question",{...question.data,frequent:data.frequent});
}
