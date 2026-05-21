# AI Task Workbench

在 Ubuntu 上管理 Claude + Codex 开发流程的本地工具。

## 安装（Ubuntu 一行命令）

```bash
bash install.sh
```

## 手动安装

需要：Node.js 22、pnpm、tmux、git、claude CLI、codex CLI。

```bash
pnpm install
pnpm dev
```

启动后访问 `http://127.0.0.1:5173`。

## 项目结构

| 目录 | 说明 |
|------|------|
| `apps/web/` | 前端页面 (React + Vite) |
| `apps/server/` | 后端 API (Fastify) |
| `packages/shared/` | 共享类型 |
| `packages/core/` | 核心逻辑 |
| `templates/prompts/` | skill prompt 模板 |
| `.tmp/` | 项目根目录下的状态文件 |
