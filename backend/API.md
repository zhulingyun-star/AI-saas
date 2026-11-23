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

## 商品库（V8）

以下仍以 `/api/clients/{clientId}` 为前缀，均校验客户所有者，写操作需要 CSRF。商品仍由同一 `productGroupId` 的素材组成，`{anchor}` 为该商品任意一个素材 ID；写操作会在缺少 `productGroupId` 的旧商品上自动补上。

| 接口 | 请求与语义 |
| --- | --- |
| GET `/product-library` | `{folders:[{id,parentId,name,sortOrder,revision}], products:{商品键:{groupId,anchorId,folderId,analysis,reviewed,confirmed,understandingSaved,personaCount,projectCount}}}`。商品键与前端分组一致（`group:ID` / `sku:` / `name:` / `asset:`）；`analysis` 为分析状态摘要（status、revision、analyzedAt、stale、category、confirmCount、unverifiedCount、provableCount、riskCount），没有分析时省略 |
| POST `/product-folders` | `{name,parentId?}` 新建文件夹。最多两层；同一客户内名称唯一；`全部商品`、`未分类`、`待核对` 为固定分类，不能用作名称 |
| PUT `/product-folders/{id}` | `{name,revision}` 改名，revision 不一致返回 409 |
| DELETE `/product-folders/{id}` | 只能删除没有子文件夹、没有商品的文件夹，204 |
| PUT `/product-groups/{anchor}/folder` | `{folderId}` 移动商品；`folderId` 为空表示放回未分类。一个商品只在一个文件夹 |
| PUT `/product-groups/{anchor}/review` | `{confirmed:[条目键...],reviewed}` 保存分析核对进度；`reviewed=true` 记录本次分析时间，重新分析后自动回到待核对 |
| GET `/product-groups/{anchor}/understanding` | 商品理解与目标人群。未保存时 `understanding` 为根据商品分析确定性推导的内容（`source=DERIVED`，`saved=false`），`personas` 为推导出的建议人群（无 id，`personasSaved=false`） |
| PUT `/product-groups/{anchor}/understanding` | `{understanding:{core,sub,pain,obj,scene,when},revision}`；首次保存 revision=0，之后用返回的 revision，冲突 409。每类最多 12 个标签、每个最多 60 字 |
| POST `/product-groups/{anchor}/understanding/extract` | `{revision}` 重新提取。配置了文字模型时调用 AiService（结果中出现分析里没有的价格、优惠、功效、产地等字眼会被丢弃，`source=AI`）；`AI_MODE=local` 时按分析结果确定性推导（`source=DERIVED`）。没有分析结果返回 400 |
| POST `/product-groups/{anchor}/personas/adopt` | 把建议人群写入库；已保存过人群的商品不会重复写入 |
| POST `/product-groups/{anchor}/personas` | `{name,pain,want,tone,scene,worry,hooks}` 新增人群（未保存过时先采用建议人群）。每个商品最多 12 个 |
| PUT `/product-groups/{anchor}/personas/{id}` | `{persona:{...},revision}` 修改，冲突 409 |
| DELETE `/product-groups/{anchor}/personas/{id}` | 删除人群，返回最新的商品理解与人群 |

商品理解分类：`core` 核心卖点、`sub` 次要卖点、`pain` 用户痛点、`obj` 购买顾虑、`scene` 使用场景、`when` 购买时机。本地推导只使用商品分析中已有的文字：核心卖点来自非待验证的可证明卖点，次要卖点来自可展示细节，购买顾虑来自待确认资料和待验证卖点，使用场景来自适用场景和搭配；分析里没有购买时机，本地推导留空。

人群 `hooks` 只能取 8 种开头类型：痛点型、反常识型、对比型、结果前置型、价格型、人群锁定型、悬念型、身份代入型。

新表：`product_folders`（文件夹）、`product_profiles`（商品所在文件夹、核对进度、人群是否已保存）、`product_understandings`（商品理解）、`product_personas`（目标人群）。

## 参考视频库（V9）

以下仍以 `/api/clients/{clientId}` 为前缀，均校验客户所有者，写操作需要 CSRF。参考视频就是 `kind=REFERENCE` 的视频素材；上传（POST `/assets`，`kind=REFERENCE`）、拆解（GET / POST / PUT `/assets/{asset}/storyboard`、`/storyboard/thumbnail`）和删除（DELETE `/assets/{asset}/reference`）沿用原接口和状态机，本节只是在它们之上加了文件夹、显示名和人工标注。

| 接口 | 请求与语义 |
| --- | --- |
| GET `/reference-library` | `{folders:[{id,parentId,name,sortOrder,revision}], references:[参考视频], analysisEnabled}`，参考视频按上传时间倒序。每条：`{assetId,name,fileName,mime,sizeBytes,createdAt,folderId?,hook?,storyboard:{status,revision,hasReport,error,duration?,shotCount?,lineCount?},usedBy:[{id,name,kind}]}`。`name` 是显示名，没改过时等于文件名；`analysisEnabled=false` 表示读片模型没配置（`AI_MODE=local`），POST storyboard 会返回 400 |
| GET `/references/{asset}` | 单条参考视频，字段同上，另加 `shotTasks:{镜头id:任务}`、`labelRevision`。不是参考视频返回 404 |
| POST `/reference-folders` | `{name,parentId?}` 新建文件夹。规则与商品库相同（同一份 `LibraryFolders` 代码）：最多两层；同一客户内名称唯一；`全部参考视频`、`未分类` 为固定分类，不能用作名称。商品库和参考视频库的文件夹互不影响 |
| PUT `/reference-folders/{id}` | `{name,revision}` 改名，revision 不一致返回 409 |
| DELETE `/reference-folders/{id}` | 只能删除没有子文件夹、没有参考视频的文件夹，204 |
| PUT `/references/{asset}/folder` | `{folderId}` 移动；为空表示放回未分类。一条参考视频只在一个文件夹 |
| PUT `/references/{asset}/name` | `{name,revision}` 改显示名（1–60 字），不改素材文件名。冲突 409 |
| PUT `/references/{asset}/labels` | `{hook?,shotTasks:{镜头id:任务},revision}` 人工标注。`hook` 为 8 种开头类型之一，空值表示还没标；任务只能取 抓住注意力、建立需求、给出方案、建立信任、打消顾虑、促进决定、推动下单，空值表示不标。镜头 id 必须是当前拆解结果里的镜头（否则 409）；没有拆解结果时只能标开头类型。名称和标注共用 `labelRevision`，冲突 409 |

- 拆解结果里没有开头类型和每镜任务，系统不推断，默认都是“还没标”。每镜任务保存时会记下镜头的起止时间；重新拆解或改了镜头区间后，对不上的旧任务不再返回。
- `usedBy`（被哪些项目用过）只按真实记录算：`remake_drafts` 里这条视频所属的项目，加上作品 `config.referenceLinks[].assetId` 指向这条视频的作品（作品属于项目时算那个项目，没属于项目的作品单独列出，`kind=work`）。同一项目只算一次。
- 删除参考视频（原接口）时一并删除它的库信息；被改编稿或作品引用的仍然不能删（409）。

新表：`reference_folders`（文件夹）、`reference_profiles`（所在文件夹、显示名、开头类型、每镜任务 JSON、revision）。
