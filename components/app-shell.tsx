"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { UserRole } from "@prisma/client";
import { LogoutButton } from "@/components/logout-button";

type SessionLite = {
  displayName: string;
  role: UserRole;
};

type NavIcon =
  | "dashboard"
  | "orders"
  | "patients"
  | "cash"
  | "accounting"
  | "stock"
  | "suppliers"
  | "debt"
  | "users"
  | "sequences"
  | "backup";

type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  hint?: string;
  roles?: UserRole[];
};

type NavSection = {
  section: string;
  items: NavItem[];
};

type QuickAction = {
  href: string;
  label: string;
  roles?: UserRole[];
};

const navSections: NavSection[] = [
  {
    section: "Vente et Patients",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", hint: "Vue d'ensemble" },
      { href: "/orders", label: "Commandes", icon: "orders", hint: "Flux patient" },
      { href: "/patients", label: "Patients", icon: "patients", hint: "Fiches & ordonnance" },
      { href: "/reports/daily-cash", label: "Caisse journaliere", icon: "cash", hint: "Encaissement" }
    ]
  },
  {
    section: "Stock et Fournisseurs",
    items: [
      { href: "/stock", label: "Stock", icon: "stock", hint: "Lots & mouvements" },
      { href: "/suppliers", label: "Fournisseurs", icon: "suppliers", hint: "Achats", roles: ["ADMIN", "GESTIONNAIRE_STOCK"] },
      {
        href: "/reports/supplier-aging",
        label: "Echeances Fournisseurs",
        icon: "debt",
        hint: "Suivi echeances",
        roles: ["ADMIN", "GESTIONNAIRE_STOCK"]
      }
    ]
  },
  {
    section: "Administration",
    items: [
      { href: "/reports/accounting", label: "Comptabilite", icon: "accounting", hint: "Marge & cashflow", roles: ["ADMIN"] },
      { href: "/settings/users", label: "Utilisateurs", icon: "users", hint: "Comptes & roles", roles: ["ADMIN"] },
      { href: "/settings/sequences", label: "Sequences", icon: "sequences", hint: "Compteurs docs", roles: ["ADMIN"] },
      { href: "/settings/backup", label: "Backup", icon: "backup", hint: "Restauration", roles: ["ADMIN"] }
    ]
  }
];

const quickActionsByPath: Array<{
  match: (pathname: string) => boolean;
  actions: QuickAction[];
}> = [
  {
    match: (pathname) => pathname.startsWith("/orders"),
    actions: [
      { href: "/orders/new", label: "Nouvelle commande" },
      { href: "/patients", label: "Patients" }
    ]
  },
  {
    match: (pathname) => pathname.startsWith("/patients"),
    actions: [
      { href: "/orders/new", label: "Nouvelle commande" },
      { href: "/patients", label: "Liste patients" }
    ]
  },
  {
    match: (pathname) => pathname.startsWith("/stock"),
    actions: [
      { href: "/stock/movements", label: "Mouvements stock", roles: ["ADMIN", "GESTIONNAIRE_STOCK"] },
      { href: "/stock/alerts", label: "Alertes stock" }
    ]
  },
  {
    match: (pathname) => pathname.startsWith("/suppliers"),
    actions: [
      { href: "/suppliers/purchase-orders", label: "Bons commande", roles: ["ADMIN", "GESTIONNAIRE_STOCK"] },
      { href: "/suppliers/invoices", label: "Factures fournisseur", roles: ["ADMIN", "GESTIONNAIRE_STOCK"] }
    ]
  },
  {
    match: (pathname) => pathname.startsWith("/reports/accounting"),
    actions: [
      { href: "/reports/supplier-aging", label: "Echeances Fournisseurs", roles: ["ADMIN"] },
      { href: "/reports/daily-cash", label: "Caisse journaliere", roles: ["ADMIN"] }
    ]
  },
  {
    match: (pathname) => pathname.startsWith("/settings"),
    actions: [{ href: "/dashboard", label: "Retour dashboard" }]
  },
  {
    match: () => true,
    actions: [
      { href: "/orders/new", label: "Nouvelle commande" },
      { href: "/patients", label: "Patients" }
    ]
  }
];

