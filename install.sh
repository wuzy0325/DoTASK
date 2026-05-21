#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}==>${NC} $1"; }
warn()  { echo -e "${YELLOW}==>${NC} $1"; }
err()   { echo -e "${RED}==>${NC} $1"; }
skip()  { echo -e "  ${YELLOW}skip${NC} $1"; }
ok()    { echo -e "  ${GREEN}ok${NC} $1"; }
doing() { echo -e "  ${GREEN}•${NC} $1"; }

info "AI Task Workbench 安装检查"

# ── Node.js 22+ ──
if command -v node &>/dev/null; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VER" -ge 22 ]; then
    ok "Node.js $(node -v)"
  else
    warn "Node.js $(node -v) 版本低于 22，需要升级"
    doing "添加 NodeSource 仓库..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    doing "安装 Node.js 22..."
    sudo apt-get install -y nodejs
    ok "Node.js $(node -v)"
  fi
else
  info "安装 Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ok "Node.js $(node -v)"
fi

# ── apt 系统包 ──
MISSING_APT=()
for pkg in git tmux curl; do
  if ! dpkg -s "$pkg" &>/dev/null; then
    MISSING_APT+=("$pkg")
  fi
done
if [ ${#MISSING_APT[@]} -gt 0 ]; then
  info "安装系统包: ${MISSING_APT[*]}"
  sudo apt-get install -y "${MISSING_APT[@]}"
fi
ok "git tmux curl"

# ── pnpm ──
if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm -v)"
else
  info "安装 pnpm..."
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
  ok "pnpm $(pnpm -v)"
fi

# ── Claude Code ──
if command -v claude &>/dev/null; then
  ok "claude $(claude --version 2>/dev/null || echo 'installed')"
else
  info "安装 Claude Code..."
  npm install -g @anthropic-ai/claude-code 2>/dev/null && ok "claude installed" || warn "claude 安装失败，可手动 npm install -g @anthropic-ai/claude-code"
fi

# ── Codex CLI ──
if command -v codex &>/dev/null; then
  ok "codex $(codex --version 2>/dev/null || echo 'installed')"
else
  info "安装 Codex CLI..."
  npm install -g openai-codex 2>/dev/null && ok "codex installed" || warn "codex 安装失败，可手动 npm install -g openai-codex"
fi

# ── 项目依赖 ──
if [ -d node_modules ]; then
  skip "node_modules 已存在"
else
  info "安装项目依赖..."
  pnpm install
fi

echo ""
echo "========================================="
echo "  安装完成"
echo ""
echo "  启动：  pnpm dev"
echo "  访问：  http://127.0.0.1:5173"
echo "========================================="
