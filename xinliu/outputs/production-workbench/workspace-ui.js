'use strict';

const workspaceUi = {
  queueScope: '待处理',
  query: '',
  batch: '全部批次',
  owner: '全部负责人',
  resourceTab: 'assets',
  allFormats: false,
  advanced: false,
  editResources: false,
  resourcePicker: '',
  pickerQuery: '',
  batchMode: 'hooks',
  screenIssues: []
};

function workspaceShell(view, body) {
  const resourceViews = ['resources', 'assets', 'models', 'wardrobe', 'voices', 'reference'];
  const active = resourceViews.includes(view) ? 'resources' : ['home', 'projects', 'tasks', 'runs', 'project', 'deliveries', 'gallery', 'queue', 'review', 'batch'].includes(view) ? 'projects' : ['quick', 'brief', 'result', 'drama'].includes(view) ? 'studio' : view;
  const links = [
    ['projects', 'home', '项目与制作'],
    ['studio', 'film', '内容制作'],
    ['resources', 'folder', '资源中心'],
    ['preferences', 'book', '客户知识'],
    ['data', 'chart', '投放复盘'],
    ['settings', 'settings', '团队与费用']
  ];
  return `<aside class="sidebar workspace-sidebar">${titleMarkup()}
    <div class="workspace"><strong>曜石电商 · 内容组</strong></div>
    <nav aria-label="主导航">${links.map(link => `<button class="navbutton ${active === link[0] ? 'active' : ''}" data-action="nav" data-view="${link[0]}" title="${link[2]}" ${active === link[0] ? 'aria-current="page"' : ''}>${icon(link[1])}<span>${link[2]}</span></button>`).join('')}</nav>
    <div class="side-foot"><div class="row"><span class="avatar">林</span><div class="user-copy grow"><h4>林川</h4><span class="meta">内容负责人</span></div>${button(icon('arrow'), 'logout', 'ghost', 'aria-label="退出"')}</div></div>
  </aside><div class="shell ${state.dense ? 'dense' : ''}">
    <header class="topbar"><div class="row gap8"><span class="small">客户</span><select id="activeClient" class="input" aria-label="当前客户">${Object.entries(state.clients).map(([id, item]) => `<option value="${id}" ${id === state.activeClient ? 'selected' : ''}>${escapeText(item.name)}</option>`).join('')}</select></div>
    <div class="row gap8"><button class="prototype-indicator" data-action="capability-report" aria-label="本地测试能力与限制">本地测试 ${icon('book')}</button></div></header>
    <main class="page workspace-page">${body}</main></div>`;
}

function workspaceQueue() {
  const current = {...client(),projects:client().projects.filter(work=>collabVisible(collabCampaign(work.campaignId))),jobs:client().jobs.filter(job=>job.campaignId?collabVisible(collabCampaign(job.campaignId)):collabActor().role==='owner')};
  const waiting = ['待脚本确认', '待资源确认', '未提交', '需重做'];
  if (!current.jobs.length && !current.projects.length) {
    return `${headline('工作队列', '当前客户还没有素材任务', button('开始制作 ' + icon('plus'), 'new-project', 'primary'))}
      <section class="queue-start"><div><span class="section-kicker">第一条素材</span><h2>准备商品，选好拍法，<br>再把镜头做清楚</h2><p>已有模特、穿搭和声音可以直接复用</p><div class="row wrap gap8">${button('开始制作', 'new-project', 'primary')}${button('载入示例客户', 'load-demo')}</div>
      <div class="start-secondary"><button class="link" data-action="nav" data-view="resources">准备客户资源</button><span>·</span><button class="link" data-action="nav" data-view="preferences">使用客户预设</button></div></div><div class="start-product">${imageMarkup(productCatalog[0])}<span>商品素材示例</span></div></section>`;
  }
  const allBatches = [...new Set(current.jobs.map(job => job.batch))];
  const allOwners = [...new Set(current.jobs.map(job => job.reviewer || '林川'))];
  const queueScopes = ['待处理', '待审片', '全部任务', '已归档'];
  const scoped = current.jobs.filter(job => {
    const matchesScope = workspaceUi.queueScope === '全部任务' || workspaceUi.queueScope === '待处理' && waiting.includes(job.status) || job.status === workspaceUi.queueScope;
    return matchesScope && (workspaceUi.batch === '全部批次' || job.batch === workspaceUi.batch) && (workspaceUi.owner === '全部负责人' || (job.reviewer || '林川') === workspaceUi.owner) && `${job.name} ${job.sku} ${job.batch}`.toLowerCase().includes(workspaceUi.query.toLowerCase());
  });
  const pageCount = Math.max(1, Math.ceil(scoped.length / 12));
  viewState.tablePage = Math.min(pageCount, Math.max(1, viewState.tablePage));
  const visible = scoped.slice((viewState.tablePage - 1) * 12, viewState.tablePage * 12);
  return `${headline('工作队列', `${waiting.filter(status => current.jobs.some(job => job.status === status)).length ? current.jobs.filter(job => waiting.includes(job.status)).length : 0} 条待处理 · ${current.jobs.filter(job => job.status === '待审片').length} 条待审片`, button('批量排产', 'nav', '', 'data-view="batch"') + button('创建素材 ' + icon('plus'), 'new-project', 'primary'))}
    <div class="queue-tabs" role="tablist" aria-label="任务状态">${queueScopes.map(scope => {
      const count = scope === '全部任务' ? current.jobs.length : scope === '待处理' ? current.jobs.filter(job => waiting.includes(job.status)).length : current.jobs.filter(job => job.status === scope).length;
      return `<button role="tab" aria-selected="${workspaceUi.queueScope === scope}" class="${workspaceUi.queueScope === scope ? 'active' : ''}" data-action="workspace-scope" data-value="${scope}">${scope}<span>${count}</span></button>`;
    }).join('')}</div>
    <div class="toolbar queue-toolbar"><input id="workspaceQuery" class="input search" aria-label="搜索任务" placeholder="搜索素材、SKU、批次" value="${escapeText(workspaceUi.query)}">
    ${workspaceSelect('筛选批次', 'workspaceBatch', ['全部批次', ...allBatches], workspaceUi.batch)}
    ${workspaceSelect('筛选负责人', 'workspaceOwner', ['全部负责人', ...allOwners], workspaceUi.owner)}
    <div class="grow"></div>${button('重置筛选', 'workspace-reset', 'ghost sm')}${button(state.dense ? '标准行高' : '紧凑行高', 'dense', 'ghost sm')}</div>
    ${visible.length ? `<section class="card queue-table"><div class="table-wrap"><table><thead><tr><th class="select-column"><input type="checkbox" class="checkbox" aria-label="选择本页任务" id="workspaceSelectPage" ${visible.every(job => viewState.selectedJobs.has(job.id)) ? 'checked' : ''}></th><th>素材 / SKU</th><th>批次</th><th>负责人</th><th>截止</th><th>状态</th><th>下一步</th></tr></thead><tbody>${visible.map(job => `<tr>
      <td><input type="checkbox" class="checkbox" data-select-job="${job.id}" aria-label="选择 ${escapeText(job.name)}" ${viewState.selectedJobs.has(job.id) ? 'checked' : ''}></td>
      <td><div class="row gap8">${imageMarkup(productCatalog.find(item => item.sku === job.sku) || current.assets.find(item => item.sku === job.sku) || product(), 'file-thumb')}<div><div class="file-name">${escapeText(job.name)}</div><div class="job-card-meta">${escapeText(job.sku)} · ${escapeText(job.format)} · V${job.version || 1}${job.demo ? ' · 示例' : ''}</div></div></div></td>
      <td>${escapeText(job.batch)}</td><td>${escapeText(job.reviewer || '林川')}</td><td class="mono">${escapeText(job.dueDate || '未设置')}</td>
      <td><span class="row-status"><i class="dot ${job.status === '已归档' ? 'green' : job.status === '待审片' ? 'blue' : ''}"></i>${escapeText(job.status)}</span></td>
      <td>${button(workspaceNextLabel(job), workspaceNextAction(job), 'sm', `data-id="${job.id}"`)}</td></tr>`).join('')}</tbody></table></div>
      <div class="pagination"><span class="meta">共 ${scoped.length} 条 · 第 ${viewState.tablePage} / ${pageCount} 页</span><div class="row gap8">${button('上一页', 'workspace-page', 'sm', `data-direction="-1" ${viewState.tablePage === 1 ? 'disabled' : ''}`)}${button('下一页', 'workspace-page', 'sm', `data-direction="1" ${viewState.tablePage === pageCount ? 'disabled' : ''}`)}</div></div></section>` : `<div class="card">${emptyState(current.jobs.length ? '当前没有匹配任务' : '还没有产单', current.jobs.length ? '换一个状态或重置筛选' : '完成草稿后创建产单，或者从最近的草稿继续', button('重置筛选', 'workspace-reset'))}</div>`}
    ${viewState.selectedJobs.size ? `<div class="bulk-bar"><span class="small">已选 ${viewState.selectedJobs.size} 条</span><div class="row wrap gap8">${button('分配负责人', 'assign-jobs')}${button('设置截止', 'workspace-due')}${button('预算检查', 'submit-budget')}${button('导出选中', 'export-jobs')}${button('取消', 'clear-jobs', 'ghost')}</div></div>` : ''}
    <details class="queue-drafts"><summary>最近草稿 <span>${current.projects.length}</span></summary><div class="card">${current.projects.slice(0, 4).map(project => `<div class="draft-row"><div class="grow"><strong>${escapeText(project.name)}</strong><p class="meta">${escapeText(project.sku)} · ${escapeText(project.status)}</p></div>${button('继续制作', 'open-project', 'sm', `data-id="${project.id}"`)}</div>`).join('')}</div></details>`;
}

