# 光影云（AI-saas）

**光影云** 是面向品牌与 DP 电商内容组的电商内容生产工具：从商品事实、真实素材到分镜编导、批量排产、本地粗剪、审片交付与投放复盘。

| 实现 | 目录 | 说明 |
| --- | --- | --- |
| **光影云全栈版（当前主线）** | `fronted/`、`backend/`、`deploy/` | React 19 + Java 17 / Spring AI + Docker，启动说明见下文 |
| 旧版工作台（代号「心流」，仅存档） | [`xinliu/`](./xinliu/README.md) | 早期本地工作台实现，保留作历史参考，**不再是主线，新开发请勿基于此目录** |

---

## 光影云全栈版（当前主线）

2026-11-11：按新交互改造原有 React 和 Java 项目，新增交付项目、作品分工、样片套用、逐镜方案、场景变体与保存冲突恢复。升级说明见 [fronted/README.md](fronted/README.md)。`xinliu/` 为旧版参考实现，与本全栈实现分别启动。

从商品事实、真实素材到分镜编导、批量排产、本地粗剪、审片交付与投放复盘的全栈 MVP。原型 HTML、截图和产品说明保留在根目录与 `production-workbench/`，新应用独立实现，业务数据保存到服务端。

### 目录与技术栈

```text
fronted/     React 19 + TypeScript + Vite + React Query，按要求保留 fronted 拼写
backend/     Java 17 + Spring Boot 3.5.7 + Spring AI 1.1.0 + Spring Security
             JDBC + Flyway，开发使用 H2 文件库，部署使用 PostgreSQL 16
deploy/     Dockerfile + Docker Compose + Nginx
```

### 本地启动

需要 Java 17、Maven 3.8+、Node.js 20.19+。仓库提供 Maven Central 配置与 npm 官方源配置，避免继承不可达的全局镜像；企业网络可按需替换。真实粗剪还需要 FFmpeg（支持 libx264）；未安装时仍可使用其他模块，制作任务会如实显示失败原因。

终端一：

```bash
cd backend
mvn -s maven-settings.xml test
mvn -s maven-settings.xml spring-boot:run
```

终端二：

```bash
cd fronted
npm ci
npm run dev
```

访问 http://127.0.0.1:5173 。开发环境首次启动账号：`admin`，密码：`change-me-local`。前端通过 Vite 代理 `/api`，后端默认 8080。不要直接在不同端口跨域调用 API。

默认数据：两个空客户空间及“商品事实优先”规则。上传文件和实际指标均不预造。开发数据库位于 `backend/data/workbench.mv.db`，文件位于 `backend/data/media/`。这些目录不提交 Git。

macOS 可用 `brew install ffmpeg`；也可通过 `FFMPEG_PATH=/absolute/path/to/ffmpeg` 指定已有程序。FFmpeg 在 Docker 后端镜像中自动安装。

### Docker 启动

```bash
cp deploy/.env.example deploy/.env
## 编辑 deploy/.env，替换 ADMIN_PASSWORD 和 DATABASE_PASSWORD
## ADMIN_PASSWORD 至少 12 位

docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
```

访问 http://127.0.0.1:8088 ，使用 `.env` 中的管理员凭据。仅 Nginx 暴露回环端口，后端和数据库通过 Compose 私网通信。需要对外提供服务时，在前方配置域名和 HTTPS 反向代理，设置 `COOKIE_SECURE=true`。不要把 Spring Boot 或 PostgreSQL 端口直接映射公网。

首次启动自动建库、执行迁移和初始化管理员。**管理员已存在时，不会因修改环境变量而重置密码**。当前版本没有自助注册、忘记密码或团队邀请界面。

### 可走通的流程

1. 登录，选择客户；也可新建空客户空间。
2. 在商品与素材上传图片/视频，填写 SKU、标签；可预览和下载真实文件。
3. 创建内容项目，填写商品事实并人工确认；选择拍法、平台、时长和出镜参考。
4. 生成本地规则草稿，或启用 Spring AI 编导；编辑分镜、时长、台词、素材及片段起点，锁定满意镜头。
5. 各镜头时长之和须等于成片时长。为每一镜选择真实图片或视频，再提交“本地素材粗剪”。
6. 队列异步处理，输出 **720×1280、25fps、无音轨的 MP4** 和独立 **SRT 字幕**。不是 AI 生成画面，也不将参考人物或声音自动合成到视频。
7. 审片时记录时间码和意见，退回修改或确认交付；下载 MP4/SRT。项目修改后可再次提交，新版本保留旧快照和审核记录。
8. 导入 CSV 投放报表，按素材 ID 覆盖更新，计算汇总 CTR、订单成本和 ROAS。

其他模块：模特与授权信息、分部位服装搭配（同部位/整身互斥）、真人声音试听、参考视频真实抽帧与人工改编、客户规则/配方、最多 20 条的原子批量建稿。

