import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";

export async function requirePageSession() {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}