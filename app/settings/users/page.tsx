import Link from "next/link";
import { Prisma, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { UsersAdminPanel } from "@/components/users-admin-panel";
import { db } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";

const PAGE_SIZE = 20;
const roleOptions: Array<UserRole> = ["ADMIN", "OPTICIEN", "GESTIONNAIRE_STOCK", "VENDEUR"];

function readParam(input: string | string[] | undefined) {
  if (!input) {
    return "";
  }
  return Array.isArray(input) ? input[0] ?? "" : input;
}

function parsePage(input: string) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
}

export default async function UsersSettingsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession();
  if (session.role !== "ADMIN") {
    return (
      <AppShell session={session} title="Utilisateurs">
        <p>Acces reserve a l'administrateur.</p>
      </AppShell>
    );
  }

  const params = await searchParams;
  const q = readParam(params.q).trim();
  const requestedPage = parsePage(readParam(params.page));
  const rawRole = readParam(params.role);
  const selectedRole = roleOptions.includes(rawRole as UserRole) ? (rawRole as UserRole) : "ALL";
  const activeFilter = readParam(params.active);

  const clauses: Prisma.UserWhereInput[] = [];
  if (q) {
    clauses.push({
      OR: [{ username: { contains: q } }, { displayName: { contains: q } }]
    });
  }
  if (selectedRole !== "ALL") {
    clauses.push({ role: selectedRole });
  }
  if (activeFilter === "1") {
    clauses.push({ isActive: true });
  } else if (activeFilter === "0") {
    clauses.push({ isActive: false });
  }
  const where: Prisma.UserWhereInput | undefined = clauses.length ? { AND: clauses } : undefined;

  const totalCount = await db.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);

  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  const serializedUsers = users.map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString()
  }));

  function buildHref(page: number) {
    const next = new URLSearchParams();
    if (q) {
      next.set("q", q);
    }
    if (selectedRole !== "ALL") {
      next.set("role", selectedRole);
    }
    if (activeFilter) {
      next.set("active", activeFilter);
    }
    if (page > 1) {
      next.set("page", String(page));
    }
    const query = next.toString();
    return query ? `/settings/users?${query}` : "/settings/users";
  }

  return (
    <AppShell session={session} title="Utilisateurs">
      <form className="page-filter-form" method="GET">
        <label>
          Recherche
          <input className="input" name="q" defaultValue={q} placeholder="Login ou nom" />
        </label>
        <label>
          Role
          <select className="input" name="role" defaultValue={selectedRole}>
            <option value="ALL">Tous</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <label>
          Actif
          <select className="input" name="active" defaultValue={activeFilter}>
            <option value="">Tous</option>
            <option value="1">Oui</option>
            <option value="0">Non</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrer
        </button>
        <Link href="/settings/users" className="btn">
          Reinitialiser
        </Link>
      </form>

      <div className="table-toolbar">
        <div className="table-meta">
          Total: {totalCount} - Page {currentPage}/{totalPages}
        </div>
        <div className="pagination-controls">
          {currentPage > 1 ? (
            <Link href={buildHref(currentPage - 1)} className="btn">
              Precedent
            </Link>
          ) : (
            <span className="btn btn-disabled">Precedent</span>
          )}
          {currentPage < totalPages ? (
            <Link href={buildHref(currentPage + 1)} className="btn">
              Suivant
            </Link>
          ) : (
            <span className="btn btn-disabled">Suivant</span>
          )}
        </div>
      </div>

      <UsersAdminPanel users={serializedUsers} currentUserId={session.userId} />
    </AppShell>
  );
}
