import { AppShell } from "@/components/app-shell";
import { NewOrderWorkspace } from "@/components/new-order-workspace";
import { requirePageSession } from "@/lib/page-auth";

export default async function NewOrderPage() {
  const session = await requirePageSession();

  return (
    <AppShell session={session} title="Nouvelle commande">
      <NewOrderWorkspace />
    </AppShell>
  );
}
