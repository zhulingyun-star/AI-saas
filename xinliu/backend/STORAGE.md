# H2 本地存储

当前Node后端使用H2 2.3.232文件数据库，文件为 `backend/data/xinliu.mv.db`。媒体文件仍在 `backend/data/files/`。H2只通过后端的Java JDBC子进程访问，不开放数据库TCP端口或Web控制台。

这是最小迁移：`workbench_state` 表保存单条完整状态快照（CLOB），内容包括assets、tasks、quotes、reservations和events。每次更新通过事务提交，提交授权记录成功后才调用供应商。仍是单进程内存业务模型，尚未拆成独立实体表或支持多实例并发。

## 环境与启动

需要Node.js及 **JDK 17+**。H2驱动依次从以下位置读取：

1. `XINLIU_H2_JAR` 指定的本地JAR。
2. `backend/.runtime/h2-2.3.232.jar`。
3. 本机Maven缓存 `~/.m2/repository/com/h2database/h2/2.3.232/h2-2.3.232.jar`。

本机已具备JDK和Maven缓存，无需额外下载。其他机器可先运行：

```sh
node xinliu/work/install-h2.cjs
node xinliu/work/production-server.cjs
```

安装脚本从Maven Central获取固定版本驱动，并验证SHA-256。驱动缓存与数据库文件被Git和Docker构建上下文忽略。可通过被忽略的 `.env.local` 配置 `XINLIU_H2_PASSWORD`；不在代码或命令行中写数据库密码。`XINLIU_JAVA` 可指定Java可执行文件。

`GET /api/health` 返回 `database: "H2"`。服务启动会先加载数据库，失败则停止启动，不回退到JSON写入。退出服务会关闭JDBC连接；第二个进程无法同时打开该文件数据库。

## 迁移与备份

- 仅在H2状态表没有初始化记录时读取旧 `state.json`。
- 导入后事务提交；原JSON保持原样作为迁移前备份，不再更新。
- 以后启动以H2为准，不反复导入JSON或复活已删除记录。
- 旧JSON无效时拒绝启动，保留原文件供修复。
- 重启时尚在提交的任务恢复为unknown，不自动重发收费请求。

备份前停止服务，同时备份 `xinliu.mv.db` 与 `files/`。原 `state.json` 只是迁移前备份，不包含新数据。回滚数据库前应保留当前库副本，避免丢失迁移后的任务与费用记录。

本次迁移范围仅为后端状态。浏览器中的客户、作品、分工等仍使用localStorage/IndexedDB，尚未迁移至服务端数据库；实际图片/视频保留文件存储。

## 验证

```sh
node --test xinliu/backend/test/*.test.cjs
node xinliu/work/verify-generation-ui.cjs
```

测试使用真实临时H2数据库，覆盖旧JSON一次导入、原文件保留、重启恢复、无效数据拒绝、双进程锁定，以及原有供应商授权和任务流程；模型调用仅使用本地模拟。
