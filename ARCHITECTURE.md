# BAQALA — Architecture générale

Application web de gestion de superette / boutique alimentaire : stock, caisse (POS), taxes, trésorerie, bilans et Smart Agent proactif. Trilingue **en / ur / ar** avec bascule LTR ↔ RTL à chaud.

---

## 1. Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Base de données | **MySQL 8.0+** (InnoDB, utf8mb4) | Imposé. Les règles métier critiques (encaissement, stock FEFO, clôture de caisse, règles d'alerte) vivent dans des **procédures stockées transactionnelles** : cohérence garantie même si plusieurs caisses tournent en parallèle. |
| Backend API | **Node.js 20 LTS + TypeScript + Express** | Un seul langage front/back, écosystème riche (PDF, Excel, imprimantes ESC/POS). |
| Accès BDD | `mysql2/promise` (pool) | Appel direct des procédures stockées, requêtes paramétrées, pas d'ORM qui masquerait la logique SQL. |
| Validation | `zod` | Validation de chaque requête de l'API. Le calcul du panier (`pos/domain/cart.ts`) est dupliqué côté front pour l'affichage, la base reste l'autorité. |
| Auth | JWT (durée configurable, 12 h par défaut) + `bcryptjs` | Rôles ADMIN (tout) / MANAGER (gestion + comptabilité + vendeurs) / CASHIER = Vendeur (caisse, ses ventes < 24 h), permissions JSON modifiables (`/api/roles`). |
| Smart Agent | `node-cron` + moteur de règles TypeScript au-dessus des procédures `sp_agent_*` | Planification (horaire + à la clôture de caisse), enrichissement et notifications. |
| Exports | `exceljs` côté serveur (en-têtes traduits, feuilles RTL) ; PDF et tickets via l'impression du navigateur | Le navigateur gère parfaitement la mise en forme arabe/ourdou, ce que les générateurs PDF serveur gèrent mal. |
| Frontend | **React 18 + Vite + TypeScript** | SPA rapide, idéale pour une caisse. |
| i18n | `i18next` + `react-i18next` | Changement de langue sans rechargement ; `dir` et `lang` mis à jour sur `<html>`. |
| État | `zustand` (panier, session caisse, persistance locale) + `@tanstack/react-query` (données serveur) | Le panier et les formulaires ne dépendent pas de la langue : la bascule ne perd rien. |
| UI | Tailwind CSS (propriétés logiques `ms-*`, `me-*`, `ps-*`, variantes `rtl:`) | Le même composant s'affiche correctement en LTR et RTL. |
| Graphiques | Recharts | Dashboard interactif. |
| Polices | Inter (en), Noto Naskh Arabic (ar), Noto Nastaliq Urdu (ur) | Rendu correct des scripts arabes. |
| Tests | Vitest (domaine : panier, règles de l'agent) | |

Une version poste unique (desktop) reste possible plus tard en emballant le front et l'API dans Electron/Tauri, sans changer le code métier.

---

## 2. Structure des dossiers (monorepo npm workspaces)

```
baqala/
├── package.json                 # workspaces backend + frontend ; scripts dev / build / start / db:init / db:demo / test
├── README.md                    # Guide d'installation
├── ARCHITECTURE.md
├── GUIDE-PC-DISTANCE-TACTILE.md # Démarrage auto, accès à distance (Tailscale), écran tactile
├── GUIDE-APPLICATIONS.md      # Applications PC / Android, modules par utilisateur, logo
├── branding/                  # Logo et icônes (SVG, PNG, ICO)
├── apps/
│   ├── shared/connect.html    # Écran « adresse du serveur » commun aux deux applications
│   ├── desktop/               # Application Windows (Electron) : fenêtre dédiée, impression directe des tickets
│   └── android/               # Application Android (WebView Java, compilée sans Gradle : build-apk.sh)
├── deploy/
│   ├── windows/                 # installer.bat/.ps1 (tâche planifiée, pare-feu, raccourci), ouvrir-caisse.bat (kiosque)
│   └── linux/baqala.service     # unité systemd
├── database/
│   ├── migrations/              # Évolutions de base appliquées par npm run db:migrate
│   ├── schema.sql               # 34 tables, vues, triggers, 28 procédures, données initiales
│   └── seed_demo.sql            # Données de démonstration (optionnel)
│
├── backend/                     # API Node 20+ / TypeScript / Express
│   ├── .env.example
│   ├── scripts/db-init.ts       # crée la base, l'utilisateur MySQL, exécute schema.sql (+ seed_demo.sql avec --demo)
│   ├── tests/                   # vitest : panier/rendu monnaie, règles du Smart Agent
│   └── src/
│       ├── config/env.ts
│       ├── core/
│       │   ├── db.ts            # pool mysql2, withConnection (pose @app_user_id pour l'audit), withTransaction, callProcedure
│       │   ├── errors.ts        # AppError + traduction des SIGNAL SQL (message = clé i18n)
│       │   ├── auth.ts          # JWT, requireAuth (droits relus en base, cache 15 s), can('permission')
│       │   ├── modules.ts       # Modules par utilisateur : permissions effectives = rôle ∩ modules autorisés
│       │   └── http.ts          # helpers zod (pagination, période, montants)
│       ├── modules/             # un dossier par domaine
│       │   ├── auth/ users/ settings/ audit/
│       │   ├── catalog/         # products.routes (HTTP) + products.repository (SQL), categories
│       │   ├── taxes/ suppliers/ customers/ purchases/ inventory/ cash/
│       │   ├── pos/             # pos.routes + domain/cart.ts (calcul pur du panier, partagé avec le front)
│       │   ├── reports/         # reports.service (requêtes), excel.ts (exceljs), labels.ts (en/ur/ar)
│       │   └── agent/           # agent.engine (orchestration) + domain/rules.ts (règles pures testées)
│       ├── jobs/agent.job.ts    # cron du Smart Agent (horaire par défaut) + passage au démarrage
│       ├── app.ts               # assemblage Express ; sert aussi frontend/dist en production
│       └── server.ts
│
└── frontend/                    # React 18 + Vite + Tailwind
    └── src/
        ├── i18n/                # i18next ; locales/en.json, ur.json, ar.json (embarqués) ; dir/lang du document
        ├── api/                 # client axios + hooks TanStack Query + types
        ├── stores/              # zustand : auth, panier (persisté), toasts
        ├── lib/                 # format.ts (nombres, monnaie, dates par langue), cart.ts
        ├── components/          # Layout, LanguageSwitcher, graphiques, UI
        └── features/            # dashboard, pos, products, inventory, purchases, customers,
                                 # cash, sales, reports, agent, settings, auth
```

### Règle de dépendance

```
routes (HTTP, validation zod)  ──►  service / repository (SQL)  ──►  procédures stockées
              │
              └──►  domain (règles pures : panier, règles de l'agent) — sans Express ni MySQL
```

Les règles métier critiques (stock FEFO, taxes figées par ligne, clôture de caisse) vivent dans les procédures stockées, donc restent cohérentes quel que soit le client. Le code `domain` est pur et couvert par les tests.

---

## 3. Flux clés

**Encaissement (POS)**
1. Le scanner code-barres agit comme un clavier : le champ de saisie reste focalisé, `Enter` déclenche la recherche par `barcode`/`sku`.
2. Le panier vit dans `cartStore` (zustand, persisté) ; le front affiche un total indicatif.
3. `POST /api/pos/checkout` → `sp_pos_checkout(session, user, client, items JSON, paiements JSON, langue)`.
4. La procédure fait tout dans **une seule transaction** : prix promo, taxes par ligne, sortie de stock FEFO, coût réel, paiements fractionnés, rendu monnaie, crédit client, trésorerie, numéro de ticket. Toute erreur annule l'ensemble.
5. L'API renvoie le ticket ; le front l'imprime (HTML 58/80 mm ou ESC/POS) dans la langue choisie.

**Erreurs métier** : les procédures lèvent `SIGNAL SQLSTATE '45000'` avec une **clé i18n** (`errors.insufficientStock`, `errors.creditLimitExceeded`...). L'API la transmet telle quelle, le front l'affiche traduite. Aucune chaîne en dur côté serveur.

**Smart Agent** : `sp_agent_run()` exécute 6 règles (stock faible, péremption, réassort par vélocité, anomalies, promotions, cross-selling), met à jour `smart_alerts` sans doublon (`dedupe_key`) et résout automatiquement les alertes dont la condition a disparu. Le module `agent` du backend l'appelle par cron, y ajoute des règles TypeScript si besoin et pousse les alertes au front.

---

## 4. Modèle de données (34 tables)

| Domaine | Tables |
|---|---|
| Référentiels | `languages`, `roles`, `users`, `settings`, `document_sequences` |
| Catalogue | `categories`, `category_translations`, `units`, `taxes`, `tax_translations`, `suppliers`, `products`, `product_translations`, `product_taxes`, `product_batches` |
| Stock & achats | `stock_movements`, `purchases`, `purchase_items`, `purchase_item_taxes` |
| Clients | `customers`, `customer_ledger` |
| Caisse & ventes | `cash_registers`, `cash_sessions`, `sales`, `sale_items`, `sale_item_taxes`, `sale_payments` |
| Trésorerie | `cash_categories`, `cash_movements` |
| Smart Agent | `promotions`, `smart_alerts`, `product_associations`, `agent_runs` |
| Audit | `audit_logs` |

**Choix de conception importants**

- **Lots (`product_batches`)** : chaque entrée en stock crée un lot avec sa date de péremption et son coût. Les sorties consomment en **FEFO** (premier périmé, premier sorti). Le COGS utilise le coût réel du lot, pas une estimation.
- **Taxes figées** : `sale_item_taxes` et `purchase_item_taxes` enregistrent taux et montant au moment de l'opération. Changer un taux demain ne modifie pas l'historique. La vue `v_tax_ledger` donne la taxe collectée vs payée (achats + dépenses).
- **Plusieurs taxes par produit** (`product_taxes`) : ex. TVA 18 % + accise 20 % sur les sodas. Taxes en pourcentage ou montant fixe par unité. Prix TTC ou HT selon le paramètre `prices_include_tax`.
- **Une seule session ouverte par caisse**, garantie par une colonne générée unique.
- **Écart de caisse** = compté − (fond + entrées espèces − sorties espèces), calculé à la clôture avec un rapport Z.
- **Audit** : triggers sur produits, taxes, paramètres et clôtures ; l'API exécute `SET @app_user_id = ?` sur chaque connexion pour attribuer les modifications.
- **Suppression logique** des produits (`deleted_at`) : l'historique des ventes reste intact.

### Procédures stockées (surface d'API de la base)

| Domaine | Procédures |
|---|---|
| Stock | `sp_stock_in`, `sp_stock_out` (FEFO), `sp_record_waste`, `sp_adjust_stock`, `sp_receive_purchase`, `sp_pay_supplier` |
| Caisse | `sp_open_cash_session`, `sp_close_cash_session` (rapport Z), `sp_record_cash_movement`, `sp_customer_repayment`, `fn_session_expected_cash` |
| POS | `sp_pos_checkout`, `sp_void_sale` (règle des 24 h du vendeur appliquée dans `pos.routes.ts`) |
| Comptabilité | `sp_financial_summary` (CA, marges brute/nette, taxes dues, cash-flow), `sp_period_report` (jour/semaine/mois/année), `sp_tax_report`, `sp_top_products`, `sp_product_profit` (bénéfice par produit et par mois, coût réel `sale_items.unit_cost`) |
| Smart Agent | `sp_agent_run`, `sp_agent_rule_low_stock`, `sp_agent_rule_expiry`, `sp_agent_rule_reorder`, `sp_agent_rule_anomalies`, `sp_agent_rule_promotions`, `sp_agent_rule_associations`, `sp_agent_accept_promotion` |
| Utilitaires | `sp_next_document_number`, `fn_setting` |

---

## 5. Exécuter le schéma seul (sans l'application)

La méthode recommandée est `npm run db:init` (voir README.md). Pour tester le SQL à la main :

```bash
mysql -u root -p < database/schema.sql          # crée la base `baqala`
mysql -u root -p baqala < database/seed_demo.sql  # optionnel : données de démo

mysql -u root -p baqala -e "CALL sp_financial_summary(CURDATE() - INTERVAL 30 DAY, CURDATE());"
mysql -u root -p baqala -e "CALL sp_agent_run();"
```

Compte par défaut : **admin / Admin@123** (changement de mot de passe imposé à la première connexion).
Paramètres à ajuster dans `settings` : `currency_code` (PKR par défaut), `prices_include_tax`, taux de la table `taxes` selon votre pays.
