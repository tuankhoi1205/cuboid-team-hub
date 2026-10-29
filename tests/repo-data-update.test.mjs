import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rename, access, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { packBackup } from "../self-host/repo-backup.mjs";
import { applyPublishedData, publishDataRelease } from "../self-host/repo-data-update.mjs";

const firstFile = "11111111-1111-4111-8111-111111111111";
const oldFile = "22222222-2222-4222-8222-222222222222";
const format = "cuboid-repo-data-release-v1";
const quiet = () => {};
function makeDb(file, label) {
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE members(id TEXT); CREATE TABLE records(kind TEXT, value TEXT); CREATE TABLE auth_sessions(id TEXT); CREATE TABLE auth_tokens(id TEXT); CREATE TABLE auth_credentials(password_hash TEXT)");
  db.prepare("INSERT INTO members VALUES(?)").run(label);
  db.prepare("INSERT INTO records VALUES('daily',?)").run(label);
  db.prepare("INSERT INTO auth_credentials VALUES(?)").run(label + "-password-hash");
  db.close();
}
function value(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare("SELECT value FROM records WHERE kind='daily'").get().value; }
  finally { db.close(); }
}
async function fixture({ existing = true, publish = true } = {}) {
  await mkdir(resolve(".sites-runtime"), { recursive: true });
  const workspace = await mkdtemp(resolve(".sites-runtime/repo-data-update-test-"));
  const root = join(workspace, "self-host"), dataDir = join(workspace, "host-data"), source = join(workspace, "source");
  const archiveFile = join(workspace, "data/team-backup.cuboid.enc"), keyFile = join(root, ".runtime/repo-backup-key.json");
  await Promise.all([mkdir(root, { recursive: true }), mkdir(dataDir), mkdir(source), mkdir(join(workspace, "data"))]);
  makeDb(join(source, "cuboid.sqlite"), "new");
  await writeFile(join(source, "manifest.json"), JSON.stringify({ format: "cuboid-selfhost-full-v1" }));
  await mkdir(join(source, "files")); await writeFile(join(source, "files", firstFile), "new-file");
  const info = await packBackup({ backupDir: source, archiveFile, keyFile });
  const release = publish ? await publishDataRelease({ root, dataDir: source, archiveFile, info }) : null;
  if (existing) {
    makeDb(join(dataDir, "cuboid.sqlite"), "old");
    await mkdir(join(dataDir, "files")); await writeFile(join(dataDir, "files", oldFile), "old-file");
    const db = new DatabaseSync(join(dataDir, "cuboid.sqlite")); db.exec("INSERT INTO auth_sessions VALUES('old-session')"); db.close();
  }
  // Reserve an unused loopback port, rather than probing the real production Hub.
  const server = createServer(); await new Promise(done => server.listen(0, "127.0.0.1", done));
  const port = server.address().port; await new Promise(done => server.close(done));
  const options = { root, dataDir, port, log: quiet };
  return { workspace, root, dataDir, source, archiveFile, keyFile, info, release, options, database: join(dataDir, "cuboid.sqlite"), apply: () => applyPublishedData(options) };
}

