import { z } from "zod";
import initialImport from "../data/initial-import.json" with { type: "json" };
import { scheduledWorkday } from "./kpi.ts";
import { buildTeamEvaluation,evaluationTotals } from "./evaluation.ts";
import {ensureQcAssignments,qcJobAction} from "./qc-job-workflow.ts";
import { dailyQcAction } from "./qc-workflow.ts";
import { reportQcApprovalStatements } from "./report-qc.ts";
import {dailyReportWritable,DAILY_REPORT_DEADLINE} from "./daily-reports.ts";
import {reportEndId} from "./report-progress.ts";
import {taskFrameCount} from "./task-frames.ts";
import {cuboidsFromIds,PRODUCTION_FACTOR} from "./report-production.ts";

export type Identity = { userId: string; email: string };
export type Member = { id: string; name: string; email: string; auth_id: string | null; role: string; state: string; invite_expires: string | null; created_at: string };
export type Row = { id: string; kind: string; natural_key: string; owner_id: string | null; project_id: string | null; task_id: string | null; date: string | null; status: string; revision: number; data: Record<string, any>; created_at: string; updated_at: string };
export type Statement = { bind(...args: any[]): Statement; all(): Promise<{ results: any[] }>; first(): Promise<any>; run(): Promise<any> };
export type Database = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<any[]> };
export class HubError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export const ensure: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 400) => { if (!ok) throw new HubError(message, status); };
export const today = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export const localTime = (now = new Date()) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
export function weekStart(date: string) { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
export function addDays(date: string, n: number) { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const TEAM = [
  ["Nguyễn Tuấn Khôi", "26ai.khoint2"], ["Nguyễn Tuấn Minh", "26ai.minhnt3"], ["Nguyễn Thái Hà", "26ai.hant"],
  ["Đào Xuân Tùng", "26ai.tungdx"], ["Đỗ Thành Long", "26ai.longdt"], ["Dương Quang Hiệp", "26ai.hiepdq"],
  ["Cẩm Vũ Ngọc Thạch", "26ai.thachcvn"], ["Phạm Nguyễn Tuân", "26ai.tuanpn"], ["Nguyễn Vũ Quang Minh", "26ai.minhnvq"], ["Phan Ngọc Hòa", "26ai.hoapn"],
];
export const DEFAULT_SETTINGS = { workStart: "08:30", workEnd: "17:30", lateGrace: 10, reportDeadline: "17:00", dailyPolicyVersion:1, workDays: [1, 2, 3, 4, 5], kpiStartDate:"2026-10-20",kpiWorkingSaturday:"2026-10-24",errorTypes: ["Sai vị trí", "Kích thước", "Hướng", "Class", "Thiếu/thừa object", "Tracking/ID", "Khác"] };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, "Ngày không hợp lệ");
const str = z.string().trim().max(10000);
const required = z.string().trim().min(1, "Vui lòng điền thông tin bắt buộc").max(500);
const num = z.coerce.number().finite().min(0).max(100000000);
const url = z.string().trim().max(2000).refine(v => !v || /^https?:\/\//i.test(v), "Link phải bắt đầu bằng https:// hoặc http://");
const id = z.string().min(1).max(100);
const projectSchema = z.object({ name: required, description: str.default(""), instructions: str.default(""), unit: z.enum(["frame", "cuboid", "scene"]), target: num.nullable().default(null), status: z.enum(["active", "archived"]).default("active") });
const taskSchema = z.object({ code: z.string().trim().max(500).default(""), jobId: z.string().trim().regex(/^\d*$/, "Job ID chỉ gồm chữ số").max(30).default(""), title: required, frameCount: num.int().positive().nullable().optional(), projectId: id, assigneeId: id, reviewerId: id, link: url.default(""), assignedDate: date, deadline: date, priority: z.enum(["low", "normal", "high", "urgent"]), quantity: num.positive(), note: str.default("") }).refine(v=>v.code||v.jobId,{message:"Nhập Task ID / mã batch hoặc Job ID",path:["code"]});
const lineSchema = z.object({ taskId: id, taskCode:z.string().default(""),jobId:z.string().default(""),endId:z.string().trim().regex(/^\d*$/,"ID đã làm tới chỉ gồm chữ số").max(30).default(""),activity: z.enum(["annotation", "qc"]).default("annotation"), idCount:num.int().nullable().optional(), minutes: num.positive().max(1440), quantity: num, rework: num, work: str.default(""), issue: str.default(""), evidence: url.default("") });
const reportSchema = z.object({ date, memberId:id.optional(), lines: z.array(lineSchema).min(1).max(50), completed: str.default(""), blockers: str.default(""), support: str.default(""), nextPlan: str.default(""), submit: z.boolean().default(false) });
const weeklySchema = z.object({ date, highlights: str.default(""), difficulties: str.default(""), improvements: str.default(""), nextPlan: str.default(""), submit: z.boolean().default(false) });
const reviewSchema = z.object({ taskId: id, productionDate: date.optional(), checked: num.positive(), passed: num, failed: num, scope: z.enum(["full", "sample"]), sample: str.default(""), verdict: z.enum(["passed", "changes"]), note: str.default(""), errors: z.array(z.object({ type: required, severity: z.enum(["minor", "major", "critical"]), description: required, evidence: url.default("") })).max(100) });

export class Hub {
  constructor(public db: Database, public leadEmail: string, public now = new Date()) {}
  stamp() { return this.now.toISOString(); }
  async members(): Promise<Member[]> { return (await this.db.prepare("SELECT * FROM members ORDER BY created_at,id").all()).results; }
  async rows(kind?: string): Promise<Row[]> { const q = kind ? this.db.prepare("SELECT * FROM records WHERE kind=? ORDER BY created_at DESC").bind(kind) : this.db.prepare("SELECT * FROM records ORDER BY created_at DESC"); return (await q.all()).results.map(r => ({ ...r, data: JSON.parse(r.data) })); }
  async get(recordId: string, kind?: string): Promise<Row> { const r = await this.db.prepare("SELECT * FROM records WHERE id=?").bind(recordId).first(); ensure(r && (!kind || r.kind === kind), "Không tìm thấy dữ liệu", 404); return { ...r, data: JSON.parse(r.data) }; }
  async current(identity: Identity) { const m = await this.db.prepare("SELECT * FROM members WHERE auth_id=? AND state='active'").bind(identity.userId).first(); ensure(m, "Tài khoản chưa được kích hoạt hoặc đã bị vô hiệu hóa", 403); return m as Member; }
  lead(m: Member) { ensure(m.role === "Lead", "Chỉ Lead được thực hiện thao tác này", 403); }
  attendanceLead(m: Member) { ensure(m.role === "Lead" && m.id === "member-0", "Chỉ Nguyễn Tuấn Khôi được đánh điểm danh, đi trễ và tác phong", 403); }
  async setup(identity: Identity) {
    ensure(this.leadEmail && identity.email.toLowerCase() === this.leadEmail.toLowerCase(), "Chỉ email Lead đã cấu hình mới được thiết lập team", 403);
    ensure(!(await this.members()).length, "Team đã được thiết lập", 409);
    const stamp = this.stamp();
    const stmts = TEAM.map(([name, handle], i) => this.db.prepare("INSERT INTO members(id,name,email,auth_id,role,state,created_at) VALUES(?,?,?,?,?,?,?)").bind("member-" + i, name, handle + "@vinuni.edu.vn", i === 0 ? identity.userId : null, i === 0 ? "Lead" : "Annotator", i === 0 ? "active" : "pending", stamp));
    stmts.push(this.insert("settings", "settings", DEFAULT_SETTINGS, { natural_key: "settings" }));
    for (const r of initialImport) stmts.push(this.insert(r.kind, r.id, r.data, r as Partial<Row>));
    stmts.push(this.audit("member-0", "Thiết lập team 10 người", "team", null, { count: 10 }));
    await this.db.batch(stmts);
    return { ok: true };
  }
  async activate(identity: Identity) {
    const member = await this.db.prepare("SELECT * FROM members WHERE lower(email)=?").bind(identity.email.toLowerCase()).first();
    ensure(member && member.state === "invited" && member.invite_expires > this.stamp() && !member.auth_id, "Lời mời không hợp lệ hoặc đã hết hạn. Liên hệ Lead.", 403);
    const results = await this.db.batch([
      this.db.prepare("UPDATE members SET auth_id=?,state='active',invite_expires=NULL WHERE id=? AND state='invited' AND auth_id IS NULL").bind(identity.userId, member.id),
      this.audit(member.id, "Chấp nhận lời mời", member.id, null, { email: member.email }),
    ]);
    ensure(results[0].meta?.changes === 1, "Lời mời đã được sử dụng", 409); return { ok: true };
  }
  insert(kind: string, recordId: string, data: any, meta: Partial<Row> = {}) {
    return this.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)").bind(recordId, kind, meta.natural_key || recordId, meta.owner_id || null, meta.project_id || null, meta.task_id || null, meta.date || null, meta.status || "active", JSON.stringify(data), this.stamp(), this.stamp());
  }
  // INSERT deliberately has no conflict clause: a stale revision or duplicate is
  // a constraint failure that rolls back the entire D1 transaction, including audit.
  replace(row: Row, data: any, status = row.status, naturalKey = row.natural_key) {
    return this.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at,natural_key=CASE WHEN records.revision=? THEN excluded.natural_key ELSE NULL END").bind(row.id, row.kind, naturalKey, row.owner_id, row.project_id, row.task_id, row.date, status, row.revision + 1, JSON.stringify(data), row.created_at, this.stamp(), row.revision);
  }
  audit(actor: string, action: string, entityId: string, before: any, after: any) { return this.db.prepare("INSERT INTO audit(id,actor_id,action,entity_id,before,after,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), actor, action, entityId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), this.stamp()); }
  notify(owner: string, title: string, detail: string, page: string) { return this.insert("notification", crypto.randomUUID(), { title, detail, page, read: false }, { owner_id: owner }); }
  async commit(m: Member, action: string, row: Row | null, kind: string, data: any, meta: Partial<Row> = {}, extras: Statement[] = []) {
    const recordId = row?.id || crypto.randomUUID();
    await this.db.batch([row ? this.replace(row, data, meta.status, meta.natural_key) : this.insert(kind, recordId, data, meta), ...extras, this.audit(m.id, action, recordId, row, { ...meta, data })]);
    return { ok: true, id: recordId };
  }
  canTask(m: Member, r: Row) { return m.role === "Lead" || r.data.assigneeId === m.id || (m.role === "QA/QC" && r.data.reviewerId === m.id); }
  async visible(m: Member) {
    const all = await this.rows();
    const qcTaskIds=new Set(all.filter(r=>["qc-session","qc-assignment"].includes(r.kind)&&m.role==="QA/QC"&&r.data.reviewerId===m.id).map(r=>r.task_id));
    const tasks = all.filter(r => r.kind === "task" && (this.canTask(m, r)||qcTaskIds.has(r.id)));
    const taskIds = new Set(tasks.map(t => t.id));
    const projectIds = new Set(tasks.map(t => t.project_id));
    const reportIds = new Set(all.filter(r => ["daily", "weekly"].includes(r.kind) && (m.role === "Lead" || r.owner_id === m.id)).map(r => r.id));
    return all.flatMap(r => {
      if (m.role === "Lead") return [r];
      if (r.kind === "task") return taskIds.has(r.id) ? [r] : [];
      if (r.kind === "project") return projectIds.has(r.id) ? [r] : [];
      if (["settings", "document"].includes(r.kind)) return [r];
      if(["kpi-exclusion","kpi-rate"].includes(r.kind))return !r.owner_id||r.owner_id===m.id?[r]:[];
      if (["attendance", "request", "weekly", "notification"].includes(r.kind)) return r.owner_id === m.id ? [r] : [];
      if(r.kind==="manual-rework")return r.owner_id===m.id?[r]:[];
      if (r.kind === "target") return r.owner_id === m.id ? [r] : [];
      if(["qc-session","qc-assignment"].includes(r.kind))return r.data.assigneeId===m.id||(m.role==="QA/QC"&&r.data.reviewerId===m.id)?[r]:[];
      if(r.kind==="qc-basic")return r.owner_id===m.id||m.role==="QA/QC"&&taskIds.has(r.task_id||"")?[r]:[];
      if (["review", "comment"].includes(r.kind)) return taskIds.has(r.task_id || "") ? [r] : [];
      if (r.kind === "daily") {
        if (r.owner_id === m.id) return [r];
        if (m.role === "QA/QC" && r.status !== "draft") { const lines = r.data.lines.filter((l: any) => tasks.some(t => t.id === l.taskId && (t.data.reviewerId === m.id||qcTaskIds.has(t.id)))); return lines.length ? [{ ...r, data: { lines, scoped: true } }] : []; }
      }
      if (r.kind === "file") return r.owner_id === m.id || taskIds.has(r.data.entityId) || reportIds.has(r.data.entityId) ? [r] : [];
      return [];
    });
  }
  async state(identity: Identity) {
    const members = await this.members();
    if (!members.length) return { needsSetup: true, leadEligible: identity.email.toLowerCase() === this.leadEmail.toLowerCase(), email: identity.email };
    const me = members.find(m => m.auth_id === identity.userId && m.state === "active");
    if (!me) { const invite = members.find(m => m.email.toLowerCase() === identity.email.toLowerCase() && m.state === "invited" && (m.invite_expires || "") > this.stamp()); return { needsActivation: true, invited: !!invite, name: invite?.name, email: identity.email }; }
    await this.ensureAttendanceDefaults();
    await ensureQcAssignments(this);
    const rows = await this.visible(me);
    const directory = me.role === "Lead" ? members : members.filter(m => m.id === me.id || rows.some(r => r.kind === "task" && [r.data.assigneeId, r.data.reviewerId].includes(m.id))).map(m => ({ id: m.id, name: m.name, role: m.role, state: m.state }));
    return { me, members: directory, teamSize: members.length, records: rows, serverDate: today(this.now), serverTime: this.stamp(), audit: me.role === "Lead" ? (await this.db.prepare("SELECT * FROM audit ORDER BY created_at DESC LIMIT 300").all()).results : [] };
  }
  async settings() {
    const row=await this.get("settings","settings");
    if(!row.data.dailyPolicyVersion){const data={...row.data,reportDeadline:DAILY_REPORT_DEADLINE,dailyPolicyVersion:1};await this.db.batch([this.replace(row,data),this.audit("system:daily-policy","Áp dụng hạn Daily Report 17:00",row.id,row,{data})]);return{...DEFAULT_SETTINGS,...data};}
    return {...DEFAULT_SETTINGS,...row.data};
  }
  async ensureAttendanceDefaults() {
    const day=today(this.now),members=(await this.members()).filter(m=>m.state==="active");
    if(!members.length)return;
    const policy=(await this.rows("settings")).find(r=>r.id==="attendance-default-policy");
    const start=policy?.data.lastDate||day,statements:Statement[]=[],settings=await this.settings();
    // Inserts never overwrite a leave, lateness, half-day or manual correction.
    for(let d=start;d<=day;d=addDays(d,1))for(const m of members) {
      if(today(new Date(m.created_at))>d||!scheduledWorkday(d,settings))continue;
      const data={checkIn:null,checkOut:null,lateMinutes:0,conduct:"Đúng quy định",note:"",defaulted:true,markedBy:"system:defaults",markedAt:this.stamp()};
      statements.push(this.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,date,status,revision,data,created_at,updated_at) VALUES(?,'attendance',?,?,?,'present',1,?,?,?) ON CONFLICT(kind,natural_key) DO NOTHING").bind(crypto.randomUUID(),m.id+":"+d,m.id,d,JSON.stringify(data),this.stamp(),this.stamp()));
      statements.push(this.db.prepare("UPDATE records SET data=json_set(data,'$.conduct','Đúng quy định','$.conductDefault',1),revision=revision+1,updated_at=? WHERE kind='attendance' AND owner_id=? AND date=? AND json_extract(data,'$.conduct') IS NULL").bind(this.stamp(),m.id,d));
    }
    const defaultCount=statements.length,data={startDate:policy?.data.startDate||day,lastDate:day};
    if(!policy)statements.push(this.db.prepare("INSERT INTO records(id,kind,natural_key,status,revision,data,created_at,updated_at) VALUES('attendance-default-policy','settings','attendance-default-policy','active',1,?,?,?) ON CONFLICT(kind,natural_key) DO NOTHING").bind(JSON.stringify(data),this.stamp(),this.stamp()));
    else if(policy.data.lastDate<day)statements.push(this.db.prepare("UPDATE records SET data=json_set(data,'$.lastDate',?),revision=revision+1,updated_at=? WHERE id='attendance-default-policy' AND json_extract(data,'$.lastDate')<?").bind(day,this.stamp(),day));
    if(statements.length){const results=await this.db.batch(statements);const changes=results.slice(0,defaultCount).reduce((n,r)=>n+(r.meta?.changes||0),0);if(changes)await this.db.batch([this.audit("system:defaults","Điểm danh và tác phong mặc định",day,null,{from:start,to:day,changes})]);}
  }
  async mutate(m: Member, action: string, input: any): Promise<{ok: boolean; id?: string}> {
    const b = input || {};
    if(["qc-job-assign","qc-job-start"].includes(action))return(await qcJobAction(this,m,action,b))!;
    if(["qc-assign","qc-start","qc-result","qc-draft"].includes(action))return (await dailyQcAction(this,m,action,b))!;
    if(action==="manual-rework"){
      this.lead(m);const data=z.object({memberId:id,date,reason:required}).parse(b);
      ensure(data.date<=today(this.now),"Ngày rework không được ở tương lai");
      ensure((await this.members()).some(member=>member.id===data.memberId),"Không tìm thấy nhân sự");
      const key=data.memberId+":"+data.date,old=(await this.rows("manual-rework")).find(r=>r.natural_key===key);
      if(old){ensure(old.data.reason===data.reason,"Ngày này đã có rework thủ công; không cộng trùng",409);return{ok:true,id:old.id};}
      return this.commit(m,"Ghi bổ sung rework đã xử lý thủ công",null,"manual-rework",{reason:data.reason,source:"lead_manual_confirmation",recordedBy:m.id,recordedAt:this.stamp()},{owner_id:data.memberId,date:data.date,natural_key:key,status:"active"});
    }
    if (action === "member") {
      this.lead(m);
      const data = z.object({ name: required, email: z.string().email().max(254), role: z.enum(["Lead", "QA/QC", "Annotator"]), state: z.enum(["pending", "invited", "active", "disabled"]) }).parse(b);
      const members = await this.members(); const old = b.id ? members.find(x => x.id === b.id) : null;
      ensure(!b.id || old, "Không tìm thấy nhân sự", 404);
      ensure(old?.id !== "member-0" || (data.role === "Lead" && data.state === "active"), "Cần giữ tài khoản Lead Nguyễn Tuấn Khôi để quản lý điểm danh");
      ensure(!(old?.role === "Lead" && (data.role !== "Lead" || data.state !== "active")) || members.filter(x => x.role === "Lead" && x.state === "active").length > 1, "Cần giữ ít nhất một Lead đang hoạt động");
      ensure(data.state !== "active" || old?.auth_id, "Tài khoản chỉ kích hoạt sau khi người dùng chấp nhận lời mời");
      ensure(!old?.auth_id || data.email.toLowerCase() === old.email.toLowerCase(), "Không thể đổi email của tài khoản đã kích hoạt");
      const memberId = old?.id || crypto.randomUUID();
      const expires = data.state === "invited" ? new Date(this.now.getTime() + 7 * 86400000).toISOString() : null;
      await this.db.batch([this.db.prepare("INSERT INTO members(id,name,email,role,state,created_at,invite_expires) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,role=excluded.role,state=excluded.state,invite_expires=excluded.invite_expires").bind(memberId, data.name, data.email.toLowerCase(), data.role, data.state, old?.created_at || this.stamp(), expires), this.audit(m.id, data.state === "invited" ? "Mời thành viên" : "Cập nhật nhân sự / phân quyền", memberId, old, data)]);
      return { ok: true, id: memberId };
    }
    if (action === "project") {
      this.lead(m); const data = projectSchema.parse(b); const old = b.id ? await this.get(b.id, "project") : null;
      if (old && old.data.unit !== data.unit) ensure(!(await this.rows("task")).some(t => t.project_id === old.id), "Không thể đổi đơn vị sau khi dự án đã có task");
      return this.commit(m, "Lưu dự án", old, "project", data, { status: data.status });
    }
    if (action === "task") {
      this.lead(m); const data = taskSchema.parse(b);
      if(data.jobId&&data.code) { ensure(/^\d+$/.test(data.code),"Task ID CVAT phải gồm chữ số khi có Job ID"); data.link=`https://cvat-test.vantixapps.net/tasks/${data.code}/jobs/${data.jobId}`; }
      else if(data.jobId&&/^https:\/\/cvat-test\.vantixapps\.net\/tasks\//i.test(data.link))data.link="";
      ensure(data.deadline >= data.assignedDate, "Deadline phải sau ngày giao");
      const project = await this.get(data.projectId, "project"); ensure(project.status === "active", "Dự án đã được lưu trữ");
      const members = await this.members();
      ensure(members.some(x => x.id === data.assigneeId && x.state !== "disabled"), "Người thực hiện phải có trong danh sách và không bị vô hiệu hóa");
      ensure(members.some(x => x.id === data.reviewerId && x.state !== "disabled" && ["Lead", "QA/QC"].includes(x.role)), "Người kiểm tra phải là Lead hoặc QA/QC không bị vô hiệu hóa");
      const tasks = await this.rows("task"); ensure(!tasks.some(t => t.data.code === data.code && (t.data.jobId||"") === data.jobId && t.id !== b.id), "Cặp Task ID / Job ID đã tồn tại");
      const old = b.id ? await this.get(b.id, "task") : null;
      ensure(!old || old.project_id === data.projectId, "Không thể chuyển task sang dự án khác");
      ensure(!old || old.status !== "done", "Task hoàn thành đã được khóa");
      ensure(!old || data.quantity >= old.data.completed, "Khối lượng giao không được thấp hơn tiến độ đã làm");
      if (old) { const reported = (await this.rows("daily")).flatMap(r=>r.data.lines).filter((l:any)=>l.taskId===old.id).reduce((n:number,l:any)=>n+l.quantity,0); ensure(data.quantity>=reported,"Khối lượng giao không được thấp hơn sản lượng đã ghi nhận"); }
      return this.commit(m, "Giao / cập nhật task", old, "task", { ...old?.data, ...data, completed: old?.data.completed || 0 }, { project_id: data.projectId, natural_key:data.code+":"+data.jobId,status: old?.status || "todo" }, [this.notify(data.assigneeId, "Task được phân công", data.code + " · " + data.title, "tasks"), this.notify(data.reviewerId, "Phân công kiểm tra", data.code, "qa")]);
    }
    if (action === "progress") {
      const row = await this.get(id.parse(b.id), "task"); ensure(m.role === "Lead" || row.data.assigneeId === m.id, "Không được sửa task của người khác", 403);
      ensure(row.status !== "done", "Task hoàn thành đã được khóa"); ensure(row.data.quantity && row.data.deadline, "Lead cần bổ sung khối lượng giao và deadline của task nhập từ sheet");
      const completed = num.parse(b.completed); ensure(completed <= row.data.quantity, "Tiến độ không được vượt khối lượng giao");
      const status = z.enum(["doing", "qa", "recheck"]).parse(b.status);
      const allowed: Record<string, string[]> = { todo: ["doing"], doing: ["doing", "qa"], changes: ["doing", "recheck"], recheck: [], qa: [] };
      ensure(allowed[row.status]?.includes(status), "Chuyển trạng thái không hợp lệ");
      if(status==="recheck") {const latest=(await this.rows("review")).filter(r=>r.task_id===row.id&&r.data.mode!=="daily").sort((a,b)=>b.data.round-a.data.round)[0];ensure(!latest?.data.errors?.some((e:any)=>!e.fixed),"Cần đánh dấu đã sửa từng lỗi trước khi gửi kiểm tra lại");}
      ensure(!["qa", "recheck"].includes(status) || completed > 0, "Cần có sản lượng trước khi gửi kiểm tra");
      const extras = ["qa", "recheck"].includes(status) ? [this.notify(row.data.reviewerId, "Task chờ kiểm tra", row.data.code, "qa")] : [];
      return this.commit(m, "Cập nhật tiến độ task", row, "task", { ...row.data, completed }, { status }, extras);
    }
    if (action === "comment") {
      const row = await this.get(id.parse(b.taskId), "task"); ensure(this.canTask(m, row), "Không có quyền xem task", 403);
      return this.commit(m, "Bình luận task", null, "comment", { text: required.parse(b.text) }, { owner_id: m.id, task_id: row.id });
    }
    if (action === "checkin" || action === "checkout") {
      throw new HubError("Team không tự check-in/check-out. Chỉ Nguyễn Tuấn Khôi được ghi điểm danh.", 403);
    }
    if (action === "attendance-mark") {
      this.attendanceLead(m);
      const data = z.object({ memberId:id,date,status:z.enum(["present","late","leave","half","absent"]),lateMinutes:num.max(1440),conduct:z.enum(["Đúng quy định","Chưa đúng quy định","Chưa đánh giá"]),note:str.default(""),checkIn:z.string().default(""),checkOut:z.string().default("") }).parse(b);
      ensure(data.date<=today(this.now),"Không đánh điểm danh cho ngày tương lai");ensure((await this.members()).some(x=>x.id===data.memberId),"Thành viên không tồn tại");
      ensure(data.status!=="late"||data.lateMinutes>0,"Cần ghi số phút đi trễ");
      ensure(!data.checkOut||data.checkIn,"Không được check-out trước check-in");if(data.checkIn)this.validateTimes(data.checkIn,data.checkOut,data.date);
      const old=(await this.rows("attendance")).find(r=>r.owner_id===data.memberId&&r.date===data.date);
      return this.commit(m,"Đánh điểm danh / đi trễ / tác phong",old||null,"attendance",{...old?.data,defaulted:false,conductDefault:false,checkIn:data.checkIn||null,checkOut:data.checkOut||null,lateMinutes:data.status==="late"?data.lateMinutes:0,conduct:data.conduct,note:data.note,markedBy:m.id,markedAt:this.stamp()}, {owner_id:data.memberId,date:data.date,natural_key:data.memberId+":"+data.date,status:data.status});
    }
    if (action === "request") {
      this.attendanceLead(m);
      const data = z.object({ type: z.enum(["leave", "correction"]), date, endDate: date, reason: required, leaveType: z.enum(["leave", "half", "absent"]).default("leave"), checkIn: z.string().default(""), checkOut: z.string().default("") }).parse(b);
      ensure(data.endDate >= data.date && Date.parse(data.endDate) - Date.parse(data.date) <= 31 * 86400000, "Đơn tối đa 31 ngày");
      if (data.type === "correction") { ensure(data.date === data.endDate && data.date <= today(this.now), "Chỉnh công chỉ áp dụng một ngày đã diễn ra"); this.validateTimes(data.checkIn, data.checkOut, data.date); }
      return this.commit(m, "Gửi đơn nghỉ / điều chỉnh công", null, "request", data, { owner_id: m.id, date: data.date, status: "submitted" });
    }
    if (action === "request-decision") {
      this.attendanceLead(m); const row = await this.get(id.parse(b.id), "request"); ensure(row.status === "submitted", "Đơn đã được xử lý", 409);
      const approved = z.boolean().parse(b.approved); const reason = required.parse(b.reason); const extras: Statement[] = [];
      if (approved) {
        const all = await this.rows("attendance");
        for (let day = row.data.date; day <= row.data.endDate; day = addDays(day, 1)) {
          const old = all.find(a => a.owner_id === row.owner_id && a.date === day);
          if (row.data.type === "leave") ensure(!old?.data.checkIn, "Ngày có check-in cần điều chỉnh công riêng");
          const data = row.data.type === "correction" ? { ...old?.data, checkIn: row.data.checkIn || null, checkOut: row.data.checkOut || null, note: row.data.reason, adjustedBy: m.id } : { ...old?.data, checkIn: null, checkOut: null, note: row.data.reason, adjustedBy: m.id };
          const s = row.data.type === "leave" ? row.data.leaveType : (old?.status || "present");
          extras.push(old ? this.replace(old, data, s) : this.insert("attendance", crypto.randomUUID(), data, { owner_id: row.owner_id, date: day, natural_key: row.owner_id + ":" + day, status: s }));
          extras.push(this.audit(m.id, "Điều chỉnh điểm danh", old?.id || row.id, old, { date: day, data, status: s }));
        }
      }
      extras.push(this.notify(row.owner_id!, approved ? "Đơn đã được duyệt" : "Đơn bị từ chối", reason, "attendance"));
      return this.commit(m, "Duyệt đơn", row, "request", { ...row.data, decisionReason: reason, decidedBy: m.id, decidedAt: this.stamp() }, { status: approved ? "approved" : "rejected" }, extras);
    }
    if (action === "daily") {
      const data = reportSchema.parse(b); ensure(data.date <= today(this.now), "Không gửi báo cáo cho ngày tương lai");
      const owner=(await this.members()).find(member=>member.id===(data.memberId||m.id));ensure(owner,"Không tìm thấy nhân sự",404);
      ensure(m.role==="Lead"||owner.id===m.id,"Chỉ Lead được viết hoặc sửa báo cáo thay thành viên",403);
      const settings=await this.settings();ensure(dailyReportWritable(m,owner.id,data.date,this.now,settings.reportDeadline),`Daily Report chỉ được nhập/sửa trước ${settings.reportDeadline} trong ngày báo cáo. Sau hạn, liên hệ Lead.`,403);
      ensure(data.lines.reduce((n, l) => n + l.minutes, 0) <= 1440, "Tổng thời gian không được vượt 24 giờ/ngày");
      ensure(new Set(data.lines.map(l => l.taskId + ":" + l.activity)).size === data.lines.length, "Mỗi task / hoạt động chỉ xuất hiện một dòng trong ngày");
      const all = await this.rows(); const old=b.id?await this.get(id.parse(b.id),"daily"):all.find(r => r.kind === "daily" && r.owner_id === owner.id && r.date === data.date);
      ensure(!old||old.owner_id===owner.id&&old.date===data.date,"Không được đổi nhân sự hoặc ngày của báo cáo đang sửa",409);
      if(old&&b.revision!=null)ensure(b.revision===old.revision,"Báo cáo đã được người khác cập nhật. Tải lại trước khi sửa tiếp.",409);
      const status=data.submit||old&&["submitted","approved","imported"].includes(old.status)?"submitted":"draft";
      const reservations: Statement[] = [];
      for (const l of data.lines) {
        const task = await this.get(l.taskId, "task");
        l.taskCode=task.data.code;l.jobId=task.data.jobId||"";
        if (l.activity === "qc") { ensure((owner.role === "Lead" || (owner.role === "QA/QC" && task.data.reviewerId === owner.id)), "Chỉ báo cáo QC cho task được giao kiểm tra", 403); ensure(l.quantity === 0 && l.rework === 0, "Hoạt động QC chỉ ghi thời gian; sản lượng lấy từ kết quả kiểm tra"); continue; }
        ensure(task.data.assigneeId === owner.id, "Chỉ được báo cáo annotation cho task của nhân sự báo cáo", 403);
        if(l.idCount!=null){
          ensure(all.some(p=>p.kind==="project"&&p.id===task.project_id&&p.data.unit==="cuboid"),"Công thức ID × frame chỉ áp dụng cho cuboid");
          const previous=old?.data.lines?.find((line:any)=>line.taskId===l.taskId&&line.activity!=="qc"),frames=previous?.idCount!=null?previous.frameCountAtReport:taskFrameCount(task);
          ensure(frames!=null,"Lead cần nhập số frame của Job trước khi tính cuboid");
          const quantity=cuboidsFromIds(l.idCount,frames);ensure(quantity!=null,"Số ID hoặc số frame không hợp lệ, hoặc sản lượng vượt giới hạn");
          l.quantity=quantity;Object.assign(l,{frameCountAtReport:frames,productionFactor:PRODUCTION_FACTOR});
        }
        ensure(status!=="submitted"||l.endId,"Cần nhập ID đã làm tới cho mỗi dòng annotation");
      }
      const reports=[...all.filter(r=>r.kind==="daily"&&r.id!==old?.id),{date:data.date,data}],touched=new Set([...data.lines,...(old?.data.lines||[])].filter((l:any)=>l.activity!=="qc").map((l:any)=>l.taskId));
      for(const taskId of touched){const task=await this.get(taskId,"task"),lines=reports.flatMap(r=>(r.data.lines||[]).filter((l:any)=>l.taskId===taskId&&l.activity!=="qc").map((line:any)=>({date:r.date,line}))).sort((a,b)=>b.date!.localeCompare(a.date!)),total=lines.reduce((n,v)=>n+(v.line.quantity||0),0),latest=lines[0];ensure(task.data.quantity==null||total<=task.data.quantity,"Tổng sản lượng mới trong báo cáo vượt khối lượng task "+task.data.code);reservations.push(this.replace(task,{...task.data,reportedTotal:total,latestProductionDate:latest?.date||null,latestEndId:latest?reportEndId(latest.line):""}));}
      return this.commit(m, m.id!==owner.id?"Lead viết / sửa Daily Report thay thành viên":status==="submitted"?"Gửi / sửa daily report":"Lưu nháp daily report", old || null, "daily", {...data,qcContentToken:crypto.randomUUID(),createdBy:old?.data.createdBy||m.id,lastEditedBy:m.id,lastEditedAt:this.stamp()}, { owner_id: owner.id, date: data.date, natural_key: owner.id + ":" + data.date, status }, reservations);
    }
    if (action === "weekly") {
      const data = weeklySchema.parse(b); data.date = weekStart(data.date); ensure(data.date <= today(this.now), "Không gửi báo cáo tuần tương lai");
      const old = (await this.rows("weekly")).find(r => r.owner_id === m.id && r.date === data.date); ensure(!old || ["draft", "changes"].includes(old.status), "Báo cáo cần Lead mở lại trước khi sửa", 409);
      const aggregate = await this.aggregate(m, m.id, data.date);
      return this.commit(m, data.submit ? "Gửi weekly report" : "Lưu nháp weekly report", old || null, "weekly", { ...data, snapshot: data.submit ? aggregate : null, aggregatedAt: data.submit ? this.stamp() : null }, { owner_id: m.id, date: data.date, natural_key: m.id + ":" + data.date, status: data.submit ? "submitted" : "draft" });
    }
    if (action === "report-decision") {
      this.lead(m); const row = await this.get(id.parse(b.id)); ensure(["daily", "weekly"].includes(row.kind), "Loại báo cáo không hợp lệ");
      const decision = z.enum(["approve", "changes", "reopen"]).parse(b.decision); const reason = decision === "approve" ? str.parse(b.reason || "") : required.parse(b.reason);
      ensure(decision === "reopen" ? ["approved", "submitted"].includes(row.status) : row.status === "submitted", "Trạng thái báo cáo không phù hợp", 409);
      return this.commit(m, "Duyệt / mở lại báo cáo", row, row.kind, { ...row.data,...(row.kind==="daily"?{autoQcApproved:false,...(decision!=="approve"?{qcContentToken:crypto.randomUUID(),qcBaseRevision:undefined}: {})}:{}), reviewReason: reason, reviewedBy: m.id, reviewedAt: this.stamp() }, { status: decision === "approve" ? "approved" : "changes" }, [this.notify(row.owner_id!, decision === "approve" ? "Báo cáo đã duyệt" : "Báo cáo cần bổ sung", reason || row.date!, row.kind)]);
    }
    if(action==="review-fix") {
      const data=z.object({id,errorIndex:z.coerce.number().int().min(0),fixed:z.boolean(),note:str.default("")}).parse(b);
      const review=await this.get(data.id,"review"),task=await this.get(review.task_id!,"task");
      ensure(task.data.assigneeId===m.id,"Chỉ annotator được giao bài mới được cập nhật sửa lỗi",403);
      ensure(review.data.errors[data.errorIndex],"Không tìm thấy lỗi",404);
      if(review.data.mode==="daily")ensure(!review.data.errors[data.errorIndex].verification,"Lỗi đã được QC kiểm lại; xem kết quả hoặc lỗi được ghi tiếp",409);
      else {ensure(["changes","doing"].includes(task.status),"Bài không ở trạng thái sửa lỗi",409);const latest=(await this.rows("review")).filter(r=>r.task_id===task.id&&r.data.mode!=="daily").sort((a,b)=>b.data.round-a.data.round)[0];ensure(latest?.id===review.id,"Chỉ cập nhật lỗi của lượt QC mới nhất",409);}
      const errors=review.data.errors.map((e:any,i:number)=>i===data.errorIndex?{...e,fixed:data.fixed,fixNote:data.note,fixedBy:m.id,fixedAt:data.fixed?this.stamp():null}:e);
      const value={...review.data,errors,repairStatus:errors.every((e:any)=>e.fixed)?"fixed":"pending"};
      const approvals=review.data.mode==="daily"?reportQcApprovalStatements(this,m,await this.rows(),[{...review,data:value}]):[];
      return this.commit(m,"Cập nhật trạng thái sửa lỗi",review,"review",value,{},[this.replace(task,task.data),...approvals]);
    }
    if (action === "review") {
      const data = reviewSchema.parse(b); const task = await this.get(data.taskId, "task");
      data.productionDate ||= today(this.now); ensure(data.productionDate<=today(this.now),"Ngày sản lượng không được ở tương lai");
      ensure(m.role === "Lead" || (m.role === "QA/QC" && task.data.reviewerId === m.id), "Chỉ QA/QC được phân công hoặc Lead được kiểm tra", 403);
      ensure(["qa", "recheck"].includes(task.status), "Task chưa sẵn sàng kiểm tra hoặc đã xử lý", 409);
      ensure(data.checked === data.passed + data.failed && data.checked <= task.data.completed, "Số đạt + cần sửa phải bằng số đã kiểm và không vượt tiến độ task");
      ensure(data.scope !== "sample" || data.sample.trim(), "Cần mô tả phạm vi mẫu"); ensure(data.scope !== "full" || data.checked === task.data.completed, "Kiểm toàn bộ phải bằng khối lượng task đã làm");
      ensure(data.verdict !== "passed" || (data.failed === 0 && task.data.completed === task.data.quantity), "Chỉ hoàn thành khi không còn lỗi và đã làm đủ khối lượng giao");
      ensure(data.verdict !== "changes" || (data.failed > 0 && data.errors.length > 0), "Cần ghi số lượng và chi tiết lỗi khi trả sửa");
      const settings = await this.settings(); ensure(data.errors.every(e => settings.errorTypes.includes(e.type)), "Loại lỗi không nằm trong danh mục");
      const reviews = (await this.rows("review")).filter(r => r.task_id === task.id);
      return this.commit(m, "Ghi nhận kết quả QA/QC", null, "review", { ...data, round: reviews.length + 1, first: !reviews.some(r=>r.data.mode!=="daily"), fixerId: task.data.assigneeId, checkedAt: this.stamp() }, { owner_id: m.id, task_id: task.id, project_id: task.project_id, date: today(this.now), status: data.verdict }, [this.replace(task, { ...task.data, completedAt: data.verdict === "passed" ? this.stamp() : null }, data.verdict === "passed" ? "done" : "changes"), this.notify(task.data.assigneeId, data.verdict === "passed" ? "Task đã hoàn thành" : "Task cần sửa lỗi", task.data.code + " · " + data.note, "tasks")]);
    }
    if (action === "document") { this.lead(m); const data = z.object({ title: required, content: str, link: url.default(""), category: z.enum(["announcement", "guide"]) }).parse(b); return this.commit(m, "Lưu thông báo / tài liệu", b.id ? await this.get(b.id, "document") : null, "document", data, { owner_id: m.id }); }
    if (action === "settings") { this.lead(m); const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/); const data = z.object({ workStart: time, workEnd: time, lateGrace: z.coerce.number().int().min(0).max(120), reportDeadline: time, workDays: z.array(z.number().int().min(0).max(6)).min(1), kpiStartDate:date.default("2026-10-20"),kpiWorkingSaturday:date.refine(v=>new Date(v+"T12:00:00Z").getUTCDay()===6,"Chọn một thứ Bảy làm việc").default("2026-10-24"),errorTypes: z.array(required).min(1).max(30) }).parse(b); ensure(data.workEnd > data.workStart, "Giờ kết thúc phải sau giờ bắt đầu"); const row=await this.get("settings");return this.commit(m, "Cập nhật cài đặt", row, "settings", {...row.data,...data}); }
    if (action === "target") { this.lead(m); const data = z.object({ memberId: id, projectId: id, from: date, to: date, quantity: num.positive() }).parse(b); ensure(data.to >= data.from, "Khoảng ngày không hợp lệ"); await this.get(data.projectId, "project"); ensure((await this.members()).some(x => x.id === data.memberId), "Thành viên không tồn tại"); return this.commit(m, "Thiết lập chỉ tiêu", b.id ? await this.get(b.id, "target") : null, "target", data, { owner_id: data.memberId, project_id: data.projectId, date: data.from }); }
    if (action === "notification-read") { const row = await this.get(id.parse(b.id), "notification"); ensure(row.owner_id === m.id, "Không có quyền", 403); await this.db.batch([this.replace(row, { ...row.data, read: true })]); return { ok: true }; }
    if(action==="kpi-exclusion") {
      this.attendanceLead(m);const data=z.object({date,memberId:id.nullable().default(null),reason:str.default(""),enabled:z.boolean().default(true)}).parse(b);
      ensure(!data.memberId||(await this.members()).some(m=>m.id===data.memberId),"Thành viên không tồn tại");
      const key=(data.memberId||"team")+":"+data.date,old=(await this.rows("kpi-exclusion")).find(r=>r.natural_key===key);
      return this.commit(m,data.enabled?"Không tính KPI trong ngày":"Tính lại KPI trong ngày",old||null,"kpi-exclusion",data,{owner_id:data.memberId,date:data.date,natural_key:key,status:data.enabled?"active":"disabled"});
    }
    if(action==="kpi-rate") {
      this.attendanceLead(m);const data=z.object({memberId:id,date,quantity:num.int(),reason:str.default("")}).parse(b);
      ensure((await this.members()).some(m=>m.id===data.memberId),"Thành viên không tồn tại");
      const key=data.memberId+":"+data.date,old=(await this.rows("kpi-rate")).find(r=>r.natural_key===key);
      return this.commit(m,"Điều chỉnh mức KPI theo người",old||null,"kpi-rate",data,{owner_id:data.memberId,date:data.date,natural_key:key,status:"active"});
    }
    throw new HubError("Thao tác không tồn tại", 404);
  }
  validateTimes(checkIn: string, checkOut: string, day: string) {
    const start=Date.parse(checkIn),end=Date.parse(checkOut);
    ensure(checkIn && !isNaN(start), "Giờ check-in không hợp lệ"); ensure(today(new Date(start)) === day && start <= this.now.getTime(), "Giờ check-in phải thuộc ngày điều chỉnh và không ở tương lai");
    ensure(!checkOut || (!isNaN(end) && end > start && end <= this.now.getTime() && today(new Date(end)) === day), "Giờ check-out không hợp lệ");
  }
  async evaluation(m:Member,input:any={}) {
    this.lead(m);const settings=await this.settings(),end=today(this.now);
    const data=z.object({from:date.default((settings.kpiStartDate||end)>end?end:settings.kpiStartDate||end),to:date.default(end),member:z.string().max(100).default(""),role:z.enum(["","Lead","QA/QC","Annotator"]).default(""),state:z.enum(["","active","pending","invited","disabled"]).default(""),q:z.string().max(500).default("")}).parse(input);
    ensure(data.from<=data.to&&data.to<=end,"Chọn khoảng ngày hợp lệ, không vượt ngày hiện tại");
    const members=await this.members();ensure(!data.member||members.some(m=>m.id===data.member),"Không tìm thấy nhân sự",404);
    const q=data.q.trim().toLocaleLowerCase("vi"),rows=buildTeamEvaluation(members,await this.rows(),data.from,data.to).filter(r=>(!data.member||r.memberId===data.member)&&(!data.role||r.role===data.role)&&(!data.state||r.state===data.state)&&(!q||(r.name+" "+r.username).toLocaleLowerCase("vi").includes(q)));
    return {from:data.from,to:data.to,rows,totals:evaluationTotals(rows)};
  }
  async aggregate(m: Member, owner: string, start: string) {
    if (owner === "team") {
      this.lead(m); const members = await this.members(); const summaries: any[] = [];
      for (const member of members) summaries.push({ memberId: member.id, name: member.name, role: member.role, ...await this.aggregate(m, member.id, start) });
      const products: Record<string, any> = {}, firstPass: Record<string, any> = {};
      for (const summary of summaries) { for (const p of summary.products) { const v = products[p.projectId] ||= { ...p, quantity: 0, rework: 0, minutes: 0, missingReworkLines:0 }; v.missingReworkLines += p.missingReworkLines || 0; v.quantity += p.quantity; v.rework += p.rework; v.minutes += p.minutes; } for (const [key,p] of Object.entries(summary.firstPass) as any) { const v = firstPass[key] ||= { unit:p.unit,checked:0,passed:0 }; v.checked += p.checked; v.passed += p.passed; } }
      return { start: weekStart(start), end: addDays(weekStart(start),6), minutes: summaries.reduce((n,s)=>n+s.minutes,0), annotationMinutes: summaries.reduce((n,s)=>n+s.annotationMinutes,0), qcMinutes: summaries.reduce((n,s)=>n+s.qcMinutes,0), missingTimeLines: summaries.reduce((n,s)=>n+s.missingTimeLines,0), knownTimeLines: summaries.reduce((n,s)=>n+s.knownTimeLines,0), products: Object.values(products), firstPass, tasks: { completed:summaries.reduce((n,s)=>n+s.tasks.completed,0),open:summaries.reduce((n,s)=>n+s.tasks.open,0),overdue:summaries.reduce((n,s)=>n+s.tasks.overdue,0) }, sourceReports:summaries.flatMap(s=>s.sourceReports),sourceTasks:summaries.flatMap(s=>s.sourceTasks),sourceReviews:summaries.flatMap(s=>s.sourceReviews),attendance:summaries.flatMap(s=>s.attendance), errors:summaries.flatMap(s=>s.errors), members:summaries };
    }
    ensure(m.role === "Lead" || owner === m.id, "Không có quyền xem tổng hợp người khác", 403); start = weekStart(date.parse(start)); const end = addDays(start, 6); const all = await this.rows();
      const reports = all.filter(r => r.kind === "daily" && r.owner_id === owner && r.date! >= start && r.date! <= end && ["submitted", "approved", "imported"].includes(r.status));
    const tasks = all.filter(r => r.kind === "task" && r.data.assigneeId === owner && r.data.assignedDate <= end && (r.updated_at.slice(0, 10) >= start || r.status !== "done"));
    const products: Record<string, any> = {};
    for (const report of reports) for (const l of report.data.lines) { const t = all.find(r => r.id === l.taskId); const p = all.find(r => r.id === t?.project_id); if (!p) continue; const v = products[p.id] ||= { projectId: p.id, project: p.data.name, unit: p.data.unit, quantity: 0, rework: 0, minutes: 0, missingReworkLines:0 }; if(l.rework==null)v.missingReworkLines++; v.quantity += l.quantity; v.rework += l.rework; v.minutes += l.minutes; }
    const taskIds = new Set(all.filter(r => r.kind === "task" && r.data.assigneeId === owner).map(t => t.id));
    const reviews = all.filter(r => r.kind === "review" && taskIds.has(r.task_id!) && r.date! >= start && r.date! <= end);
    const first: Record<string, { unit: string; checked: number; passed: number }> = {};
    for (const r of reviews.filter(r => r.data.first)) { const p = all.find(p => p.id === r.project_id); if (p) { const v = first[p.id] ||= { unit: p.data.unit, checked: 0, passed: 0 }; v.checked += r.data.checked; v.passed += r.data.passed; } }
    const lines = reports.flatMap(r=>r.data.lines);
    return { start, end, minutes: lines.reduce((n: number, l: any) => n + (l.minutes || 0), 0), annotationMinutes: lines.filter(l=>l.activity!=="qc").reduce((n,l)=>n+(l.minutes||0),0), qcMinutes: lines.filter(l=>l.activity==="qc").reduce((n,l)=>n+(l.minutes||0),0), missingTimeLines:lines.filter(l=>l.minutes==null).length, knownTimeLines:lines.filter(l=>l.minutes!=null).length, products: Object.values(products), tasks: { completed: tasks.filter(t => t.status === "done" && t.data.completedAt && today(new Date(t.data.completedAt))>=start && today(new Date(t.data.completedAt))<=end).length, open: tasks.filter(t => t.status !== "done").length, overdue: tasks.filter(t => t.status !== "done" && t.data.deadline && t.data.deadline < (end < today(this.now) ? end : today(this.now))).length }, firstPass: first, errors: reviews.flatMap(r => r.data.errors), attendance: all.filter(r => r.kind === "attendance" && r.owner_id === owner && r.date! >= start && r.date! <= end).map(r => ({ date: r.date, status: r.status })), sourceReports: reports.map(r => ({ id: r.id, date: r.date, status: r.status, revision: r.revision })), sourceTasks: tasks.map(r => ({ id: r.id, code: r.data.code, status: r.status, revision: r.revision })), sourceReviews: reviews.map(r => r.id), formula: "Tỷ lệ đạt lần đầu = số đơn vị đạt ở lần kiểm đầu / số đơn vị đã kiểm lần đầu. Tính riêng từng dự án, không trộn đơn vị." };
  }
}


