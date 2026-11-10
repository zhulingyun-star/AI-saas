# 心流

品牌与 DP 电商内容组的视频制作工作台：交付项目、当前待办、生成任务三层关联。

## 启动

需要 Node.js 22+，建议 Node.js 24。

```sh
cd xinliu
node work/production-server.cjs
```

打开 http://127.0.0.1:8767/#projects 。

Windows 可双击 `outputs/启动网站.cmd`；升级后重启使用 `outputs/重启心流服务.cmd`。仅绑定本机回环地址，不直接发布公网。

`outputs/电商生产台.html` 为离线前端，出片必须通过网站访问 API。

## 供应商接入

- 文档：http://127.0.0.1:8767/api.html
- OpenAPI：http://127.0.0.1:8767/api/openapi
- 健康检查：http://127.0.0.1:8767/api/health

流程：上传素材 → 保存任务 → 报价 → 明确授权 → 提交 → 查单 → 转存结果 → 人工审片。

复制 `backend/provider.example.json` 为 `backend/provider.local.json`，按正式供应商文档配置模型 ID、创建/查单路径、能力、价格和返回字段。密钥放在 `backend/.env.local` 或环境变量，模板为 `backend/.env.example`。

`xinliu-bridge` 是本系统的适配契约，不是 Seedance 官方接口。未配置、报价未知或动作迁移能力不足时不调用模型。超时保持未知，不自动重发。

## 构建与验证

```sh
node work/build-production.cjs
node --test backend/test/server.test.cjs
npm ci --prefix work/ui-runtime
node work/verify-generation-ui.cjs
```

浏览器验证目前默认使用 Windows Microsoft Edge。其他验证要求预览服务已启动：

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

当前不是生产多人 SaaS；服务端会话用于本机单操作者测试，演示角色不是多租户鉴权。上线仍需真实身份与权限、数据库、共享存储、队列、对账及安全审查。

SVG 为原创界面示意。商品与人像照片仅用于界面示例，不默认授权商业广告。WebM 为已有图片/字幕的本地粗剪，仅作自动测试，不是 Seedance 生成。

真实密钥、客户数据、浏览器登录记录、依赖目录、日志和测试导出包均不包含在本次提交中。

Wan2.2、Prompt-Relay 与火山引擎 SDK 仅作研究参考，未复制模型权重或商业服务。Unslop 设计参考 Damir Sokolovsky（@heydamir），CC BY 4.0。

详细说明：`outputs/production-workbench/心流出片接口与策略说明.md`。