### Spring AI 配置

默认 `AI_MODE=local`：使用明确标注的本地规则草稿，无模型调用。启用真实文本模型：

```bash
export AI_MODE=openai
export AI_BASE_URL=https://your-openai-compatible-provider.example
export AI_API_KEY=replace-with-provider-key
export AI_MODEL=replace-with-model-id
cd backend
mvn -s maven-settings.xml spring-boot:run
```

Docker 中在 `deploy/.env` 配置相同变量，再重建后端容器。`AI_BASE_URL` 通常填写 API 主机或 `/v1` 基址，不包含 `/chat/completions`；密钥只进入后端，不返回浏览器。

文本模型通过 `AI_MODE=openai`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL` 配置。Seedance 视频生成单独通过 `VIDEO_API_ENABLED=true`、`VIDEO_API_BASE_URL`、`VIDEO_API_KEY`、`VIDEO_API_MODEL`、`VIDEO_API_SIZE` 配置。当前视频接口使用 NewAPI JSON：`POST /videos`（`model/prompt/duration/ratio/resolution/referenceImages`）、`GET /videos/{id}`、`GET /videos/{id}/content`。最终出片的商品图片通过私有 OSS 限时链接提交，凭据保存在本地 `deploy/oss.env`；读片与文案识别仍使用 Base64。详见 [二创文案与出片](docs/remake-copy-and-generation.md)。提交视频任务会产生供应商费用，工作台会再次确认；请求超时或任务状态不明时不会自动重发。启用前先核对供应商兼容契约及模型规格/价格。

`AiService` 使用 Spring AI `ChatClient` / `OpenAiChatModel`，以结构化输出生成分镜；启用客户规则、传入已确认商品事实、保留锁定镜头，并校验镜头数量、长度和总时长。生成结果只写入编辑器，人工保存后才更新项目。接口失败不会用本地草稿掩盖失败。

Spring AI 与 Boot 的版本配对参考 [Spring AI 官方说明](https://github.com/spring-projects/spring-ai/tree/1.1.x)。选用 Java 17 兼容的 1.1.x / Boot 3.5.x 组合，不依赖需要更高 Java 版本的主线升级。

### 环境变量

| 名称 | 默认值 / 用途 |
| --- | --- |
| `PORT` | 8080，后端端口 |
| `DATABASE_URL` | H2 文件库；Compose 设置为 PostgreSQL JDBC URL |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | 数据库账号与密码 |
| `STORAGE_PATH` | `./data/media`，上传和产物目录 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 首次启动的管理员凭据 |
| `AI_MODE` | `local` 或 `openai` |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | 文本编导模型配置 |
| `FFMPEG_PATH` | `ffmpeg`，可设置绝对路径 |
| `COOKIE_SECURE` | 开发 HTTP 为 false，HTTPS 部署为 true |
| `HTTP_PORT` | Compose 对外回环端口，默认 8088 |

### 验证

```bash
cd backend
mvn -s maven-settings.xml test
mvn -s maven-settings.xml package

cd ../fronted
npm ci
npm run build
npx playwright install chromium
## 确保前后端均已启动，后端已配置 FFmpeg
npm run test:e2e
```

端到端测试使用开发账号，可通过 `E2E_USERNAME`、`E2E_PASSWORD`、`E2E_BASE_URL` 覆盖；`PLAYWRIGHT_CHROMIUM_PATH` 可指向本机兼容 Chromium。测试会在当前数据库创建测试项目、上传文件和交付记录，请对测试环境执行。

API 路由和请求格式见 [backend/API.md](backend/API.md)，部署与备份见 [deploy/README.md](deploy/README.md)，实现边界与验证结果见 [IMPLEMENTATION.md](IMPLEMENTATION.md)。

### 当前边界

- 外部视频生成供应商是明确的占位接口：`VIDEO_API` 任务进入 `BLOCKED`，不假装出片、不扣费。
- ASR/OCR/自动切镜、换装/身份一致性生成、TTS/声音克隆、音轨混音、支付计费、千川授权均待真实供应商配置和后续实现。
- 当前为单组织管理员管理多个客户；服务端按客户所有者做权限校验。团队角色、邀请、SSO 和跨用户共享尚未实现。
- Session 保存在进程内，重启需要重新登录；作业为数据库队列、单 worker 顺序执行。当前按单后端实例部署，不支持多实例滚动扩缩容。
- 文件存储为本地卷；对象存储、存储配额、媒体内容扫描、限流和运营级审计尚待完善。镜头素材按 MIME 与文件格式白名单接受，FFmpeg 在处理时进一步验证可解码性。
- 示例图片沿用原型的 Unsplash 素材，仅用于界面演示，不代表品牌合作或商业人物授权；产品/设计出处见原有说明文件。
