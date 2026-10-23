import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({root:fileURLToPath(new URL(".",import.meta.url)),plugins:[react()],publicDir:fileURLToPath(new URL("../public",import.meta.url)),build:{outDir:"dist/client",emptyOutDir:true,target:"es2022"}});
