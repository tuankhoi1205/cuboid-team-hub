import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {resolve,join} from "node:path";
const root=fileURLToPath(new URL(".",import.meta.url));
const python=process.env.QC_PYTHON||(process.platform==="win32"?"python":"python3");
if(process.platform==="win32"){
 const bundled=spawnSync(python,[join(root,"bundle_windows_runtime.py")],{stdio:"inherit",env:process.env});
 if(bundled.error)throw bundled.error;process.exit(bundled.status??1);
}
const excluded=["tkinter","numpy","pandas","matplotlib","PIL","lxml","IPython","PyQt6","PySide6"];
const r=spawnSync(python,["-m","PyInstaller","--noconfirm","--clean","--onedir","--name","qc-worker","--distpath",join(root,"worker"),"--workpath",join(root,".build/worker"),"--specpath",join(root,".build"),"--paths",resolve(root,"../self-host/tool-qc"),"--hidden-import","openpyxl",...excluded.flatMap(m=>["--exclude-module",m]),resolve(root,"../self-host/tool-qc/web_runner.py")],{stdio:"inherit",env:{...process.env,PYINSTALLER_CONFIG_DIR:join(root,".build/pyinstaller-cache")}});
if(r.error)throw r.error;
process.exit(r.status??1);
