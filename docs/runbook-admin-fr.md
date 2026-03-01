# Runbook Admin (Optica v1)

## 1) Installation locale (premiere fois)

1. Ouvrir `cmd` dans le dossier projet.
2. Executer `ops\setup-local.cmd`.
3. Demarrer l'app avec `ops\start-dev.cmd` (ou `ops\start-prod-local.cmd` apres build).

## 2) Connexion initiale

- Utilisateur: `admin`
- Mot de passe: `admin1234`

## 3) Gestion utilisateurs

1. Aller dans `Utilisateurs`.
2. Creer les comptes `VENDEUR`, `OPTICIEN`, `GESTIONNAIRE_STOCK`.
3. Desactiver les comptes inutilises.

## 4) Backup & Restore

### Backup manuel

1. Aller dans `Settings > Backup`.
2. Cliquer `Lancer backup`.
3. Verifier le statut `SUCCESS`.

### Validation restore (sans restaurer)

1. Selectionner un backup.
2. Cliquer `Verifier backup`.
3. Verifier message `Validation OK`.

### Restore reelle

1. Selectionner un backup valide.
2. Taper `RESTORE` dans le champ de confirmation.
3. Cliquer `Restaurer backup`.
4. Redemarrer le serveur local.

### Automatiser le backup quotidien (Windows)

1. Ouvrir `cmd` en administrateur.
2. Executer `ops\schedule-backup-daily.cmd`.
3. Verifier la tache `OpticaDailyBackup` dans le Planificateur de taches.
4. Option: changer l'heure avec `ops\schedule-backup-daily.cmd -Time 21:30`.

## 5) Cloture journaliere

1. Le vendeur ouvre sa caisse.
2. Le vendeur cloture en fin de shift.
3. L'admin controle `Caisse journaliere` (totaux + ecart).

## 6) Regles critiques

- Documents confirmes/financiers: pas de suppression brute, annulation avec raison.
- Restauration: toujours faire un backup juste avant.
- Garder le dossier `backups` sur disque local securise.
