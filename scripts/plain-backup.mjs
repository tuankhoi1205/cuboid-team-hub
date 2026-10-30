import {DatabaseSync,backup} from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile,readdir,lstat,rename,copyFile,mkdtemp} from "node:fs/promises";
import {resolve,join,dirname} from "node:path";
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const valid=name=>name==="cuboid.sqlite"||name==="manifest.json"||/^files\/[a-f0-9-]{36}$/.test(name);
async function ordinary(file,directory=false){const info=await lstat(file);if(info.isSymbolicLink()||!(directory?info.isDirectory():info.isFile()))throw new Error("Expected ordinary backup file/directory");return info;}

export async function packPlainBackup({dataDir,directory,workDir}){
 dataDir=resolve(dataDir);directory=resolve(directory);workDir=resolve(workDir);
 await mkdir(workDir,{recursive:true});const stage=await mkdtemp(join(workDir,"plain-backup-"));
 await ordinary(join(dataDir,"cuboid.sqlite"));const live=new DatabaseSync(join(dataDir,"cuboid.sqlite"),{readOnly:true,timeout:5000});
 try{await backup(live,join(stage,"cuboid.sqlite"));}finally{live.close();}
 const db=new DatabaseSync(join(stage,"cuboid.sqlite"));let summary;
 try{
  db.exec("PRAGMA secure_delete=ON; DELETE FROM auth_sessions; DELETE FROM auth_tokens; DELETE FROM auth_limits; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE; VACUUM;");
  if(Object.values(db.prepare("PRAGMA integrity_check").get())[0]!=="ok")throw new Error("Invalid SQLite backup");
  summary={members:db.prepare("SELECT count(*) n FROM members").get().n,records:db.prepare("SELECT count(*) n FROM records").get().n,dailyReports:db.prepare("SELECT count(*) n FROM records WHERE kind='daily'").get().n,uploadedFiles:0};
 }finally{db.close();}
 const names=["cuboid.sqlite","manifest.json"];
 try{
  await ordinary(join(dataDir,"files"),true);
  for(const name of (await readdir(join(dataDir,"files"))).sort()){
   if(!valid("files/"+name))throw new Error("Unexpected uploaded filename");await ordinary(join(dataDir,"files",name));
   await mkdir(join(stage,"files"),{recursive:true});await copyFile(join(dataDir,"files",name),join(stage,"files",name));names.push("files/"+name);
  }
 }catch(error){if(error.code!=="ENOENT")throw error;}
 summary.uploadedFiles=names.length-2;const createdAt=new Date().toISOString();
 await writeFile(join(stage,"manifest.json"),JSON.stringify({format:"cuboid-selfhost-full-v1",createdAt,includes:["SQLite business data","Password hashes","Uploaded files"],excluded:["Active sessions","Activation/reset tokens","Login rate limits"],encryption:"none"},null,2)+"\n");
 const files=[];for(const path of names){const bytes=await readFile(join(stage,path));files.push({path,bytes:bytes.length,sha256:digest(bytes)});}
 const manifest={format:"cuboid-plain-backup-v1",createdAt,summary,files},bytes=Buffer.from(JSON.stringify(manifest,null,2)+"\n");
 await writeFile(join(stage,"checksums.json"),bytes);await mkdir(dirname(directory),{recursive:true});
 // Both old and new snapshots remain recoverable; no live DB is moved.
 let previous;try{await ordinary(directory,true);previous=join(workDir,"previous-plain-"+randomUUID());await rename(directory,previous);}catch(error){if(error.code!=="ENOENT")throw error;}
 try{await rename(stage,directory);}catch(error){if(previous)await rename(previous,directory);throw error;}
 return {...manifest,sha256:digest(bytes)};
}

export async function unpackPlainBackup({directory,release,backupRoot}){
 directory=resolve(directory);await ordinary(directory,true);await ordinary(join(directory,"checksums.json"));
 const bytes=await readFile(join(directory,"checksums.json")),manifest=JSON.parse(bytes);
 if(digest(bytes)!==release.sha256||manifest.format!=="cuboid-plain-backup-v1"||manifest.createdAt!==release.createdAt||JSON.stringify(manifest.summary)!==JSON.stringify(release.summary)||!Array.isArray(manifest.files))throw new Error("Plain snapshot manifest mismatch");
 const files=[],seen=new Set();let total=0;
 for(const file of manifest.files){
  if(!valid(file.path)||seen.has(file.path))throw new Error("Unsafe or duplicate plain backup path");seen.add(file.path);
  if(file.path.startsWith("files/"))await ordinary(join(directory,"files"),true);await ordinary(join(directory,file.path));
  const data=await readFile(join(directory,file.path));total+=data.length;if(total>128*1024*1024)throw new Error("Plain snapshot exceeds supported size");
  if(data.length!==file.bytes||digest(data)!==file.sha256)throw new Error("Plain snapshot checksum mismatch: "+file.path);files.push({path:file.path,data});
 }
 if(!seen.has("cuboid.sqlite")||!seen.has("manifest.json")||files.length-2!==manifest.summary.uploadedFiles)throw new Error("Incomplete plain snapshot");
 if(JSON.parse(files.find(file=>file.path==="manifest.json").data).format!=="cuboid-selfhost-full-v1")throw new Error("Invalid full backup manifest");
 await mkdir(backupRoot,{recursive:true});const folder=await mkdtemp(join(resolve(backupRoot),"github-restored-"));
 for(const file of files){const target=join(folder,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,file.data,{flag:"wx",mode:0o600});}
 return folder;
}
