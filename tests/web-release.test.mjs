import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, readFile, cp, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { writeBuildManifest, inspectWebRelease, installWebRelease } from "../self-host/web-release.mjs";

async function fixture() {
  await mkdir(resolve(".sites-runtime"), { recursive: true });
  const workspace = await mkdtemp(resolve(".sites-runtime/web-release-test-")), root = join(workspace, "self-host"), output = join(root, "web-release");
  for (const name of ["app", "lib", "drizzle", "public", "self-host/web-release/client/assets", "self-host/web-release/server", "self-host/data"]) await mkdir(join(workspace, name), { recursive: true });
  await writeFile(join(workspace, "app/ui.tsx"), "new UI");
  await writeFile(join(workspace, "package.json"), "{}"); await writeFile(join(workspace, "package-lock.json"), "{}");
  await writeFile(join(output, "client/index.html"), '<script src="/assets/app.js"></script>');
  await writeFile(join(output, "client/assets/app.js"), 'console.log("new-ui")');
  await writeFile(join(output, "server/server.mjs"), 'console.log("new-server")');
  await writeFile(join(root, "data/keep-db.sqlite"), "private DB sentinel");
  const manifest = await writeBuildManifest({ root, output });
  return { root, output, manifest };
}
test("the tracked portable release installs UI and server together and preserves data", async () => {
  const f = await fixture(); const result = await installWebRelease({ root: f.root });
  assert.equal(result.status, "installed"); assert.equal(result.buildId, f.manifest.buildId);
  assert.equal((await inspectWebRelease(join(f.root, "dist"))).buildId, f.manifest.buildId);
  assert.match(await readFile(join(f.root, "dist/client/assets/app.js"), "utf8"), /new-ui/);
  assert.equal(await readFile(join(f.root, "data/keep-db.sqlite"), "utf8"), "private DB sentinel");
  assert.equal((await installWebRelease({ root: f.root })).status, "already-installed");
});
test("corrupt or missing release assets fail without replacing the current UI", async () => {
  const f = await fixture(); await installWebRelease({ root: f.root });
  await writeFile(join(f.output, "client/assets/app.js"), "corrupted");
  await assert.rejects(installWebRelease({ root: f.root }), /checksum/);
  assert.match(await readFile(join(f.root, "dist/client/assets/app.js"), "utf8"), /new-ui/);
});
test("replacing a different build preserves the old complete build", async () => {
  const f = await fixture(); await installWebRelease({ root: f.root });
  await writeFile(join(f.output, "client/assets/app.js"), "newer UI"); await writeBuildManifest({ root: f.root, output: f.output });
  const result = await installWebRelease({ root: f.root }); assert.equal(result.status, "installed");
  assert.match(await readFile(join(result.previousBuild, "client/assets/app.js"), "utf8"), /new-ui/);
  assert.equal(await readFile(join(f.root, "dist/client/assets/app.js"), "utf8"), "newer UI");
});
test("unlisted required assets and traversal entries are rejected before install", async () => {
  const f = await fixture(); const file = join(f.output, "build-manifest.json");
  const malformed = { ...f.manifest, files: [{ path: "../data/keep-db.sqlite", sha256: "a".repeat(64), bytes: 1 }] };
  await writeFile(file, JSON.stringify(malformed)); await assert.rejects(installWebRelease({ root: f.root }), /manifest|path/);
  await assert.rejects(access(join(f.root, "dist")));
});
