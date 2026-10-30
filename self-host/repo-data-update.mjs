import { createHash, randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { DatabaseSync } from "node:sqlite";
import {
  existsSync, lstatSync, mkdirSync, openSync, closeSync, writeFileSync,
  readFileSync, renameSync, unlinkSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspectBackup, unpackBackup } from "./repo-backup.mjs";
import { unpackPlainBackup } from "../scripts/plain-backup.mjs";

const format = "cuboid-repo-data-release-v1";
const receiptName = "repo-data-release.json";
const journalName = ".repo-data-update-pending.json";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const readJson = file => JSON.parse(readFileSync(file, "utf8"));

function ordinary(file, directory = false) {
  const info = lstatSync(file);
  if (info.isSymbolicLink() || !(directory ? info.isDirectory() : info.isFile())) {
    throw new Error("Repository data update requires ordinary local files/directories: " + basename(file));
  }
}
function writeJson(file, value) {
  const temporary = file + "." + randomUUID() + ".tmp";
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  renameSync(temporary, file);
}
function readReceipt(dataDir) {
  try { return readJson(join(dataDir, receiptName)); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function takeLock(dataDir) {
  const file = join(dataDir, ".repo-data-update.lock");
  if (existsSync(file)) {
    ordinary(file);
    const owner = readJson(file);
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error("Invalid repository data update lock.");
    try {
      process.kill(owner.pid, 0);
      throw new Error("Another repository data update is running.");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    unlinkSync(file);
  }
  const fd = openSync(file, "wx", 0o600);
  try { writeFileSync(fd, JSON.stringify({ pid: process.pid })); }
  finally { closeSync(fd); }
  return () => unlinkSync(file);
}
async function portIsOpen(port) {
  return new Promise(done => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let finished = false;
    const finish = value => { if (finished) return; finished = true; socket.destroy(); done(value); };
    socket.once("connect", () => finish(true));
    socket.once("error", error => {
      if (error.code === "ECONNREFUSED") finish(false);
      else { socket.destroy(); if (!finished) { finished = true; done(true); } }
    });
    socket.setTimeout(1500, () => finish(true));
  });
}
function checkedDatabase(file, summary) {
  ordinary(file);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (Object.values(db.prepare("PRAGMA integrity_check").get())[0] !== "ok") throw new Error("Snapshot SQLite integrity check failed.");
    const actual = {
      members: db.prepare("SELECT count(*) n FROM members").get().n,
      records: db.prepare("SELECT count(*) n FROM records").get().n,
      dailyReports: db.prepare("SELECT count(*) n FROM records WHERE kind='daily'").get().n,
    };
    for (const key of Object.keys(actual)) if (actual[key] !== summary[key]) throw new Error("Snapshot summary mismatch: " + key);
    if (db.prepare("SELECT count(*) n FROM auth_sessions").get().n || db.prepare("SELECT count(*) n FROM auth_tokens").get().n) throw new Error("Snapshot must not contain active sessions or reset tokens.");
  } finally { db.close(); }
}
function checkpoint(file) {
  if (!existsSync(file)) return;
  ordinary(file);
  const db = new DatabaseSync(file, { timeout: 5000 });
  try {
    const result = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    if (result.busy) throw new Error("Existing database is busy; stop the Hub before updating.");
  } finally { db.close(); }
  if (existsSync(file + "-wal") || existsSync(file + "-shm")) throw new Error("Existing database still has an open WAL; stop all Hub processes before updating.");
}
function recover(dataDir) {
  const journalFile = join(dataDir, journalName);
  if (!existsSync(journalFile)) return;
  ordinary(journalFile);
  const journal = readJson(journalFile);
  if (journal.format !== format || !/^before-repo-update-[a-f0-9-]{36}$/.test(journal.backupFolder) || !/^[a-f0-9]{64}$/.test(journal.sha256) || typeof journal.hadDatabase !== "boolean" || typeof journal.hadFiles !== "boolean") throw new Error("Invalid repository data recovery journal.");
  const previous = join(dataDir, "backups", journal.backupFolder);
  ordinary(previous, true);
  if (readReceipt(dataDir)?.transactionId !== journal.backupFolder) {
    for (const [name, had] of [["cuboid.sqlite", journal.hadDatabase], ["files", journal.hadFiles]]) {
      const original = join(previous, name), current = join(dataDir, name);
      if (existsSync(original) || !had) {
        if (existsSync(current)) renameSync(current, join(previous, "unapplied-" + name));
        if (had) renameSync(original, current);
      }
    }
  }
  unlinkSync(journalFile);
}

// Export is the only publishing step. Code-only pushes keep the same data revision.
export async function publishDataRelease({ root, dataDir, archiveFile, info }) {
  root = resolve(root); dataDir = resolve(dataDir);
  const release = {
    format, policy: "replace-on-next-start", sha256: sha256(await readFile(archiveFile)),
    createdAt: info.createdAt, keyId: info.keyId, summary: info.summary,
  };
  writeJson(join(root, "../data/team-data-release.json"), release);
  // Do not roll the publishing machine back to its own snapshot on restart.
  writeJson(join(dataDir, receiptName), { ...release, appliedAt: new Date().toISOString(), source: "export" });
  return release;
}

export async function applyPublishedData({ root, dataDir, port = 3210, log = console.log }) {
  root = resolve(root); dataDir = resolve(dataDir);
  const releaseFile = resolve(root, "../data/team-data-release.json");
  if (!existsSync(releaseFile)) return { status: "no-release" };
  ordinary(releaseFile);
  const release = readJson(releaseFile);
  if (release.format !== format || release.policy !== "replace-on-next-start" || !/^[a-f0-9]{64}$/.test(release.sha256) || !Number.isFinite(Date.parse(release.createdAt))) throw new Error("Invalid repository data release.");
  mkdirSync(dataDir, { recursive: true, mode: 0o700 }); ordinary(dataDir, true);
  const unlock = takeLock(dataDir);
  try {
    const database = join(dataDir, "cuboid.sqlite");
    if (existsSync(join(dataDir, journalName))) {
      if (await portIsOpen(port)) throw new Error("Stop the running Hub before recovering a data update.");
      recover(dataDir);
    }
    const receipt = readReceipt(dataDir);
    if (receipt?.sha256 === release.sha256 && existsSync(database)) return { status: "already-applied", sha256: release.sha256 };
    if (await portIsOpen(port)) throw new Error("Stop the running Hub before applying the repository data release.");
    const backupRoot = join(dataDir, "backups");
    mkdirSync(backupRoot, { recursive: true, mode: 0o700 }); ordinary(backupRoot, true);
    let incoming;
    if(release.storage==="plain")incoming=await unpackPlainBackup({directory:resolve(root,"../data/plain"),release,backupRoot});
    else{
      const archiveFile=resolve(root,"../data/team-backup.cuboid.enc"),keyFile=join(root,".runtime/repo-backup-key.json");
      ordinary(archiveFile);ordinary(keyFile);
      if(sha256(await readFile(archiveFile))!==release.sha256)throw new Error("Repository data archive checksum does not match its release.");
      const header=await inspectBackup(archiveFile);
      if(header.keyId!==release.keyId||header.createdAt!==release.createdAt||JSON.stringify(header.summary)!==JSON.stringify(release.summary))throw new Error("Repository data release does not match the encrypted snapshot.");
      incoming=await unpackBackup({archiveFile,keyFile,backupRoot});
    }
    checkedDatabase(join(incoming, "cuboid.sqlite"), release.summary);
    const incomingFiles = join(incoming, "files");
    mkdirSync(incomingFiles, { recursive: true, mode: 0o700 });
    checkpoint(database);
    const currentFiles = join(dataDir, "files");
    if (existsSync(currentFiles)) ordinary(currentFiles, true);
    const backupFolder = "before-repo-update-" + randomUUID(), previous = join(dataDir, "backups", backupFolder);
    mkdirSync(previous, { mode: 0o700 });
    writeJson(join(previous, "manifest.json"), { format: "cuboid-selfhost-full-v1", createdAt: new Date().toISOString(), includes: ["Previous SQLite database", "Uploaded files"], excluded: [], reason: "Before applying published repository data", releaseSha256: release.sha256 });
    const journal = { format, sha256: release.sha256, backupFolder, hadDatabase: existsSync(database), hadFiles: existsSync(currentFiles) };
    writeJson(join(dataDir, journalName), journal);
    try {
      if (journal.hadDatabase) renameSync(database, join(previous, "cuboid.sqlite"));
      if (journal.hadFiles) renameSync(currentFiles, join(previous, "files"));
      renameSync(incomingFiles, currentFiles);
      renameSync(join(incoming, "cuboid.sqlite"), database);
      writeJson(join(dataDir, receiptName), { ...release, appliedAt: new Date().toISOString(), source: "repository", transactionId: backupFolder, previousBackup: previous });
      unlinkSync(join(dataDir, journalName));
    } catch (error) {
      recover(dataDir);
      throw error;
    }
    log("Repository data applied once. Previous database/files saved: " + previous);
    return { status: "applied", sha256: release.sha256, previousBackup: previous };
  } finally { unlock(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = fileURLToPath(new URL(".", import.meta.url));
  applyPublishedData({ root, dataDir: process.env.HUB_DATA_DIR || join(root, "data"), port: Number(process.env.HUB_PORT || 3210) })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
