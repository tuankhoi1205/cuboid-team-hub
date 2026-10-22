import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { Hub, HubError, ensure, today } from "../../../../lib/domain";
import { csv, xlsx } from "../../../../lib/export";
import { z } from "zod";

export const dynamic = "force-dynamic";
const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: responseHeaders });
async function boundedBody(req: Request, limit: number) {
  ensure(Number(req.headers.get("Content-Length") || 0) <= limit, "Yêu cầu quá lớn", 413);
  const reader = req.body?.getReader(); ensure(reader, "Thiếu nội dung yêu cầu"); const chunks: Uint8Array[] = []; let size=0;
  while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>limit){await reader.cancel();throw new HubError("Yêu cầu quá lớn",413);} chunks.push(value); }
  const bytes=new Uint8Array(size);let pos=0;for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.length;}return bytes;
}
async function readJson(req: Request, limit=1024*1024) { try { return JSON.parse(new TextDecoder().decode(await boundedBody(req,limit))); } catch(e) { if(e instanceof HubError)throw e;throw new HubError("JSON không hợp lệ"); } }
async function handle(req: Request) {
  try {
    ensure(env.DB, "Cơ sở dữ liệu chưa được kết nối", 503);
    const identity = await getChatGPTUser(); ensure(identity, "Vui lòng đăng nhập", 401);
    const hub = new Hub(env.DB, env.LEAD_EMAIL || ""); const url = new URL(req.url); const action = url.pathname.split("/api/hub/")[1];
    if (req.method !== "GET") { ensure(req.headers.get("Origin") === url.origin, "Yêu cầu không cùng nguồn", 403); ensure(req.headers.get("Sec-Fetch-Site") !== "cross-site", "Yêu cầu không hợp lệ", 403); }
    if (req.method === "GET" && action === "state") return json(await hub.state(identity));
    if (req.method === "POST" && action === "setup") return json(await hub.setup(identity));
    if (req.method === "POST" && action === "activate") return json(await hub.activate(identity));
    const me = await hub.current(identity);
    if (req.method === "GET" && action === "aggregate") return json(await hub.aggregate(me, url.searchParams.get("member") || me.id, url.searchParams.get("week") || today()));
    if (req.method === "GET" && action === "export") {
      const kind = url.searchParams.get("kind") || "task";
      ensure(["task", "daily", "weekly", "attendance", "review", "target"].includes(kind), "Loại xuất không hợp lệ");
      const visible = await hub.visible(me);
      let records = visible.filter(r => r.kind === kind);
      for (const [param, field] of [["project", "project_id"], ["member", "owner_id"], ["status", "status"]] as const) {
        const v = url.searchParams.get(param);
        if (v && field === "project_id" && kind === "daily") records = records.map(r=>({...r,data:{...r.data,lines:r.data.lines.filter((l:any)=>visible.find(t=>t.id===l.taskId)?.project_id===v)}})).filter(r=>r.data.lines.length);
        else if (v) records = records.filter(r => field === "status" && v === "overdue" ? r.kind === "task" && r.status !== "done" && r.data.deadline && r.data.deadline < today() : field === "owner_id" && kind === "task" ? r.data.assigneeId === v : r[field] === v);
      }
      const from = url.searchParams.get("from"), to = url.searchParams.get("to"), search = url.searchParams.get("q")?.toLowerCase();
      records = records.filter(r => (!from || (r.date || r.data.assignedDate || r.created_at.slice(0,10)) >= from) && (!to || (r.date || r.data.assignedDate || r.created_at.slice(0,10)) <= to) && (!search || JSON.stringify(r.data).toLowerCase().includes(search)));
      const members = await hub.members(), all = await hub.visible(me); const name = (id: string) => members.find(m => m.id === id)?.name || ""; const project = (id: string | null) => all.find(r => r.id === id); const fmt = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : s;
      let rows: unknown[][];
      if (kind === "task") rows = [["Mã task", "Tên", "Dự án", "Người thực hiện", "QA/QC", "Trạng thái", "Đơn vị", "Khối lượng giao", "Tiến độ", "Ngày giao", "Deadline"], ...records.map(r => [r.data.code, r.data.title, project(r.project_id)?.data.name, name(r.data.assigneeId), name(r.data.reviewerId), r.status, project(r.project_id)?.data.unit, r.data.quantity, r.data.completed, fmt(r.data.assignedDate), fmt(r.data.deadline)])];
      else if (kind === "daily") rows = [["Ngày", "Nhân sự", "Trạng thái", "Task", "Dự án", "Hoạt động", "Đơn vị", "Phút", "Sản lượng mới", "Sửa lỗi", "Công việc", "Vướng mắc"], ...records.flatMap(r => r.data.lines.map((l: any) => { const t = all.find(t => t.id === l.taskId); const p = project(t?.project_id || null); return [fmt(r.date!), name(r.owner_id!), r.status, t?.data.code, p?.data.name, l.activity === "qc" ? "QC" : "Annotation", p?.data.unit, l.minutes, l.quantity, l.rework, l.work, l.issue]; }))];
      else rows = [["ID", "Ngày", "Nhân sự", "Trạng thái", "Dự án", "Dữ liệu JSON (thời gian ISO UTC)"], ...records.map(r => [r.id, fmt(r.date || ""), name(r.owner_id!), r.status, project(r.project_id)?.data.name || "", JSON.stringify(r.data)])];
      const excel = url.searchParams.get("format") === "xlsx";
      await hub.db.batch([hub.audit(me.id, "Xuất báo cáo " + kind, "export", null, { count: records.length, filters: Object.fromEntries(url.searchParams) })]);
      return new Response((excel ? xlsx(rows) : csv(rows)) as BodyInit, { headers: { ...responseHeaders, "Content-Type": excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8", "Content-Disposition": `attachment; filename="cuboid-${kind}-${today()}.${excel ? "xlsx" : "csv"}"` } });
    }
    if (req.method === "GET" && action === "backup") {
      hub.lead(me); const snapshot = { format: "cuboid-hub-v1", project: "appgprj_6ad97f484fe481919887bf7a05f76782", createdAt: hub.stamp(), members: await hub.members(), records: await hub.rows(), audit: (await hub.db.prepare("SELECT * FROM audit ORDER BY created_at").all()).results };
      return new Response(JSON.stringify(snapshot), { headers: { ...responseHeaders, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="cuboid-backup-${today()}.json"` } });
    }
    if (req.method === "POST" && action === "restore") {
      hub.attendanceLead(me); const b = await readJson(req,15*1024*1024) as any;
      ensure(b.confirm === "KHOI PHUC", "Cần xác nhận khôi phục"); const snap = b.snapshot;
      ensure(snap?.format === "cuboid-hub-v1" && snap.project === "appgprj_6ad97f484fe481919887bf7a05f76782", "Bản sao lưu không thuộc ứng dụng này");
      ensure(Array.isArray(snap.records) && Array.isArray(snap.members) && snap.records.length <= 50000, "Bản sao lưu không hợp lệ");
      ensure(snap.members.some((x: any) => x.id === me.id && x.auth_id === me.auth_id && x.role === "Lead" && x.state === "active"), "Bản sao lưu phải giữ tài khoản Lead hiện tại");
      const allowed = ["project", "task", "daily", "weekly", "attendance", "request", "review", "document", "settings", "target", "comment", "notification", "file", "import", "legacy"];
      const stmts = [hub.db.prepare("DELETE FROM records"), hub.db.prepare("DELETE FROM members")];
      for (const m of snap.members) { z.object({ id: z.string(), name: z.string(), email: z.string().email(), role: z.enum(["Lead", "QA/QC", "Annotator"]), state: z.enum(["pending", "invited", "active", "disabled"]) }).parse(m); stmts.push(hub.db.prepare("INSERT INTO members(id,name,email,auth_id,role,state,invite_expires,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(m.id, m.name, m.email, m.auth_id, m.role, m.state, m.invite_expires, m.created_at)); }
      for (const r of snap.records) { ensure(allowed.includes(r.kind) && typeof r.id === "string" && r.data && typeof r.data === "object", "Dữ liệu sao lưu bị lỗi"); stmts.push(hub.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(r.id, r.kind, r.natural_key, r.owner_id, r.project_id, r.task_id, r.date, r.status, r.revision, JSON.stringify(r.data), r.created_at, r.updated_at)); }
      stmts.push(hub.audit(me.id, "Khôi phục dữ liệu", "backup", null, { backupAt: snap.createdAt, records: snap.records.length })); await hub.db.batch(stmts); return json({ ok: true });
    }
    if (req.method === "POST" && action === "upload") {
      ensure(env.BUCKET, "Kho tệp chưa được kết nối", 503); const bytes=await boundedBody(req,11*1024*1024); const form = await new Response(bytes as BodyInit,{headers:{"Content-Type":req.headers.get("Content-Type")||""}}).formData(); const file = form.get("file") as File; const entityId = String(form.get("entityId") || "");
      ensure(file && typeof file.arrayBuffer === "function" && file.size > 0 && file.size <= 10 * 1024 * 1024, "Tệp tối đa 10 MB");
      ensure((await hub.visible(me)).some(r => r.id === entityId && ["task", "daily", "weekly"].includes(r.kind)), "Không có quyền đính kèm vào bản ghi này", 403);
      const entity = await hub.get(entityId); ensure(me.role === "Lead" || (entity.kind === "task" ? hub.canTask(me, entity) : entity.owner_id === me.id && ["draft", "changes"].includes(entity.status)), "Bản ghi đã khóa hoặc bạn không có quyền", 403);
      const key = "files/" + crypto.randomUUID(); await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: "application/octet-stream" } });
      try { await hub.commit(me, "Tải tệp minh chứng", null, "file", { name: file.name.slice(0, 240), size: file.size, key, entityId }, { owner_id: me.id }); } catch (e) { await env.BUCKET.delete(key); throw e; }
      return json({ ok: true });
    }
    if (req.method === "GET" && action.startsWith("file/")) {
      const file = await hub.get(action.slice(5), "file"); ensure((await hub.visible(me)).some(r => r.id === file.id), "Không có quyền truy cập tệp", 403); ensure(env.BUCKET, "Kho tệp chưa sẵn sàng", 503); const blob = await env.BUCKET.get(file.data.key); ensure(blob, "Không tìm thấy tệp. Cần khôi phục tệp R2 từ bản sao lưu.", 404);
      return new Response(blob.body, { headers: { ...responseHeaders, "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.data.name)}` } });
    }
    if (req.method === "POST") return json(await hub.mutate(me, action, await readJson(req)));
    return json({ error: "Không tìm thấy" }, 404);
  } catch (e: any) {
    if (e instanceof HubError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ error: e.issues.map(i => i.path.join(".") + ": " + i.message).join("; ") }, 400);
    if (/constraint|UNIQUE|NOT NULL/i.test(e?.message || "")) return json({ error: "Dữ liệu đã thay đổi hoặc bị trùng. Tải lại rồi thử lại." }, 409);
    console.error("Hub API failure", e?.message); return json({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại." }, 500);
  }
}
export const GET = handle;
export const POST = handle;
