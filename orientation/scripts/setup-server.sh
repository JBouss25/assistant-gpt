#!/bin/bash
# Préparation d'un serveur Ubuntu 24.04 (instance OVH Public Cloud, zone Rabat) pour Orientation 4.0.
# À lancer une seule fois, en root :  sudo bash scripts/setup-server.sh
# Idempotent : peut être relancé sans risque.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "À lancer avec sudo."; exit 1; fi
ADMIN_USER="${SUDO_USER:-ubuntu}"
export DEBIAN_FRONTEND=noninteractive

echo "==> 1/6 Mises à jour du système"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git ufw fail2ban unattended-upgrades openssl

echo "==> 2/6 Mises à jour de sécurité automatiques"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> 3/6 Docker (dépôt officiel)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
usermod -aG docker "$ADMIN_USER"
# Journaux Docker limités pour ne pas remplir le disque
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}' > /etc/docker/daemon.json
  systemctl restart docker
fi

echo "==> 4/6 Pare-feu : SSH, HTTP, HTTPS uniquement"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban

echo "==> 5/6 SSH : connexion par clé uniquement"
if [ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/99-orientation.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
  systemctl reload ssh || systemctl reload sshd
else
  echo "   !! Aucune clé SSH trouvée pour $ADMIN_USER : connexion par mot de passe laissée active pour éviter de vous bloquer."
fi

echo "==> 6/6 Mémoire d'échange (utile pour compiler le front)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo
echo "Serveur prêt. Déconnectez-vous puis reconnectez-vous pour que $ADMIN_USER puisse utiliser Docker."
