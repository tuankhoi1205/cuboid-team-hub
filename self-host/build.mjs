import { build } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root=fileURLToPath(new URL(".",import.meta.url));
const output=process.env.HUB_BUILD_DIR?resolve(process.env.HUB_BUILD_DIR):resolve(root,"dist");
await build({configFile:resolve(root,"vite.config.ts"),build:{outDir:resolve(output,"client")}});
await build({configFile:false,root,ssr:{noExternal:["zod"]},build:{ssr:resolve(root,"server.ts"),outDir:resolve(output,"server"),emptyOutDir:true,target:"node24",minify:false,rollupOptions:{output:{entryFileNames:"server.mjs"}}}});
console.log("Bản tự host đã được build: "+output);
