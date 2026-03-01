import "./globals.css";
import type { Metadata } from "next";
import { initBackupScheduler } from "@/lib/services/backup-scheduler";
import { ToastProvider } from "@/components/toast-provider";

export const metadata: Metadata = {
  title: "Optica v1",
  description: "Gestion laboratoire optique"
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "test") {
    initBackupScheduler();
  }

  return (
    <html lang="fr">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
