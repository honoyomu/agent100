# Hermes installs into its own tree on the root disk (/opt/hermes): HOME is
# /data, which images do not carry. HERMES_HOME lives there too, so the tool
# store pm populates at install time is found at runtime.
sudo -E apt-get install -y -qq libatomic1
sudo mkdir -p /opt/hermes
sudo chown dev:dev /opt/hermes
curl -fsSL -o /tmp/hermes-install.sh https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh
if ! HOME=/opt/hermes/home HERMES_INSTALL_VERBOSE=1 bash /tmp/hermes-install.sh \
  --dir /opt/hermes/hermes-agent --hermes-home /opt/hermes/home/.hermes \
  --non-interactive --skip-browser --skip-computer-use > /tmp/hermes-install.log 2>&1; then
  grep -v -E '^\s+\w+:\s+[0-9.]+%' /tmp/hermes-install.log | tail -40
  exit 1
fi
sudo ln -sf /opt/hermes/home/.local/bin/hermes /usr/local/bin/hermes
export HERMES_HOME=/opt/hermes/home/.hermes
hermes config set model.provider openrouter
hermes config set model.default anthropic/claude-sonnet-5.5
