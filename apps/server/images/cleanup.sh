sudo apt-get clean
sudo rm -rf /root/.npm /var/lib/apt/lists/*
v() { command -v "$1" >/dev/null && echo -n " $1=$("$@" 2>/dev/null | head -1)"; }
echo "versions: tmux=$(tmux -V | cut -d' ' -f2)$(v claude --version)$(v codex --version)$(v opencode --version)$(HERMES_HOME=/opt/hermes/home/.hermes v hermes --version)"
