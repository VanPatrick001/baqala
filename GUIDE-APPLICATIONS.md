# BAQALA : applications PC et Android, modules par utilisateur

## 1. Comment ça marche

```
          PC du magasin (serveur)                      Vos appareils
  ┌──────────────────────────────────┐     ┌──────────────────────────────┐
  │ MySQL + serveur BAQALA (port 4000)│◄────┤ Application PC  (Windows)    │
  │ démarre tout seul avec le PC      │     │ Application Android (APK)    │
  │ (deploy\windows\installer.bat)    │◄────┤ ou simple navigateur         │
  └──────────────────────────────────┘     └──────────────────────────────┘
        réseau du magasin (Wi-Fi)  ou  à distance via Tailscale
```

Les données restent **sur le PC du magasin**. Les applications PC et Android sont des fenêtres dédiées, connectées à ce serveur : elles affichent toujours la dernière version de BAQALA, sans mise à jour à installer de votre côté.

Installez d'abord le serveur sur le PC du magasin ([README.md](README.md), puis [GUIDE-PC-DISTANCE-TACTILE.md](GUIDE-PC-DISTANCE-TACTILE.md) pour le démarrage automatique et Tailscale).

---

## 2. Application PC (Windows 10 / 11)

**Installation :** double-cliquez sur **`BAQALA-Setup-1.0.0.exe`** et suivez l'assistant (dans la langue de Windows : français, anglais ou arabe). Un raccourci **BAQALA** est créé sur le bureau et dans le menu Démarrer.

> Windows peut afficher « Windows a protégé votre ordinateur » : l'installateur n'est pas signé par un certificat payant. Cliquez sur **Informations complémentaires**, puis **Exécuter quand même**.

**Premier lancement :** BAQALA demande l'adresse du serveur.

| Où se trouve ce PC ? | Adresse à saisir |
|---|---|
| C'est le PC du magasin | `http://localhost:4000` (proposée d'office) |
| Un autre PC dans le magasin | l'adresse affichée par le serveur, par ex. `http://192.168.1.20:4000` |
| Un PC à la maison | l'adresse Tailscale, par ex. `http://pc-magasin:4000` |

Dans **Options pour ce PC** :

- **Imprimante de tickets** : les tickets de caisse sortent directement sur cette imprimante, sans fenêtre. Les rapports, eux, ouvrent toujours la fenêtre d'impression (pour choisir « Enregistrer en PDF »).
- **Plein écran (kiosque)** : idéal pour un poste caisse tactile. **Alt + F4** pour quitter.
- **Ouvrir BAQALA au démarrage de Windows**.

Raccourcis : **F11** plein écran, **F5** recharger, **Ctrl + Maj + S** changer de serveur, **Ctrl + / Ctrl −** zoom. Le bouton **Changer de serveur** est aussi en bas du menu de gauche.

Sur le PC du magasin, l'application PC remplace le raccourci « Caisse BAQALA » créé par `installer.bat` (les deux fonctionnent).

---

## 3. Application Android

**Installation :**

1. Copiez **`BAQALA-1.0.0.apk`** sur le téléphone (câble, WhatsApp à vous-même, Google Drive…) et ouvrez-le.
2. Android demande d'autoriser l'installation depuis cette source : acceptez (Paramètres → Installer des applis inconnues). Si Play Protect avertit que l'application est inconnue, choisissez **Installer quand même** : elle n'est simplement pas publiée sur le Play Store.
3. Ouvrez **BAQALA** : saisissez l'adresse du serveur (même tableau que ci-dessus), puis touchez le grand bouton vert.

Android 6 ou plus récent. Pour l'utiliser **hors du magasin**, installez aussi **Tailscale** sur le téléphone (même compte que le PC du magasin).

- **Impression** : le bouton Imprimer ouvre l'impression Android (imprimante Wi-Fi, Bluetooth via le service de l'imprimante, ou « Enregistrer en PDF »).
- **Exports Excel** : enregistrés dans **Téléchargements/BAQALA**, puis ouverts automatiquement si une application sait lire les fichiers Excel.
- Si le serveur ne répond plus (Wi-Fi coupé, PC éteint, Tailscale déconnecté), l'écran de connexion s'affiche et **se reconnecte tout seul** dès que le serveur revient.
- **Retour** deux fois pour quitter. **Changer de serveur** : en bas du menu (☰).

---

## 4. Modules par utilisateur

Pour chaque compte, vous choisissez précisément les modules ouverts : on peut en retirer, et aussi en **ajouter** au-delà du rôle.

**Paramètres → Utilisateurs → ✎ (modifier) → Modules**

- **Tous les modules du rôle** : comportement par défaut.
- **Seulement ces modules** : la personne a exactement les modules cochés. Par exemple *Caisse + Rapports* pour un vendeur de confiance, *Tableau de bord + Rapports* pour un associé qui suit les chiffres depuis son téléphone, *Stock + Achats* pour un magasinier.

Modules disponibles : Tableau de bord, Caisse, Ventes, Produits, Stock, Achats (et fournisseurs), Clients, Caisse & dépenses, Rapports, Smart Agent, Paramètres.

Bon à savoir :

- Un module coché donne **l'accès de base** (consulter, utiliser au quotidien), même si le rôle ne l'avait pas : un vendeur avec *Rapports* coché voit les rapports et le bénéfice par produit. Les **droits de gestion** (comptabilité, prix, utilisateurs, droits) viennent toujours du rôle : cocher *Caisse & dépenses* pour un vendeur ne lui permet pas de saisir des dépenses. Voir [GUIDE-ROLES-BENEFICES.md](GUIDE-ROLES-BENEFICES.md).
- L'**administrateur** a toujours tous les modules et tous les droits.
- Un module garde ce dont il a besoin pour fonctionner : un vendeur limité à la Caisse peut toujours chercher les produits et choisir un client pendant la vente.
- Le changement s'applique **en une vingtaine de secondes**, sans que la personne ait à se reconnecter. Un compte désactivé est coupé tout de suite.
- Vous ne pouvez pas retirer le module Paramètres à votre propre compte (pour ne jamais vous enfermer dehors).

**Base créée avant cette version :** lancez une fois `npm run db:migrate` sur le PC du magasin (vos données sont conservées), puis `npm run build` et redémarrez le PC.

---

## 5. Logo

Tous les fichiers sont dans `branding/` :

| Fichier | Usage |
|---|---|
| `logo.svg`, `png/logo-1200.png` | logo complet sur fond clair (enseigne, factures, réseaux sociaux) |
| `logo-dark.svg`, `png/logo-dark-1200.png` | logo complet sur fond sombre |
| `icon.svg`, `png/icon-*.png` (16 à 1024 px) | icône seule (application, favicon) |
| `icon.ico` | icône Windows |
| `icon-maskable.svg` | icône Android / application installée |

Couleur principale : vert sarcelle `#0F766E` ; accents : vert feuille `#A3E635` et jaune `#FACC15`.

---

## 6. Recompiler les applications (développeurs)

**PC :** `cd apps/desktop && npm install && npm run dist:win` → `apps/desktop/dist/BAQALA-Setup-<version>.exe` (sous Linux, il faut Wine).

**Android :** `apps/android/build-apk.sh` → `apps/android/dist/BAQALA-<version>.apk`. Outils : JDK 17+, `android-sdk-platform-23 aapt zipalign apksigner dalvik-exchange` (paquets Ubuntu/Debian).

> **Conservez précieusement `apps/android/keystore/`** (clé de signature et son mot de passe). Sans elle, une nouvelle version de l'APK ne pourra pas s'installer par-dessus l'ancienne : il faudrait désinstaller l'application.
