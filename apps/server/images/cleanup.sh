sudo apt-get clean
sudo rm -rf /root/.npm /root/.cache /var/lib/apt/lists/* /tmp/*
v() { command -v "$1" >/dev/null && printf ' %s=%s' "$1" "$("$@" 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)"; }
export RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo HERMES_HOME=/opt/hermes/home/.hermes
echo "versions:$(v claude --version)$(v codex --version)$(v opencode --version)$(v hermes --version)$(v node --version)$(v bun --version)$(v python3 --version)$(v uv --version)$(v go version)$(v rustc --version)$(v php --version)$(v ruby --version)$(v java --version)$(v docker --version)$(v gh --version)"
