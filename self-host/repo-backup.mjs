import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
import {readFile,writeFile,mkdir,readdir,lstat,mkdtemp,rename,copyFile} from "node:fs/promises";
import {constants} from "node:fs";
import {resolve,join,dirname,sep} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";
import {gzipSync,gunzipSync} from "node:zlib";
import {DatabaseSync} from "node:sqlite";

const root=fileURLToPath(new URL(".",import.meta.url)),magic=Buffer.from("CUBOID-ENC-1\n"),limit=128*1024*1024;
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
const validPath=name=>name==="cuboid.sqlite"||name==="manifest.json"||/^files\/[a-f0-9-]{36}$/.test(name);
async function keyAt(file,create=false){
 let value;try{value=JSON.parse(await readFile(file,"utf8"));}catch(e){if(e.code!=="ENOENT"||!create)throw e;
  value={format:"cuboid-repo-key-v1",key:randomBytes(32).toString("base64"),createdAt:new Date().toISOString()};
  await mkdir(dirname(file),{recursive:true,mode:0o700});await writeFile(file,JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});
 }
 const key=Buffer.from(value.key||"","base64");if(value.format!=="cuboid-repo-key-v1"||key.length!==32)throw new Error("Invalid backup key file");return key;
}
function parseArchive(bytes){
 if(bytes.length<magic.length+4||!bytes.subarray(0,magic.length).equals(magic))throw new Error("Invalid encrypted backup format");
 const length=bytes.readUInt32BE(magic.length),start=magic.length+4,end=start+length;
 if(length>16384||end+16>=bytes.length)throw new Error("Invalid encrypted backup header");
 const aad=bytes.subarray(start,end),header=JSON.parse(aad.toString("utf8"));
 if(header.format!=="cuboid-repo-backup-v1"||header.algorithm!=="AES-256-GCM")throw new Error("Unsupported backup format");
 return{header,aad,tag:bytes.subarray(end,end+16),ciphertext:bytes.subarray(end+16)};
}
export async function inspectBackup(archiveFile){return parseArchive(await readFile(archiveFile)).header;}
export async function packBackup({backupDir,archiveFile,keyFile}){
 const db=new DatabaseSync(join(backupDir,"cuboid.sqlite"),{readOnly:true});let summary;
 try{
  if(db.prepare("SELECT count(*) n FROM auth_sessions").get().n||db.prepare("SELECT count(*) n FROM auth_tokens").get().n)throw new Error("Use a full backup with active sessions and reset tokens removed");
  summary={members:db.prepare("SELECT count(*) n FROM members").get().n,records:db.prepare("SELECT count(*) n FROM records").get().n,dailyReports:db.prepare("SELECT count(*) n FROM records WHERE kind='daily'").get().n};
 }finally{db.close();}
 const names=["cuboid.sqlite","manifest.json"];
 try{for(const name of (await readdir(join(backupDir,"files"))).sort()){if(!validPath("files/"+name))throw new Error("Unexpected uploaded file name");names.push("files/"+name);}}catch(e){if(e.code!=="ENOENT")throw e;}
 const files=[];let total=0;
 for(const name of names){const path=join(backupDir,...name.split("/")),info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw new Error("Backup must contain ordinary files only");total+=info.size;if(total>limit/2)throw new Error("Backup exceeds the supported repository archive size");const bytes=await readFile(path);files.push({path:name,sha256:digest(bytes),bytes:bytes.toString("base64")});}
 const key=await keyAt(keyFile,true),iv=randomBytes(12),header={format:"cuboid-repo-backup-v1",algorithm:"AES-256-GCM",createdAt:new Date().toISOString(),keyId:digest(key).slice(0,16),iv:iv.toString("base64"),summary:{...summary,uploadedFiles:names.length-2},excludes:["Active sessions","Activation/reset tokens"]};
 const aad=Buffer.from(JSON.stringify(header)),size=Buffer.alloc(4);size.writeUInt32BE(aad.length);
 const cipher=createCipheriv("aes-256-gcm",key,iv);cipher.setAAD(aad);
 const payload=gzipSync(Buffer.from(JSON.stringify({format:"cuboid-repo-payload-v1",files}))),encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
 const packed=Buffer.concat([magic,size,aad,cipher.getAuthTag(),encrypted]);
 await mkdir(dirname(archiveFile),{recursive:true});const temporary=archiveFile+"."+randomBytes(6).toString("hex")+".tmp";await writeFile(temporary,packed,{flag:"wx",mode:0o600});await rename(temporary,archiveFile);
 key.fill(0);return header;
}
export async function unpackBackup({archiveFile,keyFile,backupRoot}){
 const parsed=parseArchive(await readFile(archiveFile)),key=await keyAt(keyFile);
 if(digest(key).slice(0,16)!==parsed.header.keyId)throw new Error("This key does not match the backup");
 const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(parsed.header.iv,"base64"));decipher.setAAD(parsed.aad);decipher.setAuthTag(parsed.tag);
 const plaintext=Buffer.concat([decipher.update(parsed.ciphertext),decipher.final()]);key.fill(0);
 const payload=JSON.parse(gunzipSync(plaintext,{maxOutputLength:limit}).toString("utf8"));
 if(payload.format!=="cuboid-repo-payload-v1"||!Array.isArray(payload.files))throw new Error("Invalid backup payload");
 const files=[],seen=new Set();for(const file of payload.files){if(!validPath(file.path)||seen.has(file.path))throw new Error("Unsafe or duplicate backup path");seen.add(file.path);const bytes=Buffer.from(file.bytes,"base64");if(digest(bytes)!==file.sha256)throw new Error("Backup checksum failed");files.push({path:file.path,bytes});}
 if(!seen.has("cuboid.sqlite")||!seen.has("manifest.json"))throw new Error("Incomplete backup");
 const manifest=JSON.parse(files.find(f=>f.path==="manifest.json").bytes.toString("utf8"));if(manifest.format!=="cuboid-selfhost-full-v1")throw new Error("Unsupported full backup manifest");
 await mkdir(backupRoot,{recursive:true,mode:0o700});const folder=await mkdtemp(join(resolve(backupRoot),"github-restored-"));
 for(const file of files){const target=join(folder,...file.path.split("/"));await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,file.bytes,{flag:"wx",mode:0o600});}
 return folder;
}
async function main(){
 const command=process.argv[2],data=resolve(process.env.HUB_DATA_DIR||join(root,"data")),archiveFile=resolve(process.argv[3]||join(root,"../data/team-backup.cuboid.enc")),keyFile=resolve(process.argv[4]||join(root,".runtime/repo-backup-key.json"));
 if(command==="export"){
  // The key must remain outside the tracked snapshot directory, even with custom paths.
  const repositoryData=resolve(root,"../data");if(keyFile===repositoryData||keyFile.startsWith(repositoryData+sep))throw new Error("Keep the key outside the tracked data directory");
  const output=execFileSync(process.execPath,[join(root,"admin.mjs"),"backup"],{env:{...process.env,HUB_DATA_DIR:data},encoding:"utf8",windowsHide:true});
  const backupDir=output.trim().replace(/^Full backup saved: /,"");if(!resolve(backupDir).startsWith(join(data,"backups")+sep))throw new Error("Unexpected full backup directory");
  const info=await packBackup({backupDir,archiveFile,keyFile});await writeFile(archiveFile+".json",JSON.stringify({...info,sha256:digest(await readFile(archiveFile))},null,2)+"\n");
  // A custom export is just a backup; only the standard Git snapshot publishes a release.
  if(archiveFile===resolve(root,"../data/team-backup.cuboid.enc")){
   const {publishDataRelease}=await import("./repo-data-update.mjs");await publishDataRelease({root,dataDir:data,archiveFile,info});
  }
  console.log(JSON.stringify({archiveFile,keyFile,...info.summary,keyId:info.keyId},null,2));
 }else if(command==="inspect")console.log(JSON.stringify(await inspectBackup(archiveFile),null,2));
 else if(command==="unpack")console.log("Full backup unpacked: "+await unpackBackup({archiveFile,keyFile,backupRoot:join(data,"backups")}));
 else if(command==="restore-new"){
  const target=join(data,"cuboid.sqlite");try{await lstat(target);throw new Error("Database already exists; use unpack and the normal full restore process instead");}catch(e){if(e.code!=="ENOENT")throw e;}
  try{if((await readdir(join(data,"files"))).length)throw new Error("Uploaded files already exist; use the normal full restore process instead");}catch(e){if(e.code!=="ENOENT")throw e;}
  const folder=await unpackBackup({archiveFile,keyFile,backupRoot:join(data,"backups")});
  // COPYFILE_EXCL also protects against a server creating its database during unpack.
  await copyFile(join(folder,"cuboid.sqlite"),target,constants.COPYFILE_EXCL);
  try{for(const name of await readdir(join(folder,"files"))){await mkdir(join(data,"files"),{recursive:true,mode:0o700});await copyFile(join(folder,"files",name),join(data,"files",name),constants.COPYFILE_EXCL);}}catch(e){if(e.code!=="ENOENT")throw e;}
  console.log("Fresh data restored. Existing passwords were kept; active sessions were not restored.");
 }else throw new Error("Choose export, inspect, unpack or restore-new");
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(e=>{console.error(e.message);process.exitCode=1;});
