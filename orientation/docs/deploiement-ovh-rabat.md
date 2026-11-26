# Mise en ligne sur OVHcloud (Local Zone de Rabat) — `ooavenir.oostudy.ma`

Guide pas à pas pour installer Orientation 4.0 sur un serveur OVH situé au Maroc, avec le nom de domaine
géré chez ADK Media. Durée : environ 1 h la première fois.

Architecture installée sur le serveur :

```
Internet ──HTTPS──> Caddy (certificat automatique) ──> Front Next.js ──> API FastAPI ──> PostgreSQL
                                                                              └──> sauvegardes chiffrées quotidiennes
```

Seuls les ports 80 et 443 (Caddy) et 22 (SSH) sont ouverts. L'API et la base ne sont pas accessibles depuis Internet.

---

## 0. Ce qu'il vous faut

- Un compte OVHcloud avec un **projet Public Cloud**.
- Une **clé SSH** sur votre ordinateur (sinon : `ssh-keygen -t ed25519` dans un terminal).
- L'accès à la **zone DNS de `oostudy.ma`** chez ADK Media (cPanel → « Zone Editor » ou espace client).
- Une **adresse e-mail d'envoi** pour les invitations parent, par exemple `noreply@oostudy.ma` créée chez
  ADK Media ou une offre e-mail OVH. Notez son serveur SMTP, son port et son mot de passe.
- Un **gestionnaire de mots de passe** pour y ranger les secrets générés à l'étape 4.

## 1. Créer le serveur chez OVH

Dans l'espace client OVHcloud → Public Cloud → Instances → Créer une instance :

1. **Localisation : choisir la Local Zone de Rabat (Maroc).** C'est le point essentiel pour que les données
   restent au Maroc. Si Rabat n'apparaît pas pour le modèle choisi, essayez un autre modèle ou contactez OVH.
2. **Image : Ubuntu 24.04.**
3. **Taille : 2 vCPU et 4 Go de mémoire minimum**, 40 Go de disque ou plus. C'est suffisant pour 3 à 5 établissements.
4. **Clé SSH :** ajoutez votre clé publique (contenu du fichier `~/.ssh/id_ed25519.pub`).
5. Une fois l'instance créée, notez son **adresse IP publique** (ex. `51.x.x.x`).

## 2. Faire pointer `ooavenir.oostudy.ma` vers le serveur (chez ADK Media)

Dans la zone DNS de `oostudy.ma`, ajoutez :

| Type | Nom | Valeur | TTL |
| --- | --- | --- | --- |
| A | `ooavenir` | l'IP publique du serveur OVH | 3600 |

Si le serveur a aussi une adresse IPv6, ajoutez un enregistrement `AAAA` équivalent. Vérifiez au bout de
quelques minutes depuis votre ordinateur : `nslookup ooavenir.oostudy.ma` doit renvoyer l'IP du serveur.
Le reste de `oostudy.ma` (site, e-mails) reste chez ADK Media sans changement.

## 3. Préparer le serveur (une seule fois)

```bash
ssh ubuntu@IP_DU_SERVEUR
git clone https://github.com/JBouss25/assistant-gpt.git
cd assistant-gpt/orientation
sudo bash scripts/setup-server.sh      # mises à jour, Docker, pare-feu, SSH par clé, fail2ban
exit                                   # puis se reconnecter pour activer les droits Docker
```

> Si le dépôt GitHub est privé, GitHub demandera un identifiant : utilisez un « personal access token » en
> lecture seule, ou une clé de déploiement.

## 4. Configurer

```bash
ssh ubuntu@IP_DU_SERVEUR
cd assistant-gpt/orientation
./scripts/gen-env.sh demo ooavenir.oostudy.ma votre.adresse@oostudy.ma
nano .env        # compléter le bloc SMTP (voir ci-dessous)
```

- `demo` = démonstration en ligne avec les comptes fictifs. Pour de vrais élèves, voir l'étape 9.
- L'adresse e-mail sert à Let's Encrypt (alertes sur le certificat HTTPS).
- **Copiez immédiatement `FIELD_ENCRYPTION_KEY` et `BACKUP_PASSPHRASE` dans votre gestionnaire de mots de passe.**
  Sans elles, les données chiffrées et les sauvegardes sont définitivement illisibles.
