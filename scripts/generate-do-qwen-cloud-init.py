#!/usr/bin/env python3
from pathlib import Path
import secrets

ROOT = Path("/Users/abdulazizalrayes/Documents/New project/stratasaudi-website")
OPS = ROOT / "ops" / "qwen3-paperclip-pilot"

compose = (OPS / "docker-compose.yml").read_text()
service = (OPS / "qwen3-paperclip-pilot.service").read_text()
smoke = (OPS / "smoke-test.sh").read_text()

paperclip_prod_ip = "64.227.151.175"
vllm_api_key = secrets.token_urlsafe(32)

script = f"""#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

APP_DIR=/opt/qwen3-paperclip-pilot
mkdir -p "$APP_DIR" "$APP_DIR/hf-cache"

apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release ufw

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! dpkg -s nvidia-container-toolkit >/dev/null 2>&1; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update
  apt-get install -y nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
fi

cat > "$APP_DIR/.env" <<'EOF_ENV'
VLLM_MODEL=Qwen/Qwen3-8B-AWQ
VLLM_PORT=8000
VLLM_HOST=0.0.0.0
VLLM_GPU_MEMORY_UTILIZATION=0.9
VLLM_MAX_MODEL_LEN=8192
VLLM_API_KEY={vllm_api_key}
HF_HOME=./hf-cache
EOF_ENV

cat > "$APP_DIR/docker-compose.yml" <<'EOF_COMPOSE'
{compose}
EOF_COMPOSE

cat > "$APP_DIR/smoke-test.sh" <<'EOF_SMOKE'
{smoke}
EOF_SMOKE
chmod +x "$APP_DIR/smoke-test.sh"

cat > /etc/systemd/system/qwen3-paperclip-pilot.service <<'EOF_SERVICE'
{service}
EOF_SERVICE

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow from {paperclip_prod_ip} to any port 8000 proto tcp
ufw --force enable

systemctl daemon-reload
systemctl enable --now qwen3-paperclip-pilot.service

echo "{vllm_api_key}" > /root/qwen_vllm_api_key.txt
chmod 600 /root/qwen_vllm_api_key.txt
"""

output = OPS / "do-cloud-init.generated.sh"
output.write_text(script)
print(output)
print(vllm_api_key)