function workspaceNextLabel(job) {
  return job.status === '待审片' ? '去审片' : job.status === '已归档' ? '查看交付' : job.status === '未提交' ? '检查提交' : job.status === '待资源确认' ? '补齐资源' : job.status === '需重做' ? '修改脚本' : '确认脚本';
}
function workspaceNextAction(job) {
  return ['待审片', '已归档', '未提交'].includes(job.status) ? 'review-job' : 'workspace-open-job';
}
function workspaceSelect(label, id, values, selected) {
  return `<select class="input" id="${id}" aria-label="${label}">${values.map(value => `<option ${value === selected ? 'selected' : ''}>${escapeText(value)}</option>`).join('')}</select>`;
}

function workspaceResources() {
  const currentView = viewState.view;
  if (['assets', 'models', 'wardrobe', 'voices', 'reference'].includes(currentView)) workspaceUi.resourceTab = currentView;
  const tabs = [['assets', '商品与素材'], ['models', '模特'], ['wardrobe', '服装与搭配'], ['voices', '声音'], ['reference', '参考片']];
  const pages = { assets: assetsPage, models: modelsPage, wardrobe: wardrobePage, voices: voicesPage, reference: referencePage };
  const markup = pages[workspaceUi.resourceTab]();
  const container = document.createElement('div');
  container.innerHTML = markup;
  const originalHeadline = container.querySelector('.page-head');
  const controls = originalHeadline?.lastElementChild?.innerHTML || '';
  originalHeadline?.remove();
  container.querySelectorAll(':scope > .notice').forEach(element => element.remove());
  return `${headline('资源中心', '', controls)}
    ${workspaceUi.resourceReturn ? `<div class="resource-return"><span class="grow">正在为「${escapeText(product().name)}」准备资源</span>${button('返回当前制作', 'workspace-return-studio', 'sm')}</div>` : ''}
    <div class="tabs resource-tabs" role="tablist" aria-label="资源分类">${tabs.map(tab => `<button class="${workspaceUi.resourceTab === tab[0] ? 'active' : ''}" data-action="workspace-resource-tab" data-tab="${tab[0]}" role="tab" aria-selected="${workspaceUi.resourceTab === tab[0]}">${tab[1]}</button>`).join('')}</div><div class="resource-content">${container.innerHTML}</div>`;
}

