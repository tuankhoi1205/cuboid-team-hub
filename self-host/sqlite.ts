import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Database, Statement } from "../lib/domain.ts";

class Query implements Statement {
  constructor(private db:DatabaseSync,private sql:string,private args:any[]=[]) {}
  bind(...args:any[]) { return new Query(this.db,this.sql,args); }
  async all() { return {results:this.db.prepare(this.sql).all(...this.args)}; }
  async first() { return this.db.prepare(this.sql).get(...this.args)||null; }
  execute() { const r=this.db.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes)}}; }
  async run() { return this.execute(); }
}
export class SqliteStore implements Database {
  sql:DatabaseSync;
  constructor(file:string,schema:string) {
    if(file!==":memory:")mkdirSync(dirname(file),{recursive:true,mode:0o700});
    this.sql=new DatabaseSync(file,{timeout:5000});
    this.sql.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;");
    this.sql.exec("CREATE TABLE IF NOT EXISTS selfhost_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
    if(!this.sql.prepare("SELECT 1 FROM selfhost_meta WHERE key='schema_v1'").get()) {
      this.transaction(()=>{ this.sql.exec(schema);this.sql.prepare("INSERT INTO selfhost_meta VALUES('schema_v1','1')").run(); });
    }
    this.sql.exec(`CREATE TABLE IF NOT EXISTS auth_credentials(member_id TEXT PRIMARY KEY REFERENCES members(id),password_hash TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),credential_version INTEGER NOT NULL,expires_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_tokens(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),purpose TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed_at INTEGER);
      CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS members_handle_unique ON members(lower(substr(email,1,instr(email,'@')-1)));`);
  }
  prepare(sql:string) { return new Query(this.sql,sql); }
  transaction<T>(fn:()=>T):T { this.sql.exec("BEGIN IMMEDIATE");try{const result=fn();this.sql.exec("COMMIT");return result;}catch(e){this.sql.exec("ROLLBACK");throw e;} }
  async batch(statements:Statement[]) {
    // No await inside the transaction: concurrent HTTP requests cannot enter it.
    return this.transaction(()=>statements.map(s=>(s as Query).execute()));
  }
  close() { this.sql.close(); }
}
