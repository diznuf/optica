# Optica v1

Application web locale pour gestion de laboratoire optique.

## Stack
- Next.js 15 (App Router, TypeScript)
- Prisma + SQLite
- Auth JWT cookie
- RBAC par role (`ADMIN`, `OPTICIEN`, `GESTIONNAIRE_STOCK`, `VENDEUR`)

## Installation
1. Copier `.env.example` vers `.env`.
2. Installer les dependances: `npm install`.
3. Generer Prisma client: `npm run prisma:generate`.
4. Synchroniser la base locale: `npx prisma db push --accept-data-loss`.
5. Seed initial: `npm run prisma:seed`.
6. Lancer: `npm run dev`.

### Installation rapide Windows
- `ops\setup-local.cmd`
- `ops\start-dev.cmd`
- `ops\start-prod-local.cmd`
- `ops\backup-now.cmd`
- `ops\schedule-backup-daily.cmd`

## Compte initial
- Utilisateur: `admin`
- Mot de passe: `admin1234`

## Fonctionnalites implementees
- Auth + session cookie + API `/api/auth/*`
- RBAC + filtre prix d'achat pour vendeur
- CRUD patients + prescriptions
- Prescription complete: create + edit (OD/OS SPH/CYL/AXIS/ADD, PD far/near, prism, notes, contact lens fit)
- CRUD produits + stock ledger
- Workflow fournisseurs: PO, reception, facture, paiement partiel, retour
- Cloture caisse vendeur: ouverture/cloture shift avec ecart caisse
- Workflow commandes patients + transitions + paiement
- Liaison commande/prescription: selection de la prescription patient et snapshot conserve dans les lignes de commande
- FIFO sur sortie stock (`OUT` et `RETURN_SUPPLIER`)
- Documents numerotes: bon de livraison, facture, recu (anti-dup)
- Verification coherence montants commande avant generation documents
- Pages impression: `/print/delivery-note/:id`, `/print/invoice/:id`, `/print/receipt/:id`
- Rapports: stock bas, aging fournisseurs, caisse journaliere
- Audit log actions critiques
- Backup manuel + restauration + retention

## Backup quotidien
- Script: `npm run backup:daily`
- Pour automatiser sous Windows: creer une tache planifiee quotidienne qui execute cette commande.
- Option rapide: `ops\schedule-backup-daily.cmd` (par defaut 20:00).
  - Exemple heure personnalisee: `ops\schedule-backup-daily.cmd -Time 21:30`
- Le backup est verifie (signature SQLite + `PRAGMA integrity_check` + SHA256).
- Restauration admin: validation dry-run possible et confirmation explicite `RESTORE` requise.

## Tests integration
- Script: `npm run test:integration`
- Prerequis: lancer `npm run build` avant le test.
- Le script demarre l'application sur un port de test et valide: backup/restore dry-run, RBAC API+pages, shift caisse vendeur, documents anti-dup, FIFO, paiements, transitions, suppression/annulation.

## Documentation operationnelle
- `docs/acceptance-checklist-fr.md`
- `docs/runbook-admin-fr.md`
- `docs/runbook-vendeur-fr.md`
- `docs/runbook-stock-fr.md`

## Notes v1
- Pas de TVA
- Pas de barcode
- Single-PC localhost
- Les pages UI sont operationnelles pour consultation et flux principal; des ecrans formulaire supplementaires peuvent etre etendus selon besoin.
