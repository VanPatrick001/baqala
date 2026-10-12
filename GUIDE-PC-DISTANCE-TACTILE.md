# BAQALA : PC du magasin, accès à distance et écran tactile

Les trois sont possibles et prévus dans l'application :

1. **L'app tourne sur le PC du magasin**, elle démarre toute seule avec le PC, la caisse s'ouvre en plein écran.
2. **Vous y accédez à distance** (téléphone, PC à la maison) de façon sécurisée avec **Tailscale**, sans rien ouvrir sur votre box Internet.
3. **L'écran tactile fonctionne** : grandes touches, pavé numérique à l'écran pour l'encaissement, pas de zoom accidentel.

Prérequis : avoir fait l'installation du [README.md](README.md) (Node.js, MySQL, `npm install`, `backend/.env`, `npm run db:init`).

---

## 1. Faire tourner l'app sur le PC du magasin (Windows 10 / 11)

Dans le dossier `baqala\deploy\windows`, **double-cliquez sur `installer.bat`** et acceptez la demande de droits administrateur.

Le script s'occupe de tout :

- il compile l'application ;
- il crée la tâche « BAQALA Serveur » qui **démarre l'app avec le PC**, même sans ouvrir de session Windows, et la relance si elle s'arrête ;
- il met MySQL en démarrage automatique ;
- il autorise le port 4000 **uniquement** pour le réseau du magasin et pour Tailscale (jamais Internet directement) ;
- il crée sur le bureau le raccourci **« Caisse BAQALA »**, qui ouvre la caisse en plein écran.

Pour que la caisse s'ouvre aussi toute seule en plein écran à chaque allumage, lancez plutôt `installer.bat -CaisseAuDemarrage` (depuis une invite de commandes dans ce dossier).

À la fin, le script affiche les adresses de l'app, par exemple :

```
BAQALA fonctionne : http://localhost:4000
  depuis un autre appareil : http://192.168.1.20:4000  (Wi-Fi)
```

**Réglages Windows indispensables** (Paramètres → Système → Alimentation) : mise en veille **Jamais** lorsque branché. Un PC en veille n'est plus joignable à distance.

- Quitter le plein écran : **Alt + F4**.
- Journal du serveur : `baqala\logs\baqala.log`.
- Tout retirer : `desinstaller.bat` (la base de données et vos ventes ne sont pas touchées).

> Sous Linux, utilisez `deploy/linux/baqala.service` (instructions dans le fichier).

### Autres appareils dans le magasin

Une tablette ou un second PC connecté au **même Wi-Fi** ouvre simplement l'adresse affichée (`http://192.168.1.20:4000`). Pensez à donner une **adresse IP fixe** au PC du magasin dans votre box (réservation DHCP), sinon l'adresse peut changer.

---

## 2. Accès à distance avec Tailscale (recommandé)

Tailscale crée un réseau privé chiffré entre **vos** appareils. Personne d'autre ne peut voir l'app. Rien à configurer sur la box Internet. C'est gratuit pour un usage personnel (jusqu'à 100 appareils).

1. Créez un compte sur **https://tailscale.com** (avec Google, Microsoft ou e-mail).
2. **Sur le PC du magasin** : installez Tailscale pour Windows, connectez-vous avec ce compte. Dans le menu Tailscale, activez **« Run unattended »** pour qu'il reste connecté même sans session ouverte.
3. **Sur votre téléphone** (Android / iPhone) **ou votre PC à la maison** : installez l'application Tailscale et connectez-vous avec **le même compte**.
4. Dans l'app Tailscale, repérez le nom du PC du magasin (ex. `pc-magasin`) et ouvrez dans le navigateur :

```
http://pc-magasin:4000
```

(ou son adresse en `100.x.x.x`, affichée dans Tailscale).

Connectez-vous avec votre identifiant BAQALA habituel. Tout fonctionne à distance : tableau de bord, rapports, stock, agent, et même la caisse.

**Option : adresse en https et icône sur le téléphone.** Sur le PC du magasin, dans une invite de commandes :

```
tailscale serve --bg 4000
```

Si Tailscale le demande, acceptez l'activation de HTTPS. L'app devient accessible en `https://pc-magasin.<votre-réseau>.ts.net`, toujours réservée à vos appareils. Avec cette adresse, le menu du navigateur propose **« Installer l'application »** ou **« Ajouter à l'écran d'accueil »**, et BAQALA s'ouvre en plein écran comme une vraie app.

### Vérifier l'accès par Internet

