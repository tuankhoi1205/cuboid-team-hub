import {build} from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
const root=fileURLToPath(new URL(".",import.meta.url));
await build({configFile:false,root,base:"./",plugins:[react()],publicDir:false,build:{outDir:"dist/renderer",target:"es2022",emptyOutDir:true}});
await build({configFile:false,root,build:{ssr:resolve(root,"main.ts"),outDir:"dist/main",target:"node22",emptyOutDir:true,minify:false,rollupOptions:{external:["electron"],output:{format:"cjs",entryFileNames:"main.cjs"}}},ssr:{noExternal:["zod","fflate"]}});
