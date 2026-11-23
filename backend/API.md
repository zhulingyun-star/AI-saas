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
| GET `/product-groups/{anchor}/projects` | （V10）用到这个商品（同一组商品图）的项目，字段同 `/project-library` 里的项目，按更新时间倒序。`projectCount` 从 V10 起也按项目（作品）里记下的 `productAnchorId` 计数，不再按交付项目绑定计数 |
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

## 项目（新版，V10）

新的「项目」= 一个商品 + 一种创作方式，就是 `projects` 表里的一行（原来叫作品）。不再经过交付项目：新建的项目 `work_flow.campaign_id` 为空，`campaigns` 及其接口保持不变，旧页面仍可用。以下仍以 `/api/clients/{clientId}` 为前缀，均校验客户所有者，写操作需要 CSRF。

| 接口 | 请求与语义 |
| --- | --- |
| GET `/project-library` | `{folders, projects:[项目], videoEnabled, aiEnabled}`。项目：`{id,name,revision,mode,flow,legacyPath,folderId,product:{anchorId,groupId,name,sku,coverId,imageIds}|null,reference:{assetId,name}|null,ratio,resolution,duration,status,storyboardConfirmed,storyboardSaved,versions:{count,running,unreviewed,usable,latestStatus},updatedAt,createdAt}`。`mode` 为 `REMAKE`/`FRAMEWORK`/`ONE_CLICK`/`OTHER`（由 `config.creationMode`/`productionMode` 判断）；`flow=true` 表示能用新版四步详情打开（视频二创且记下了商品和参考视频，包括旧流程出片时建的作品；框架模式 / 一键成片是新版新建的，见下一节），否则前端去 `legacyPath`（旧流程的框架模式、一键成片和其他作品进 `/studio/{id}`，旧二创草稿回交付项目里的二创页） |
| POST `/project-library/projects` | `{mode,productAnchorId,referenceAssetId?,ratio,resolution,folderId?,name?,facts,factsConfirmed}` 新建。`ratio` 只能 `9:16`/`16:9`，`resolution` 只能 `480p`/`720p`/`1080p`；`facts` 不能为空且 `factsConfirmed=true`。视频二创要选已拆解完的参考视频（否则 400），时长跟参考视频走（向上取整）。不提交任何生成任务。配置写入 `projects.config`：`flowVersion=2,productAnchorId,productName,productAssetIds,productCoverId,videoRatio,videoResolution`，二创另有 `creationMode=VIDEO_REMAKE,referenceAssetId,referenceLinks`，框架 / 一键另有 `creationMode=ECOMMERCE_VIDEO,productionMode` |
| POST / PUT / DELETE `/project-folders[/{id}]` | 项目文件夹，规则与商品库相同（`LibraryFolders`）；`全部项目`、`未分类` 为固定名称 |
| PUT `/projects/{id}/folder` | `{folderId}` 移动；为空表示未分类 |
| PUT `/projects/{id}/name` | `{name,revision}` 改名（1–150 字），revision 为项目的 revision，冲突 409 |
| GET `/projects/{id}/flow` | 视频二创详情（框架模式 / 一键成片的返回见下一节；`flow=false` 的项目返回 400，消息里带旧页面地址）：`{project,revision,settings:{ratio,resolution,personaId,personaName,approach,facts},product:{...,analysis:{status,revision,stale,hasReport,category,appearance,risks,hasPrice},personas},reference:{参考视频详情,report,boardRevision},legacyApproach,storyboard:{saved,confirmed,revision,stale,shots},ignores,targetDuration,draftSegments,versions,videoEnabled,aiEnabled}` |
| PUT `/projects/{id}/settings` | `{revision,name?,ratio?,resolution?,personaId?,personaName?,approach?}`，没传的字段不变，`personaName=""` 清除人群。画幅分辨率只影响之后出的版本 |
| PUT `/projects/{id}/product` | `{anchorId,revision}` 换商品：分镜回到未确认，人群清空 |
| PUT `/projects/{id}/reference` | `{assetId,revision}` 换参考视频（必须已拆解）：分镜和忽略记录清空，按新视频重来 |
| PUT `/projects/{id}/storyboard` | `{revision,shots:[{id,camera,visual,lines,task}],confirmed}`。镜头 id 和顺序必须与当前分镜一致（不能增删镜头，台词可增删，每镜最多 8 句、每句 120 字）；`task` 只能取 7 种每镜任务或空；`confirmed=true` 时每镜都要写画面。首次保存 revision=0，冲突 409 |
| POST `/projects/{id}/storyboard/reset` | `{revision}` 参考视频重新拆解后按新拆解重做（删除已保存的分镜） |
| POST `/projects/{id}/storyboard/draft` | `{revision}` 让 AI 按商品写每镜的改成和改编思路；`AI_MODE=local` 返回 503 并且不改动 |
| POST `/projects/{id}/ad-ignores` | `{key}` 记一条广告用语检查的「没问题，忽略」，返回全部 key。key 由前端生成（哪一句、哪个词、位置、句子哈希），句子改了自动失效 |
| POST `/projects/{id}/versions` | `{segments:[{key,title,text}],note?,basedOn?,confirmed:true}` 出一版。分镜必须已确认；时长 4–30 秒；出片词合计不超过 5000 字；第二版起 `note` 必填。之前审片评为「差」的原因会作为 `avoid` 段自动加在最后。把出片词、分段、改动说明、`basedOnJobId`、`carriedReasons`、当前画幅分辨率写进 `projects.config` 后走原来的 `ProjectService.submit(VIDEO_API)`：视频接口未启用时任务是 `BLOCKED`（未发出请求）。有排队 / 生成中的版本，或提交结果不确定的 `BLOCKED` 版本时返回 409 |
| POST `/projects/{id}/versions/rewrite` | `{basedOn,instruction}` 一句话让 AI 改某一版的出片词，只返回 `{segments,note}` 给用户看，不出片；`AI_MODE=local` 返回 503 |
| PUT `/jobs/{id}/verdict` | `{rating:GOOD|BAD|null,reason,use:USABLE|DISCARDED|null,revision}` 单独审片。只有出好的版本能审；`BAD` 必须写原因；首次 revision=0，冲突 409 |
| POST `/jobs/{id}/cancel` | 取消：`QUEUED` 直接不发；`BLOCKED` 标为已取消；`VIDEO_API` 的 `RUNNING` 只停止等待（供应商可能仍在生成）；本地粗剪运行中和已结束的返回 400。状态记为 `CANCELLED`，轮询结果不会再覆盖它 |

