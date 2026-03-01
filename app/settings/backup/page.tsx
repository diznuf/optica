import { AppShell } from "@/components/app-shell";
import { BackupConsole } from "@/components/backup-console";
import { requirePageSession } from "@/lib/page-auth";

export default async function BackupSettingsPage() {
  const session = await requirePageSession();
  if (session.role !== "ADMIN") {
    return (
      <AppShell session={session} title="Backup et restauration">
        <p>Acces reserve a l'administrateur.</p>
      </AppShell>
    );
  }

  return (
    <AppShell session={session} title="Backup et restauration">
      <BackupConsole />
    </AppShell>
  );
}
