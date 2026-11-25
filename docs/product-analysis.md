# 商品广告分析

来源流程参考（只读）：`G:/manjupingtai/mj_system/manjupingtai2/backend/app/services/ad_identify.py`、`backend/app/prompts/zh/ad_prompt.py`、`frontend/src/components/ad/IdentifyPanel.tsx`、`IdentifyEditor.tsx`。

本项目以 Java / React 实现核光影云程：整组带编号图片 + 商品说明 → 外观/细节/用法/证据/受众与广告建议 → 后台保存 → 人工编辑。使用现有 AI_MODE / AI_BASE_URL / AI_API_KEY / AI_MODEL；不复制来源项目凭据。

- 当前输入：最多 30 张商品图片，FFmpeg 生成长边 1024 的 JPEG 副本后内联发送；不修改原图。视频和音频不送入本版分析，界面明确提示。
- 信息分层：图片可见事实、用户说明、待验证主张、创意建议。功能功效不能凭图片认定。
- 新增 V4 product_analyses 表；以客户 + 商品组 ID 关联，保存来源快照、结果、说明、模型、状态、时间及版本。旧商品第一次分析时补稳定组 ID。
- 后台队列单任务运行，重复提交返回 409；刷新或关闭详情不影响任务。重启中断任务标记失败，可重试；失败保留旧结果。
- 编辑不调用模型，版本冲突返回 409。成功重新分析会替换手动修改，界面二次确认。资料变化显示过期提示。
- 来源图片通过保存时的素材 ID 关联，后续新增图片不会把旧分析指到另一张图。
- 暂不迁移原项目的操作视频裁剪、自动创意编排、生成片审核、复杂状态卡。分析目前作为可编辑商品资料保存，尚未自动注入脚本生成。

接口（均检查客户归属和 CSRF）：
GET /api/clients/{client}/product-groups/{asset}/analysis
POST 同上，{brief} 开始分析
PUT 同上，{revision,brief,report} 保存人工修改

验证：ProductAnalysisTest 使用本地 HTTP 模型桩验证消息、任务和持久化；WorkflowIntegrationTest 验证商品分组与封面；product-analysis.spec.ts 验证编辑保存刷新与重新分析确认。
