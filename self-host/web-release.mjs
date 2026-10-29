import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, readdir, mkdir, cp, rename, lstat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const format = "cuboid-web-release-v1";
const manifestFile = "build-manifest.json";
async function filesIn(root, prefix = "") {
  const files = [];
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const name = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error("Build must not contain symbolic links: " + name);
    if (entry.isDirectory()) files.push(...await filesIn(root, name));
    else if (entry.isFile()) files.push(name);
  }
  return files;
}
export async function sourceFingerprint(root) {
  const repository = resolve(root, ".."), names = [];
  for (const folder of ["app", "lib", "drizzle", "public"]) for (const name of await filesIn(join(repository, folder))) names.push(folder + "/" + name);
  for (const name of await readdir(root)) if (/\.(?:mjs|ts|tsx|html|css)$/.test(name)) names.push("self-host/" + name);
  names.push("package.json", "package-lock.json");
  const descriptions = [];
  for (const path of names.sort()) descriptions.push({ path, sha256: hash(await readFile(join(repository, path))) });
  return hash(JSON.stringify(descriptions));
}
export async function writeBuildManifest({ root, output }) {
  const files = [];
  for (const path of (await filesIn(output)).filter(name => name !== manifestFile)) {
    const bytes = await readFile(join(output, path)); files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  const manifest = { format, buildId: hash(JSON.stringify(files)), createdAt: new Date().toISOString(), sourceSha256: await sourceFingerprint(root), files };
  await writeFile(join(output, manifestFile), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}
export async function inspectWebRelease(directory) {
  const manifest = JSON.parse(await readFile(join(directory, manifestFile), "utf8"));
  if (manifest.format !== format || !Array.isArray(manifest.files) || manifest.buildId !== hash(JSON.stringify(manifest.files))) throw new Error("Invalid web release manifest.");
  const seen = new Set();
  for (const file of manifest.files) {
    if (!/^(?:client|server)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(file.path) || file.path.split("/").some(part => part === "." || part === "..") || seen.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error("Unsafe or duplicate web release path.");
    seen.add(file.path);
    const target = join(directory, file.path), info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Release must contain ordinary files: " + file.path);
    const bytes = await readFile(target);
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error("Web release checksum mismatch: " + file.path);
  }
  if (!["client/index.html", "server/server.mjs"].every(name => seen.has(name))) throw new Error("Web release is incomplete.");
  return manifest;
}
export async function installWebRelease({ root, releaseDir = join(root, "web-release"), output = join(root, "dist") }) {
  root = resolve(root); output = resolve(output);
  if (output !== join(root, "dist")) throw new Error("Web installation must target this Hub's dist directory.");
  const manifest = await inspectWebRelease(releaseDir);
  try {
    const current = await inspectWebRelease(output);
    if (current.buildId === manifest.buildId) return { status: "already-installed", buildId: manifest.buildId };
  } catch (error) { if (!/ENOENT|manifest|checksum|incomplete/.test(error.message)) throw error; }
  const runtime = join(root, ".runtime"); await mkdir(runtime, { recursive: true });
  const runtimeInfo = await lstat(runtime); if (!runtimeInfo.isDirectory() || runtimeInfo.isSymbolicLink()) throw new Error("Runtime must be an ordinary directory.");
  const stage = join(runtime, "web-install-" + randomUUID());
  await mkdir(stage, { recursive: true });
  for (const file of manifest.files) {
    const target = join(stage, file.path); await mkdir(dirname(target), { recursive: true }); await cp(join(releaseDir, file.path), target, { errorOnExist: true, force: false });
  }
  await writeFile(join(stage, manifestFile), JSON.stringify(manifest, null, 2) + "\n");
  await inspectWebRelease(stage);
  // Data and secrets never enter this directory. Preserve the old build for rollback.
  const previous = join(root, ".runtime", "web-before-update-" + randomUUID());
  let moved = false;
  try {
    try { await rename(output, previous); moved = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(stage, output);
  } catch (error) { if (moved) await rename(previous, output); throw error; }
  return { status: "installed", buildId: manifest.buildId, ...(moved ? { previousBuild: previous } : {}) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = fileURLToPath(new URL(".", import.meta.url));
  try {
    if (process.argv[2] === "package") {
      const built = join(root, "dist"); const manifest = await inspectWebRelease(built);
      if (manifest.sourceSha256 !== await sourceFingerprint(root)) throw new Error("Source changed after build. Run npm run build:host first.");
      const release = join(root, "web-release"), previous = join(root, ".runtime", "previous-published-web-" + randomUUID());
      await mkdir(dirname(previous), { recursive: true });
      try { await rename(release, previous); } catch (error) { if (error.code !== "ENOENT") throw error; }
      await cp(built, release, { recursive: true, errorOnExist: true, force: false }); await inspectWebRelease(release);
      console.log("Published portable web build: " + manifest.buildId);
    } else console.log(JSON.stringify(await installWebRelease({ root }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
