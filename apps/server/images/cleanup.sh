sudo apt-get clean
sudo rm -rf /root/.npm /var/lib/apt/lists/*
echo "versions: tmux=$(tmux -V | cut -d' ' -f2) claude=$(claude --version 2>/dev/null | cut -d' ' -f1) codex=$(codex --version 2>/dev/null | cut -d' ' -f2) opencode=$(opencode --version 2>/dev/null)"
