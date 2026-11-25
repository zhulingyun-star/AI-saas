> ⚠️ 本目录为旧版工作台（内部代号「心流」）存档。产品已统一更名为 **光影云**，当前主线为根目录 ronted/ + ackend/ 全栈版，启动与部署说明见根 README。新开发请勿基于本目录。

# 心流

品牌与 DP 电商内容组的视频制作工作台：交付项目、当前待办、生成任务三层关联。

新开发对话先读：[产品全景与开发交接](./outputs/心流_产品全景与开发交接_20261111.md) 和 `AGENTS.md`。2026-11-11 UI版减少口号与重复说明，用布局、状态和主操作组织页面，保留事实与费用授权。

## 启动

需要 Node.js 22+（本机Node 20.19亦已通过验证）、JDK 17+。后端已使用H2文件数据库，驱动与迁移说明见 [本地存储](./backend/STORAGE.md)。

```sh
cd xinliu
node work/production-server.cjs
```

打开 http://127.0.0.1:8767/#projects 。

Windows 可双击 `outputs/启动网站.cmd`；升级后重启使用 `outputs/重启心流服务.cmd`。仅绑定本机回环地址，不直接发布公网。

`outputs/电商生产台.html` 为离线前端，出片必须通过网站访问 API。

## 本地数据

后端任务、素材索引、报价与事件保存在 `backend/data/xinliu.mv.db`（H2），媒体保存在 `backend/data/files/`。首次启动自动导入旧 `state.json` 并保留原文件；浏览器中的客户、作品与分工数据保持原存储。

## 供应商接入

支持 [Yunxin / SilvaMux 独立provider](./backend/PROVIDERS.md)，可按文本、图片理解、视频分别选择；本机先使用Yunxin，凭据只保存在被忽略的`.env.yunxin.local`。

已增加 [SilvaMux / Seedance 2.0 适配](./backend/SILVAMUX.md)，默认新建短片为4秒、480p、无声。当前账号视频权限仍待开通；未确认价格不会提交收费任务。

- 文档：http://127.0.0.1:8767/api.html
- OpenAPI：http://127.0.0.1:8767/api/openapi
- 健康检查：http://127.0.0.1:8767/api/health

流程：上传素材 → 保存任务 → 报价 → 明确授权 → 提交 → 查单 → 转存结果 → 人工审片。

参考片可拆解、选镜头并建立独立改编草稿，支持8秒测试规格。真实参考视频需HTTPS输入；本地文件可按授权使用[临时私有OSS暂存工具](./backend/REFERENCE-STAGING.md)，目前由操作者手动执行。

复制 `backend/provider.example.json` 为 `backend/provider.local.json`，按正式供应商文档配置模型 ID、创建/查单路径、能力、价格和返回字段。密钥放在 `backend/.env.local` 或环境变量，模板为 `backend/.env.example`。

默认无自定义配置时使用内置 `ark-video` SilvaMux 适配；可用 `backend/provider.silvamux.example.json` 配置更详细的能力与报价。原 `xinliu-bridge` 是本系统的适配契约，不是 Seedance 官方接口。未配置、报价未知或动作迁移能力不足时不调用模型。超时保持未知，不自动重发。

## 构建与验证

当前覆盖范围和未测边界见 [功能测试覆盖报告](./功能测试覆盖报告.md)。

```sh
node work/build-production.cjs
node --test backend/test/*.test.cjs
npm ci --prefix work/ui-runtime
node work/verify-all.cjs
```

完整回归使用独立临时H2及全新浏览器数据，不加载真实供应商凭据，也不修改当前项目。结果写入被忽略的 `work/test-results/`。macOS默认Chrome，Windows默认Edge，可通过 `PLAYWRIGHT_CHROMIUM_PATH` 指定浏览器。下面的单项脚本默认使用8767预览服务，也可通过 `XINLIU_TEST_BASE_URL` 指定测试服务：

```sh
node work/verify-production-flow.cjs
node work/verify-production-guardrails.cjs
node work/verify-collaboration.cjs
node work/verify-reference-variants.cjs
node work/verify-workspace.cjs
node work/verify-production-offline.cjs
```

## 目录

- `backend/`：联调 API、配置模板、接口规范和测试。
- `outputs/production-workbench/`：页面源码、提示词策略、示例素材和接入说明。
- `outputs/电商生产台.html`：包含脚本、样式和示例图片的离线版本。
- `work/`：启动、构建和验证脚本，不含浏览器档案或研究临时文件。

## 边界与素材

当前阶段不接入支付、充值、钱包、订阅购买或退款，不列入交付验收。模型调用仍保留估价、费用授权与调用记录，供应商费用人工核对。

当前不是生产多人 SaaS；服务端会话用于本机单操作者测试，演示角色不是多租户鉴权。上线仍需真实身份与权限、服务端完整业务数据建模、共享存储、队列、对账及安全审查。

SVG 为原创界面示意。商品与人像照片仅用于界面示例，不默认授权商业广告。WebM 为已有图片/字幕的本地粗剪，仅作自动测试，不是 Seedance 生成。

真实密钥、客户数据、浏览器登录记录、依赖目录、日志和测试导出包均不包含在本次提交中。

Wan2.2、Prompt-Relay 与火山引擎 SDK 仅作研究参考，未复制模型权重或商业服务。Unslop 设计参考 Damir Sokolovsky（@heydamir），CC BY 4.0。

详细说明：`outputs/production-workbench/心流出片接口与策略说明.md`。
