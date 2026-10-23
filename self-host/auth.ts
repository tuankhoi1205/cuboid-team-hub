import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { Hub, HubError, ensure, type Member } from "../lib/domain.ts";
import type { SqliteStore } from "./sqlite.ts";

export const hashToken=(value:string)=>createHash("sha256").update(value).digest("hex");
const freshToken=()=>randomBytes(32).toString("base64url");
let hashJobs=0;
async function derive(password:string,salt:Buffer) {
  ensure(hashJobs<3,"Đang xử lý đăng nhập. Vui lòng thử lại sau vài giây.",429);hashJobs++;
  try{return await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,key)=>e?reject(e):resolve(key)));}finally{hashJobs--;}
}
export function validatePassword(password:unknown):asserts password is string {
  ensure(typeof password==="string"&&password.length>=3&&password.length<=128,"Mật khẩu cần từ 3 đến 128 ký tự.");
}
export async function passwordHash(password:string) { validatePassword(password);const salt=randomBytes(16);return `scrypt-v1:${salt.toString("hex")}:${(await derive(password,salt)).toString("hex")}`; }
export async function passwordMatches(password:string,stored:string) {
  const [version,salt,digest]=stored.split(":");
  if(version!=="scrypt-v1"||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{128}$/.test(digest))return false;
  const actual=await derive(password,Buffer.from(salt,"hex"));return timingSafeEqual(actual,Buffer.from(digest,"hex"));
}
export function cookieValue(req:Request,name:string) { return req.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="))?.slice(name.length+1)||""; }
export const sessionCookie=(token:string,secure:boolean,maxAge=12*3600)=>`cuboid_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?"; Secure":""}`;

export class LocalAuth {
  private dummyHash="";
  constructor(public store:SqliteStore) {}
  async initialize() { this.dummyHash=await passwordHash(freshToken());this.cleanup(); }
  cleanup() { const now=Date.now();this.store.sql.prepare("DELETE FROM auth_sessions WHERE expires_at<? OR last_seen<?").run(now,now-2*3600000);this.store.sql.prepare("DELETE FROM auth_tokens WHERE expires_at<?").run(now);this.store.sql.prepare("DELETE FROM auth_limits WHERE expires_at<?").run(now); }
  isSetup() { return !!this.store.sql.prepare("SELECT 1 FROM auth_credentials WHERE member_id='member-0'").get(); }
  limit(key:string,max:number,windowMs=15*60000) {
    const hash=hashToken(key),now=Date.now();
    const result=this.store.sql.prepare("INSERT INTO auth_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count").get(hash,now+windowMs,now,now) as any;
    ensure(result.count<=max,"Đã thử quá nhiều lần. Vui lòng chờ 15 phút rồi thử lại.",429);
  }
  async current(req:Request) {
    const token=cookieValue(req,"cuboid_session");if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
    const now=Date.now();const row=this.store.sql.prepare(`SELECT m.*,c.version AS credential_version FROM auth_sessions s JOIN members m ON m.id=s.member_id JOIN auth_credentials c ON c.member_id=m.id WHERE s.token_hash=? AND s.expires_at>? AND s.last_seen>? AND s.credential_version=c.version AND m.state='active'`).get(hashToken(token),now,now-2*3600000) as any;
    if(!row)return null;
    this.store.sql.prepare("UPDATE auth_sessions SET last_seen=? WHERE token_hash=?").run(now,hashToken(token));
    return row as Member;
  }
  session(memberId:string) {
    const credential=this.store.sql.prepare("SELECT version FROM auth_credentials WHERE member_id=?").get(memberId) as any;ensure(credential,"Tài khoản chưa đặt mật khẩu",403);
    const token=freshToken(),now=Date.now();
    this.store.sql.prepare("INSERT INTO auth_sessions VALUES(?,?,?,?,?)").run(hashToken(token),memberId,credential.version,now+12*3600000,now);
    return token;
  }
  async login(username:unknown,password:unknown,ip:string) {
    ensure(typeof username==="string"&&username.length<=254&&typeof password==="string"&&password.length<=128,"Thông tin đăng nhập không hợp lệ");
    const handle=username.trim().toLowerCase();this.limit("login-user:"+handle,12);this.limit("login-ip:"+ip,100);
    const row=this.store.sql.prepare(`SELECT m.*,c.password_hash FROM members m LEFT JOIN auth_credentials c ON c.member_id=m.id WHERE lower(m.email)=? OR lower(substr(m.email,1,instr(m.email,'@')-1))=?`).get(handle,handle) as any;
    const valid=await passwordMatches(password,row?.password_hash||this.dummyHash);
    ensure(valid&&row?.state==="active"&&row?.password_hash,"Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản chưa được kích hoạt.",401);
    const hub=new Hub(this.store,"");await this.store.batch([hub.audit(row.id,"Đăng nhập bằng mật khẩu",row.id,null,null)]);
    return {token:this.session(row.id),member:row as Member};
  }
  logout(req:Request) { this.store.sql.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hashToken(cookieValue(req,"cuboid_session"))); }
  issue(memberId:string,purpose:"setup"|"invite"|"reset",hours:number) {
    const token=freshToken(),expires=Date.now()+hours*3600000;
    this.store.transaction(()=>{this.store.sql.prepare("DELETE FROM auth_tokens WHERE member_id=? AND purpose=?").run(memberId,purpose);this.store.sql.prepare("INSERT INTO auth_tokens VALUES(?,?,?,?,NULL)").run(hashToken(token),memberId,purpose,expires);});
    return {token,expires:new Date(expires).toISOString()};
  }
  tokenInfo(token:string) {
    ensure(/^[A-Za-z0-9_-]{43}$/.test(token),"Liên kết không hợp lệ hoặc đã hết hạn",400);
    const row=this.store.sql.prepare(`SELECT t.*,m.name,m.email,m.state FROM auth_tokens t JOIN members m ON m.id=t.member_id WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?`).get(hashToken(token),Date.now()) as any;
    ensure(row&&row.state!=="disabled","Liên kết không hợp lệ hoặc đã hết hạn",400);
    ensure(row.purpose!=="setup"||!this.isSetup(),"Tài khoản Lead đã được thiết lập",409);
    return row;
  }
  async consume(token:string,password:unknown) {
    validatePassword(password);const info=this.tokenInfo(token);const digest=await passwordHash(password);const hub=new Hub(this.store,"");
    this.store.transaction(()=>{
      this.tokenInfo(token);
      const changed=this.store.sql.prepare("UPDATE auth_tokens SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?").run(Date.now(),hashToken(token),Date.now());ensure(changed.changes===1,"Liên kết đã được sử dụng",409);
      this.store.sql.prepare("INSERT INTO auth_credentials(member_id,password_hash,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(member_id) DO UPDATE SET password_hash=excluded.password_hash,version=version+1,updated_at=excluded.updated_at").run(info.member_id,digest,new Date().toISOString());
      this.store.sql.prepare("UPDATE members SET auth_id=?,state='active',invite_expires=NULL WHERE id=?").run("local:"+info.member_id,info.member_id);
      this.store.sql.prepare("DELETE FROM auth_sessions WHERE member_id=?").run(info.member_id);
      this.store.sql.prepare("DELETE FROM auth_tokens WHERE member_id=?").run(info.member_id);
      this.store.sql.prepare("INSERT INTO audit(id,actor_id,action,entity_id,before,after,created_at) VALUES(?,?,?,?,NULL,NULL,?)").run(crypto.randomUUID(),info.member_id,info.purpose==="invite"?"Kích hoạt tài khoản bằng lời mời":"Thiết lập / khôi phục mật khẩu",info.member_id,hub.stamp());
    });
    return {memberId:info.member_id,token:this.session(info.member_id)};
  }
  async changePassword(me:Member,current:unknown,next:unknown) {
    ensure(typeof current==="string"&&current.length<=128,"Mật khẩu hiện tại không hợp lệ");validatePassword(next);
    this.limit("change-password:"+me.id,8);
    const credential=this.store.sql.prepare("SELECT password_hash FROM auth_credentials WHERE member_id=?").get(me.id) as any;
    ensure(credential&&await passwordMatches(current,credential.password_hash),"Mật khẩu hiện tại không đúng",403);
    const token=this.issue(me.id,"reset",1);return this.consume(token.token,next);
  }
  async afterMutation(action:string,result:any,actor:Member,body:any,req:Request,publicOrigin:string) {
    if(action!=="member"||!result.id)return result;
    const member=this.store.sql.prepare("SELECT * FROM members WHERE id=?").get(result.id) as any;
    if(body.state==="disabled"||body.role) this.store.sql.prepare("DELETE FROM auth_sessions WHERE member_id=? AND member_id!=?").run(result.id,actor.id);
    if(body.state==="invited") {
      const invite=this.issue(result.id,"invite",7*24);
      return {...result,invitationUrl:`${publicOrigin||new URL(req.url).origin}/auth/activate?token=${invite.token}`,username:member.email.split("@")[0],inviteExpires:invite.expires};
    }
    return result;
  }
}