function workspaceStudio() {
  const config = state.config;
  const category = categories[config.category];
  const stage = viewState.stage;
  const project = client().projects.find(item => item.id === config.draftId);
  let body;
  if (stage === 0) {
    const available = [...new Map([...productCatalog.filter(item => item.category === config.category), ...client().assets.filter(item => item.kind === '图片' && item.tag === '商品图')].map(item => [item.id, item])).values()];
    body = `<section class="card"><div class="card-header"><h3>商品与任务</h3>${button('套用客户预设', 'workspace-preset', 'ghost sm')}</div><div class="section-block"><div class="setting-grid">${selectorField('品类', 'category', Object.keys(categories), config.category)}${selectorField('商品 / SKU', 'productId', available.length ? available : [{ id: 'custom', name: '上传商品' }], config.productId)}${selectorField('平台', 'platform', ['抖音', 'TikTok', '小红书', '快手'], config.platform)}${selectorField('任务目标', 'intent', ['信息流测试', '商品转化', '直播引流', '日常种草', '品牌介绍'], config.intent)}</div>
      <div class="section-label"><strong>商品素材</strong>${button('从资源中心选择', 'workspace-picker', 'ghost sm', 'data-kind="assets"')}</div>${uploadZone('draftMedia', 'image/*,video/*', '上传商品图或使用视频', '保留素材引用，后续无需重复上传')}
      <div class="strip mt">${config.assets.map(id => client().assets.find(asset => asset.id === id)).filter(Boolean).map(asset => `<div class="media-item">${imageMarkup(asset)}<span>${escapeText(asset.tag)}</span><button aria-label="移除此引用" data-action="remove-draft-asset" data-id="${asset.id}">×</button></div>`).join('')}</div>
      <label class="field mt"><span>已确认卖点</span><textarea id="claims" class="input">${escapeText(config.claims)}</textarea></label>
      <div class="setting-grid">${selectorField('主要讲什么', 'claimFocus', category.claims, config.claimFocus)}${selectorField('证据来源', 'evidence', category.evidence, config.evidence)}</div>
      <details class="workspace-details"><summary>活动价格与额外要求</summary><div class="setting-grid mt"><label class="field"><span>活动价格</span><input id="price" class="input" value="${escapeText(config.price)}" placeholder="留空不报价格"></label><label class="field"><span>额外要求</span><input id="note" class="input" value="${escapeText(config.note)}" placeholder="选填"></label></div></details>
      <label class="row small mt"><input type="checkbox" class="checkbox" id="factsConfirmed" ${config.factsConfirmed ? 'checked' : ''}> 商品卖点与活动信息已确认</label></div></section>`;
  } else if (stage === 1) {
    const formats = [...new Set([config.format, category.style, ...category.formats])].filter(format => category.formats.includes(format));
    const visible = workspaceUi.allFormats ? formats : formats.slice(0, 4);
    body = `<section class="card"><div class="card-header"><h3>选择拍法与开场</h3>${button('套用客户预设', 'workspace-preset', 'ghost sm')}</div><div class="section-block">
      <div class="section-label"><strong>${workspaceUi.allFormats ? '全部拍法' : '常用拍法'}</strong>${button(workspaceUi.allFormats ? '收起' : `全部拍法 ${formats.length}`, 'workspace-formats', 'ghost sm')}</div>
      <div class="choice-grid workspace-formats">${visible.map((format, index) => `<button class="choice ${format === config.format ? 'selected' : ''}" data-action="config-choice" data-field="format" data-value="${format}" aria-pressed="${format === config.format}">${formatThumbnail(format, index)}<span class="label">${format}</span><p>${formatDescription(format)}</p></button>`).join('')}</div>
      <div class="setting-grid mt">${selectorField('开场方式', 'hook', hooks, config.hook)}${selectorField('编导介入', 'mode', ['按我的想法', '共同编导', '全案托管'], config.mode)}</div>
      <details class="workspace-details" ${workspaceUi.advanced ? 'open' : ''} data-workspace-details="advanced"><summary>场景、机位与表达 <span>${escapeText(config.scene)} · ${escapeText(config.camera)}</span></summary><div class="setting-grid mt">${selectorField('场景', 'scene', scenes, config.scene)}${selectorField('画面质感', 'camera', cameraStyles, config.camera)}${selectorField('表达语气', 'style', contentStyles, config.style)}${selectorField('制作方式', 'pipeline', ['AI补镜头 + 后期组装', '已有实拍素材混剪', '整片生成', '剧情分段 + 合成'], config.pipeline)}</div></details>
      <details class="workspace-details"><summary>编导建议</summary><p class="muted small mt">${directorTip()}</p></details></div></section>`;
  } else if (stage === 2) {
    body = `<section class="card"><div class="card-header"><h3>逐镜脚本</h3>${button('重排草稿', 'rebuild-shots', 'sm')}</div>
      <div class="script-overview"><div class="row wrap gap8"><span>${config.duration} 秒 · ${getShots().length} 镜</span>${button('调整时长与镜头数', 'workspace-script-settings', 'ghost sm')}</div><span class="meta">选择一镜，修改画面和台词</span></div>
      <div class="workspace-shot-layout"><div class="shot-list" role="tablist" aria-label="镜头列表">${getShots().map((shot, index) => `<button role="tab" aria-selected="${viewState.activeShot === index}" class="${viewState.activeShot === index ? 'active' : ''}" data-action="workspace-shot" data-index="${index}"><span class="mono">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeText(shot.role)}</strong><p>${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s ${shot.locked ? '· 已锁定' : ''}</p></div></button>`).join('')}</div><div id="workspaceShotEdit">${workspaceShotMarkup()}</div></div>
      <details class="workspace-details script-timeline"><summary>查看时间轴与完整提示词</summary><div class="timeline-board"><div class="timeline-track"><label>画面</label><div class="segments">${getShots().map(shot => `<span class="segment">${escapeText(shot.role)}</span>`).join('')}</div></div></div><textarea class="input mt" readonly aria-label="完整提示词" style="height:200px">${escapeText(compilePrompt())}</textarea></details></section>`;
  } else if (stage === 3) {
    body = `<section class="card"><div class="card-header"><h3>声音与字幕</h3></div><div class="section-block"><div class="option-group"><label>字幕样式</label>${chooseChips('subtitle', ['白字黑描边', '黄字重点', '干净下方字幕', '无字幕'])}</div>
      <div class="setting-grid">${selectorField('卖点花字', 'flower', ['卖点黄字', '规格信息条', '促销贴片', '无花字'], config.flower)}${selectorField('结尾动作', 'cta', ['查看商品详情', '进直播间看看', '按需选择规格', '收藏使用方法', '无行动文案'], config.cta)}</div>
      <details class="workspace-details"><summary>语速与背景声音 <span>${config.speed.toFixed(1)}× · ${config.music}</span></summary><label class="field mt"><span>语速 <b id="speedValue">${config.speed.toFixed(1)}×</b></span><input id="speed" class="voice-slider" type="range" min=".8" max="1.4" step=".1" value="${config.speed}"></label>${selectorField('背景声音', 'music', ['无配乐', '用户上传配乐', '只留同期声'], config.music)}${button('试听当前口播', 'speak-script')}</details></div></section>`;
  } else {
    body = `<section class="card"><div class="card-header"><h3>制作确认</h3>${badge('1 条')}</div><div class="section-block"><div class="summary-fields"><div><label>商品</label>${escapeText(product().name)} / ${escapeText(product().sku)}</div><div><label>输出</label>${config.platform} · ${config.duration}s · ${getShots().length} 镜</div></div>
      <details class="workspace-details mt"><summary>查看制作配置与完整提示词</summary><textarea class="input mt" readonly style="height:250px">${escapeText(compilePrompt())}</textarea></details>
      <div class="output-choice mt"><div><h3>导出本地粗剪</h3><p>已有素材、字幕与上传口播 · WebM · 0 模型积分</p></div>${button('导出预览视频', 'export-preview', 'primary', viewState.renderBusy ? 'disabled' : '')}</div>
      <div class="output-choice"><div><h3>视频生成</h3><p>先确认方案，再准备素材与报价</p></div>${button('确认方案并准备生成', 'flow-build-brief', 'primary')}</div>
      <div class="notice warn mt">本地粗剪使用已有素材；模型生成需另行确认素材用途和本次费用</div>
      <details class="workspace-details"><summary>其他交付操作</summary><div class="row wrap gap8 mt">${button('导出脚本与 SRT', 'export-script')}${button('用此配置排产', 'nav', '', 'data-view="batch"')}${button('保存客户预设', 'save-template')}</div></details></div></section>`;
  }
  const origin = project?.originJobId ? client().jobs.find(job => job.id === project.originJobId) : null;
  return `<div class="session-path"><a href="#queue">工作队列</a><span>/</span><span>${escapeText(product().sku)}</span><span>/</span><span>${origin ? '产单编辑' : '单条制作'}</span></div>
    <div class="studio-top"><div><h1>${escapeText(project?.name || product().name + ' · ' + config.format)}</h1><div class="meta">${escapeText(product().name)} · ${config.platform} · ${config.intent}</div></div>${button('保存草稿', 'save-draft')}</div>
    <div class="studio-steps">${['商品资料', '拍法与出镜', '镜头脚本', '声音与字幕', '制作交付'].map((title, index) => `<button class="${stage === index ? 'current' : ''}" data-action="studio-stage" data-stage="${index}"><b>${index + 1}</b>${title}</button>`).join('')}</div>
    ${workspaceUi.screenIssues.length ? `<div class="notice warn mb" role="alert">${workspaceUi.screenIssues.map(escapeText).join('；')}</div>` : ''}
    <div class="studio-layout"><div class="studio-editor">${body}${stage === 1 || stage === 3 ? workspaceResourceStrip() : ''}
      <div class="step-footer">${button(icon('back') + ' 上一步', 'previous-stage', stage === 0 ? 'ghost' : '', stage === 0 ? 'disabled' : '')}${stage < 4 ? button('确认，进入' + ['拍法与出镜', '镜头脚本', '声音与字幕', '制作交付'][stage] + ' ' + icon('arrow'), 'next-stage', 'primary') : button('返回工作队列', 'nav', '', 'data-view="queue"')}</div></div>
      ${workspacePreview()}</div>`;
}