- 版本 = `jobs` 一行，`no` 为任务的 revision（同一项目递增）。每版的出片词、分段、画幅分辨率、改动说明从任务快照（`jobs.snapshot` 的 `config`）读，旧流程出的版本按空行把整段出片词切成段。
- 出片请求现在把项目的画幅（`config.videoRatio`）作为 `ratio` 传给视频接口（原来固定 9:16），分辨率仍是 `config.videoResolution`。`VIDEO_API_SIZE` 只在作品没选分辨率时决定默认值。
- 新表：`project_folders`、`project_profiles`（项目所在文件夹）、`project_storyboards`（分镜：每镜原视频快照 + 改成的机位 / 画面 / 台词 / 任务，`confirmed`、`revision`、拆解来源 revision）、`project_ad_ignores`（忽略记录）、`job_verdicts`（每版审片：评价、原因、可投放 / 不用了、revision）。画幅、分辨率、给谁看、改编思路继续放在 `projects.config`，不新增列。

## 项目（新版）：框架模式 / 一键成片四步详情（V11）

新版新建的框架模式、一键成片项目（`config.flowVersion=2`）在项目列表里 `flow=true`，进 `/p/{id}` 四步详情：商品 → 方向 → 分镜 → 出片。旧流程里建的这两种作品仍是 `flow=false`，进 `legacyPath`（`/studio/{id}`）；旧的 `/projects/{id}/frameworks`、`/projects/one-click` 等接口不变。列表项目多了 `plan:{directions,selected,boardsConfirmed}`（方向数、选中的方向数、选中且分镜已确认的方向数）。

下面的 `/projects/{id}/flow`、`/settings`、`/product`、`/versions` 与视频二创同一个地址，后端按项目的创作方式分到 `DirectionFlowService`。

