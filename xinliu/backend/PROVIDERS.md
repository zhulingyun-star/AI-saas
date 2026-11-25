# 模型供应商

仅使用SilvaMux，旧渠道适配与环境选择已移除。

- 固定Origin：https://www.silvamux.com，代码位于silvamux.cjs。
- 文本编导、图片/视频理解：doubao-seed-2-1-pro-260628，/api/v1/chat/completions。
- 视频生成：doubao-seedance-2-0-260128，/api/v3/contents/generations/tasks。

Key、URL、模型与业务估价统一位于后端silvamux.private.cjs，不随仓库管理，Git/Docker忽略，权限0600。该模块仅后端导入；Key只用于固定origin的鉴权头，不放provider profile、H2、报价、前端或日志。不读取模型环境变量。

pricing.text/vision是每次业务估价；videoPerSecond/referenceVideoPerSecond/audioPerSecond是各视频模式每输出秒估价。空值拦截，不继承其他渠道价格；变更后重启且重新报价授权。

2026-11-25只读模型列表核对ID后，以4秒苹果测试片执行一次真实视频理解，HTTP200、finish_reason=stop，观察到红苹果、浅色台面、持续推镜、无切换，与视频一致，总用量4596 tokens，不据此推算金额。记录在忽略的data/silvamux-probe。图片理解已实现image_url输入，尚未另行真实调用；本次未新增视频生成。

视频理解支持16MB内已上传本地文件，通过video_url.data URI发送；页面选1–5条逐条报价授权，返回只保存知识草稿，截断/未知停止后续且不重发。费用授权、会话、CSRF、客户素材范围和幂等检查保留。

model-protocols.cjs保留供应商无关的协议辅助函数作测试兼容，不含旧渠道URL或Key。历史任务保留原快照，成功结果仍可读取；移除渠道的未完成任务不请求、不借用SilvaMux凭据。模拟测试通过options.providers及allowFixture注入，生产不接受其他渠道。
