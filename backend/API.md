# API 约定

基础地址 `/api`，UTF-8 JSON。同源 HttpOnly Session Cookie 鉴权。读操作 GET；所有写操作必须先 GET `/auth/csrf`，从响应取得 `token` 和 `headerName`，并在请求头带回，登录和退出也不例外。CSRF token 属于当前 Session，退出后重新获取。错误统一尽可能返回 `{ "message": "可读的原因" }`。

| 接口 | 作用 |
| --- | --- |
| GET `/auth/csrf` | 获取匿名/登录会话 CSRF token |
| POST `/auth/login` | `{username,password}`，建立会话 |
| GET `/auth/me` | 当前用户：`{username,displayName,role,roleLabel,status,owner,canManage}`（V13 起多了后面几项） |
| POST `/auth/logout` | 注销并使会话失效，204 |
| GET `/system` | 当前 AI 模式与能力边界，不返回密钥 |
| GET / POST `/clients` | 当前账号能进的客户列表 / 新建 `{name,category}`（V13 起只有管理员能新建，记在团队主账号名下） |

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

## 资产库与投放数据（V12）

资产库 = 所有项目出好的成片（`jobs` 里有成片文件的那些版本，每一版一条）。投放数据只来自用户手填或导入的表格，没有就是没有；累计、「哪种赢了」「该换新了」都只按这些真实记录算，接口不返回任何估算或示例数字。旧的 `metrics` 表和 `/metrics` 导入（素材 ID + 消耗）不动，旧「投放数据」页仍可用。以下仍以 `/api/clients/{clientId}` 为前缀，均校验客户所有者，写操作需要 CSRF。

| 接口 | 请求与语义 |
| --- | --- |
| GET `/video-library` | `{videos:[成片],pendingVersions,hooks}`。只列出好的版本，新的在前；`pendingVersions` 是还没出好或没出成功的版本数。成片：`{id(任务 id),code,projectId,projectName,mode,projectFlow,projectPath,no,jobNo,status,message,hasOutput,createdAt,updatedAt,ratio,resolution,duration,note,product:{anchorId,name,coverId},reference:{assetId,name}?,direction:{id,title,letter}?,hook,personaName,scene,contentType,verdict?,hasPrice,adName,perf?,tired:[命中的信号名]}`。`no` 与项目详情一致（框架模式按方向数，一键成片按项目数，其他是任务 revision）；`letter` 是框架模式选中方向的 A/B/C。开头类型、人群、场景来自方向（框架 / 一键）或参考视频的开头标注和项目人群（二创），没有就是空。`code` = 任务 id 去横线前 8 位；`adName`（投放用名）= `商品_开头类型_人群_场景_时长秒_v版本_code`。值为 null 的字段不出现在 JSON 里 |
| GET `/video-library/{jobId}` | 成片详情：上面的字段 + `{segments,carriedReasons,records:[记录，日期新的在前],signals:[{key,title,hit,detail}]|null,madeOn}`。`signals=null` 表示有曝光的记录少于 3 条，还判断不了；`madeOn` 是生成那天（北京时间） |
| POST `/jobs/{jobId}/performance` | 手填一条：`{dateFrom,dateTo?,impressions,clicks,retain3s?,finishRate?,productClicks?,orders?,gpm?,roi?,negativeRate?,note?}`，返回新的详情。必填开始日期、曝光、点击；结束日期默认同开始日期；日期不能早于成片生成那天、不能晚于今天、一条最多 366 天；点击 ≤ 曝光；3 秒留存 / 完播率 / 负反馈率是 0–100 的百分数；投产比 0–10000；备注最多 300 字。同一条成片的记录日期不能重叠（400）。没出好的版本 400 |
| PUT `/jobs/{jobId}/performance/{id}` | 同上 + `revision`，冲突 409 |
| DELETE `/jobs/{jobId}/performance/{id}?revision=N` | 删一条，冲突 409，返回新的详情 |
| POST `/performance-imports/preview` | `{fileName,text,mapping?,assign?}` 预览 CSV（不写库）。`text` 是表格全文（前端按 UTF-8 读，读不通按 GBK），逗号 / 制表符 / 分号分隔，支持引号和 BOM；最多约 2MB、5000 行、80 列。`mapping` 是 `{字段:列号}`，不传就按表头猜（如「素材名称」「展示数」「点击数」「3秒播放率」「成交订单数」「消耗回报率」）；字段：`adName,code,date,dateFrom,dateTo,impressions,clicks,retain3s,finishRate,productClicks,orders,gpm,roi,negativeRate,note`。`assign` 是 `{行号:任务 id 或 "skip"}`（行号按表格行，第 1 行是表头）。返回 `{fileName,columns:[{index,name,field}],mapping,fields,missing,sample,totalRows,rows:[{row,name,code,dateFrom,dateTo,values,status:OK|ERROR|UNMATCHED|SKIPPED,by:NAME|CODE|NAME_CODE|MANUAL,jobId,video,messages}],counts:{ok,error,unmatched,skipped},videos}`。缺了必需的列（投放用名或视频编号、日期、曝光、点击）时 `missing` 不为空、不逐行检查。对成片顺序：投放用名完全一致 → 视频编号（任务 id 或至少 6 位前缀，多条命中要手动指认）→ 名字最后一段是视频编号 → 手动指认。逐行检查同手填，另外和已有记录、和表里前面的行（同一条成片）日期重叠都算错误行。点击率、转化率列不读，按曝光、点击、成交单数重新算 |
| POST `/performance-imports` | 同上 + `confirmed:true`。在事务里重新检查一遍；还有 `UNMATCHED` 行（没指认也没跳过）400；没有能导入的行 400；`ERROR` 行不导入，在返回里逐行说明：`{importId,imported,skipped,videos,errors:[{row,name,messages}]}` |
| GET `/performance-imports` | 最近 20 次导入：`{id,fileName,totalRows,imported,skipped,errors,by,at}` |