function workspaceResourceStrip() {
  const model = selectedModel();
  const look = selectedLook();
  const voice = selectedVoice();
  const provenance = state.config.presetName ? `来自预设：${escapeText(state.config.presetName)}` : '当前制作配置';
  return `<section class="card resource-strip"><div class="card-header"><h3>出镜与声音</h3><span class="meta">${provenance}</span></div><div class="resource-strip-grid">
    <button data-action="workspace-picker" data-kind="models"><span class="resource-strip-thumb">${model ? imageMarkup(model) : icon('people')}</span><span><small>出镜人</small><strong>${escapeText(model?.name || '不出镜')}</strong></span>${icon('settings')}</button>
    <button data-action="workspace-picker" data-kind="wardrobe"><span class="resource-strip-thumb">${look ? imageMarkup(getGarments().find(item => item.id === look.parts[0])) : icon('shirt')}</span><span><small>穿搭</small><strong>${escapeText(look?.name || '原图服装')}</strong></span>${icon('settings')}</button>
    <button data-action="workspace-picker" data-kind="voices"><span class="resource-strip-thumb">${icon('sound')}</span><span><small>口播</small><strong>${escapeText(voice?.name || '无口播')}</strong></span>${icon('settings')}</button>
    </div></section>`;
}

function workspacePreview() {
  const container = document.createElement('div');
  container.innerHTML = previewPanel();
  container.querySelector('.production-config')?.remove();
  const note = container.querySelector('.preview-note');
  if (note) note.textContent = '已有素材编排预览 · 不含新生成动作';
  return container.innerHTML;
}