- **Ne relancez jamais `gen-env.sh` (ni ne changez `POSTGRES_PASSWORD`) sur un serveur déjà en service** :
  la base garde l'ancien mot de passe et l'API ne pourrait plus s'y connecter.

Bloc SMTP, exemple pour une boîte créée chez ADK Media (à vérifier dans cPanel → « Comptes de messagerie » →
« Configurer le client de messagerie ») :

```
SMTP_HOST=mail.oostudy.ma
SMTP_PORT=465
SMTP_USER=noreply@oostudy.ma
SMTP_PASSWORD=...
MAIL_FROM=noreply@oostudy.ma
```

Avec le port 465, la connexion est chiffrée d'emblée ; avec 587, elle passe par STARTTLS.

## 5. Lancer

```bash
./scripts/deploy.sh
```

Le premier lancement construit les images (5 à 10 minutes), applique les migrations, puis Caddy obtient le
certificat HTTPS. Pour une démo, chargez ensuite les comptes fictifs :

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api python -m app.seed_demo
```

Ouvrez **https://ooavenir.oostudy.ma**. Les comptes de démonstration ont le mot de passe `demo1234`.

## 6. Mettre à jour

Après chaque nouvelle version poussée sur GitHub :

```bash
cd ~/assistant-gpt/orientation && ./scripts/deploy.sh
```

Le script fait une sauvegarde, récupère le code, reconstruit, applique les migrations et attend que tout soit prêt.

## 7. Sauvegardes

- Une sauvegarde **chiffrée** (AES-256) est faite chaque jour dans `orientation/backups/` ; 14 jours conservés.
- **Copiez-les régulièrement hors du serveur** (une panne disque emporterait tout). Depuis votre ordinateur :
  `scp ubuntu@IP_DU_SERVEUR:assistant-gpt/orientation/backups/*.enc ./sauvegardes-orientation/`
  (ou un conteneur OVH Object Storage, à choisir lui aussi en zone Maroc si disponible).
- Sauvegarde immédiate : `docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps backup once`
- Restauration (remplace la base actuelle, confirmation demandée) :
  `./deploy/restore.sh backups/orientation-AAAAMMJJ-HHMMSS.dump.enc`

## 8. Surveiller et dépanner

```bash
C="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
$C ps                       # état des services
$C logs -f --tail=100 api   # journaux de l'API (ou web, caddy, db, backup)
```

| Symptôme | Cause probable |
| --- | --- |
| Le navigateur affiche une erreur de certificat | DNS pas encore propagé ou port 80 fermé : vérifier `nslookup`, puis `$C logs caddy` |
| « Erreur 502 » | API ou front en cours de démarrage, ou arrêtés : `$C ps`, puis les journaux |
| L'API redémarre en boucle avec « password authentication failed » | `POSTGRES_PASSWORD` a changé depuis la création de la base (voir étape 4) |
| Les invitations parent échouent | Bloc SMTP incomplet ou erroné : `$C logs api` |

## 9. Passer de la démo à la production (vrais élèves)

À faire **seulement** quand ces conditions sont réunies :

- [ ] déclaration ou autorisation **CNDP** obtenue, mentions d'information et durées de conservation validées par le juriste ;
- [ ] **référentiel réel** chargé et validé par le comité scientifique (plus de valeurs `SRC-DEMO-*`) ;
- [ ] envoi des e-mails testé (une invitation reçue sur une vraie boîte) ;
- [ ] copie des sauvegardes hors du serveur organisée.

Ensuite : dans `.env`, remplacez `APP_ENV=demo` par `APP_ENV=production` (sans toucher aux secrets), puis
**repartez d'une base vide**, car les comptes fictifs de démo ne doivent pas coexister avec de vrais élèves.
La commande `docker volume rm` qui le permet **efface définitivement la base** : faites-vous accompagner
pour cette étape. Enfin, relancez `./scripts/deploy.sh`. En production, le jeu de démonstration est refusé,
les codes d'invitation ne s'affichent jamais et les invitations partent par e-mail.