test("an existing host gets the published DB, passwords and files; original data is recoverable", async () => {
  const f = await fixture(); const result = await f.apply();
  assert.equal(result.status, "applied"); assert.equal(value(f.database), "new");
  assert.equal(value(join(result.previousBackup, "cuboid.sqlite")), "old");
  assert.equal(await readFile(join(result.previousBackup, "files", oldFile), "utf8"), "old-file");
  assert.equal(await readFile(join(f.dataDir, "files", firstFile), "utf8"), "new-file");
  assert.deepEqual(await readdir(join(f.dataDir, "files")), [firstFile]);
  const db = new DatabaseSync(f.database, { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT password_hash FROM auth_credentials").get().password_hash, "new-password-hash");
    assert.equal(db.prepare("SELECT count(*) n FROM auth_sessions").get().n, 0);
  } finally { db.close(); }
});

test("restarting the same release preserves reports entered after the update", async () => {
  const f = await fixture(); await f.apply();
  const db = new DatabaseSync(f.database); db.exec("UPDATE records SET value='entered-after-pull'"); db.close();
  assert.equal((await f.apply()).status, "already-applied"); assert.equal(value(f.database), "entered-after-pull");
});

test("a fresh host is initialized without setup or creating an empty DB first", async () => {
  const f = await fixture({ existing: false }); assert.equal((await f.apply()).status, "applied"); assert.equal(value(f.database), "new");
});

test("a code-only checkout without a data release leaves an existing host unchanged", async () => {
  const f = await fixture({ publish: false }); assert.equal((await f.apply()).status, "no-release"); assert.equal(value(f.database), "old");
});

test("the publishing machine does not restore its own snapshot over newer edits", async () => {
  const f = await fixture();
  const db = new DatabaseSync(join(f.source, "cuboid.sqlite")); db.exec("UPDATE records SET value='publisher-newer'"); db.close();
  assert.equal((await applyPublishedData({ ...f.options, dataDir: f.source })).status, "already-applied");
  assert.equal(value(join(f.source, "cuboid.sqlite")), "publisher-newer");
});

test("a new published data revision applies once and backs up the previous host state", async () => {
  const f = await fixture(); await f.apply();
  const db = new DatabaseSync(join(f.source, "cuboid.sqlite")); db.exec("UPDATE records SET value='second-release'"); db.close();
  const info = await packBackup({ backupDir: f.source, archiveFile: f.archiveFile, keyFile: f.keyFile });
  await publishDataRelease({ root: f.root, dataDir: f.source, archiveFile: f.archiveFile, info });
  const result = await f.apply(); assert.equal(result.status, "applied"); assert.equal(value(f.database), "second-release");
  assert.equal(value(join(result.previousBackup, "cuboid.sqlite")), "new");
  assert.equal((await f.apply()).status, "already-applied");
});

test("missing key and corrupt archive both fail before changing the current DB/files", async () => {
  for (const failure of ["key", "archive"]) {
    const f = await fixture();
    if (failure === "key") await rename(f.keyFile, f.keyFile + ".missing");
    else await writeFile(f.archiveFile, "damaged archive");
    await assert.rejects(f.apply()); assert.equal(value(f.database), "old");
    assert.equal(await readFile(join(f.dataDir, "files", oldFile), "utf8"), "old-file");
    await assert.rejects(access(join(f.dataDir, ".repo-data-update-pending.json")));
  }
});

test("a running listener prevents a pending overwrite", async () => {
  const f = await fixture(); const server = createServer(socket => socket.end());
  await new Promise(done => server.listen(f.options.port, "127.0.0.1", done));
  try { await assert.rejects(f.apply(), /Stop the running Hub/); assert.equal(value(f.database), "old"); }
  finally { await new Promise(done => server.close(done)); }
});

test("an open SQLite WAL prevents replacing a DB even on a different HTTP port", async () => {
  const f = await fixture(); const db = new DatabaseSync(f.database); db.exec("PRAGMA journal_mode=WAL; INSERT INTO records VALUES('note','still-open')");
  try { await assert.rejects(f.apply(), /open WAL/); assert.equal(value(f.database), "old"); }
  finally { db.close(); }
});

test("an interrupted swap recovers original DB and files before retrying", async () => {
  const f = await fixture(); const backupFolder = "before-repo-update-" + randomUUID(), previous = join(f.dataDir, "backups", backupFolder);
  await mkdir(previous, { recursive: true });
  await rename(f.database, join(previous, "cuboid.sqlite")); await rename(join(f.dataDir, "files"), join(previous, "files"));
  makeDb(f.database, "partially-installed");
  await writeFile(join(f.dataDir, ".repo-data-update-pending.json"), JSON.stringify({ format, sha256: f.release.sha256, backupFolder, hadDatabase: true, hadFiles: true }));
  // No key makes the retry fail after recovery, so the recovered originals can be examined.
  await rename(f.keyFile, f.keyFile + ".missing"); await assert.rejects(f.apply());
  assert.equal(value(f.database), "old"); assert.equal(await readFile(join(f.dataDir, "files", oldFile), "utf8"), "old-file");
});

test("a completed swap interrupted before journal cleanup keeps the committed new data", async () => {
  const f = await fixture(); const result = await f.apply();
  await writeFile(join(f.dataDir, ".repo-data-update-pending.json"), JSON.stringify({ format, sha256: f.release.sha256, backupFolder: result.previousBackup.split(/[\\/]/).at(-1), hadDatabase: true, hadFiles: true }));
  assert.equal((await f.apply()).status, "already-applied"); assert.equal(value(f.database), "new");
});

test("a live update lock is respected and an older release cannot silently roll back data", async () => {
  const f = await fixture(); await writeFile(join(f.dataDir, ".repo-data-update.lock"), JSON.stringify({ pid: process.pid }));
  await assert.rejects(f.apply(), /Another repository data update/); assert.equal(value(f.database), "old");
  await rename(join(f.dataDir, ".repo-data-update.lock"), join(f.dataDir, "test-lock"));
  await writeFile(join(f.dataDir, "repo-data-release.json"), JSON.stringify({ createdAt: "2099-01-01T00:00:00Z", sha256: "a".repeat(64) }));
  assert.equal((await f.apply()).status, "older-release-skipped"); assert.equal(value(f.database), "old");
});
