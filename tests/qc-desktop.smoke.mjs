// Native app regression: Datumaro + blank jobs, full-width strip and pointer range selection.
import {createRequire} from "node:module";
import {existsSync} from "node:fs";
import {mkdtemp,mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {readOfflineWorkbook} from "../lib/qc-offline-excel.ts";
process.chdir(fileURLToPath(new URL("..",import.meta.url)));
const require=createRequire(import.meta.url),{_electron:electron}=require(process.env.QC_PLAYWRIGHT_MODULE||"../qc-desktop/node_modules/playwright");
const root=resolve("qc-desktop");await mkdir(resolve(".sites-runtime"),{recursive:true});
const temp=await mkdtemp(resolve(".sites-runtime/qc-desktop-smoke-"));
const annotation=(id,track,position)=>({id,type:"cuboid_3d",label_id:0,attributes:{track_id:track,keyframe:true},position,rotation:[0,0,0],scale:[4,1.8,1.6]});
const datumaro={dm_format_version:"1.0",categories:{label:{labels:[{name:"vehicle"}]}},items:[{id:"frame_0",attr:{frame:0},annotations:[annotation(1,0,[0,0,0]),annotation(2,2,[10,0,0])]},{id:"frame_2",attr:{frame:2},annotations:[annotation(3,0,[0,0,0]),annotation(4,2,[200,0,0])]}]};
await mkdir(join(temp,"user"),{recursive:true});
const inputPath=join(temp,"datumaro.json"),outputPath=join(temp,"Job.qc-result.xlsx"),blankOutput=join(temp,"Blank-888.qc-result.xlsx");
await writeFile(inputPath,JSON.stringify(datumaro));
const env={...process.env,QC_USER_DATA:join(temp,"user"),QC_SMOKE:"1"};delete env.ELECTRON_RUN_AS_NODE;
const candidates=process.platform==="win32"?[join(root,"release/win-unpacked/Cuboid QC.exe")]:process.platform==="darwin"?[join(root,"release/mac-arm64/Cuboid QC.app/Contents/MacOS/Cuboid QC"),join(root,"release/mac/Cuboid QC.app/Contents/MacOS/Cuboid QC")]:[join(root,"release/linux-unpacked/cuboid-qc-offline"),join(root,"release/linux-unpacked/Cuboid QC")];
const packaged=process.env.QC_ELECTRON_EXECUTABLE||(process.env.QC_SMOKE_PACKAGED?candidates.find(p=>existsSync(p)):undefined);
if(process.env.QC_SMOKE_PACKAGED&&!packaged)throw new Error("Packaged QC executable not found");
let app,page;
async function waitBounds(predicate){
 for(let i=0;i<150;i++){const b=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());if(predicate(b))return b;await new Promise(r=>setTimeout(r,30));}
 throw new Error("QC bounds: "+JSON.stringify(await app.evaluate(({BrowserWindow,screen})=>({bounds:BrowserWindow.getAllWindows()[0].getBounds(),area:screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).workArea}))));
}
async function saveTo(path){await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},path);}
async function readEventually(path){
 for(let i=0;i<150;i++){try{return await readFile(path,"utf8");}catch(e){if(e.code!=="ENOENT")throw e;await new Promise(r=>setTimeout(r,30));}}
 throw new Error("Output file not written: "+path);
}
async function readResult(path){await readEventually(path);return readOfflineWorkbook(new Uint8Array(await readFile(path)));}
const stripBounds=(b,area)=>Math.abs(b.width-area.width)<=2&&Math.abs(b.height-72)<=1;
async function reloadSaved(){await page.waitForFunction(()=>!document.querySelector('.titlebar button')?.disabled&&document.querySelector('.feedback small')?.textContent.includes('Đã lưu'));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.reload();}
async function chooseMenu(label,contextTarget){
 await app.evaluate(({Menu},label)=>{
  globalThis.__qcMenuChoice=label;
  Menu.prototype.popup=function(options){
   const item=this.items.find(i=>i.label===globalThis.__qcMenuChoice);
   if(!item||!item.enabled)throw new Error("Missing/disabled QC menu action: "+globalThis.__qcMenuChoice);
   setTimeout(()=>{item.click();options.callback?.();},5);
  };
 },label);
 if(contextTarget)await contextTarget.click({button:"right"});
 else await page.getByRole("button",{name:"Tùy chọn QC",exact:true}).click();
}
async function dragFrames(start,end){
 const a=await page.locator('.compact button[data-frame="'+start+'"]').boundingBox(),b=await page.locator('.compact button[data-frame="'+end+'"]').boundingBox();
 assert.ok(a&&b);await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();
}
try{
 app=await electron.launch({executablePath:packaged||createRequire(join(root,"package.json"))("electron"),args:packaged?[]:[root],env,timeout:60000});
 page=await app.firstWindow();const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",dialog=>dialog.accept().catch(()=>{}));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
 await page.getByRole("heading",{name:"QC offline",exact:true}).waitFor();
 const initial=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());assert.ok(initial.width<=800&&initial.height<=350);
 await page.screenshot({path:join(temp,"initial.png")});
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},inputPath);
 await page.getByRole("button",{name:"Mở Datumaro",exact:true}).click();
 await page.getByRole("heading",{name:"Đang QC · ID 1",exact:true}).waitFor({timeout:60000});
 assert.equal(await page.getByLabel("Giải thích lỗi",{exact:true}).count(),0);
 assert.match(await page.locator(".matrix button.warning").first().getAttribute("title"),/Cảnh báo tool D.*Frame 2: .+/);
 await page.getByRole("button",{name:"Chọn toàn bộ ID 1",exact:true}).click();
 await page.getByRole("button",{name:"Ghi log",exact:true}).click();
 assert.equal(await page.getByLabel("Từ frame",{exact:true}).inputValue(),"0");assert.equal(await page.getByLabel("Đến frame",{exact:true}).inputValue(),"2");
 await page.getByLabel("Giải thích lỗi",{exact:true}).fill("Hộp lệch trái ở frame 0–2");
 await page.getByLabel("Giải thích lỗi",{exact:true}).press("Enter");
 await page.waitForFunction(async()=>{const w=await window.qcDesktop.load();return w.cursor===0&&w.checks[0].logs.length===1&&!w.checks[0].doneAt;});
 assert.equal(await page.getByLabel("Giải thích lỗi",{exact:true}).count(),0);
 // A single frame opens the editor; Enter appends a second log on the same ID.
 await page.getByRole("button",{name:"ID 1 frame 0",exact:true}).click();
 await page.getByLabel("Giải thích lỗi",{exact:true}).waitFor();assert.equal(await page.getByLabel("Từ frame",{exact:true}).inputValue(),"0");assert.equal(await page.getByLabel("Đến frame",{exact:true}).inputValue(),"0");
 await page.getByLabel("Giải thích lỗi",{exact:true}).fill("Lỗi thứ hai ở frame 0");await page.getByLabel("Giải thích lỗi",{exact:true}).press("Enter");
 await page.waitForFunction(async()=>{const w=await window.qcDesktop.load();return w.cursor===0&&w.checks[0].logs.length===2&&!w.checks[0].doneAt;});
 await page.getByRole("button",{name:"Done ID →",exact:true}).click();
 await page.getByRole("heading",{name:"Đang QC · ID 3",exact:true}).waitFor();
 assert.equal(await page.getByLabel("Giải thích lỗi",{exact:true}).count(),0);
 await page.getByRole("button",{name:"Done ID →",exact:true}).click();
 await page.waitForFunction(async()=>{const w=await window.qcDesktop.load();return w.checks.every(c=>c.doneAt);});
 const toolPath=join(temp,"Tool-QC.xlsx");await saveTo(toolPath);
 await page.getByRole("button",{name:"Excel Tool_QC",exact:true}).click();
 assert.equal((await readEventually(toolPath)).slice(0,2),"PK");
 await page.getByRole("button",{name:"Thanh nổi",exact:true}).click();
 await page.locator(".compact").waitFor();
 const area=await app.evaluate(({BrowserWindow,screen})=>screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()).workArea);
 await waitBounds(b=>stripBounds(b,area));
 assert.equal(await page.locator(".titlebar,.feedback,.log-form").count(),0);assert.equal(await page.locator(".matrix tbody tr").count(),1);
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),true);
 await chooseMenu("Ghim lên trên màn hình");await waitBounds(b=>b.y===area.y&&stripBounds(b,area));
 await chooseMenu("Ghim xuống dưới màn hình");await waitBounds(b=>Math.abs(b.y+b.height-area.y-area.height)<=2&&stripBounds(b,area));
 await page.screenshot({path:join(temp,"floating.png")});
 await chooseMenu("Ghi log vùng chọn");
 await page.getByLabel("Giải thích lỗi",{exact:true}).waitFor();await waitBounds(b=>b.height>72);
 await page.getByRole("button",{name:"Hủy",exact:true}).click();await waitBounds(b=>stripBounds(b,area));
 await chooseMenu("Mở bảng đầy đủ");await page.locator("main").waitFor();
 await reloadSaved();await page.getByRole("heading",{name:"Đang QC · ID 3",exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.qcDesktop.load())).checks.filter(c=>c.doneAt).length,2);
 await saveTo(outputPath);await page.getByRole("button",{name:"Xuất Excel ↓"}).click();
 const exported=await readResult(outputPath);assert.equal(exported.checks[0].logs.length,2);assert.equal(exported.checks[0].logs[0].frameEnd,2);assert.equal(exported.checks[1].logs.length,0);assert.equal("ticket" in exported,false);assert.ok(exported.marks.length);

 // Create a job with no file dialog or Datumaro, then inspect frame ranges beyond page 60.
 await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>{throw new Error("Switching jobs must not prompt to save a draft");};});
 await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>{throw new Error("Blank jobs must not open a file dialog");};});
 await page.getByRole("button",{name:"Bảng trắng mới",exact:true}).click();
 await page.getByLabel("Job ID",{exact:true}).fill("888");await page.getByLabel("Số frame",{exact:true}).fill("90");await page.getByLabel("Số ID",{exact:true}).fill("2");
 await page.getByRole("button",{name:"Tạo bảng QC",exact:true}).click();
 await page.getByRole("heading",{name:"Đang QC · ID 1",exact:true}).waitFor();
 assert.equal(await page.getByRole("button",{name:"Excel Tool_QC",exact:true}).count(),0);
 await page.getByRole("button",{name:"Thanh nổi",exact:true}).click();await waitBounds(b=>stripBounds(b,area));
 assert.equal(await page.locator(".compact .matrix thead th").count(),92);assert.equal(await page.locator(".log-form").count(),0);
 const doneButton=page.getByRole("button",{name:"Done ID →",exact:true}),doneBounds=await doneButton.boundingBox(),strip=await page.locator(".compact").boundingBox();
 const previousButton=page.getByRole("button",{name:"← ID trước",exact:true}),previousBounds=await previousButton.boundingBox();
 assert.ok(previousBounds.y+previousBounds.height<=doneBounds.y+2&&Math.abs(previousBounds.x-doneBounds.x)<=2,"Previous ID must sit above Done");assert.ok(await previousButton.isDisabled());
 assert.ok(Math.abs(doneBounds.x+doneBounds.width-strip.x-strip.width)<=2,"Done ID must stay at the right edge");
 // Done from the strip advances to the next unchecked ID without adding a log.
 await doneButton.click();await page.getByRole("button",{name:"Chọn toàn bộ ID 2",exact:true}).waitFor();
 let state=await page.evaluate(()=>window.qcDesktop.load());assert.ok(state.checks[0].doneAt);assert.equal(state.checks[0].logs.length,0);assert.equal(state.cursor,1);
 await previousButton.click();await page.getByRole("button",{name:"Chọn toàn bộ ID 1",exact:true}).waitFor();
 await page.getByRole("button",{name:"Chọn toàn bộ ID 1",exact:true}).click();assert.equal(await page.locator(".compact button.selected").count(),90);
 // Mouse wheel over the strip (including its fixed button) scrolls frames both ways.
 await doneButton.hover();await page.mouse.wheel(0,420);
 await page.waitForFunction(()=>document.querySelector('.matrix-scroll').scrollLeft>0);
 await page.mouse.wheel(0,-420);await page.waitForFunction(()=>document.querySelector('.matrix-scroll').scrollLeft===0);
 await dragFrames(2,8);assert.equal(await page.locator(".compact button.selected").count(),7);
 // Releasing a dragged range opens the editor directly, without a context menu.
 await page.getByLabel("Giải thích lỗi",{exact:true}).waitFor();assert.equal(await page.getByLabel("Từ frame",{exact:true}).inputValue(),"2");assert.equal(await page.getByLabel("Đến frame",{exact:true}).inputValue(),"8");
 await page.getByLabel("Giải thích lỗi",{exact:true}).fill("Log từ bảng trắng · frame 2–8");await page.getByLabel("Hướng giải quyết",{exact:true}).fill("Chỉnh lại hộp");
 await page.screenshot({path:join(temp,"floating-editor.png")});
 await page.getByLabel("Giải thích lỗi",{exact:true}).press("Enter");
 await waitBounds(b=>stripBounds(b,area));await page.getByRole("button",{name:"Chọn toàn bộ ID 1",exact:true}).waitFor();
 await page.waitForFunction(async()=>{const w=await window.qcDesktop.load();return w.cursor===0&&w.checks[0].logs.length===1&&!w.checks[0].doneAt;});
 assert.equal(await page.locator(".log-form").count(),0);
 await page.getByRole("button",{name:"ID 1 frame 10",exact:true}).click();await page.getByLabel("Giải thích lỗi",{exact:true}).waitFor();
 assert.equal(await page.getByLabel("Từ frame",{exact:true}).inputValue(),"10");assert.equal(await page.getByLabel("Đến frame",{exact:true}).inputValue(),"10");
 await page.getByLabel("Giải thích lỗi",{exact:true}).fill("Log thứ hai của ID 1");await page.getByLabel("Giải thích lỗi",{exact:true}).press("Enter");
 await waitBounds(b=>stripBounds(b,area));await page.waitForFunction(async()=>{const w=await window.qcDesktop.load();return w.cursor===0&&w.checks[0].logs.length===2&&!w.checks[0].doneAt;});
 await page.screenshot({path:join(temp,"floating-multi-log.png")});
 // Empty Enter must not mark an ID done or advance it.
 await page.getByRole("button",{name:"ID 1 frame 12",exact:true}).click();await page.getByLabel("Giải thích lỗi",{exact:true}).press("Enter");
 await page.getByRole("alert").waitFor();state=await page.evaluate(()=>window.qcDesktop.load());assert.equal(state.cursor,0);assert.equal(state.checks[0].doneAt,"");assert.equal(state.checks[0].logs.length,2);
 await page.getByRole("button",{name:"Hủy",exact:true}).click();await waitBounds(b=>stripBounds(b,area));
 await doneButton.click();await page.getByRole("button",{name:"Chọn toàn bộ ID 2",exact:true}).waitFor();
 await page.getByRole("button",{name:"ID 2 frame 1",exact:true}).click();await page.getByLabel("Giải thích lỗi",{exact:true}).waitFor();
 await previousButton.click();await page.getByRole("button",{name:"Chọn toàn bộ ID 1",exact:true}).waitFor();await waitBounds(b=>stripBounds(b,area));
 state=await page.evaluate(()=>window.qcDesktop.load());assert.equal(state.checks[0].logs.length,2);
 await doneButton.click();await page.getByRole("button",{name:"Chọn toàn bộ ID 2",exact:true}).waitFor();
 await dragFrames(8,2);assert.equal(await page.locator(".compact button.selected").count(),7);
 await page.getByLabel("Giải thích lỗi",{exact:true}).waitFor();assert.equal(await page.getByLabel("Từ frame",{exact:true}).inputValue(),"2");assert.equal(await page.getByLabel("Đến frame",{exact:true}).inputValue(),"8");
 await page.getByRole("button",{name:"Hủy",exact:true}).click();await waitBounds(b=>stripBounds(b,area));
 await page.locator('.compact button[data-frame="10"]').click({modifiers:["Shift"]});assert.equal(await page.locator(".compact button.selected").count(),9);
 await page.getByRole("button",{name:"Hủy",exact:true}).click();await waitBounds(b=>stripBounds(b,area));
 // Hold the pointer at the viewport edge: drag selection must continue while it scrolls.
 await page.evaluate(()=>{window.__qcPointerTrace=[];for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,e=>window.__qcPointerTrace.push({type,x:e.clientX,y:e.clientY,buttons:e.buttons,frame:e.target.dataset?.frame}),true);});
 const start=await page.locator('.compact button[data-frame="2"]').boundingBox(),viewport=await page.locator(".matrix-scroll").boundingBox();
 await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();await page.mouse.move(viewport.x+viewport.width-5,start.y+start.height/2,{steps:12});
 await page.waitForFunction(()=>{const cells=[...document.querySelectorAll(".compact button.selected")];return cells.some(c=>Number(c.dataset.frame)>=65);},{},{timeout:10000});
 await page.mouse.up();assert.ok(await page.locator(".matrix-scroll").evaluate(e=>e.scrollLeft)>0);
 await page.getByLabel("Giải thích lỗi",{exact:true}).waitFor();await page.getByRole("button",{name:"Hủy",exact:true}).click();await waitBounds(b=>stripBounds(b,area));
 const scrolledDone=await doneButton.boundingBox();assert.ok(Math.abs(scrolledDone.x-doneBounds.x)<=2,"Done ID must not scroll with frames");
 await page.getByRole("button",{name:"Chọn toàn bộ ID 2",exact:true}).click();assert.equal(await page.locator(".compact button.selected").count(),90);
 await doneButton.click();await page.waitForFunction(async()=>{const w=await window.qcDesktop.load();return w.checks.every(c=>c.doneAt);});
 assert.ok(await page.getByRole("button",{name:"Đã xong ✓",exact:true}).isDisabled());
 await page.screenshot({path:join(temp,"blank-floating.png")});
 await saveTo(blankOutput);await chooseMenu("Xuất Excel kết quả");
 const blankResult=await readResult(blankOutput);assert.equal(blankResult.source.kind,"blank");assert.equal(blankResult.source.jobId,"888");assert.equal(blankResult.source.frames.length,90);assert.equal("sha256" in blankResult.source,false);assert.equal(blankResult.checks.length,2);
 assert.deepEqual([blankResult.checks[0].logs[0].frameStart,blankResult.checks[0].logs[0].frameEnd],[2,8]);assert.equal(blankResult.checks[0].logs[0].solution,"Chỉnh lại hộp");assert.equal(blankResult.checks[0].logs.length,2);assert.equal(blankResult.checks[0].logs[1].frameStart,10);assert.equal(blankResult.checks[1].logs.length,0);
 await chooseMenu("Mở bảng đầy đủ");await reloadSaved();await page.getByRole("heading",{name:"Đang QC · ID 2",exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.qcDesktop.load())).source.kind,"blank");
 // Canceling an export keeps the current job; finishing exports and opens the small start screen.
 await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});
 await page.getByRole("button",{name:"Hoàn tất & mở bài khác",exact:true}).click();
 await page.getByRole("button",{name:"Hoàn tất & mở bài khác",exact:true}).waitFor({state:"visible"});
 assert.equal((await page.evaluate(()=>window.qcDesktop.load())).source.jobId,"888");
 await saveTo(blankOutput);await page.getByRole("button",{name:"Hoàn tất & mở bài khác",exact:true}).click();
 await page.getByRole("heading",{name:"QC offline",exact:true}).waitFor();await waitBounds(b=>b.width<=800&&b.height<=350);
 await page.getByRole("button",{name:"Bài gần đây",exact:true}).click();
 await page.getByRole("button",{name:/Job 888 · Bảng trắng/}).click();await page.getByRole("heading",{name:"Đang QC · ID 2",exact:true}).waitFor();
 const reopened=await page.evaluate(()=>window.qcDesktop.load());assert.equal(reopened.checks[0].logs[0].description,blankResult.checks[0].logs[0].description);
 // An unfinished job may be switched away from without falsely completing any ID.
 await page.getByRole("button",{name:"Bảng trắng mới",exact:true}).click();await page.getByLabel("Job ID",{exact:true}).fill("999");
 await page.getByLabel("Số frame",{exact:true}).fill("30");await page.getByLabel("Số ID",{exact:true}).fill("2");
 await page.getByRole("button",{name:"Tạo bảng QC",exact:true}).click();await page.getByRole("heading",{name:"Đang QC · ID 1",exact:true}).waitFor();
 await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>{throw new Error("Opening another job must only autosave");};});
 await page.getByRole("button",{name:"Mở bài khác",exact:true}).click();await page.getByRole("heading",{name:"QC offline",exact:true}).waitFor();
 await page.getByRole("button",{name:"Bài gần đây",exact:true}).click();await page.getByRole("button",{name:/Job 999 · Bảng trắng/}).click();
 await page.getByRole("heading",{name:"Đang QC · ID 1",exact:true}).waitFor();
 const unfinished=await page.evaluate(()=>window.qcDesktop.load());assert.ok(unfinished.checks.every(c=>!c.doneAt));assert.equal(unfinished.source.jobId,"999");
 assert.equal(errors.length,0,errors.join("\n"));
 console.log("PASS: click/drag opens logs; Enter saves multiple logs on the same ID without marking Done; explicit Done advances; Previous above Done; wheel/edge scrolling; Datumaro/blank Excel; finish/switch/recovery.");console.log("Artifacts: "+temp);
}catch(e){
 if(app){const pages=app.windows();if(pages[0]){console.log(await pages[0].locator("body").innerText());console.log(await pages[0].evaluate(()=>({trace:window.__qcPointerTrace,scroll:{left:document.querySelector('.matrix-scroll')?.scrollLeft,width:document.querySelector('.matrix-scroll')?.clientWidth,total:document.querySelector('.matrix-scroll')?.scrollWidth},bounds:document.querySelector('.matrix-scroll')?.getBoundingClientRect().toJSON()})));await pages[0].screenshot({path:join(temp,"failed.png")}).catch(()=>{});}}
 throw e;
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
