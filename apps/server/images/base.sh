# Shared by every harness image. Runs as `dev` (passwordless sudo).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
sudo -E apt-get update -qq
sudo -E apt-get install -y -qq tmux bubblewrap ripgrep
