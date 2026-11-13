# SilvaMux 视频接入

当前适配协议为 `ark-video`，默认模型 `doubao-seedance-2-0-260128`。

- 创建：`POST https://www.silvamux.com/api/v3/contents/generations/tasks`
- 查单：`GET https://www.silvamux.com/api/v3/contents/generations/tasks/{id}`
- 鉴权：后端 `Authorization: Bearer`，密钥来自 `SILVAMUX_API_KEY`。
- 2026-11-12：此账号文本请求成功；视频创建返回 HTTP 403 / `MODEL_ACCESS_DENIED`。尚未验证真实视频成片、480p可用性或视频价格。

## 本机启动

```sh
cd xinliu
node work/production-server.cjs
```

打开 http://127.0.0.1:8767/ 。后端加载 `backend/.env.local`。没有 `provider.local.json` 时按 `XINLIU_VIDEO_PROVIDER` 选择内置配置（未指定默认SilvaMux，本机当前选择Yunxin）；已有配置优先，避免覆盖既有供应商。

在 `.env.local` 配置以下变量（模板见 `.env.example`）：

```dotenv
SILVAMUX_API_KEY=填入你的密钥
XINLIU_VIDEO_CREDITS_PER_SECOND=
XINLIU_VIDEO_RESULT_ORIGINS=
```

`XINLIU_VIDEO_CREDITS_PER_SECOND` 必须填写核实后的正数估价，单位是工作台估价积分/输出秒。不是自动获取的供应商报价，也没有假定points与人民币兑换关系。留空时返回 `PRICE_UNKNOWN`，不调用收费接口。页面授权上限约束的是这次配置估价，并非供应商强制扣费上限。

`XINLIU_VIDEO_RESULT_ORIGINS` 填写供应商实际视频文件的HTTPS origin，多个值用逗号分隔。未确认结果存储域名之前保持为空；成功生成但域名未获允许时任务为 `result_unavailable`，错误会提示具体origin。核实后补充白名单并重启服务，再查单转存；不会重复生成。创建/查单仍使用提交时冻结的供应商配置。

如需自定义能力与报价，复制 `provider.silvamux.example.json` 为 `provider.local.json`。默认试运行仅开放480p，时长4–15整数秒，不声明专门动作迁移能力。增加分辨率前须核实模型权限和对应报价。

## 制作与费用

新建“直接做视频”默认4秒、480p、无声、单镜头。已有方案不会自动截短。“制作能力与独立策略”中可应用4秒规格：先保存历史、保留第一镜，修改后的方案重新核对确认。套用配方沿用其原始时长，可再显式改为短片规格。

商品、人物、服装图片转换为 `reference_image`，视频转换为 `reference_video`，声音转换为 `reference_audio`。输入顺序保持不变。图片可使用data URI，视频和音频需提供供应商可访问的授权HTTPS URL。本地文件不会公开暴露。生成声音默认关闭，选中的声音素材不会在无声模式下自动发送。

收费请求仍经过：素材授权 → 保存任务 → 报价 → 明确确认费用 → 提交一次。图片/无声模式使用 `price.creditsPerSecond`；有声模式须另配 `price.audioCreditsPerSecond`；含参考视频须另配 `price.referenceVideoCreditsPerSecond`，未知模式价格拦截，不套用基础价。报价是配置估算，实际费用须查供应商记录；本地预留不是钱包。

供应商创建仅返回`id`时任务进入排队；查单成功后读取`content.video_url`，转存MP4/WebM，再人工审片。HTTP 400/401/402/403/404/422/429明确拒绝进入`rejected`并释放本地估价预留；403权限不足显示开通模型提示。重复提交同任务不会重发。网络中断、超时或5xx保持`unknown`，有上游编号可查单，没有编号需人工核对。

## 验证

```sh
node --test backend/test/*.test.cjs
node work/build-production.cjs
node work/verify-generation-ui.cjs
```

浏览器验证优先使用 `work/ui-runtime` 的playwright-core，也可复用仓库 `fronted/node_modules`。macOS默认Chrome，Windows默认Edge；其他位置通过 `PLAYWRIGHT_CHROMIUM_PATH` 指定。所有验证使用本地HTTP模拟供应商，不消耗真实模型积分。
