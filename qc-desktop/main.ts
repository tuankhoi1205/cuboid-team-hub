import {app,BrowserWindow,ipcMain,dialog,screen,protocol,net,session,Menu} from "electron";
import {readFile,writeFile,mkdir,rename,copyFile,stat,mkdtemp,rm} from "node:fs/promises";
import {existsSync} from "node:fs";
import {join,resolve,basename,extname,sep} from "node:path";
import {pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {offlineResultSchema} from "../lib/qc-offline";
import {offlineWorkbook} from "../lib/qc-offline-excel";
import {parseWorkspace} from "./workspace";
const exec=promisify(execFile),MAX=15*1024*1024;
let win:BrowserWindow,fullBounds:Electron.Rectangle|undefined,saveChain=Promise.resolve(),running=false;
let compactMode=false,compactEditor=false,compactBaseY=0;
protocol.registerSchemesAsPrivileged([{scheme:"cuboid",privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
app.setName("Cuboid QC");
// XWayland provides global window placement for the movable QC strip on Ubuntu.
if(process.platform==="linux"&&process.env.DISPLAY)app.commandLine.appendSwitch("ozone-platform","x11");
if(process.env.QC_USER_DATA)app.setPath("userData",resolve(process.env.QC_USER_DATA));
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();
app.on("second-instance",()=>{if(win){if(win.isMinimized())win.restore();if(!process.env.QC_SMOKE)win.show();win.focus();}});
async function readJson(path:string,limit=MAX){if((await stat(path)).size>limit)throw new Error("File vượt giới hạn cho phép");return JSON.parse((await readFile(path,"utf8")).replace(/^\uFEFF/,""));}
const dataFile=()=>join(app.getPath("userData"),"workspace.json");
const jobsFolder=()=>join(app.getPath("userData"),"jobs");
async function recentJobs(){try{const value=await readJson(join(jobsFolder(),"index.json"),1024*1024);if(!Array.isArray(value))throw new Error("Danh sách bài đã lưu không hợp lệ");return value;}catch(e:any){if(e.code==="ENOENT")return[];throw e;}}
function trusted(e:Electron.IpcMainInvokeEvent){const url=e.senderFrame&&new URL(e.senderFrame.url);if(e.sender!==win.webContents||e.senderFrame!==win.webContents.mainFrame||url?.protocol!=="cuboid:"||url?.host!=="app")throw new Error("Yêu cầu không hợp lệ");}
function handle(name:string,fn:(...args:any[])=>unknown){ipcMain.handle(name,async(e,...args)=>{trusted(e);return fn(...args);});}
async function save(value:unknown){
 const state=parseWorkspace(value),serialized=JSON.stringify(state);if(Buffer.byteLength(serialized)>20*1024*1024)throw new Error("Nháp vượt 20 MB");
 const next=saveChain.catch(()=>{}).then(async()=>{
  await mkdir(app.getPath("userData"),{recursive:true});const path=dataFile();await writeFile(path+".tmp",serialized,{mode:0o600});if(existsSync(path))await copyFile(path,path+".bak");await rename(path+".tmp",path);
  if(state.source){
   await mkdir(jobsFolder(),{recursive:true});const source=state.source,key=createHash("sha256").update(JSON.stringify([source.kind||"datumaro",source.kind==="blank"?source.jobId:source.sha256,source.trackOffset,state.startedAt])).digest("hex"),file=join(jobsFolder(),key+".json");
   await writeFile(file+".tmp",serialized,{mode:0o600});await rename(file+".tmp",file);
   const jobs=await recentJobs(),info={key,title:source.kind==="blank"?"Job "+source.jobId+" · Bảng trắng":source.name,done:state.checks.filter(c=>c.doneAt).length,total:state.checks.length,updatedAt:new Date().toISOString()},index=join(jobsFolder(),"index.json");
   await writeFile(index+".tmp",JSON.stringify([info,...jobs.filter((j:any)=>j.key!==key)].slice(0,50)),{mode:0o600});await rename(index+".tmp",index);
  }
 });saveChain=next;await next;
}
async function saveDialog(name:string,content:string|Uint8Array){const r=await dialog.showSaveDialog(win,{defaultPath:name,filters:[{name:"QC file",extensions:[extname(name).slice(1)]}]});if(r.canceled||!r.filePath)return null;await writeFile(r.filePath,content);return r.filePath;}
if(locked)app.whenReady().then(async()=>{
 const renderer=join(app.getAppPath(),"dist/renderer");
 protocol.handle("cuboid",request=>{const u=new URL(request.url);const path=resolve(renderer,"."+decodeURIComponent(u.pathname));if(u.host!=="app"||!path.startsWith(renderer+sep))return new Response("Forbidden",{status:403});return net.fetch(pathToFileURL(path).href);});
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 session.defaultSession.setPermissionCheckHandler(()=>false);
 session.defaultSession.webRequest.onBeforeRequest({urls:["http://*/*","https://*/*","ws://*/*","wss://*/*"]},(_details,cb)=>cb({cancel:true}));
 win=new BrowserWindow({width:760,height:310,minWidth:760,minHeight:215,frame:false,show:false,backgroundColor:"#f4f6fa",webPreferences:{preload:join(app.getAppPath(),"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:"deny"}));win.webContents.on("will-navigate",e=>e.preventDefault());
 handle("qc:load",async()=>{await saveChain;let corrupt=false;for(const suffix of ["",".bak"]){try{return parseWorkspace(await readJson(dataFile()+suffix,20*1024*1024));}catch(e:any){if(e.code!=="ENOENT")corrupt=true;}}if(corrupt)throw new Error("Nháp và bản dự phòng không đọc được. Dữ liệu gốc vẫn ở thư mục app; hãy nhập bản nháp đã xuất.");return null;});
 handle("qc:save",save);
 handle("qc:history",async()=>{await saveChain.catch(()=>{});return recentJobs();});
 handle("qc:history-open",async(key)=>{if(typeof key!=="string"||!/^[a-f0-9]{64}$/.test(key))throw new Error("Mã bài không hợp lệ");await saveChain.catch(()=>{});return parseWorkspace(await readJson(join(jobsFolder(),key+".json"),20*1024*1024));});
 handle("qc:import-draft",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Nháp QC",extensions:["json"]}]});return r.canceled?null:parseWorkspace(await readJson(r.filePaths[0],20*1024*1024));});
 handle("qc:export-draft",async(value)=>saveDialog("Cuboid.qc-draft.json",JSON.stringify(parseWorkspace(value))));
 handle("qc:datumaro",async(offset)=>{
  if(offset!==0&&offset!==1)throw new Error("Offset ID chỉ là 0 hoặc 1");if(running)throw new Error("Đang xử lý file khác");
  const chosen=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"Datumaro 3D",extensions:["zip","json"]}]});if(chosen.canceled)return null;
  running=true;let temp="";
  try{
   const path=chosen.filePaths[0];if((await stat(path)).size>100*1024*1024)throw new Error("File vượt 100 MB");
   await mkdir(join(app.getPath("userData"),"tool"),{recursive:true});temp=await mkdtemp(join(app.getPath("userData"),"tool/run-"));
   // Copy once so fingerprint and parser always use the exact same source bytes.
   const input=join(temp,"input"+extname(path));await copyFile(path,input);const hash=createHash("sha256").update(await readFile(input)).digest("hex");
   const resultPath=join(temp,"result.json"),excel=join(temp,"Tool-QC.xlsx");
   const worker=app.isPackaged?join(process.resourcesPath,"qc-worker",process.platform==="win32"?"qc-worker.exe":"qc-worker"):join(app.getAppPath(),"worker/qc-worker",process.platform==="win32"?"qc-worker.exe":"qc-worker");
   const runtime=join(app.isPackaged?process.resourcesPath:app.getAppPath(),app.isPackaged?"qc-worker":"worker/qc-worker"),bundledPython=join(runtime,"python.exe");
   const python=existsSync(bundledPython)?bundledPython:process.env.QC_PYTHON;
   const command=python|| (existsSync(worker)?worker:undefined);
   if(!command)throw new Error("Chưa có bộ kiểm tra. Chạy build worker trước khi đóng gói.");
   const args=python?["-I","-B",existsSync(bundledPython)?join(runtime,"tool/web_runner.py"):join(app.getAppPath(),"../self-host/tool-qc/web_runner.py")]:[];
   try{await exec(command,[...args,input,resultPath,excel,String(offset)],{windowsHide:true,timeout:240000,maxBuffer:1024*1024});}catch(e:any){throw new Error(String(e.stderr||e.message).slice(-2000));}
   const tool=await readJson(resultPath,32*1024*1024);await copyFile(excel,join(app.getPath("userData"),`Tool-QC-${hash}-${offset}.xlsx`));
   return{source:{name:basename(path),sha256:hash,trackOffset:offset,frames:tool.matrix.frames},tool};
  }finally{running=false;if(temp)await rm(temp,{recursive:true,force:true});}
 });
 handle("qc:export-tool",async(hash,offset)=>{if(typeof hash!=="string"||!/^[a-f0-9]{64}$/.test(hash)||(offset!==0&&offset!==1))throw new Error("Mã file không hợp lệ");const path=join(app.getPath("userData"),`Tool-QC-${hash}-${offset}.xlsx`);if(!existsSync(path))throw new Error("Nháp chuyển từ máy khác chưa có Excel Tool_QC. Mở lại Datumaro để tạo báo cáo.");const r=await dialog.showSaveDialog(win,{defaultPath:"Tool-QC.xlsx"});if(r.canceled||!r.filePath)return null;await copyFile(path,r.filePath);return r.filePath;});
 handle("qc:export",async(value)=>{const result=offlineResultSchema.parse(value);if(Buffer.byteLength(JSON.stringify(result))>MAX-4096)throw new Error("Kết quả vượt 15 MB; cần chia nhỏ bài QC để tải kết quả lên web.");const name=basename(result.source.name).replace(/\.(json|zip)$/i,"").replace(/[<>:"/\\|?*\x00-\x1f]/g,"_");return saveDialog(name+".qc-result.xlsx",offlineWorkbook(result));});
 handle("qc:menu",async(options)=>{
  if(typeof options?.previous!=="boolean"||typeof options.next!=="boolean"||typeof options.export!=="boolean"||typeof options.progress!=="string"||options.progress.length>120)throw new Error("Tùy chọn QC không hợp lệ");
  return new Promise<string|null>(resolve=>{
   let settled=false;const finish=(value:string|null)=>{if(!settled){settled=true;resolve(value);}};
   const item=(label:string,value:string,enabled=true):Electron.MenuItemConstructorOptions=>({label,enabled,click:()=>finish(value)});
   const menu=Menu.buildFromTemplate([
    {label:options.progress,enabled:false},{type:"separator"},
    item("Ghi log vùng chọn","log"),item("Done · ID tiếp theo","done"),{type:"separator"},
    item("ID trước","previous",options.previous),item("ID tiếp","next",options.next),
    item("Mở bảng đầy đủ","expand"),item("Ghim lên trên màn hình","top"),item("Ghim xuống dưới màn hình","bottom"),{type:"separator"},
    item("Xuất Excel kết quả","export",options.export),item("Hoàn tất & mở bài khác","finish",options.export),
    item("Mở bài khác","new"),item("Bài gần đây","recent"),item("Đóng app","close")
   ]);menu.popup({window:win,callback:()=>finish(null)});
  });
 });
 handle("qc:window",async(options)=>{
  if(typeof options?.compact!=="boolean"||options.editor!==undefined&&typeof options.editor!=="boolean"||options.home!==undefined&&typeof options.home!=="boolean"||options.dock&&!['top','bottom'].includes(options.dock))throw new Error("Chế độ cửa sổ không hợp lệ");
  if(options.compact){
   const bounds=win.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
   if(!compactMode){fullBounds=bounds;compactBaseY=area.y+area.height-72;if(win.isMaximized())win.unmaximize();}
   else if(!compactEditor)compactBaseY=bounds.y;
   if(options.dock)compactBaseY=options.dock==="top"?area.y:area.y+area.height-72;
   compactBaseY=Math.max(area.y,Math.min(compactBaseY,area.y+area.height-72));
   const height=options.editor?196:72;
   win.setMinimumSize(Math.min(area.width,300),70);win.setResizable(false);
   const target={x:area.x,y:Math.min(compactBaseY,area.y+area.height-height),width:area.width,height};
   win.setBounds(target);
   // Windows rounds physical pixels at fractional display scaling.
   for(let i=0;i<3;i++){const actual=win.getBounds(),dw=actual.width-target.width,dh=actual.height-target.height;if(Math.abs(dw)<=1&&Math.abs(dh)<=1)break;win.setBounds({...target,width:target.width-dw,height:target.height-dh});}
   win.setAlwaysOnTop(true,"floating");compactMode=true;compactEditor=!!options.editor;
  }else{
   win.setAlwaysOnTop(false);win.setResizable(true);win.setMinimumSize(760,options.home?310:400);
   if(options.home)fullBounds=undefined;
   win.setBounds(options.home?{width:760,height:310}:fullBounds||{x:60,y:60,width:1000,height:590});compactMode=false;compactEditor=false;
  }
 });
 handle("qc:close",async()=>{await saveChain;win.close();});
 win.on("close",e=>{if(running){e.preventDefault();void dialog.showMessageBox(win,{message:"Đang kiểm tra Datumaro. Chờ hoàn tất trước khi đóng app.",type:"info"});}});
 await win.loadURL("cuboid://app/index.html");if(!process.env.QC_SMOKE)win.show();
});
app.on("window-all-closed",()=>app.quit());