Sur le téléphone, **coupez le Wi-Fi** (pour passer en 4G/5G, donc vraiment par Internet), puis ouvrez l'adresse ci-dessus. La page de connexion BAQALA doit s'afficher. Les applications PC et Android acceptent la même adresse (`http://pc-magasin:4000` ou l'adresse `https://…ts.net`) au premier lancement ou via **Changer de serveur**.

Le PC du magasin doit rester **allumé**, avec MySQL et BAQALA démarrés (c'est automatique après `installer.bat`) et Tailscale connecté. Désactivez la mise en veille : Paramètres Windows → Système → Alimentation → Écran et veille → « Jamais » pour la mise en veille.

### Que choisir ?

| | Tailscale | Cloudflare Tunnel |
|---|---|---|
| Qui peut ouvrir l'app | uniquement vos appareils, connectés à votre compte Tailscale | toute personne dont l'e-mail est autorisé dans Cloudflare Access |
| Sur chaque appareil | installer l'application Tailscale | rien, un navigateur suffit |
| Il faut | un compte gratuit | un nom de domaine (environ 10 € par an) géré par Cloudflare |
| Conseillé pour | vous et votre manager | des vendeurs sur plusieurs boutiques, sans rien installer |

### Alternative : Cloudflare Tunnel

À choisir seulement si vous voulez une adresse publique (ex. `https://caisse.mon-magasin.com`) ouverte depuis n'importe quel navigateur sans installer Tailscale. Il faut un nom de domaine géré par Cloudflare.

1. Sur https://one.dash.cloudflare.com : **Networks → Tunnels → Create a tunnel** (type Cloudflared), nommez-le `baqala`.
2. Cloudflare affiche une commande `cloudflared.exe service install <jeton>` : installez cloudflared sur le PC du magasin (`winget install Cloudflare.cloudflared`) puis lancez cette commande en administrateur. Le tunnel démarre alors avec Windows.
3. Dans l'onglet **Public Hostname**, choisissez `caisse.mon-magasin.com` et le service `http://localhost:4000`.
4. **Protégez l'adresse avec Cloudflare Access** (Access → Applications → Add → Self-hosted) en n'autorisant que vos adresses e-mail. Sans cette protection, la page de connexion BAQALA serait visible de tout Internet.

### Règles de sécurité

- **N'ouvrez jamais le port 4000 sur votre box** (redirection de port) : utilisez Tailscale ou Cloudflare.
- Changez le mot de passe `admin` (imposé à la première connexion) et donnez **un compte par personne**, avec le rôle **Vendeur** pour les vendeurs (pas d'accès à la comptabilité).
- Après 8 mots de passe faux, BAQALA bloque les essais pendant 15 minutes.
- Faites la sauvegarde quotidienne décrite dans le README.

---

## 3. Écran tactile

Rien à installer : l'application détecte l'écran tactile.

- Boutons et champs agrandis pour le doigt (au moins 44 px).
- Dans la fenêtre de paiement, **pavé numérique à l'écran** : tapez le montant donné par le client, puis le grand bouton vert de confirmation. Le rendu de monnaie s'affiche immédiatement.
- Fiches produits à toucher pour ajouter au panier, boutons **+ / −** pour les quantités.
- Pas de zoom accidentel au double appui.
- Pour les autres écrans (fiches produits, achats…), le **clavier tactile de Windows** s'ouvre en touchant un champ. S'il ne s'affiche pas : Paramètres → Personnalisation → Saisie tactile → « Afficher le clavier tactile lorsqu'il n'y a pas de clavier ».

**Matériel conseillé** : écran tactile de 15 pouces ou plus, résolution 1366 × 768 minimum, avec un lecteur de codes-barres USB (il fonctionne comme un clavier) et une imprimante de tickets.

**Imprimante de tickets en plein écran** : le raccourci « Caisse BAQALA » imprime sans fenêtre de dialogue, sur l'**imprimante par défaut** de Windows. Définissez donc l'imprimante de tickets comme imprimante par défaut (Paramètres → Bluetooth et appareils → Imprimantes).

---

## 4. Dépannage

| Problème | Solution |
|---|---|
| L'app ne répond pas après le démarrage du PC | Attendez une minute (elle démarre 30 s après Windows), puis consultez `logs\baqala.log`. Vérifiez que le service MySQL est démarré. |
| Une tablette du magasin n'arrive pas à se connecter | Même Wi-Fi que le PC ? Adresse IP du PC changée ? Relancez `installer.bat` pour recréer la règle de pare-feu. |
| Inaccessible à distance | Tailscale doit être connecté sur les deux appareils, et le PC du magasin ne doit pas être en veille. |
| La caisse s'ouvre dans une fenêtre normale | Fermez toutes les fenêtres Chrome ouvertes par le raccourci, puis relancez « Caisse BAQALA ». |
| Le port 4000 est déjà utilisé | Changez `PORT` dans `backend\.env` et remplacez `4000` dans `ouvrir-caisse.bat`, puis relancez `installer.bat -Port <nouveau>`. |
