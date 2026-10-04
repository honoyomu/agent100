# Developer toolchain shared by every harness image. Runs as `dev` after
# base.sh (set -euo pipefail, apt lists fresh). Everything lands on the root
# disk so it ships in the image; per-user state (GOPATH, docker data) stays
# under /data.
export DEBIAN_FRONTEND=noninteractive
APT="sudo -E apt-get install -y -qq --no-install-recommends"

echo "== apt packages"
$APT \
  build-essential cmake pkg-config gdb \
  git-lfs jq fd-find fzf bat tree htop vim nano less zip unzip wget rsync lsof strace \
  dnsutils iputils-ping net-tools shellcheck httpie gnupg ca-certificates \
  sqlite3 postgresql-client default-mysql-client redis-tools \
  python3 python3-pip python3-venv python3-dev pipx \
  php-cli php-common php-curl php-mbstring php-xml php-zip php-sqlite3 php-mysql php-pgsql \
  php-intl php-gd php-bcmath php-readline \
  ruby-full default-jdk-headless maven
# Debian renames these two binaries.
sudo ln -sf /usr/bin/fdfind /usr/local/bin/fd
sudo ln -sf /usr/bin/batcat /usr/local/bin/bat
sudo git lfs install --system >/dev/null
sudo apt-get install -y -qq --only-upgrade gh

echo "== docker"
# Images and containers live on /data: big, per machine, never in an image.
sudo mkdir -p /etc/docker /etc/systemd/system/docker.service.d
echo '{ "data-root": "/data/docker", "features": { "containerd-snapshotter": false } }' | sudo tee /etc/docker/daemon.json >/dev/null
printf '[Unit]\nRequiresMountsFor=/data\n' | sudo tee /etc/systemd/system/docker.service.d/10-data.conf >/dev/null
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian trixie stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo -E apt-get update -qq
$APT docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker dev
sudo systemctl daemon-reload
sudo systemctl enable docker >/dev/null
sudo systemctl restart docker
# Capture first: `grep -q` closing the pipe early would fail it under pipefail.
hello=$(sudo docker run --rm hello-world)
grep -q 'Hello from Docker' <<<"$hello"
sudo docker system prune -af >/dev/null

echo "== go"
GO_VERSION=$(curl -fsSL 'https://go.dev/VERSION?m=text' | sed -n 1p)
curl -fsSL "https://go.dev/dl/${GO_VERSION}.linux-amd64.tar.gz" | sudo tar -C /usr/local -xz
sudo ln -sf /usr/local/go/bin/go /usr/local/go/bin/gofmt /usr/local/bin/

echo "== rust"
sudo mkdir -p /opt/rust
sudo chown dev:dev /opt/rust
export RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo
curl -fsSL https://sh.rustup.rs | sh -s -- -y -q --no-modify-path --profile minimal -c rustfmt,clippy

echo "== python, php, node extras"
curl -fsSL https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh >/dev/null
curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php
COMPOSER_SIG=$(curl -fsSL https://composer.github.io/installer.sig)
echo "${COMPOSER_SIG}  /tmp/composer-setup.php" | sha384sum -c - >/dev/null
sudo php /tmp/composer-setup.php --quiet --install-dir=/usr/local/bin --filename=composer
rm /tmp/composer-setup.php
sudo corepack enable
sudo npm i -g --no-fund --no-audit typescript tsx >/dev/null
curl -fsSL https://bun.sh/install | sudo env BUN_INSTALL=/usr/local bash >/dev/null 2>&1

echo "== environment"
# Login shells (the web terminal, agent services) pick this up; the rustup
# variables also go to /etc/environment so plain SSH commands find toolchains.
sudo tee /etc/profile.d/agent100-devtools.sh >/dev/null <<'PROFILE'
export RUSTUP_HOME=/opt/rust/rustup
export CARGO_HOME=/opt/rust/cargo
export GOPATH="$HOME/go"
export PATH="$PATH:/opt/rust/cargo/bin:$HOME/go/bin:$HOME/.local/bin"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
PROFILE
printf 'RUSTUP_HOME=/opt/rust/rustup\nCARGO_HOME=/opt/rust/cargo\nCOREPACK_ENABLE_DOWNLOAD_PROMPT=0\n' \
  | sudo tee -a /etc/environment >/dev/null
# rustup's proxies find the toolchain through RUSTUP_HOME; wrappers keep them
# working for tools that run commands with a scrubbed environment.
for bin in cargo rustc rustup rustfmt rustdoc cargo-clippy clippy-driver; do
  printf '#!/bin/sh\nexport RUSTUP_HOME="${RUSTUP_HOME:-/opt/rust/rustup}" CARGO_HOME="${CARGO_HOME:-/opt/rust/cargo}"\nexec /opt/rust/cargo/bin/%s "$@"\n' "$bin" \
    | sudo tee "/usr/local/bin/$bin" >/dev/null
  sudo chmod 0755 "/usr/local/bin/$bin"
done