function isActiveLink(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function visibleByRole<T extends { roles?: UserRole[] }>(items: T[], role: UserRole) {
  return items.filter((item) => !item.roles || item.roles.includes(role));
}

function NavIconGlyph({ icon }: { icon: NavIcon }) {
  switch (icon) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="5" rx="2" />
          <rect x="13" y="10" width="8" height="11" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
        </svg>
      );
    case "orders":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M8 3h8l4 4v14H4V3h4z" />
          <path d="M8 12h8M8 16h5M16 7v4h4" />
        </svg>
      );
    case "patients":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="8" r="3.25" />
          <circle cx="16.5" cy="9.5" r="2.5" />
          <path d="M3.5 19c.7-2.7 3.2-4.5 5.9-4.5S14.6 16.3 15.3 19M14.2 19c.4-1.7 1.9-2.9 3.7-2.9S21.2 17.3 21.6 19" />
        </svg>
      );
    case "cash":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <circle cx="12" cy="12" r="2.6" />
          <path d="M3 9h3M18 15h3" />
        </svg>
      );
    case "accounting":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 19h16" />
          <path d="M7 16V9.5M12 16V6.5M17 16v-4" />
          <path d="m5 11.5 4-2.8L13 10l6-4" />
        </svg>
      );
    case "stock":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5zM4 8.5V16l8 4.5M20 8.5V16L12 20.5M12 13v7.5" />
        </svg>
      );
    case "suppliers":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" />
          <circle cx="7" cy="18" r="1.8" />
          <circle cx="17" cy="18" r="1.8" />
        </svg>
      );
    case "debt":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 19h16M6.5 16V9.5M12 16V6.5M17.5 16v-4" />
          <path d="m5 7.5 4 2.5L13.2 7l5.8 2.6" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="8.2" cy="8.2" r="3.1" />
          <circle cx="16.7" cy="8.8" r="2.6" />
          <path d="M3.5 19c.8-2.7 3.1-4.4 5.6-4.4S14 16.3 14.8 19M14 19c.5-1.8 2.1-3 4-3s3.5 1.2 4 3" />
        </svg>
      );
    case "sequences":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M5 6h14M5 12h14M5 18h14" />
          <path d="M7.2 4.2v3.6M11.2 10.2v3.6M15.2 16.2v3.6" />
        </svg>
      );
    case "backup":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 7h16v10H4z" />
          <path d="M8 7V5.7A1.7 1.7 0 0 1 9.7 4h4.6A1.7 1.7 0 0 1 16 5.7V7" />
          <path d="M12 11v4M10 13h4" />
        </svg>
      );
    default:
      return null;
  }
}

