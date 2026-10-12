# BAQALA — Gestion intelligente de boutique alimentaire

Application web complète pour superette / épicerie : **stock, caisse (POS), taxes, trésorerie, bilans statistiques et Smart Agent proactif**, en **anglais, ourdou et arabe** (changement de langue à tout moment, affichage de droite à gauche pour l'ourdou et l'arabe).

Tout tourne en local : une base **MySQL** sur votre machine, une API Node.js et l'interface dans le navigateur.

---

## 1. Prérequis

| Logiciel | Version | Lien |
|---|---|---|
| Node.js | 20 ou plus (22 LTS conseillé) | https://nodejs.org |
| MySQL Server | 8.0 ou plus | https://dev.mysql.com/downloads/mysql/ (Windows : « MySQL Installer ») |
| Navigateur | Chrome, Edge ou Firefox récent | |

Pendant l'installation de MySQL, **notez le mot de passe du compte `root`**. Il sert une seule fois, pour créer la base.

---

## 2. Installation

```bash
# 1. Dans le dossier du projet
cd baqala
npm install

# 2. Configuration
cp backend/.env.example backend/.env        # Windows : copy backend\.env.example backend\.env
```

Ouvrez `backend/.env` et renseignez au minimum :

```ini
DB_ROOT_PASSWORD=le_mot_de_passe_root_de_mysql   # utilisé uniquement par db:init
DB_PASSWORD=un_mot_de_passe_pour_l_application   # l'utilisateur MySQL "baqala" sera créé avec
JWT_SECRET=une_longue_phrase_secrete_aleatoire
```

```bash
# 3. Création de la base (choisissez UNE des deux commandes)
npm run db:init       # base vide, prête pour votre magasin
npm run db:demo       # base + données de démonstration (produits, achats, ventes, dépenses)
```

