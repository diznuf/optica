import { isSameDay } from "date-fns";
import { db } from "@/lib/db";
import { runBackupAndRecord } from "@/lib/services/backup";

const state = globalThis as unknown as { backupSchedulerStarted?: boolean };

async function runDailyBackupIfNeeded() {
  const last = await db.backupRecord.findFirst({
    where: { status: "SUCCESS" },
    orderBy: { createdAt: "desc" }
  });

  if (last && isSameDay(last.createdAt, new Date())) {
    return;
  }

  await runBackupAndRecord();
}

export function initBackupScheduler() {
  if (state.backupSchedulerStarted) {
    return;
  }

  state.backupSchedulerStarted = true;
  void runDailyBackupIfNeeded();
  setInterval(() => {
    void runDailyBackupIfNeeded();
  }, 60 * 60 * 1000);
}