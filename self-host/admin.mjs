import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, cp, copyFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL(".",import.meta.url)),data=resolve(process.env.HUB_DATA_DIR||join(root,"data"));
const command=process.argv[2];
const dbPath=join(data,"cuboid.sqlite");
if(!existsSync(dbPath))throw new Error("Chua co du lieu. Chay StartHub.cmd truoc.");
async function makeBackup() {
 const stamp=new Date().toISOString().replace(/[:.]/g,"-");const target=join(data,"backups",stamp);await mkdir(target,{recursive:true,mode:0o700});
 const db=new DatabaseSync(dbPath,{timeout:5000});try{await backup(db,join(target,"cuboid.sqlite"));}finally{db.close();}
 const snapshot=new DatabaseSync(join(target,"cuboid.sqlite"));try{snapshot.exec("DELETE FROM auth_sessions; DELETE FROM auth_tokens; PRAGMA wal_checkpoint(TRUNCATE)");}finally{snapshot.close();}
 if(existsSync(join(data,"files")))await cp(join(data,"files"),join(target,"files"),{recursive:true});
 await writeFile(join(target,"manifest.json"),JSON.stringify({format:"cuboid-selfhost-full-v1",createdAt:new Date().toISOString(),includes:["SQLite business data","Password hashes","Uploaded files"],excluded:["Active sessions","Unused activation/reset tokens"]},null,2),{mode:0o600});
 return target;
}
if(command==="backup")console.log("Full backup saved: "+await makeBackup());
else if(command==="reset-lead") {
 process.env.HUB_NO_LISTEN="1";const {createLocalApp}=await import("./dist/server/server.mjs");
 const app=await createLocalApp({dataDir:data,publicDir:join(root,"dist/client")});
 try{if(!app.auth.isSetup())throw new Error("Mo http://127.0.0.1:3210/auth/setup de thiet lap Lead lan dau.");const result=app.auth.issue("member-0","reset",0.5);await mkdir(join(root,".runtime"),{recursive:true,mode:0o700});await writeFile(join(root,".runtime/reset-lead-link.txt"),`http://127.0.0.1:${process.env.HUB_PORT||3210}/auth/activate?token=${result.token}`,{mode:0o600});await app.store.batch([app.hub.audit("member-0","Tao lien ket khoi phuc Lead tren may host","member-0",null,{expires:result.expires})]);console.log("Private one-time recovery link saved to .runtime/reset-lead-link.txt (30 minutes).");}finally{await app.close();}
} else if(command==="restore") {
 if(process.argv[4]!=="KHOI_PHUC")throw new Error("Usage: node admin.mjs restore <backup-folder> KHOI_PHUC. StopHub.cmd must run first.");
 const target=resolve(process.argv[3]||"");const backupRoot=resolve(data,"backups");if(!target.startsWith(backupRoot+sep))throw new Error("Backup folder must be inside data/backups.");
 if(!(await stat(join(target,"cuboid.sqlite"))).isFile()||!existsSync(join(target,"manifest.json")))throw new Error("Backup is incomplete.");
 const live=await fetch(`http://127.0.0.1:${process.env.HUB_PORT||3210}/api/health`,{signal:AbortSignal.timeout(1500)}).then(r=>r.ok).catch(()=>false);if(live)throw new Error("StopHub.cmd must run before restoring.");
 const saved=await makeBackup();
 const current=new DatabaseSync(dbPath);current.exec("PRAGMA wal_checkpoint(TRUNCATE)");current.close();
 await copyFile(join(target,"cuboid.sqlite"),dbPath);
 if(existsSync(join(target,"files")))await cp(join(target,"files"),join(data,"files"),{recursive:true,force:true});
 console.log("Restored data. Previous data saved: "+saved+". StartHub.cmd can now run.");
} else throw new Error("Choose backup, reset-lead or restore.");
