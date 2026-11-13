# 模型供应商配置

`providers.cjs` 负责按用途选供应商；`yunxin.cjs` 与 `silvamux.cjs` 各自定义地址、模型、凭据变量与估价。`ark-video.cjs` 仅共享视频协议的数据结构，不共享凭据或渠道选择。

## 切换

后端先加载 `.env.local`，再加载 `.env.yunxin.local`；启动进程已有环境变量优先。每种用途独立选择：

```dotenv
XINLIU_TEXT_PROVIDER=yunxin
XINLIU_VISION_PROVIDER=yunxin
XINLIU_VIDEO_PROVIDER=yunxin
```

将单项改为 `silvamux` 可切回。未支持的用途不借用另一家Key；未知provider报错。现有 `provider.local.json` 仍优先于环境选择，需沿用独立keyEnv，不把Key直接写到provider对象。

| 供应商 | 用途 | 协议 / 默认模型 | 凭据变量 |
| --- | --- | --- | --- |
| Yunxin | 文本、图片理解 | Gemini原生 / gemini-3.8-flash | YUNXIN_TEXT_KEY |
| Yunxin | 视频 | Ark / doubao-seedance-2-0 | YUNXIN_VIDEO_KEY |
| SilvaMux | 视频 | Ark / doubao-seedance-2-0-260128 | SILVAMUX_API_KEY |

Yunxin端点与渠道来自本机lightshadow的 `CommerceModelGateway.java` 与配置：文本保留 `/hub/v1beta/models/{model}:generateContent`，视频保留 `/hub/volcengine/api/v3/contents/generations/tasks` 前缀。视频使用internal-yumi渠道，不借用GPT或其他账号Key。没有复制lightshadow整份配置、业务代码或客户数据。

## 凭据与仓库

后续模型、数据库、对象存储和其他第三方凭据统一遵循此约定：使用本地 `xx.env`（如 `storage.env`）或现有 `.env.*` 文件；Git与Docker均忽略真实凭据文件，只提交空值的 `xx.env.example` 模板。新增文件需显式配置后端加载，文件名被忽略不代表会自动加载。凭据文件权限设为0600，不放入前端资源或交付包。

Yunxin真实Key仅存在于 `backend/.env.yunxin.local`，权限0600，已被Git与Docker构建上下文忽略。模板 `.env.yunxin.example` 只包含空凭据，可以提交。密钥不进入前端、任务JSON、报价、接口配置摘要或文档。源lightshadow配置保持原样，不将其内嵌凭据带入当前仓库可提交文件。

## 费用与状态

本机估价从lightshadow业务价格表提取：文本编导6积分/次、图片理解6积分/次、480p视频3积分/秒，参考视频模式2积分/输出秒。它们是业务积分估价，不是Yunxin实际扣费，不表示积分与货币的换算关系。无声4秒单次估价为12积分；实际请求仍需页面逐次授权。有声价格未确认，留空时拦截有声生成。部署到别处时空模板不自带这些估价。

默认输出仍为4秒、480p、无声、单镜头。结果域名须通过 `YUNXIN_VIDEO_RESULT_ORIGINS` 核实配置，未知域名阻止转存并提示具体origin，补充后可查单恢复，不重新生成。

已提交任务冻结provider与模型配置，之后切换供应商仍使用原渠道Key与查单路径。Key值本身不写入快照。网络错误不自动切换到其他供应商或重发，避免重复收费。Gemini截断或空答案不自动采用，也不会自动进入视频生成。

2026-11-12：已完成一次用户授权的Yunxin Seedance 2.0真实视频流程，传入5张商品参考图，仅创建1个上游任务。成片已转存并回填，实际4.04秒、496×864、无音轨。本地估价12业务积分，实际供应商扣费仍待对账；首帧、中段、尾帧已检查，保留待审片。结果使用的精确存储origin已加入本机忽略的env配置。

2026-11-13：另经明确授权，以5张商品图加裁切去声参考视频完成1条真实参考改编。请求8秒、480p、9:16、无声，本地估价16业务积分；实际8.04秒、496×864、无音轨，已转存、回填及保存检查。私有OSS临时参考对象已删除，实际供应商/存储费用待对账。未新增有声或批量能力验证。
