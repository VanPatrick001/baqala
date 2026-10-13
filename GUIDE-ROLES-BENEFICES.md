# BAQALA : rôles, règle des 24 heures et bénéfice par produit

> L'application est en anglais, ourdou et arabe. Les noms d'écrans cités ici, en anglais : *Settings → Users*, *Settings → Roles & rights*, *Sales → Correct the sale / Void sale*, *Reports → Profit by product*.

## 1. Les trois rôles

| | Administrateur | Manager | Vendeur |
|---|:-:|:-:|:-:|
| Vendre à la caisse, ouvrir et fermer sa caisse | ✔ | ✔ | ✔ |
| Voir ses propres ventes | ✔ | ✔ | ✔ |
| Annuler ou corriger **sa** vente de **moins de 24 h** | ✔ | ✔ | ✔ |
| Annuler ou corriger **n'importe quelle** vente, à tout moment | ✔ | ✔ | ✖ |
| Produits, prix d'achat et de vente, stock, achats, fournisseurs | ✔ | ✔ | consultation des produits |
| **Comptabilité** : dépenses, entrées d'argent, journal de caisse, taxes | ✔ | ✔ | ✖ |
| Rapports, **bénéfice par produit**, tableau de bord, Smart Agent | ✔ | ✔ | ✖ |
| **Ajouter et gérer les vendeurs** | ✔ | ✔ | ✖ |
| Ajouter, modifier, **supprimer** tous les utilisateurs, changer leur rôle | ✔ | ✖ | ✖ |
| **Modifier les droits** de chaque rôle | ✔ | ✖ | ✖ |

Ces règles sont vérifiées **par le serveur**, pas seulement cachées à l'écran : un vendeur qui tenterait d'appeler une fonction interdite (depuis un autre appareil, par exemple) reçoit un refus.

**Base créée avant cette version :** sur le PC du magasin, lancez une fois `npm run db:migrate` (vos données sont conservées), puis `npm run build` et redémarrez le PC. Le rôle « Caissier » devient « Vendeur » et reçoit les droits ci-dessus.

---

## 2. Gérer les utilisateurs

**Paramètres → Utilisateurs**

- **Manager** : bouton **Nouveau vendeur**. La liste ne montre que les vendeurs ; le manager peut les modifier, changer leur mot de passe ou les désactiver.
- **Administrateur** : voit tout le monde, choisit le rôle (Administrateur, Manager, Vendeur), modifie et **supprime** (icône corbeille).
  - Un utilisateur supprimé ne peut plus se connecter ; ses ventes passées gardent son nom ; son identifiant redevient libre.
  - Il reste toujours au moins un administrateur actif, et personne ne peut supprimer son propre compte.

**Paramètres → Rôles et droits** (administrateur) : cochez ou décochez les droits du Manager et du Vendeur, puis **Enregistrer**. Le changement s'applique en une vingtaine de secondes, sans reconnexion. Le rôle Administrateur garde toujours tous les droits. Le **Manager reçoit automatiquement tous les droits du Vendeur**, y compris ceux que vous ajoutez au Vendeur. Un droit de gestion donne aussi la consultation (par exemple « Ajuster le stock » donne aussi « Voir le stock »).

Les **modules par utilisateur** (*Settings → Users → ✎ → Modules*) servent à ouvrir ou fermer des écrans pour une personne précise : un module coché lui donne l'accès de base même si son rôle ne l'a pas (voir [GUIDE-APPLICATIONS.md](GUIDE-APPLICATIONS.md)). Ils ne s'appliquent pas à l'administrateur.

---

## 3. Corriger ou annuler une vente

**Ventes → cliquez sur le ticket**

- **Annuler la vente** : le stock revient, l'argent est rendu (sortie de caisse), le crédit client est corrigé. Un motif est obligatoire et tout est tracé dans le journal d'audit.
- **Corriger la vente** : la vente est annulée et ses articles reviennent dans le panier de la caisse. Modifiez quantités, articles ou remise, puis encaissez à nouveau : un nouveau ticket est créé.

Pour un **vendeur**, ces deux boutons n'apparaissent que sur **ses propres ventes de moins de 24 heures**. Après 24 heures, le ticket affiche « seul un manager peut modifier cette vente ». Le délai est calculé avec l'heure du PC du magasin, pas celle du téléphone.

Si la caisse de la vente est déjà clôturée, le remboursement sort de la caisse ouverte (en priorité celle de la personne qui annule) ; si aucune caisse n'est ouverte, BAQALA demande d'en ouvrir une.

---

## 4. Bénéfice exact par produit et par mois

**Rapports → Bénéfice par produit**

Chaque produit a un **prix d'achat** et un **prix de vente** (fiche produit, la marge s'affiche pendant la saisie). À chaque vente, BAQALA enregistre le **coût d'achat réel** de l'article vendu (le lot sorti du stock, le plus ancien d'abord). Le bénéfice est donc exact, même si le prix d'achat a changé entre deux livraisons :

> **Bénéfice = ventes hors taxe − coût d'achat réel des articles vendus**

- **Mois** : pour chaque produit, prix d'achat, prix de vente, bénéfice par unité, quantité vendue, ventes HT, coût d'achat, bénéfice et marge %, avec le total du mois.
- **Année** : tableau produits × mois (janvier à décembre) avec le total par produit et par mois.
- **Excel** : le classeur contient une feuille « Profit by product » (traduite selon la langue) (mois par mois, total par mois). **PDF** : bouton PDF puis « Enregistrer au format PDF ».

Les ventes annulées ne comptent pas. Les dépenses (loyer, salaires…) n'entrent pas dans ce bénéfice par produit ; elles sont dans **Rapports → Overview** (marge nette).

---

## 5. Accès par Internet

L'app tourne sur le PC du magasin ; vous l'ouvrez de partout avec **Tailscale** (recommandé, gratuit, réservé à vos appareils) ou **Cloudflare Tunnel** (adresse publique protégée par e-mail). Pas à pas complet : [GUIDE-PC-DISTANCE-TACTILE.md](GUIDE-PC-DISTANCE-TACTILE.md), section 2.

En résumé avec Tailscale : installez Tailscale sur le PC du magasin et sur votre téléphone (même compte), puis ouvrez `http://pc-magasin:4000` dans le navigateur ou dans l'application BAQALA. Chaque personne se connecte avec **son** compte : les droits de son rôle s'appliquent aussi à distance.