Le script crée la base `baqala`, toutes les tables, vues, triggers et procédures stockées, puis un utilisateur MySQL `baqala` avec des droits limités (l'application ne se connecte jamais en root).

> **Sécurité des données :** si la base contient déjà des ventes, `db:init` refuse de l'écraser. Pour repartir de zéro volontairement : `npm run db:reset` (ou `npm run db:demo:reset`), après une sauvegarde `mysqldump -u root -p baqala > sauvegarde.sql`.

Si vous préférez le client MySQL : `mysql -u root -p < database/schema.sql` fait la même chose (sans créer l'utilisateur applicatif).

---

## 3. Lancement

### Mode utilisation (recommandé en magasin)

```bash
npm run build
npm start
```

Ouvrez **http://localhost:4000**. Un seul port : l'API sert aussi l'interface. Au démarrage, le serveur affiche aussi l'adresse à ouvrir depuis les autres appareils du réseau (`http://<IP-du-PC>:4000`).

### Démarrage automatique, accès à distance, écran tactile

Voir **[GUIDE-PC-DISTANCE-TACTILE.md](GUIDE-PC-DISTANCE-TACTILE.md)** : démarrage avec le PC et caisse en plein écran (`deploy\windows\installer.bat`), accès sécurisé depuis votre téléphone avec Tailscale, réglages pour écran tactile.

### Rôles, règle des 24 h et bénéfice par produit

Voir **[GUIDE-ROLES-BENEFICES.md](GUIDE-ROLES-BENEFICES.md)** : qui peut faire quoi (Administrateur, Manager, Vendeur), correction d'une vente, bénéfice exact par produit et par mois.

### Applications PC et Android, modules par utilisateur

Voir **[GUIDE-APPLICATIONS.md](GUIDE-APPLICATIONS.md)** : application Windows (`BAQALA-Setup-1.0.0.exe`), application Android (`BAQALA-1.0.0.apk`), choix des modules visibles pour chaque utilisateur, logo.

### Mise à jour d'une installation existante

```bash
npm install
npm run db:migrate    # applique les évolutions de la base sans toucher aux données
npm run build
```

Puis redémarrez le serveur (ou le PC).

### Mode développement

```bash
npm run dev
```

Interface sur **http://localhost:5173** (rechargement à chaud), API sur le port 4000.

### Première connexion

- Identifiant : **admin**
- Mot de passe : **Admin@123**

Le changement de mot de passe est imposé à la première connexion. Créez ensuite les comptes dans **Paramètres → Utilisateurs** : rôles **Administrateur**, **Manager** et **Vendeur** (détails dans [GUIDE-ROLES-BENEFICES.md](GUIDE-ROLES-BENEFICES.md)).

---

## 4. Premiers réglages

Dans **Paramètres → Magasin** : nom, adresse, numéro fiscal, devise (PKR par défaut), prix TTC ou HT, pied de ticket, largeur du ticket (58 ou 80 mm), délai d'alerte de péremption et seuils du Smart Agent.

Dans **Paramètres → Taxes** : créez vos taxes (TVA / sales tax, taxes locales…) avec leur nom dans les trois langues, puis affectez-les aux produits. Plusieurs taxes par produit sont possibles.

---

## 5. Utilisation au quotidien

| Écran | Ce qu'on y fait |
|---|---|
| **Point de vente** | Ouvrir la caisse (fond initial), scanner ou rechercher les produits, encaisser en espèces / carte / mobile / crédit client, paiements mixtes, calcul du rendu, impression du ticket. Raccourcis : **F2** recherche, **F9** encaisser. |
| **Stock** | Niveaux, lots et dates de péremption, mouvements, pertes et casse, ajustements d'inventaire. |
| **Achats** | Fournisseurs, bons de commande, réception (entrée en stock par lot), paiements fournisseurs. |
| **Clients** | Comptes crédit (« khata »), plafond, historique, remboursements. |
| **Caisse & dépenses** | Session en cours, dépenses (loyer, salaires, électricité…), clôture avec comptage et écart, rapport Z. |
| **Rapports** | Bilan journalier, hebdomadaire, mensuel, annuel ; taxes collectées et déductibles ; top produits ; **bénéfice par produit et par mois** ; export **Excel** et **PDF**. |
| **Tableau de bord** | Chiffre d'affaires, marges, taxe due, trésorerie, panier moyen, alertes, comparaison avec la période précédente. |
| **Smart Agent** | Recommandations automatiques (voir ci-dessous). |

**Changer de langue :** boutons English / اردو / العربية en haut de l'écran, à tout moment. Le panier en cours, les formulaires et la page ouverte sont conservés. Chaque utilisateur retrouve sa langue à la connexion, et un ticket peut être réimprimé dans une autre langue depuis **Ventes**.

### Le Smart Agent

Il analyse la base toutes les heures (réglable via `AGENT_CRON`), au démarrage et à chaque clôture de caisse. Il signale :

- les **ruptures prévisibles** selon la vitesse de vente, et prépare en un clic des bons de commande par fournisseur ;
- les **produits proches de la péremption**, avec une **promotion suggérée** applicable en un clic ;
- les **anomalies** : pertes inhabituelles, trop d'annulations, écarts de caisse, marges qui s'effondrent, clients qui dépassent leur crédit ;
- les **ventes croisées** (produits souvent achetés ensemble), proposées directement au caissier dans l'écran de vente ;
- les produits dormants et les ajustements de prix.

Les seuils se règlent dans **Paramètres → Magasin**.

---

## 6. Matériel

- **Écran tactile :** reconnu automatiquement (grandes touches, pavé numérique pour l'encaissement). Détails dans le guide ci-dessus.
- **Lecteur code-barres :** tout lecteur USB ou Bluetooth en mode « clavier » fonctionne sans pilote. Le curseur est placé automatiquement dans le champ de scan ; le lecteur tape le code puis Entrée.
- **Imprimante de tickets (58/80 mm) :** installez-la comme imprimante système, puis réglez la largeur dans Paramètres. Dans la fenêtre d'impression du navigateur, choisissez cette imprimante, marges « aucune ». Pour imprimer sans fenêtre, lancez Chrome avec `--kiosk-printing`.
- **PDF :** le bouton PDF ouvre la fenêtre d'impression ; choisissez « Enregistrer au format PDF ». Cette méthode garantit un rendu parfait de l'arabe et de l'ourdou.

---

## 7. Sauvegarde

```bash
mysqldump -u root -p --routines --triggers baqala > baqala-AAAA-MM-JJ.sql   # sauvegarde
mysql -u root -p baqala < baqala-AAAA-MM-JJ.sql                              # restauration
```

Planifiez une sauvegarde quotidienne (Planificateur de tâches Windows ou cron) et copiez-la hors du PC.

---

## 8. Problèmes fréquents

| Symptôme | Solution |
|---|---|
| `Access denied for user 'root'` pendant `db:init` | Vérifiez `DB_ROOT_PASSWORD`. Sous Linux, root utilise parfois `auth_socket` : `sudo mysql -e "ALTER USER root@localhost IDENTIFIED WITH caching_sha2_password BY 'motdepasse'"`. |
| `You do not have the SUPER privilege… log_bin_trust_function_creators` | Lancez `db:init` avec le compte root, ou exécutez `SET GLOBAL log_bin_trust_function_creators = 1;` une fois. |
| `ECONNREFUSED 127.0.0.1:3306` | Le service MySQL n'est pas démarré (Windows : Services → MySQL80 → Démarrer ; Linux : `sudo service mysql start`). |
| Port 4000 déjà utilisé | Changez `PORT` dans `backend/.env`. |
| Page blanche après `npm start` | Lancez `npm run build` d'abord. |

---

## 9. Pour les développeurs

- `npm test` : tests unitaires (calcul du panier et rendu monnaie, règles du Smart Agent).
- Architecture, modèle de données et procédures stockées : voir **ARCHITECTURE.md**.
- Ajouter une langue : un fichier `frontend/src/i18n/locales/<code>.json`, une entrée dans `frontend/src/i18n/index.ts`, une ligne dans la table `languages` et les libellés d'export dans `backend/src/modules/reports/labels.ts`.