- 累计：曝光、点击、商品点击、成交单数直接加；点击率 = 点击 ÷ 曝光；转化率 = 成交单数 ÷ 点击（只算填了成交单数的记录）；3 秒留存、完播率、千次曝光成交额、投产比、负反馈率按曝光加权。
- 该换新了（只看曝光大于 0 的记录，按日期排，至少 3 条才判断，每条记录算一个点）：最近 7 条里有 6 条以上时，后 3 条平均点击率比前 3 条低 30% 以上；最近 3 条的平均负反馈率超过 0.8%；最近 3 条的 3 秒留存平均低于 25%（没有「有效播放」这一项，用 3 秒留存代替）。
- 「哪种赢了」在前端按列表里每条成片的累计分组：每条先算自己的累计，再在组里取平均（每条分量一样），少于 3 条的分组标“样本太少”。不做出价、预算、预测或打分。
- 新表：`job_performance`（一条投放记录：成片、起止日期、各项数字、备注、来源 MANUAL/IMPORT、导入批次、revision、谁改的）、`performance_imports`（每次导入：文件名、行数、导入 / 跳过 / 有问题的行数、谁导的）。

## 团队管理（V13）

一支团队 = 一个主账号（部署时用 `ADMIN_USERNAME` 建的账号，`app_users.team_owner` 指向它）和它开通的账号；团队的客户就是主账号名下的客户。已有账号迁移后都是自己团队的主账号 + 管理员，原来的访问范围不变。

- 能进哪些客户（`Store.access`，所有 `/clients/{clientId}` 接口都走它）：主账号自己的客户；同团队的管理员能进全部；其他角色只能进 `client_members` 里分给他的客户。停用的账号哪里都进不去，进不去统一 404。
- 角色：`ADMIN` 管理员、`LEAD` 客户负责人、`BUYER` 投手、`MAKER` 内容制作、`VIEWER` 只读。客户空间里的修改操作（非 GET）按角色拦（`RoleGuard`，403 + 中文原因）：只读什么都不能改；内容制作不能审片（`/jobs/{id}/verdict`、`/jobs/{id}/reviews`）、不能填或导入投放数据（`/jobs/{id}/performance*`、`/performance-imports*`、`/metrics/import`）、不能改客户知识（`/presets*`）；投手不能改客户知识。
- 状态：`PENDING` 待首次登录（第一次登录成功后变 `ACTIVE`）、`ACTIVE` 正常、`DISABLED` 已停用（登录返回 401「账号或密码错误」）。
- 密码：管理员开通或重设时设定，至少 12 位、不超过 72 字节、不能和登录账号一样；只存 BCrypt 摘要，任何接口都不返回，操作记录里也不写。

以下以 `/api/team` 为前缀，写操作需要 CSRF。

| 方法与路径 | 谁能用 | 说明 |
|---|---|---|
| GET `/members` | 团队里没停用的账号 | `{members:[{username,displayName,role,status,owner,you,createdAt,lastLoginAt,revision,allClients,clients:[{id,name}]}],clients:[{id,name,category}],canManage,you}` |
| POST `/members` | 管理员 | 开通 `{username,displayName,role,clientIds,password}`；登录账号 3–60 位英文字母、数字或 `._@-`，重名（不分大小写）409；管理员不用分配客户 |
| PUT `/members/{username}` | 管理员 | 改 `{displayName,role,clientIds,revision}`；主账号一直是管理员；不能改自己的角色；版本号过期 409 |
| PUT `/members/{username}/status` | 管理员 | `{enabled,revision}` 停用 / 重新启用；主账号和自己不能停用 |
| PUT `/members/{username}/password` | 管理员 | `{password,revision}` 重设别人的密码；主账号的密码只能主账号自己改 |
| PUT `/me/password` | 自己 | `{current,next}`，要先输对现在的密码 |
| GET `/events` | 管理员 | 最近 20 条成员变更（开通、改角色和负责客户、停用、重设密码），不含任何密码 |
| GET `/workload` | 团队里没停用的账号 | 只算当前账号能进的客户。`members[]`：每人手上的项目数、进行中（还没有可投放版本）、待审片、出片中、最近 7 天审片数和项目列表；`clients[]`：客户负责人、分到的成员、进行中 / 待审片 / 出片中；`unassignedProjects`：负责人不是团队账号的项目数。项目的负责人 = `work_flow.assignee`（新建项目时默认是建项目的账号） |

新表：`client_members(client_id, username)`、`team_events`；`app_users` 加了 `display_name, role, status, team_owner, created_at, last_login_at, revision`。旧的分工联系人（`/clients/{clientId}/team`）不动，页面挪到 `/team/contacts`。
