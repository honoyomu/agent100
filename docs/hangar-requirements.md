# Agent100 对 Hangar 的需求

## 背景

Agent100 是一个内部 POC，主要目的是测试 Hangar。用户在 dashboard 上一键部署 coding agent（Claude Code、Codex、OpenCode、Hermes），**每个 agent 对应一台 Hangar machine**。

- 我们的后端用一个 Hangar 账号管理所有 machine：每种 harness 一个 image，从 image 创建 machine。
- 浏览器不直接连 Hangar。后端经 SSH gateway 连进 machine：终端类 agent 走 pty，自带 web UI 的 agent 走 direct-tcpip 端口转发，再由后端代理给用户。
- agent 空闲时我们调 suspend，用户再打开时调 start。

现有 API（machines、operations、images、connections，以及 gateway 的 pty 和端口转发）**已经能跑通终端类 agent**。下面是还缺的部分，按优先级排列。

---

## 1. 服务端用的 API key（最需要）

**现状：** 只能走 GitHub device flow 登录，拿到 1 小时有效的 access token，加上 30 天有效、每次刷新都会换新的 refresh token。

**问题：** 我们的后端是长期运行的服务，只能自己做 refresh 轮换，还要跨进程加锁。只要有一次"刷新成功了、但新 token 没存下来"（进程崩溃或网络中断），整组 token 就作废了，只能人工重新走 device flow。30 天没有刷新也会过期。

**希望：**
- 长期有效、可以撤销的 API key（比如 `hgk_…`），直接放在 `Authorization: Bearer` 里用。
- 最好能限定权限：只能管理自己的 machine 和 image，不能调 admin 接口。
- 在 dashboard 或 CLI 里可以创建和撤销。

## 2. HTTP 预览 URL（OpenCode、Hermes 这类自带 web UI 的 agent 需要）

**现状：** 只能用 SSH 端口转发，由我们的后端做反向代理。

**问题：**
- web UI 是 SPA，资源和 API 都用绝对路径，挂在 `/agents/:id/` 这样的子路径下会出错，必须给每个 agent 一个独立的 host。
- 我们部署所在的平台不支持通配符子域名，所以这件事只能由 Hangar 来做。

**希望：**
- 形如 `https://<machineId>-<port>.<hangar 域名>`，用通配符证书。
- 支持 HTTP、SSE 和 WebSocket，长连接能保持几个小时。
- 默认不公开。比如 `POST /v1/machines/{id}/previews { port, ttlSeconds }` 返回一个一次性的签名 URL，浏览器第一次打开后在该 host 下种 cookie，之后的请求和 WebSocket 都靠这个 cookie。
- machine 处于 suspend 状态时，返回明确的状态码或提示页（如果能做成可选的"自动 start"更好）。

## 3. machine 的 labels/metadata

希望创建时可以传 `labels: { agentId, userId }`，列表接口支持按 label 过滤，方便我们对账和清理孤儿 machine。现在的临时做法是把 agentId 编进 `name`。

## 4. 更高的配额（POC 之后再说）

所有用户的 agent 都在同一个账号下，`maxMachinesPerUser = 10` 意味着整个产品最多只能有 10 个 agent。POC 阶段够用，正式测试前需要能按账号放宽（比如 100）。

`maxImagesPerUser = 10` 也是同样的情况：每种 harness 一个 image，每次升级 CLI 都会多出一个版本。

## 5. 有了更好（nice to have）

- **HTTP 的 exec API**：`POST /v1/machines/{id}/exec { argv, env, cwd, stdin, timeoutSeconds }`，返回 stdout、stderr 和 exitCode。这样初始化时（写配置、启动服务）就不用走 SSH。
- **创建时传 env 或 user-data**：类似 cloud-init，第一次启动时执行一次。
- **声明式构建 image**：用 Dockerfile，或者 base template 加一个 setup 脚本。agent CLI 基本每周发版，这样重建 image 更方便。
- **operation 完成时的 webhook**：现在只能轮询。
- **fork 运行中或已 suspend 的 machine**：将来用来"克隆 agent"。

## 6. 使用中的反馈

- **gateway 只提供 ed25519 主机证书**（`ssh-ed25519-cert-v01@openssh.com`）。Node 最常用的 SSH 库 ssh2 既不支持主机证书，也不支持用户证书登录，我们是自己给它打了补丁才连上的。如果 gateway 同时提供一个普通的 host key（客户端照样可以用 known_hosts 固定它），或者在文档里给出 Node/Python 的接入示例，其他接入方会省事很多。

## 实测数据（2026-10-04，2 vCPU / 4 GiB）

| 操作 | 耗时 |
| --- | --- |
| 从 image 创建 machine（create operation） | 约 4 秒 |
| 从点击部署到 agent 可用（含 ready 检查和 SSH 初始化） | 11–12 秒 |
| suspend | 约 6 秒 |
| 从 suspend 打开终端（start 加 SSH 连接，进程保留） | 约 2 秒 |
| 构建一个 harness image（开机、安装、stop、保存） | 约 1.5 分钟 |

---

## 想确认的问题

1. **容量**：同时能跑多少台 2 vCPU / 4 GiB 的 machine？
2. **耗时和保留期**：suspend 和 start（从 suspend 恢复）一般要多久？suspend 状态的 machine 能保留多久？
3. **SSH 长连接**：gateway 对长连接有没有空闲超时？证书过期后，已经建立的连接会不会被断开？（文档里说只在握手时检查证书。）
4. **频繁操作**：我们会比较频繁地 suspend 和 start（空闲 30 分钟就 suspend）。有没有频率限制，或者需要注意的副作用？