export function AppShell({
  session,
  title,
  children
}: {
  session: SessionLite;
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("optica_sidebar_collapsed");
    const storedCompact = window.localStorage.getItem("optica_compact_mode");
    if (stored === "1") {
      setSidebarCollapsed(true);
    }
    if (storedCompact === "1") {
      setCompactMode(true);
    }
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem("optica_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  function toggleCompactMode() {
    setCompactMode((prev) => {
      const next = !prev;
      window.localStorage.setItem("optica_compact_mode", next ? "1" : "0");
      return next;
    });
  }

  const visibleSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: visibleByRole(section.items, session.role)
        }))
        .filter((section) => section.items.length > 0),
    [session.role]
  );

  const visibleCommands = useMemo(() => visibleSections.flatMap((section) => section.items), [visibleSections]);

  const currentSection = useMemo(() => {
    const found = visibleSections.find((section) => section.items.some((item) => isActiveLink(pathname, item.href)));
    return found?.section ?? "Vue principale";
  }, [pathname, visibleSections]);

  const contextualActions = useMemo(() => {
    const rule = quickActionsByPath.find((item) => item.match(pathname)) ?? quickActionsByPath[quickActionsByPath.length - 1];
    return visibleByRole(rule.actions, session.role);
  }, [pathname, session.role]);
  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-DZ", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(new Date()),
    []
  );

  function submitCommand(event: React.FormEvent) {
    event.preventDefault();
    const query = commandQuery.trim().toLowerCase();
    if (!query) {
      return;
    }

    const directMatch = visibleCommands.find(
      (item) => item.label.toLowerCase() === query || item.href.toLowerCase() === query
    );
    if (directMatch) {
      router.push(directMatch.href);
      setCommandQuery("");
      return;
    }

    const fuzzyMatch = visibleCommands.find(
      (item) => item.label.toLowerCase().includes(query) || item.href.toLowerCase().includes(query)
    );
    if (fuzzyMatch) {
      router.push(fuzzyMatch.href);
      setCommandQuery("");
      return;
    }

    if (query.startsWith("/")) {
      router.push(query);
      setCommandQuery("");
    }
  }

  return (
    <main className={`shell-container shell-v3${sidebarCollapsed ? " collapsed" : ""}${compactMode ? " compact" : ""}`}>
      <div
        className={`shell-overlay${sidebarOpen ? " open" : ""}`}
        role="button"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={() => setSidebarOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSidebarOpen(false);
          }
        }}
        aria-label="Fermer menu"
      />

      <aside
        id="shell-sidebar"
        className={`card shell-sidebar-v3${sidebarOpen ? " open" : ""}${sidebarCollapsed ? " collapsed" : ""}`}
        aria-label="Navigation principale"
      >
        <header className="shell-sidebar-header-v3">
          <div className="shell-brand">
            <strong className="shell-logo">Optica</strong>
            <p className="shell-sidebar-subtitle">Laboratoire optique</p>
          </div>
          <button
            type="button"
            className="btn shell-collapse-btn"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? "Etendre le menu" : "Reduire le menu"}
            title={sidebarCollapsed ? "Etendre le menu" : "Reduire le menu"}
          >
            {sidebarCollapsed ? ">" : "<"}
          </button>
        </header>

        <nav className="shell-sidebar-nav-v3">
          {visibleSections.map((section) => (
            <section key={section.section} className="shell-nav-section-v3">
              <h2 className="shell-nav-section-title">{section.section}</h2>
              <div className="shell-nav-links-v3">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shell-nav-link-v3${isActiveLink(pathname, item.href) ? " active" : ""}`}
                    onClick={() => setSidebarOpen(false)}
                    title={item.label}
                  >
                    <span className="shell-nav-icon" aria-hidden="true">
                      <NavIconGlyph icon={item.icon} />
                    </span>
                    <span className="shell-nav-text">
                      <span className="shell-nav-label">{item.label}</span>
                      {item.hint ? <small className="shell-nav-hint">{item.hint}</small> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <footer className="shell-sidebar-footer-v3">
          <div className="shell-user-meta">
            <span className="shell-user-name">{session.displayName}</span>
            <span className="role-badge">{session.role}</span>
          </div>
          <LogoutButton
            className="btn shell-logout-btn"
            label={sidebarCollapsed ? "Sortir" : "Se deconnecter"}
          />
        </footer>
      </aside>

      <section className="shell-main">
        <header className="card shell-commandbar">
          <div className="shell-commandbar-head">
            <button
              type="button"
              className="btn shell-menu-btn"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-expanded={sidebarOpen}
              aria-controls="shell-sidebar"
            >
              Menu
            </button>
            <div className="shell-page-heading">
              <p className="shell-page-section">{currentSection}</p>
              <h1 className="page-title">{title}</h1>
            </div>
            <span className="shell-date-chip">{todayLabel}</span>
          </div>

          <form className="shell-command-search" onSubmit={submitCommand}>
            <label className="shell-command-label">
              Recherche globale
              <input
                list="shell-command-options"
                className="input"
                placeholder="Ex: commandes, stock, /settings/users"
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
              />
            </label>
            <datalist id="shell-command-options">
              {visibleCommands.map((item) => (
                <option key={item.href} value={item.label} />
              ))}
            </datalist>
            <button className="btn shell-go-btn" type="submit">
              Aller
            </button>
          </form>

          <div className="shell-quick-actions">
            <button type="button" className="btn shell-quick-action-btn" onClick={toggleCompactMode}>
              {compactMode ? "Vue confortable" : "Vue compacte"}
            </button>
            {contextualActions.map((action) => (
              <Link key={action.href} href={action.href} className="btn shell-quick-action-btn">
                {action.label}
              </Link>
            ))}
          </div>
        </header>

        <section className="card shell-content">{children}</section>
      </section>
    </main>
  );
}
