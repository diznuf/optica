import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { db } from "@/lib/db";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "utf8");

function ensurePathInside(baseDir: string, candidatePath: string) {
  const relative = path.relative(baseDir, candidatePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Le fichier de backup doit etre dans le dossier backups local");
  }
}

export function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (!url.startsWith("file:")) {
    throw new Error("Backup supporte seulement SQLite file:*");
  }

  const raw = url.replace("file:", "");
  return path.resolve(process.cwd(), "prisma", raw.replace(/^\.\//, ""));
}

export function resolveBackupDir() {
  return path.resolve(process.cwd(), env.BACKUP_DIR);
}

async function checksumSha256(filePath: string) {
  const hash = crypto.createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve());
  });

  return hash.digest("hex");
}

async function runSqliteIntegrityCheck(filePath: string) {
  const sqliteModule = await import("node:sqlite");
  const sqlite = new sqliteModule.DatabaseSync(filePath);

  try {
    const rows = sqlite.prepare("PRAGMA integrity_check").all() as Array<Record<string, unknown>>;
    if (!rows.length) {
      throw new Error("Integrity check SQLite vide");
    }
    const messages = rows.map((row) => String(Object.values(row)[0] ?? ""));
    if (!(messages.length === 1 && messages[0].toLowerCase() === "ok")) {
      throw new Error(`Integrity check SQLite en echec: ${messages.slice(0, 3).join(" | ")}`);
    }
  } finally {
    sqlite.close();
  }
}

export async function validateBackupFile(
  filePath: string,
  options?: {
    mustBeInsideBackupDir?: boolean;
    expectedSizeBytes?: number;
    expectedChecksumSha256?: string | null;
  }
) {
  const absolutePath = path.resolve(filePath);
  const backupDir = resolveBackupDir();

  if (options?.mustBeInsideBackupDir ?? true) {
    ensurePathInside(backupDir, absolutePath);
  }

  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error("Le chemin de backup n'est pas un fichier");
  }
  if (stat.size < SQLITE_HEADER.length) {
    throw new Error("Fichier backup trop petit");
  }
  if (path.extname(absolutePath).toLowerCase() !== ".db") {
    throw new Error("Extension backup invalide (attendu .db)");
  }

  const handle = await fs.open(absolutePath, "r");
  let header: Buffer;
  try {
    header = Buffer.alloc(SQLITE_HEADER.length);
    await handle.read(header, 0, SQLITE_HEADER.length, 0);
  } finally {
    await handle.close();
  }

  if (!header.equals(SQLITE_HEADER)) {
    throw new Error("Le fichier n'est pas un SQLite valide");
  }

  await runSqliteIntegrityCheck(absolutePath);
  const checksum = await checksumSha256(absolutePath);

  if (options?.expectedSizeBytes !== undefined && stat.size !== options.expectedSizeBytes) {
    throw new Error("Taille backup differente de l'enregistrement");
  }

  if (options?.expectedChecksumSha256 && checksum !== options.expectedChecksumSha256) {
    throw new Error("Checksum backup invalide");
  }

  return {
    absolutePath,
    sizeBytes: stat.size,
    checksumSha256: checksum,
    integrity: "ok" as const
  };
}

export async function createBackup(): Promise<{ filePath: string; sizeBytes: number; checksumSha256: string }> {
  const dbPath = resolveDbPath();
  const backupDir = resolveBackupDir();
  await fs.mkdir(backupDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(backupDir, `optica-backup-${ts}.db`);

  await fs.copyFile(dbPath, target);
  const verified = await validateBackupFile(target, { mustBeInsideBackupDir: true });

  return { filePath: verified.absolutePath, sizeBytes: verified.sizeBytes, checksumSha256: verified.checksumSha256 };
}

export async function pruneBackups(retentionDays: number) {
  const backupDir = resolveBackupDir();
  await fs.mkdir(backupDir, { recursive: true });

  const files = await fs.readdir(backupDir);
  const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  for (const file of files) {
    const fullPath = path.join(backupDir, file);
    const stat = await fs.stat(fullPath);
    if (stat.mtimeMs < threshold) {
      await fs.unlink(fullPath);
    }
  }
}

export async function runBackupAndRecord() {
  try {
    const { filePath, sizeBytes, checksumSha256 } = await createBackup();
    await pruneBackups(env.BACKUP_RETENTION_DAYS);
    const record = await db.backupRecord.create({
      data: {
        filePath,
        sizeBytes,
        checksumSha256,
        status: "SUCCESS"
      }
    });
    return { success: true, filePath, sizeBytes, checksumSha256, recordId: record.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur backup";
    await db.backupRecord.create({
      data: {
        filePath: "",
        sizeBytes: 0,
        checksumSha256: null,
        status: "FAILED",
        error: message
      }
    });
    return { success: false, error: message };
  }
}

export async function restoreBackup(
  filePath: string,
  options?: {
    expectedSizeBytes?: number;
    expectedChecksumSha256?: string | null;
    dryRun?: boolean;
  }
) {
  const validation = await validateBackupFile(filePath, {
    mustBeInsideBackupDir: true,
    expectedSizeBytes: options?.expectedSizeBytes,
    expectedChecksumSha256: options?.expectedChecksumSha256
  });

  if (options?.dryRun) {
    return {
      restored: false,
      validation
    };
  }

  const dbPath = resolveDbPath();
  const backupDir = resolveBackupDir();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyCopyPath = path.join(backupDir, `optica-pre-restore-${ts}.db`);

  await db.$disconnect();
  try {
    await fs.copyFile(dbPath, safetyCopyPath);
    await fs.copyFile(validation.absolutePath, dbPath);
    await validateBackupFile(dbPath, {
      mustBeInsideBackupDir: false
    });
  } catch (error) {
    try {
      await fs.copyFile(safetyCopyPath, dbPath);
    } catch {
      // keep original error
    }
    throw error;
  } finally {
    await db.$connect();
  }

  return {
    restored: true,
    restoredFrom: validation.absolutePath,
    safetyCopyPath,
    validation
  };
}
