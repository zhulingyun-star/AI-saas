# API 约定

基础地址 `/api`，UTF-8 JSON。同源 HttpOnly Session Cookie 鉴权。读操作 GET；所有写操作必须先 GET `/auth/csrf`，从响应取得 `token` 和 `headerName`，并在请求头带回，登录和退出也不例外。CSRF token 属于当前 Session，退出后重新获取。错误统一尽可能返回 `{ "message": "可读的原因" }`。

| 接口 | 作用 |
| --- | --- |
| GET `/auth/csrf` | 获取匿名/登录会话 CSRF token |
| POST `/auth/login` | `{username,password}`，建立会话 |
| GET `/auth/me` | 当前用户 |
| POST `/auth/logout` | 注销并使会话失效，204 |
| GET `/system` | 当前 AI 模式与能力边界，不返回密钥 |
| GET / POST `/clients` | 当前用户的客户列表 / 新建 `{name,category}` |

以下接口均以 `/clients/{clientId}` 为前缀，服务端校验当前用户是否为客户所有者。错误客户、跨用户客户统一返回 404。

| 接口 | 作用 |
| --- | --- |
| GET `/overview` | 项目、素材、活跃任务、待审片数和操作记录 |
| GET / POST `/projects` | 列表 / 创建项目 |
| GET / PUT `/projects/{id}` | 读取 / 保存项目，revision 乐观锁 |
| POST `/projects/{id}/draft` | 根据已保存事实生成分镜草稿；不直接写库 |
| GET `/projects/{id}/export` | 当前项目 JSON 下载 |
| POST `/batch` | `{projects:[ProjectInput...]}`，最多 20 条，全成功或全回滚 |
| GET `/assets` | 当前客户全部素材元数据 |
| POST `/assets` | multipart：file、kind、sku、tags；单文件 100MB |
| PUT `/assets/{id}` | `{name,kind,sku,tags,metadata}` 编辑元数据 |
| GET `/assets/{id}/file` | 受保护媒体，可选 `?download=true`；支持浏览器媒体范围请求 |
| GET / POST `/jobs` | 产单列表 / 提交 `{projectIds:[id...],provider:"LOCAL"}` |
| GET `/jobs/{id}/script` | 提交时冻结的脚本快照 |
| GET `/jobs/{id}/file` | 输出文件，`?type=mp4或srt&download=true` |
| GET / POST `/jobs/{id}/reviews` | 审核记录 / `{timecode,decision,comment}` |
| GET / POST `/presets` | 列表 / `{name,kind,content,enabled}` |
| PUT `/presets/{id}` | 编辑或启用关闭客户预设 |
| GET `/metrics` | `{summary,rows}`，分母为零的派生指标为 null |
| POST `/metrics/import` | multipart CSV file，事务性导入 |

## ProjectInput

```json
{
  "name": "白T · 细节展示",
  "sku": "TEE-001",
  "category": "服饰鞋包",
  "platform": "抖音",
  "format": "细节演示",
  "duration": 15,
  "facts": "白色基础T恤，面料成分待确认。",
  "factsConfirmed": true,
  "shots": [{"duration":15,"visual":"展示领口与版型","narration":"先看衣服的细节","assetId":"当前客户实际素材ID","startAt":0,"locked":false}],
  "config": {"cta":"查看商品详情"},
  "revision": 0
}
```

duration 5–60 秒，最多 20 镜，每镜 1–60 秒；镜头非空时，总时长必须恰好等于项目 duration。创建时 revision=0，更新必须使用服务端返回的 revision，冲突返回 409。startAt 为视频素材起点（秒），图片会忽略该值。

## 分类与状态

- 素材 kind：`PRODUCT`、`REFERENCE`、`MODEL`、`GARMENT`、`VOICE`、`OTHER`。
- 预设 kind：`RULE`（编导规则）、`RECIPE`（项目配置 JSON）、`LOOK`（搭配参考 JSON）。
- 本地作业：`QUEUED → RUNNING → REVIEW → DELIVERED`，失败为 `FAILED`。
- 审核退回：`REVIEW / DELIVERED → CHANGES_REQUESTED`。修改项目后重新提交生成新的作业版本。
- 外部占位：provider=`VIDEO_API` → `BLOCKED`，无输出和真实扣费。
- 审核 decision：`COMMENT`、`CHANGES_REQUESTED`、`DELIVERED`。无实际输出的任务无法确认交付。
- 产单提交时保存完整项目快照；同时阻止同一项目重复活跃提交，版本按项目单调递增。批次提交最大 20 条，事务内校验。

## CSV

严格 UTF-8 表头：`materialId,impressions,clicks,spend,orders,revenue`，兼容 BOM 与 CSV 引号。数量为非负整数，本版本要求 clicks ≤ impressions、orders ≤ clicks；金额为非负、最多两位小数。最多 2MB / 10000 行。文件内重复 ID 拒绝；既有相同 ID 覆盖更新，其他 ID 保留。任何行失败，整个导入回滚。

当前素材 ID 是投放系统导出的业务 ID，以字符串存储，不自动认定为作业 ID。自动关联与千川授权为待实现项。CTR=Σclicks/Σimpressions；CPA=Σspend/Σorders；ROAS=Σrevenue/Σspend。

## 心流交互升级（V2）

原 `/projects` 保留为单条作品 API；新增 `/campaigns` 表示交付项目。已有作品通过 Flyway V2 自动建立 `work_flow` 行，不清空数据。

以下仍以 `/api/clients/{clientId}` 为前缀，均执行所有者权限校验和 CSRF 写入保护：

| 接口 | 请求与语义 |
| --- | --- |
| GET / POST `/campaigns` | 列表 / 创建 `{name,ownerName,dueDate,targetCount,brief,archived,revision}` |
| PUT `/campaigns/{id}` | 更新与归档，revision 条件写入，冲突 409 |
| GET `/works` | 作品、所属交付项目、责任人、阶段、截止、备注及 workflow revision |
| PUT `/works/{id}/flow` | `{campaignId,assignee,phase,dueDate,note,revision}` |
| POST `/works/bulk-flow` | `{items:[{projectId,flow:上述对象}]}`，最多 100 条，事务内全成功或回滚 |
| GET / POST `/team` | 分工联系人列表 / 创建 `{name,responsibility}`，不会建立新登录账户 |
| POST `/projects/{id}/variants` | `{scenes:["办公室","居家窗边"]}`，最多 3 条草稿，保存来源与版本，不自动提交生成 |

工作流阶段 PLAN、MATERIALS、PRODUCTION、EDIT、REVIEW、CHANGES 可人工保存。WAITING_SYSTEM 从真实活跃任务派生；DELIVERED 由真实结果审核产生，手动设置拒绝。项目交付数按曾通过交付审核的不同作品计数，同作品多次出片不重复计数。新的失败或草稿不删除旧的固定交付文件。

`config.campaignId` 与 `work_flow.campaign_id` 同步；修改分工也递增作品 revision。不同客户项目/作品引用会被拒绝。预设新增 FAVORITE 类型保存拍法收藏；原 RULE / RECIPE / LOOK 保留。