function workspaceShotMarkup() {
  const shots = getShots();
  viewState.activeShot = Math.min(shots.length - 1, Math.max(0, viewState.activeShot));
  const index = viewState.activeShot;
  const shot = shots[index];
  const assigned = client().assets.find(asset => asset.id === shot.assetId);
  return `<div class="active-shot-header"><h3>${escapeText(shot.role)}</h3><label class="meta"><input type="checkbox" class="checkbox" data-lock-shot="${index}" ${shot.locked ? 'checked' : ''}> 锁定镜头</label></div>
    <p class="mono muted">${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s · ${shot.scale}</p>
    <label class="field mt"><span>画面与动作</span><textarea class="input" data-shot="${index}" data-shot-field="visual">${escapeText(shot.visual)}</textarea></label>
    <label class="field"><span>台词 / 旁白</span><textarea class="input" data-shot="${index}" data-shot-field="speech">${escapeText(shot.speech)}</textarea></label>
    <details class="workspace-details"><summary>素材与剪辑参数 <span>${escapeText(assigned?.name || '按出镜配置')}</span></summary><label class="field mt"><span>本镜素材</span><select class="input" data-shot="${index}" data-shot-field="assetId"><option value="">按出镜配置</option>${client().assets.filter(asset => ['图片', '视频'].includes(asset.kind)).map(asset => `<option value="${asset.id}" ${shot.assetId === asset.id ? 'selected' : ''}>${escapeText(asset.name)}</option>`).join('')}</select></label>
    ${assigned?.kind === '视频' ? `<label class="field"><span>片段起点（秒）</span><input class="input" type="number" min="0" step=".1" data-shot="${index}" data-shot-field="clipStart" value="${shot.clipStart || 0}"></label>` : ''}</details>`;
}

function workspaceRefreshShot() {
  const panel = document.getElementById('workspaceShotEdit');
  if (panel) panel.innerHTML = workspaceShotMarkup();
  document.querySelectorAll('.shot-list button').forEach((item, index) => {
    item.classList.toggle('active', index === viewState.activeShot);
    item.setAttribute('aria-selected', String(index === viewState.activeShot));
  });
}

