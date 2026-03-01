import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");

function resolveDbPath() {
  const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!dbUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL doit etre de type file:*");
  }
  const raw = dbUrl.replace("file:", "");
  return path.resolve(process.cwd(), "prisma", raw.replace(/^\.\//, ""));
}

async function checksumSha256(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function validateSqliteBackup(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size < SQLITE_HEADER.length) {
    throw new Error("Backup invalide: taille ou type fichier");
  }

  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length);
    await handle.read(header, 0, SQLITE_HEADER.length, 0);
    if (!header.equals(SQLITE_HEADER)) {
      throw new Error("Backup invalide: signature SQLite");
    }
  } finally {
    await handle.close();
  }

  const sqlite = new DatabaseSync(filePath);
  try {
    const rows = sqlite.prepare("PRAGMA integrity_check").all();
    const first = rows?.[0] ? String(Object.values(rows[0])[0]) : "";
    if (!(rows.length === 1 && first.toLowerCase() === "ok")) {
      throw new Error(`Backup invalide: integrity_check ${first || "KO"}`);
    }
  } finally {
    sqlite.close();
  }

  return {
    sizeBytes: stat.size,
    checksumSha256: await checksumSha256(filePath)
  };
}

async function run() {
  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR ?? "./backups");
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
  await fs.mkdir(backupDir, { recursive: true });

  const dbPath = resolveDbPath();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `optica-backup-${stamp}.db`);
  await fs.copyFile(dbPath, target);

  const verified = await validateSqliteBackup(target);

  const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = await fs.readdir(backupDir);
  for (const file of files) {
    const fullPath = path.join(backupDir, file);
    const stat = await fs.stat(fullPath);
    if (stat.mtimeMs < threshold) {
      await fs.unlink(fullPath);
    }
  }

  console.log(`Backup cree: ${target}`);
  console.log(`Taille: ${verified.sizeBytes} bytes`);
  console.log(`SHA256: ${verified.checksumSha256}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
