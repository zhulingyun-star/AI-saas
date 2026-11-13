# 部署与运维

要求 Docker Engine 与 Compose v2。所有命令在仓库根目录执行。

```bash
cp deploy/.env.example deploy/.env
# 使用编辑器替换管理员与数据库密码
# 如部署 HTTPS，设置 COOKIE_SECURE=true

docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
docker compose --env-file deploy/.env -f deploy/compose.yml logs --tail=100 backend
```

浏览器访问 `http://127.0.0.1:8088`。默认仅监听主机回环，远程服务器可先用 SSH 本地端口转发访问。对外发布使用正式域名、HTTPS 和反向代理；如需改变监听地址，明确编辑 Compose ports。当前不包含云账号、域名或证书占位以外的自动发布操作。

后端镜像多阶段构建 Java 17 JAR，运行时安装 FFmpeg，以非 root 用户运行。前端通过 Node 20 构建，Nginx 提供静态资源、SPA 路由与同源 API 代理。后端和数据库不映射主机端口。健康检查依次等待数据库和应用就绪。

## 数据持久化与备份

`postgres-data` 保存数据库，`media-data` 保存上传素材、MP4、SRT。备份必须同时覆盖二者，否则记录与媒体可能不一致。建议在暂停写入窗口执行：

```bash
mkdir -p backups
docker compose --env-file deploy/.env -f deploy/compose.yml exec -T postgres pg_dump -U workbench -d workbench > backups/workbench.sql
# 如需一致快照，先暂停提交任务并等待正在运行的粗剪结束，再暂停后端写入
# 使用运维平台备份命名卷 media-data，或在 backend 容器内只读打包 /app/data/media
```

不要把包含用户数据的备份提交到 Git。恢复先停止后端，将 SQL 恢复到空 PostgreSQL 库，恢复对应媒体卷，再启动后端。迁移使用 Flyway，已有迁移不要改写，新增 V2/V3 文件演进。

```bash
# 正常停止，保留数据卷
docker compose --env-file deploy/.env -f deploy/compose.yml down
# 更新代码并部署
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

不建议对含正式数据的环境执行 `down -v`，它会删除命名数据卷。

## 故障定位

- 登录 403：从同一个 Nginx/Vite 地址访问；刷新获取新 CSRF token。HTTP 环境不要开启 secure cookie。
- 模型调用 502：核对 AI_MODE、地址、模型名称与密钥。不会向前端返回密钥或供应商原始错误。
- 制作 FAILED：核对素材是否可解码、FFmpeg 是否含 libx264、文件卷是否可写。单镜头处理有 180 秒超时，失败需重新提交。
- 服务重启：会话失效，需要重新登录；先前 RUNNING 作业标记失败，QUEUED 作业继续。已完成文件保留。
- 密码环境变量更新不生效：bootstrap 只在账号不存在时创建账号，不自动覆盖已有密码。正式密码管理界面待实现。

当前仅支持一个后端实例；请勿使用 `--scale backend=...`。多实例需要共享 Session、worker 租约/重启恢复和对象存储改造。