| 接口 | 请求与语义 |
| --- | --- |
| GET `/projects/{id}/flow` | `{project,revision,mode:FRAMEWORK|ONE_CLICK,settings:{ratio,resolution,personaId,personaName,duration,facts,oneClick?},product:{同视频二创},directions:[方向],ignores,versions,videoEnabled,aiEnabled,options:{hooks,contentTypes,tempos,people,voices,looks,endings,durations:[15,30],tasks}}`。方向：`{id,source:AI|LOCAL,data,origin,edited,selected,selectOrder,revision,productChanged,versionCount,board:{saved,confirmed,revision,source,duration,stale,shots,draftSegments}}`；`data`/`origin` = `{title,why,hook,openVisual,openLine,structure,points[],scene,contentType,tempo,people,voice,look,ending,personaName,duration}`，`origin` 是写出来时的原文（恢复用）。`shots` 与视频二创同形（`origVisual/origLines` 是写出来时的原文，`camera` 为空）。`board.stale=true` 表示方向在分镜写好之后改过。版本多了 `directionId`、`oneClick`（一键成片出这一版时的设置快照）和 `jobNo`（项目里的总序号）；框架模式的 `no` 是这个方向里的序号 |
| PUT `/projects/{id}/settings` | 同视频二创，另收 `duration`（15/30，框架模式下次出方向的默认时长）和 `oneClick:{personaName,duration,src:idea|copy,copy,creative,people,voice,tempo,look}`（只限一键成片；空字符串 = 交给 AI；`copy`、`creative` 各最多 500 字） |
| PUT `/projects/{id}/product` | `{anchorId,revision}` 换商品：所有分镜回到未确认，人群清空；方向保留，`productChanged=true`；一键成片下次出片会重新写方向和分镜 |
| POST `/projects/{id}/directions/generate` | 框架模式。`{revision,personaName,duration}` 出 3 套方向（`revision` 是项目的）。没选中、也没出过片的旧方向被替换，选中的和出过片的保留；每个项目最多 12 套 |
| POST `/projects/{id}/directions/{dir}/regenerate` | `{revision}`（方向的）单独重出一套：内容和原文一起换掉，已有分镜变成 `stale` |
| PUT `/projects/{id}/directions/{dir}` | `{revision,direction:{同 data}}` 改格子；开头类型 8 选 1，内容类型 / 节奏 / 人物 / 声音 / 片种 / 收尾只能取 `options` 里的值，时长 15/30，卖点最多 3 条。恢复原文 = 把 `origin` 发回来 |
| POST `/projects/{id}/directions/confirm` | 框架模式。`{revision,ids:[1~3 个方向 id]}` 选定方向（顺序即 A/B/C），还没有分镜的方向这时写分镜（15 秒 5 镜、30 秒 7 镜，每镜时间和任务固定，只写画面和台词） |
| PUT `/projects/{id}/directions/{dir}/storyboard` | `{revision,shots:[{id,visual,lines,task}],confirmed}` 改分镜。镜头 id 和顺序不能变；每镜最多 4 句、每句 120 字；`confirmed=true` 时每镜都要有画面。一键成片保存时总是算确认 |
| POST `/projects/{id}/directions/{dir}/storyboard/rewrite` | `{revision}`（分镜的）按方向现在的格子和时长重写分镜 |
| POST `/projects/{id}/one-click/run` | 一键成片。`{revision,settings:{同 oneClick},note?}`：保存设置；设置（含商品）和上次出片时一样就沿用现在的方向和分镜（用户可能改过），否则重新写 1 个方向和它的分镜（自动算确认，旧方向保留但不再选中）；然后按分镜拼出片词出一版，返回这一版。有排队 / 生成中或结果不确定的版本时 409 |
| POST `/projects/{id}/versions` | 同视频二创，另带 `directionId`（必填）。框架模式：方向要选中、分镜要确认；同一个方向里有在出片的才 409，不同方向可以同时出片（因此不走 `ProjectService.submit` 的“一个项目只能一条在做”，其余检查一样）。审片说“差”的原因只带进同一个方向的下一版。一键成片：快照里记下当前设置 |

- 文字模型：配置了就走 `AiService.directions` / `directionBoard`（只能从给定选项里选，没价格资料时价格型开头会被换掉）；`AI_MODE=local` 不调外部模型，按商品库「商品理解」的卖点、痛点、场景和人群拼本地模板，`source=LOCAL`，`why` 里写明“本地模板……没有经过文字模型”，界面标“本地模板 · 不是 AI 写的”，缺的地方留空不编。
- 新表：`project_directions`（方向：当前内容、原文、写的时候的商品、是否选中及顺序、revision）、`project_direction_boards`（每个方向一份分镜：镜头 JSON、写自哪个方向 revision、时长、是否确认、revision）。设置放在 `projects.config`（`planDuration`、`personaName`、`oneClick`、`oneClickPlanKey`）；每一版仍是 `jobs` 一行，`snapshot.config` 里多了 `directionId`、`directionTitle`、`oneClickSnapshot`。
