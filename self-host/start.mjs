import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { installWebRelease } from "./web-release.mjs";

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Cuboid Team Hub requires Node.js 24 or newer.");
const root = fileURLToPath(new URL(".", import.meta.url));
if (process.env.HUB_USE_LOCAL_BUILD !== "1") {
  const result = await installWebRelease({ root });
  console.log("Web build: " + result.buildId + " (" + result.status + ")");
}
process.env.HUB_ROOT = root;
process.env.HUB_DATA_DIR ||= join(root, "data");
process.env.HUB_PUBLIC_DIR ||= join(root, "dist/client");
process.env.HUB_NO_LISTEN = "0";
await import(pathToFileURL(join(root, "dist/server/server.mjs")).href);
