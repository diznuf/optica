# Checklist MVP v1 (Etat Actuel)

## Critere Acceptance

| Critere | Etat | Notes |
|---|---|---|
| Vendeur fait une vente complete sans voir les prix d'achat | OK | Filtrage `buyPrice` et tests RBAC API + page |
| Admin suit soldes fournisseur (paye/non paye/aging) | OK | Pages fournisseurs + rapport aging + details |
| Stock explicable via ledger + FIFO | OK | Mouvements, lots FIFO, tests integration |
| Documents requis imprimables + numerotation unique | OK | BL, facture, recu avec anti-dup |
| Actions critiques auditees | OK | Audit sur creation/cancel/doc/backup/restore/shift |
| Backup quotidien auto + restaurable | OK* | Script daily + validation + restore guide |

## Points Restants (Go-Live)

1. UI/UX polish final (lisibilite, vitesse de saisie, feedback visuel).
2. Test de charge leger local (plusieurs creations documents consecutives).
3. Verification operationnelle en donnees reelles (2-3 jours pilote).
4. Validation humaine des impressions (papier A4, marges imprimante locale).

`OK*` = techniquement present. L'automatisation quotidienne depend de la tache planifiee Windows configuree sur le poste.