function workspaceBatch() {
  const modes = [
    ['hooks', '同一商品，测试开场', '保留拍法、模特和后期'],
    ['people', '同一脚本，换出镜或声音', '画面与口播配置分别替换'],
    ['scenes', '同一商品，换场景', '保留卖点、台词与镜头结构'],
    ['products', '同一配方，应用多个 SKU', '每件商品重新确认事实'],
    ['advanced', '自定义组合', '多维组合，先限制产单数量']
  ];
  const batch = viewState.batch || { products: [state.config.productId], formats: [state.config.format], hooks: [state.config.hook], models: [state.config.modelId], voices: [state.config.voiceId], limit: 6, name: '本周素材测试', reviewer: '林川' };
  viewState.batch = batch;
  batch.models = batch.models || [state.config.modelId];
  batch.voices = batch.voices || [state.config.voiceId];
  batch.scenes = batch.scenes || [state.config.scene];
  const multiChips = (dimension, values) => `<div class="chips">${values.map(item => `<button class="chip ${batch[dimension].includes(item.id) ? 'selected' : ''}" data-action="batch-toggle" data-dimension="${dimension}" data-value="${escapeText(item.id)}" aria-pressed="${batch[dimension].includes(item.id)}">${escapeText(item.name)}</button>`).join('')}</div>`;
  const combinations = workspaceCombinations(batch);
  return `${headline('批量排产', '先决定这次改什么，其他配置保持一致', button('返回队列', 'nav', '', 'data-view="queue"'))}
    <div class="batch-modes">${modes.map(mode => `<button class="choice ${workspaceUi.batchMode === mode[0] ? 'selected' : ''}" data-action="workspace-batch-mode" data-mode="${mode[0]}"><strong>${mode[1]}</strong><p>${mode[2]}</p></button>`).join('')}</div>
    <div class="batch-workspace"><section class="card"><div class="card-header"><h3>本次变量</h3><span class="meta">${escapeText(product().sku)} · ${state.config.format}</span></div><div class="pad"><div class="setting-grid"><label class="field"><span>批次名称</span><input id="batchName" class="input" value="${escapeText(batch.name)}"></label>${selectorField('负责人', 'batchReviewer', ['林川', '周乔', '剪辑组'], batch.reviewer)}</div>
    ${workspaceUi.batchMode === 'products' || workspaceUi.batchMode === 'advanced' ? `<div class="option-group"><label>商品 / SKU</label>${multiChips('products', batchProducts().map(item => ({ id: item.id, name: item.name + ' · ' + item.sku })))}</div>` : ''}
    ${workspaceUi.batchMode === 'advanced' ? `<div class="option-group"><label>拍法</label>${multiChips('formats', categories[state.config.category].formats.map(format => ({ id: format, name: format })))}</div>` : ''}
    ${workspaceUi.batchMode === 'hooks' || workspaceUi.batchMode === 'advanced' ? `<div class="option-group"><label>开场方式</label>${multiChips('hooks', hooks.map(hook => ({ id: hook, name: hook })))}</div>` : ''}
    ${workspaceUi.batchMode === 'people' ? `<div class="option-group"><label>出镜人</label>${multiChips('models', [{ id: 'none', name: '不出镜' }, ...getModels()])}</div><div class="option-group"><label>口播</label>${multiChips('voices', [{ id: 'none', name: '无口播' }, ...getVoices()])}</div>` : ''}
    ${workspaceUi.batchMode === 'scenes' ? `<div class="option-group"><label>本轮只改场景</label>${multiChips('scenes', scenes.map(scene => ({ id: scene, name: scene })))}</div><p class="meta">不会重写原台词或更换商品。仅建立草稿产单，不生成场景图、不自动出片；逐条核对动作与场景是否适配。</p>` : ''}
    <label class="field"><span>最多创建产单数</span><input id="batchLimit" class="input" type="number" min="1" max="100" value="${batch.limit}" style="width:110px"></label>
    <details class="workspace-details"><summary>查看继承配置</summary><div class="summary-fields mt"><div><label>拍法 / 场景</label>${state.config.format} · ${state.config.scene}</div><div><label>声音 / 字幕</label>${escapeText(selectedVoice()?.name || '无口播')} · ${state.config.subtitle}</div><div><label>穿搭</label>${escapeText(selectedLook()?.name || '原图服装')}</div><div><label>事实来源</label>${escapeText(state.config.presetName || '当前商品配置')}</div></div></details></div></section>
    <aside class="card pad batch-budget"><h3>创建前确认</h3><div class="batch-count"><strong>${combinations.length}</strong><span>条产单</span></div><dl><div><dt>本次费用</dt><dd>0 积分</dd></div><div><dt>视频提交</dt><dd>不提交</dd></div><div><dt>视频示例预算</dt><dd>${combinations.length * 90} 积分</dd></div><div><dt>客户预算上限</dt><dd>${client().budget} 积分</dd></div></dl>
    ${combinations.length * 90 > client().budget ? '<div class="notice warn">视频示例预算超出客户上限；创建产单仍不产生费用</div>' : ''}
    <p class="meta">视频价格为示例，正式提交时核对真实报价</p>${button('创建这批产单', 'workspace-commit-batch', 'primary full mt', !combinations.length ? 'disabled' : '')}</aside></div>
    <section class="card mt"><div class="card-header"><h3>产单预览</h3><span class="meta">${combinations.length} 条 · 逐条确认后提交</span></div><div class="table-wrap"><table><thead><tr><th>SKU</th><th>拍法</th><th>开场${workspaceUi.batchMode === 'scenes' ? ' / 场景' : ''}</th><th>出镜 / 声音</th><th>待确认项</th></tr></thead><tbody>${combinations.map(item => `<tr><td>${escapeText(item.sku)}</td><td>${item.format}</td><td>${item.hook}${workspaceUi.batchMode === 'scenes' ? `<p class="meta">${escapeText(item.scene)}</p>` : ''}</td><td>${escapeText(getModels().find(model => model.id === item.modelId)?.name || '不出镜')}<div class="meta">${escapeText(getVoices().find(voice => voice.id === item.voiceId)?.name || '无口播')}</div></td><td>${item.productId !== state.config.productId ? '商品事实与脚本' : workspaceUi.batchMode === 'scenes' ? '动作与新场景、脚本' : item.modelId !== state.config.modelId ? '出镜与穿搭、脚本' : '脚本'}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function workspaceCombinations(batch) {
  const combinations = [];
  const config = state.config;
  const products = workspaceUi.batchMode === 'products' || workspaceUi.batchMode === 'advanced' ? batch.products : [config.productId];
  const formats = workspaceUi.batchMode === 'advanced' ? batch.formats : [config.format];
  const openings = workspaceUi.batchMode === 'hooks' || workspaceUi.batchMode === 'advanced' ? batch.hooks : [config.hook];
  const models = workspaceUi.batchMode === 'people' ? batch.models : [config.modelId];
  const voices = workspaceUi.batchMode === 'people' ? batch.voices : [config.voiceId];
  const locations = workspaceUi.batchMode === 'scenes' ? batch.scenes || [config.scene] : [config.scene];
  const limit = Math.max(1, Math.min(100, Number(batch.limit) || 1));
  for (const productId of products) for (const format of formats) for (const hook of openings) for (const modelId of models) for (const voiceId of voices) for (const scene of locations) {
    if (combinations.length >= limit) return combinations;
    const item = batchProducts().find(productItem => productItem.id === productId);
    if (!item) continue;
    combinations.push({ productId, sku: item.sku, format, hook, modelId, voiceId, scene });
  }
  return combinations;
}

function workspaceFlushInputs() {
  ['claims', 'price', 'note'].forEach(field => {
    const input = document.getElementById(field);
    if (input) state.config[field] = input.value;
  });
  const project = client().projects.find(item => item.id === state.config.draftId);
  document.querySelectorAll('[data-shot]').forEach(input => {
    if (project?.shots?.[Number(input.dataset.shot)]) project.shots[Number(input.dataset.shot)][input.dataset.shotField] = input.dataset.shotField === 'clipStart' ? Math.max(0, Number(input.value) || 0) : input.value;
  });
  persist();
}

function workspaceOpenPicker(kind, preserveFocus = false) {
  workspaceFlushInputs();
  workspaceUi.resourcePicker = kind;
  const titles = { models: '选择出镜人', wardrobe: '选择穿搭', voices: '选择口播', assets: '选择客户素材' };
  const options = { models: getModels(), wardrobe: client().looks, voices: getVoices(), assets: client().assets };
  const items = (options[kind] || []).filter(item => `${item.name} ${item.sku || ''} ${item.style || ''}`.toLowerCase().includes(workspaceUi.pickerQuery.toLowerCase()));
  const body = `<p class="drawer-context">${escapeText(product().name)} · 当前制作不会中断</p>
    <div class="drawer-toolbar"><input id="workspacePickerQuery" class="input" placeholder="搜索资源" aria-label="搜索选择资源" value="${escapeText(workspaceUi.pickerQuery)}">${button('管理', 'workspace-manage-resource', 'sm', `data-kind="${kind}"`)}</div>
    ${kind !== 'assets' ? `<button class="picker-row" data-action="workspace-pick-resource" data-kind="${kind}" data-id="${kind === 'wardrobe' ? '' : 'none'}"><span class="picker-thumb">${icon(kind === 'models' ? 'people' : kind === 'voices' ? 'sound' : 'shirt')}</span><div><strong>${kind === 'models' ? '不出镜，使用商品画面' : kind === 'voices' ? '无口播' : '使用原图服装'}</strong></div></button>` : ''}
    ${items.length ? items.map(item => {
      const selected = kind === 'models' ? state.config.modelId === item.id : kind === 'wardrobe' ? state.config.lookId === item.id : kind === 'voices' ? state.config.voiceId === item.id : state.config.assets.includes(item.id);
      const thumb = kind === 'wardrobe' ? getGarments().find(garment => garment.id === item.parts[0]) : item;
      return `<div class="picker-row ${selected ? 'selected' : ''}"><span class="picker-thumb">${kind === 'voices' ? icon('sound') : imageMarkup(thumb)}</span><div class="grow"><strong>${escapeText(item.name)}</strong><p>${escapeText(kind === 'models' ? `${item.gender} · ${item.style}` : kind === 'wardrobe' ? `${item.parts.length} 件 · ${getModels().find(model => model.id === item.modelId)?.name || '原出镜人'}` : kind === 'voices' ? item.fileId ? '真人录音' : '系统试听' : item.sku || item.kind)}</p>${kind === 'models' && item.scope === 'demo' ? '<span class="meta">示例形象</span>' : ''}</div><div class="row gap8">${kind === 'voices' ? button(icon('play'), 'preview-voice', 'ghost sm', `data-id="${item.id}" aria-label="试听 ${escapeText(item.name)}"`) : ''}${button(selected ? '已选' : '选用', 'workspace-pick-resource', selected ? 'sm' : 'sm primary', `data-kind="${kind}" data-id="${item.id}"`)}</div></div>`;
    }).join('') : `<div class="picker-empty"><h3>${workspaceUi.pickerQuery ? '没有匹配资源' : '还没有保存的资源'}</h3><p>${workspaceUi.pickerQuery ? '换一个名称，或清空搜索' : '进入资源管理上传并保存，完成后回到这条素材'}</p></div>`}
    <div class="drawer-bottom"><span>归属：${escapeText(client().name)}</span>${button('返回制作', 'close-modal')}</div>`;
  const activeElement = preserveFocus ? viewState.returnFocus : document.activeElement;
  openModal(titles[kind], body);
  overlay.querySelector('.modal-backdrop').classList.add('resource-drawer-backdrop');
  overlay.querySelector('.modal').classList.add('resource-drawer');
  viewState.returnFocus = activeElement;
}

function workspaceCommitBatch() {
  const current = client();
  const batch = viewState.batch;
  if (!batch?.name.trim()) { toast('请填写批次名称'); return; }
  const combinations = workspaceCombinations(batch);
  if (!combinations.length) { toast('请选择本次变量'); return; }
  if (!collabCan('edit', collabDefaultCampaign(state.activeClient))) return collabReject();
  const baseline = client().projects.find(work => work.id === state.config.draftId);
  const baselineShots = collabCopy(getShots());
  combinations.forEach(item => {
    const sameProduct = item.productId === state.config.productId;
    const config = { ...JSON.parse(JSON.stringify(state.config)), ...item, draftId: '', originJobId: null, factsConfirmed: sameProduct && state.config.factsConfirmed, claims: sameProduct ? state.config.claims : batchProducts().find(productItem => productItem.id === item.productId)?.claims || '当前商品事实待确认', price: sameProduct ? state.config.price : '', assets: sameProduct ? [...state.config.assets] : [] };
    if (item.modelId !== state.config.modelId) config.lookId = '';
    if (workspaceUi.batchMode === 'scenes') config.generationCapability = 'scene';
    if (!sameProduct) {
      config.factRecords = []; config.materialRefs = []; config.referenceContext = null; config.inputApproval = null;
    }
    const version = current.jobs.filter(job => job.sku === item.sku && job.format === config.format && job.config?.hook === config.hook).length + 1;
    const shots = (['people', 'scenes'].includes(workspaceUi.batchMode) ? collabCopy(baselineShots) : generateScript(config)).map(shot => ({ ...shot, visual: workspaceUi.batchMode === 'scenes' ? shot.visual.split(state.config.scene).join(item.scene) : shot.visual, locked: false }));
    const job={ id: uniqueId('job'), name: `${item.sku}_${item.format}_${workspaceUi.batchMode === 'scenes' ? item.scene : item.hook}_V${version}`, sku: item.sku, format: item.format, batch: batch.name, model: getModels().find(model => model.id === config.modelId)?.name || '不出镜', voice: getVoices().find(voice => voice.id === config.voiceId)?.name || '无口播', reviewer: batch.reviewer, status: config.factsConfirmed ? '待脚本确认' : '待资源确认', cost: null, version, config, shots, comments: [], demo: false, variation: { sourceWorkId: baseline?.id || null, sourcePlanSignature: baseline?.accepted?.signature || null, dimension: workspaceUi.batchMode, scene: item.scene, humanReviewRequired: true } };
    collabRegisterJob(job);
    current.jobs.unshift(job);
  });
  persist();
  workspaceUi.queueScope = '待处理';
  workspaceUi.batch = batch.name;
  viewState.selectedJobs.clear();
  viewState.tablePage = 1;
  navigate('queue');
  toast(`已创建 ${combinations.length} 条产单，未提交生成`);
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'nav' && viewState.view === 'studio') workspaceFlushInputs();
  if (action === 'next-stage' || action === 'previous-stage' || action === 'studio-stage' || action === 'save-draft') workspaceFlushInputs();
  if (action.startsWith('workspace-')) {
    workspaceFlushInputs();
    switch (action) {
      case 'workspace-scope': workspaceUi.queueScope = target.dataset.value; viewState.tablePage = 1; viewState.selectedJobs.clear(); render(); break;
      case 'workspace-page': viewState.tablePage += Number(target.dataset.direction); render(); break;
      case 'workspace-reset': workspaceUi.query = ''; workspaceUi.batch = '全部批次'; workspaceUi.owner = '全部负责人'; viewState.tablePage = 1; viewState.selectedJobs.clear(); render(); break;
      case 'workspace-resource-tab': workspaceUi.resourceTab = target.dataset.tab; navigate('resources'); break;
      case 'workspace-formats': workspaceUi.allFormats = !workspaceUi.allFormats; render(); break;
      case 'workspace-shot': viewState.activeShot = Number(target.dataset.index); render(); updatePreview(viewState.activeShot, getShots()[viewState.activeShot].start); break;
      case 'workspace-script-settings':
        openModal('调整镜头结构', `${selectorField('时长', 'workspaceDuration', ['4', '5', '8', '10', '15', '20', '30'], String(state.config.duration))}${selectorField('镜头数', 'workspaceShotCount', [{ id: 1, name: '1 镜 · 短片测试' }, { id: 3, name: '3 镜 · 单卖点' }, { id: 4, name: '4 镜 · 口播与证据' }, { id: 5, name: '5 镜 · 节奏混剪' }], state.config.shotsCount)}<p class="meta">更改会重排未锁定镜头</p>${button('应用', 'workspace-apply-structure', 'primary mt')}`);
        break;
      case 'workspace-apply-structure': {
        state.config.duration = Number(document.getElementById('workspaceDuration').value);
        state.config.shotsCount = Number(document.getElementById('workspaceShotCount').value);
        const project = ensureDraft();
        if (project.flow) flowRestructureShots(project, state.config.shotsCount, state.config.duration);
        else project.shots = generateScript();
        viewState.activeShot = 0;
        saveDraft();
        closeModal();
        render();
        toast('镜头结构已更新，锁定镜头保留');
        break;
      }
      case 'workspace-picker': workspaceUi.pickerQuery = ''; workspaceOpenPicker(target.dataset.kind); break;
      case 'workspace-pick-resource': {
        const kind = target.dataset.kind;
        const id = target.dataset.id;
        if (kind === 'models') { state.config.modelId = id; if (selectedLook()?.modelId !== id) state.config.lookId = ''; }
        if (kind === 'voices') state.config.voiceId = id;
        if (kind === 'wardrobe') { state.config.lookId = id; if (id) state.config.modelId = selectedLook().modelId; }
        if (kind === 'assets') state.config.assets = [...new Set([...state.config.assets, id])];
        saveDraft();
        closeModal();
        render();
        toast('已应用到当前素材');
        break;
      }
      case 'workspace-manage-resource': {
        workspaceUi.resourceTab = target.dataset.kind;
        workspaceUi.resourceReturn = { stage: viewState.stage, draftId: state.config.draftId, view: viewState.view };
        navigate('resources');
        break;
      }
      case 'workspace-return-studio': {
        const returnView = workspaceUi.resourceReturn?.view || 'studio';
        viewState.stage = workspaceUi.resourceReturn?.stage ?? viewState.stage;
        workspaceUi.resourceReturn = null;
        navigate(returnView);
        break;
      }
      case 'workspace-preset':
        openModal('套用客户预设', [...client().templates, ...client().preferences].length ? `<div class="stack">${[...client().templates, ...client().preferences].map(preset => `<button class="choice" data-action="workspace-use-preset" data-id="${preset.id}"><strong>${escapeText(preset.name)}</strong><p>${preset.config.category} · ${preset.config.format}</p></button>`).join('')}</div>` : '<p class="muted">当前客户还没有预设，选好拍法与资源后可保存</p>');
        break;
      case 'workspace-use-preset': {
        const preset = [...client().templates, ...client().preferences].find(item => item.id === target.dataset.id);
        const currentDraft = state.config.draftId;
        const previousConfig = state.config;
        const sameProduct = previousConfig.productId === preset.config.productId;
        state.config = { ...defaultConfig(), ...JSON.parse(JSON.stringify(preset.config)), category: previousConfig.category, productId: previousConfig.productId, claims: previousConfig.claims, price: previousConfig.price, assets: [...previousConfig.assets], factsConfirmed: previousConfig.factsConfirmed, draftId: currentDraft, originJobId: previousConfig.originJobId || null, presetName: preset.name };
        if (!categories[state.config.category].formats.includes(state.config.format)) state.config.format = categories[state.config.category].style;
        if (!sameProduct) state.config.evidence = previousConfig.evidence;
        const project = ensureDraft();
        project.shots = generateScript();
        saveDraft();
        closeModal();
        render();
        toast('已带入客户预设，可继续调整');
        break;
      }
      case 'workspace-batch-mode': workspaceUi.batchMode = target.dataset.mode; if (target.dataset.mode === 'scenes' && viewState.batch) { viewState.batch.scenes ||= [state.config.scene]; viewState.batch.limit = Math.min(3, viewState.batch.limit); } render(); break;
      case 'workspace-commit-batch': workspaceCommitBatch(); break;
      case 'workspace-open-job': {
        const job = client().jobs.find(item => item.id === target.dataset.id);
        state.config = { ...defaultConfig(), ...JSON.parse(JSON.stringify(job.config)), draftId: '', originJobId: job.id };
        const project = ensureDraft();
        project.originJobId = job.id;
        project.name = job.name;
        project.shots = JSON.parse(JSON.stringify(job.shots || generateScript()));
        viewState.stage = job.status === '待资源确认' ? 0 : 2;
        viewState.activeShot = 0;
        workspaceUi.screenIssues = [];
        persist();
        navigate('studio');
        break;
      }
      case 'workspace-due':
        openModal('设置任务截止', `<label class="field"><span>截止日期</span><input id="workspaceDueDate" class="input" type="date"></label>${button('保存截止日期', 'workspace-save-due', 'primary')}`);
        break;
      case 'workspace-save-due': {
        const date = document.getElementById('workspaceDueDate').value;
        if (!date) { toast('请选择截止日期'); break; }
        client().jobs.filter(job => viewState.selectedJobs.has(job.id)).forEach(job => { job.dueDate = date; });
        persist();
        closeModal();
        render();
        toast('截止日期已更新');
        break;
      }
    }
  }
}, true);

