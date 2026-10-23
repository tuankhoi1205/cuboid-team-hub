export const MAX_QC_IDS=2000;
export type QcIdCheck={objectId:string;result:""|"passed"|"changes";frameId:string;type:string;severity:"minor"|"major"|"critical";description:string;evidence:string};
export function qcIdKey(value:string){return /^\d+$/.test(value)?BigInt(value).toString():value;}
export function qcIdRange(start:string,end:string):string[]{
 if(!/^\d{1,30}$/.test(end)||start&&!/^\d{1,30}$/.test(start))throw new Error("Phạm vi ID không hợp lệ");
 const last=BigInt(end),first=start?BigInt(start):last===BigInt(0)?BigInt(0):BigInt(1),count=last-first+BigInt(1);
 if(count<=BigInt(0))throw new Error("ID bắt đầu phải nhỏ hơn hoặc bằng ID cuối");
 if(count>BigInt(MAX_QC_IDS))throw new Error(`Bảng QC tối đa ${MAX_QC_IDS} ID; chọn ID bắt đầu gần hơn trước khi bắt đầu QC`);
 return Array.from({length:Number(count)},(_,i)=>(first+BigInt(i)).toString());
}
export function qcIdRows(start:string,end:string,errorType:string,saved:QcIdCheck[]=[]):QcIdCheck[]{
 const byId=new Map(saved.map(row=>[qcIdKey(row.objectId),row]));
 return qcIdRange(start,end).map(objectId=>byId.get(objectId)||{objectId,result:"",frameId:"",type:errorType||"Khác",severity:"minor",description:"",evidence:""});
}
export function qcLogRows(data:Record<string,any>){
 type LogRow={objectId:string;check?:QcIdCheck;errors:{index:number;error:any}[]};
 const rows=new Map<string,LogRow>();
 for(const check of data.idChecks||[])rows.set(qcIdKey(check.objectId),{objectId:check.objectId,check,errors:[]});
 for(const [index,error] of (data.errors||[]).entries()){
  const key=qcIdKey(error.objectId||""),row:LogRow=rows.get(key)||{objectId:error.objectId||"",errors:[]};
  row.errors.push({index,error});rows.set(key,row);
 }
 return [...rows.values()].sort((a,b)=>{const x=qcIdKey(a.objectId),y=qcIdKey(b.objectId);return /^\d+$/.test(x)&&/^\d+$/.test(y)?BigInt(x)<BigInt(y)?-1:BigInt(x)>BigInt(y)?1:0:x.localeCompare(y);});
}
