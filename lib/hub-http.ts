import { Hub, HubError, ensure, today } from "./domain.ts";
import { csv, xlsx } from "./export.ts";
import { z } from "zod";
import {dailyReportWritable} from "./daily-reports.ts";
import { previousWorkday } from "./kpi.ts";
import { reportSheets } from "./report-export.ts";
import { evaluationSheets } from "./evaluation.ts";
import {weeklySummarySheets} from "./weekly-summary.ts";
import {offlineCsv} from "./qc-offline.ts";
import {offlineWorkbook} from "./qc-offline-excel.ts";

export type HubRuntime = { DB: import("./domain.ts").Database; BUCKET?: { put(key:string,body:ArrayBuffer,options?:unknown):Promise<unknown>; get(key:string):Promise<{body:BodyInit}|null>; delete(key:string):Promise<unknown> }; LEAD_EMAIL:string; backupExtra?:Record<string,unknown>; authenticate(req:Request):Promise<import("./domain.ts").Identity|null>; now?:()=>Date; afterMutation?(action:string,result:any,me:any,body:any,req:Request):Promise<any>; };
const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: responseHeaders });
async function boundedBody(req: Request, limit: number) {
  ensure(Number(req.headers.get("Content-Length") || 0) <= limit, "Yêu cầu quá lớn", 413);
  const reader = req.body?.getReader(); ensure(reader, "Thiếu nội dung yêu cầu"); const chunks: Uint8Array[] = []; let size=0;
  while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>limit){await reader.cancel();throw new HubError("Yêu cầu quá lớn",413);} chunks.push(value); }
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}return bytes;
}
async function readJson(req: Request, limit=1024*1024) { try { return JSON.parse(new TextDecoder().decode(await boundedBody(req,limit))); } catch(e) { if(e instanceof HubError)throw e;throw new HubError("JSON không hợp lệ"); } }
export async function handleHub(req: Request, env: HubRuntime) {
  try {
    ensure(env.DB, "Cơ sở dữ liệu chưa được kết nối", 503);
    const identity = await env.authenticate(req); ensure(identity, "Vui lòng đăng nhập", 401);
    const hub = new Hub(env.DB, env.LEAD_EMAIL || "",env.now?.()||new Date()); const url = new URL(req.url); const action = url.pathname.split("/api/hub/")[1];
    if (req.method !== "GET") { ensure(req.headers.get("Origin") === url.origin, "Yêu cầu không cùng nguồn", 403); ensure(req.headers.get("Sec-Fetch-Site") !== "cross-site", "Yêu cầu không hợp lệ", 403); }
    if (req.method === "GET" && action === "state") return json(await hub.state(identity));
    if (req.method === "POST" && action === "setup") return json(await hub.setup(identity));
    if (req.method === "POST" && action === "activate") return json(await hub.activate(identity));
    const me = await hub.current(identity);
    await hub.ensureAttendanceDefaults();
    if(req.method==="GET"&&action==="qc-offline-export"){
      const sessionId=url.searchParams.get("id")||"",visible=await hub.visible(me);ensure(visible.some(r=>r.id===sessionId&&r.kind==="qc-session"),"Không có quyền xem log này",403);
      const session=await hub.get(sessionId,"qc-session"),result=session.data.offlineResult;ensure(result,"Phiên không có file QC offline",404);
      const format=url.searchParams.get("format"),excel=format==="xlsx",csvFormat=format==="csv";
      return new Response((excel?offlineWorkbook(result,session.data.offlineContext):csvFormat?offlineCsv(result,session.data.offlineContext):JSON.stringify(result,null,2)) as BodyInit,{headers:{...responseHeaders,"Content-Type":excel?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":csvFormat?"text/csv;charset=utf-8":"application/json","Content-Disposition":`attachment; filename="Job-${session.data.jobId||"QC"}.qc-result.${excel?"xlsx":csvFormat?"csv":"json"}"`}});
    }
    if(req.method==="GET"&&action==="kpi-summary")return json(await hub.kpiSummary(me,url.searchParams.get("period")||undefined,url.searchParams.get("member")||undefined));
    if(req.method==="GET"&&action==="evaluation")return json(await hub.evaluation(me,Object.fromEntries(url.searchParams)));
    if(req.method==="GET"&&action==="weekly-summary")return json(await hub.weeklySummary(me,url.searchParams.get("member")||(me.role==="Lead"?"team":me.id),url.searchParams.get("week")||today(hub.now)));
    if (req.method === "GET" && action === "aggregate") return json(await hub.aggregate(me, url.searchParams.get("member") || me.id, url.searchParams.get("week") || today()));
    if (req.method === "GET" && action === "export") {
      const kind = url.searchParams.get("kind") || "task";
      if(kind==="weekly-summary"){
        const data=await hub.weeklySummary(me,url.searchParams.get("member")||(me.role==="Lead"?"team":me.id),url.searchParams.get("week")||today(hub.now)),sheets=weeklySummarySheets(data),excel=url.searchParams.get("format")==="xlsx";
        await hub.db.batch([hub.audit(me.id,"Xuất Weekly Report từ Daily Report","weekly-summary",null,{start:data.start,end:data.end,asOf:data.asOf,members:data.rows.length})]);
        return new Response((excel?xlsx(sheets):csv(sheets[0].rows)) as BodyInit,{headers:{...responseHeaders,"Content-Type":excel?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"text/csv;charset=utf-8","Content-Disposition":`attachment; filename="Weekly_Report_${data.start}_${data.end}.${excel?"xlsx":"csv"}"`}});
      }
      if(kind==="evaluation") {
        const result=await hub.evaluation(me,Object.fromEntries(url.searchParams)),sheets=evaluationSheets(result),excel=url.searchParams.get("format")==="xlsx";
        await hub.db.batch([hub.audit(me.id,"Xuất đánh giá team","evaluation",null,{from:result.from,to:result.to,members:result.rows.length})]);
        return new Response((excel?xlsx(sheets):csv(sheets[0].rows)) as BodyInit,{headers:{...responseHeaders,"Content-Type":excel?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"text/csv;charset=utf-8","Content-Disposition":`attachment; filename="cuboid-evaluation-${result.from}-${result.to}.${excel?"xlsx":"csv"}"`}});
      }
      ensure(["task", "daily", "weekly", "attendance", "review", "target","morning","qc-session"].includes(kind), "Loại xuất không hợp lệ");
      const visible = await hub.visible(me);
      const validDay=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
      const morningDate=url.searchParams.get("date")||today();
      if(kind==="morning")ensure(validDay(morningDate),"Ngày báo cáo sáng không hợp lệ");
      const productionDate=kind==="morning"?(url.searchParams.get("productionDate")||previousWorkday(morningDate,await hub.settings())):"";
      if(kind==="morning")ensure(validDay(morningDate)&&validDay(productionDate)&&productionDate<morningDate,"Ngày báo cáo sáng hoặc ngày sản lượng không hợp lệ");
      let records = visible.filter(r => r.kind === (kind==="morning"?"daily":kind));
      const personalDaily=kind==="daily"&&(me.role!=="Lead"||url.searchParams.get("scope")==="mine");
      if(personalDaily)records=records.filter(r=>r.owner_id===me.id);
      if(kind==="morning")records=records.filter(r=>r.date===productionDate&&["submitted","approved","imported"].includes(r.status));
      for (const [param, field] of [["project", "project_id"], ["member", "owner_id"], ["status", "status"]] as const) {
        const v = url.searchParams.get(param);
        if (v && field === "project_id" && kind === "daily") records = records.map(r=>({...r,data:{...r.data,scoped:true,lines:r.data.lines.filter((l:any)=>visible.find(t=>t.id===l.taskId)?.project_id===v)}})).filter(r=>r.data.lines.length);
        else if (v) records = records.filter(r => field === "status" && v === "overdue" ? r.kind === "task" && r.status !== "done" && r.data.deadline && r.data.deadline < today() : field === "owner_id" && kind === "task" ? r.data.assigneeId === v : r[field] === v);
      }
      const from = url.searchParams.get("from"), to = url.searchParams.get("to"), search = url.searchParams.get("q")?.toLowerCase();
      records = records.filter(r => (!from || (r.date || r.data.assignedDate || r.created_at.slice(0,10)) >= from) && (!to || (r.date || r.data.assignedDate || r.created_at.slice(0,10)) <= to) && (!search || JSON.stringify(r.data).toLowerCase().includes(search)));
      const members=await hub.members(),all=await hub.visible(me),weekly:Record<string,any>={};
      if(kind==="weekly")for(const r of records)if(!r.data.snapshot)weekly[r.id]=await hub.aggregate(me,r.owner_id!,r.date!);
      const kpiMembers=members.filter(m=>m.state==="active"&&(m.role!=="Lead"||records.some(r=>r.owner_id===m.id))&&((me.role==="Lead"&&!personalDaily)||m.id===me.id)&&(!url.searchParams.get("member")||m.id===url.searchParams.get("member")));
      const kpiPeriod=url.searchParams.get("kpiPeriod")||(me.role==="Lead"?"cumulative":"weekly");
      ensure(["weekly","cumulative"].includes(kpiPeriod),"Kỳ KPI không hợp lệ");
      ensure(kpiPeriod!=="cumulative"||me.role==="Lead","Chỉ Lead được xem KPI lũy kế",403);
      const sheets=reportSheets(kind,records,all,members,weekly,{kpiMembers,kpiPeriod:kpiPeriod as "weekly"|"cumulative",asOf:to||today(hub.now),morningDate,productionDate});
      const excel = url.searchParams.get("format") === "xlsx";
      await hub.db.batch([hub.audit(me.id, "Xuất báo cáo " + kind, "export", null, { count: records.length, filters: Object.fromEntries(url.searchParams) })]);
      return new Response((excel ? xlsx(sheets) : csv(sheets[0].rows)) as BodyInit, { headers: { ...responseHeaders, "Content-Type": excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8", "Content-Disposition": `attachment; filename="cuboid-${kind}-${kind==="morning"?morningDate:today()}.${excel ? "xlsx" : "csv"}"` } });
    }
    if (req.method === "GET" && action === "backup") {
      hub.lead(me); const snapshot = { format: "cuboid-hub-v1", project: "appgprj_6ad97f484fe481919887bf7a05f76782", ...env.backupExtra, createdAt: hub.stamp(), members: await hub.members(), records: await hub.rows(), audit: (await hub.db.prepare("SELECT * FROM audit ORDER BY created_at").all()).results };
      return new Response(JSON.stringify(snapshot), { headers: { ...responseHeaders, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="cuboid-backup-${today()}.json"` } });
    }
    if (req.method === "POST" && action === "restore") {
      hub.attendanceLead(me); const b = await readJson(req,15*1024*1024) as any;
      ensure(b.confirm === "KHOI PHUC", "Cần xác nhận khôi phục"); const snap = b.snapshot;
      ensure(snap?.format === "cuboid-hub-v1" && snap.project === "appgprj_6ad97f484fe481919887bf7a05f76782", "Bản sao lưu không thuộc ứng dụng này");
      ensure(Array.isArray(snap.records) && Array.isArray(snap.members) && snap.records.length <= 50000, "Bản sao lưu không hợp lệ");
      ensure(snap.members.some((x: any) => x.id === me.id && x.auth_id === me.auth_id && x.role === "Lead" && x.state === "active"), "Bản sao lưu phải giữ tài khoản Lead hiện tại");
      const allowed = ["project", "task", "daily", "weekly", "attendance", "request", "review", "document", "settings", "kpi-exclusion", "kpi-rate", "target", "comment", "notification", "file", "import", "legacy", "qc-session", "qc-assignment", "qc-basic", "kpi-count", "kpi-source", "manual-rework", "weekly-snapshot", "qa-question", "qa-answer"];
      const stmts = [hub.db.prepare("DELETE FROM records"), hub.db.prepare("DELETE FROM members")];
      for (const m of snap.members) { z.object({ id: z.string(), name: z.string(), email: z.string().email(), role: z.enum(["Lead", "QA/QC", "Annotator"]), state: z.enum(["pending", "invited", "active", "disabled"]) }).parse(m); stmts.push(hub.db.prepare("INSERT INTO members(id,name,email,auth_id,role,state,invite_expires,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(m.id, m.name, m.email, m.auth_id, m.role, m.state, m.invite_expires, m.created_at)); }
      for (const r of snap.records) { ensure(allowed.includes(r.kind) && typeof r.id === "string" && r.data && typeof r.data === "object", "Dữ liệu sao lưu bị lỗi"); stmts.push(hub.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(r.id, r.kind, r.natural_key, r.owner_id, r.project_id, r.task_id, r.date, r.status, r.revision, JSON.stringify(r.data), r.created_at, r.updated_at)); }
      stmts.push(hub.audit(me.id, "Khôi phục dữ liệu", "backup", null, { backupAt: snap.createdAt, records: snap.records.length })); await hub.db.batch(stmts); return json({ ok: true });
    }
    if (req.method === "POST" && action === "upload") {
      ensure(env.BUCKET, "Kho tệp chưa được kết nối", 503); const bytes=await boundedBody(req,11*1024*1024); const form = await new Response(bytes as BodyInit,{headers:{"Content-Type":req.headers.get("Content-Type")||""}}).formData(); const file = form.get("file") as File; const entityId = String(form.get("entityId") || "");
      ensure(file && typeof file.arrayBuffer === "function" && file.size > 0 && file.size <= 10 * 1024 * 1024, "Tệp tối đa 10 MB");
      ensure((await hub.visible(me)).some(r => r.id === entityId && ["task", "daily", "weekly"].includes(r.kind)), "Không có quyền đính kèm vào bản ghi này", 403);
      const entity = await hub.get(entityId); ensure(me.role === "Lead" || (entity.kind === "task" ? hub.canTask(me, entity) : entity.kind==="daily"?dailyReportWritable(me,entity.owner_id!,entity.date!,hub.now,(await hub.settings()).reportDeadline):entity.owner_id === me.id && ["draft", "changes", "imported"].includes(entity.status)), "Bản ghi đã khóa hoặc bạn không có quyền", 403);
      const key = "files/" + crypto.randomUUID(); await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: "application/octet-stream" } });
      try { await hub.commit(me, "Tải tệp minh chứng", null, "file", { name: file.name.slice(0, 240), size: file.size, key, entityId }, { owner_id: me.id }); } catch (e) { await env.BUCKET.delete(key); throw e; }
      return json({ ok: true });
    }
    if (req.method === "GET" && action.startsWith("file/")) {
      const file = await hub.get(action.slice(5), "file"); ensure((await hub.visible(me)).some(r => r.id === file.id), "Không có quyền truy cập tệp", 403); ensure(env.BUCKET, "Kho tệp chưa sẵn sàng", 503); const blob = await env.BUCKET.get(file.data.key); ensure(blob, "Không tìm thấy tệp. Cần khôi phục tệp R2 từ bản sao lưu.", 404);
      return new Response(blob.body, { headers: { ...responseHeaders, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.data.name)}` } });
    }
    if (req.method === "POST") { const body=await readJson(req,action==="qc-offline-import"?15*1024*1024:1024*1024); const result=await hub.mutate(me,action,body); return json(env.afterMutation ? await env.afterMutation(action,result,me,body,req) : result); }
    return json({ error: "Không tìm thấy" }, 404);
  } catch (e: any) {
    if (e instanceof HubError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ error: e.issues.map(i => i.path.join(".") + ": " + i.message).join("; ") }, 400);
    if (/constraint|UNIQUE|NOT NULL/i.test(e?.message || "")) return json({ error: "Dữ liệu đã thay đổi hoặc bị trùng. Tải lại rồi thử lại." }, 409);
    console.error("Hub API failure", e?.message); return json({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại." }, 500);
  }
}