document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'activeClient') {
    workspaceUi.query = '';
    workspaceUi.batch = '全部批次';
    workspaceUi.owner = '全部负责人';
    workspaceUi.screenIssues = [];
    workspaceUi.resourceReturn = null;
    viewState.tablePage = 1;
    viewState.activeShot = 0;
  }
  if (target.id === 'workspaceBatch') { workspaceUi.batch = target.value; viewState.tablePage = 1; viewState.selectedJobs.clear(); render(); }
  if (target.id === 'workspaceOwner') { workspaceUi.owner = target.value; viewState.tablePage = 1; viewState.selectedJobs.clear(); render(); }
  if (target.id === 'workspaceSelectPage') {
    document.querySelectorAll('[data-select-job]').forEach(input => {
      if (target.checked) viewState.selectedJobs.add(input.dataset.selectJob);
      else viewState.selectedJobs.delete(input.dataset.selectJob);
    });
    render();
  }
  if (target.id === 'duration' || target.id === 'shotsCount') viewState.activeShot = 0;
});

document.addEventListener('toggle', event => {
  if (event.target.isConnected && event.target.dataset?.workspaceDetails === 'advanced') workspaceUi.advanced = event.target.open;
}, true);

document.addEventListener('change', () => {
  const advanced = document.querySelector('[data-workspace-details="advanced"]');
  if (advanced) workspaceUi.advanced = advanced.open;
}, true);

document.addEventListener('input', event => {
  const input = event.target;
  if (input.id === 'workspaceQuery') {
    const position = input.selectionStart;
    workspaceUi.query = input.value;
    viewState.tablePage = 1;
    viewState.selectedJobs.clear();
    render();
    const replacement = document.getElementById('workspaceQuery');
    replacement.focus();
    replacement.setSelectionRange(position, position);
  }
  if (input.id === 'workspacePickerQuery') {
    const position = input.selectionStart;
    workspaceUi.pickerQuery = input.value;
    workspaceOpenPicker(workspaceUi.resourcePicker, true);
    const replacement = document.getElementById('workspacePickerQuery');
    replacement.focus();
    replacement.setSelectionRange(position, position);
  }
});
