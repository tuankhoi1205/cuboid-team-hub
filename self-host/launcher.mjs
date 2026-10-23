import { spawn, execFileSync } from "node:child_process";
import { openSync, closeSync, existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL(".",import.meta.url)),runtime=join(root,".runtime"),data=join(root,"data"),stateFile=join(runtime,"run.json");
mkdirSync(runtime,{recursive:true,mode:0o700});mkdirSync(data,{recursive:true,mode:0o700});
const args=new Set(process.argv.slice(3)),command=process.argv[2]||"start",port=Number(process.env.HUB_PORT||3210),local=`http://127.0.0.1:${port}`,entry=join(root,"dist/server/server.mjs");
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function readState(){try{return JSON.parse(readFileSync(stateFile,"utf8"));}catch{return {};}}
function save(s){writeFileSync(stateFile,JSON.stringify(s,null,2),{mode:0o600});}
function processInfo(pid) {
 if(!Number.isSafeInteger(pid)||pid<=0)return null;
 if(process.platform==="win32") {
  try{const text=execFileSync("powershell.exe",["-NoProfile","-Command",`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}';if($p){$p | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress}`],{encoding:"utf8",windowsHide:true,timeout:10000});return text.trim()?JSON.parse(text):null;}catch{return null;}
 }
 try{return {CommandLine:execFileSync("ps",["-p",String(pid),"-o","args="],{encoding:"utf8"}).trim()};}catch{return null;}
}
function belongs(pid,kind,s) {const p=processInfo(pid);if(!p?.CommandLine)return false;return kind==="app"?p.CommandLine.includes(entry):p.CommandLine.includes(local)&&p.CommandLine.includes("tunnel")&&(!p.ExecutablePath||resolve(p.ExecutablePath).toLowerCase()===resolve(s.cloudflared).toLowerCase());}
function launch(binary,argv,name,env=process.env) {
 const out=openSync(join(runtime,name+".out.log"),"w",0o600),err=openSync(join(runtime,name+".err.log"),"w",0o600);
 try{const p=spawn(binary,argv,{cwd:root,env,windowsHide:true,detached:true,stdio:["ignore",out,err]});p.on("error",e=>console.error(name+": "+e.message));p.unref();return p.pid;}finally{closeSync(out);closeSync(err);}
}
async function health(){try{const r=await fetch(local+"/api/health",{signal:AbortSignal.timeout(2000)});return r.ok&&(await r.json()).service==="cuboid-self-host";}catch{return false;}}
function openBrowser() {if(process.platform==="win32")execFileSync("powershell.exe",["-NoProfile","-Command",`Start-Process -FilePath '${local}/'`],{windowsHide:true});}
if(command==="stop") {
 const s=readState();for(const kind of ["tunnel","app"]){const pid=s[kind+"Pid"];if(!pid)continue;const info=processInfo(pid);if(!info)continue;if(!belongs(pid,kind,s))throw new Error(`PID ${pid} no longer belongs to this Hub; it was not stopped.`);try{process.kill(pid);}catch(e){if(e.code!=="ESRCH")throw e;}}
 for(const file of [stateFile,join(data,"public-url.txt")])if(existsSync(file))unlinkSync(file);
 console.log("Hub and its tunnel stopped. Database and uploaded files were kept.");
} else if(command==="start"||command==="restart-app") {
 if(!existsSync(entry))throw new Error("Build missing. Run node self-host/build.mjs from the project root.");
 let s=readState();
 if(command==="restart-app"&&s.appPid) {
  if(!belongs(s.appPid,"app",s))throw new Error("The recorded process does not belong to this Hub; it was not stopped.");
  process.kill(s.appPid);
  for(let n=0;n<40;n++){if(!(await health()))break;await pause(250);}
  s.appPid=null;save(s);
 }
 if(!belongs(s.appPid,"app",s)||!(await health())) {
  if(await health())throw new Error("Port is already used by another Hub. No existing process was stopped.");
  const node=existsSync(join(runtime,"node.exe"))?join(runtime,"node.exe"):process.execPath;
  const pid=launch(node,[entry],"app",{...process.env,HUB_ROOT:root,HUB_DATA_DIR:data,HUB_PORT:String(port),HUB_NO_LISTEN:"0"});
  s={...s,appPid:pid,port,startedAt:new Date().toISOString(),appEntry:entry};save(s);
  let ready=false;for(let n=0;n<40;n++){await pause(500);if(await health()){ready=true;break;}}
  if(!ready)throw new Error("App did not become ready. Check .runtime/app.err.log.");
 }
 console.log("Local app: "+local);
 if(!args.has("--no-tunnel")) {
  if(!belongs(s.tunnelPid,"tunnel",s)) {
   let cloud=join(runtime,"cloudflared.exe");if(!existsSync(cloud))cloud=process.platform==="win32"?"cloudflared.exe":"cloudflared";
   s.tunnelPid=launch(cloud,["tunnel","--url",local,"--no-autoupdate","--protocol","http2","--loglevel","info"],"tunnel");s.cloudflared=cloud;save(s);
  }
  let publicUrl="";for(let n=0;n<100;n++){for(const name of ["tunnel.out.log","tunnel.err.log"]){try{publicUrl=readFileSync(join(runtime,name),"utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]||publicUrl;}catch{}}
   if(publicUrl)break;await pause(500);}
  if(publicUrl){writeFileSync(join(data,"public-url.txt"),publicUrl,{mode:0o600});console.log("Internet app: "+publicUrl);console.log("The free URL changes when the tunnel restarts.");}
  else console.log("Local app is running, but the tunnel is not ready. Check .runtime/tunnel.err.log.");
 }
 if(!args.has("--no-browser"))openBrowser();
} else throw new Error("Choose start, restart-app or stop.");
