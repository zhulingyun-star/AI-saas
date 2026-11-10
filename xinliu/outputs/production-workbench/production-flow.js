'use strict';

const flowUi = { query: '', category: '全部品类', scope: '推荐', kind: '电商视频', page: 1, knowledgeTab: '配方与作品', issue: '', resultShot: 0, busy: false };
const flowRecipeSeeds = [
  { id: 'wear', name: '先看上身，再看细节', category: '服饰鞋包', format: '上身试穿', productId: 'coat', hook: '实物先展示', scene: '居家窗边', roles: ['上身开场', '版型展示', '细节证据', '商品收尾'], actions: ['正面全身展示，不先拍空场景', '正侧背展示，动作自然，衣长与颜色一致', '近景展示客户确认的细节，不凭空设计性能测试', '商品清晰定格，后期添加行动文案'], need: '商品正侧背图片；试穿动作优先使用实拍', duration: 15 },
  { id: 'talk', name: '一句口播，接一个商品近景', category: '服饰鞋包', format: '真人口播', productId: 'tee', hook: '痛点直给', scene: '居家窗边', roles: ['直接开场', '商品露脸', '实物证据', '行动落点'], actions: ['人物面对固定机位，第一句话点出商品话题', '人物指向商品，画面与口播同步', '切商品细节近景，使用当前SKU实拍', '回到人物或商品，简短收尾'], need: '商品图；可选真人口播与细节视频', duration: 15 },
  { id: 'detail', name: '不出镜，三镜讲清一件商品', category: '服饰鞋包', format: '细节演示', productId: 'coat', hook: '实物先展示', scene: '桌面操作', modelId: 'none', roles: ['商品全貌', '细节证据', '规格收尾'], actions: ['完整展示当前商品，保留真实款式和颜色', '近景展示一个已确认的细节，使用客户素材', '商品定格与规格文字分层，价格只在确认后出现'], need: '主图与细节图；已有素材可直接编排', duration: 10 },
  { id: 'beauty', name: '质地先入镜，步骤接着讲', category: '美妆个护', format: '手部试用', productId: 'cream', hook: '实物先展示', scene: '桌面操作', modelId: 'none', roles: ['质地开场', '包装展示', '用法证据', '商品收尾'], actions: ['用客户实拍展示质地，不伪造使用前后效果', '包装与容量展示清晰，品牌文字以后期为准', '按客户确认的步骤展示操作，不新增功效', '包装定格，提示查看商品说明'], need: '包装图、质地实拍；功效资料需客户确认', duration: 15 },
  { id: 'food', name: '开袋见实物，再讲配料规格', category: '食品饮料', format: '开袋试吃', hook: '实物先展示', scene: '厨房餐桌', modelId: 'none', roles: ['实物开场', '开袋动作', '配料规格', '包装收尾'], actions: ['包装与食物一起入镜，确认对应关系', '优先复用真实开袋视频，避免包装变形', '只展示客户确认的配料与规格', '回到包装与食物，保留商品识别'], need: '包装图、配料资料；开袋素材优先实拍', duration: 15 },
  { id: 'home-use', name: '先摆出问题，再演示用法', category: '家居百货', format: '痛点演示', hook: '痛点直给', scene: '桌面操作', modelId: 'none', roles: ['具体困扰', '商品进入', '操作证据', '场景回收'], actions: ['用真实场景呈现一个具体困扰', '展示商品结构与尺寸，不编造适配范围', '按客户素材演示操作步骤', '同一场景回收问题，不夸大效果'], need: '商品图、尺寸资料；操作视频', duration: 15 },
  { id: 'digital-use', name: '一个功能，一段真实操作', category: '3C数码', format: '使用教程', hook: '使用步骤', scene: '桌面操作', modelId: 'none', roles: ['功能开场', '操作步骤', '结果核对', '参数收尾'], actions: ['展示一个客户确认的功能，不新增参数', '使用客户录屏或实拍，按真实步骤操作', '画面显示实际操作结果，不生成虚构界面', '商品与必要参数定格，参数以客户资料为准'], need: '商品图、参数资料；真实录屏或操作视频', duration: 15 },
  { id: 'pet-daily', name: '养宠日常，商品自然入镜', category: '宠物用品', format: '养宠日常', hook: '实物先展示', scene: '居家窗边', modelId: 'none', roles: ['日常开场', '商品用法', '包装收尾'], actions: ['用客户真实宠物素材交代日常场景', '使用客户实拍展示商品用法，不伪造宠物偏好或健康变化', '包装、适用范围与规格按客户确认资料展示'], need: '商品包装、适用资料；真实宠物使用素材', duration: 10 },
  { id: 'comic', name: '两人对话，一处生活反转', kind: '漫剧', category: '信息流漫剧', format: '生活反转', hook: '生活小冲突', scene: '办公室', roles: ['矛盾开场', '追问', '反转', '卡点收尾'], actions: ['角色A提出具体误会，交代人物关系', '角色B追问，保持服装、声音和场景连续', '一个行动揭示误会，不增加额外人物', '回收开场或留下明确悬念'], need: '两位角色参考；对白与场景设定', duration: 20 }
];

const flowCopy = value => JSON.parse(JSON.stringify(value));
function flowCurrent() {
  const current = client();
  current.recipes ||= [];
  current.knowledge ||= [];
  current.favorites ||= [];
  current.facts ||= {};
  return current;
}
function flowRecipes() {
  return [...guardNormalize().recipes.filter(recipe => recipe.status === '已发布' && (!recipe.validUntil || recipe.validUntil >= guardToday())), ...flowRecipeSeeds.map(seed => ({ ...seed, kind: seed.kind || '电商视频', demo: true }))];
}
function flowRecipe(id) { return [...flowCurrent().recipes, ...flowRecipeSeeds.map(seed => ({ ...seed, kind: seed.kind || '电商视频', demo: true }))].find(item => item.id === id); }
function flowProject() {
  const project = ensureDraft();
  project.shots ||= generateScript();
  project.history ||= [];
  guardContext(project);
  return project;
}
function flowSnapshot(project, label) {
  project.history ||= [];
  project.history.unshift({ id: uniqueId('version'), label, time: new Date().toISOString(), config: flowCopy(state.config), shots: flowCopy(project.shots || getShots()), accepted: flowCopy(project.accepted || null), drama: flowCopy(project.drama || null), result: flowCopy(project.result || null) });
}
function flowSignature(config, shots, drama = null) {
  const clean = flowCopy(config);
  ['draftId', 'originJobId', 'factsConfirmed', 'inputApproval'].forEach(key => delete clean[key]);
  (clean.factRecords || []).forEach(record => { ['confirmed', 'confirmedAt', 'confirmedBy'].forEach(key => delete record[key]); });
  (clean.knowledgeSnapshots || []).forEach(record => delete record.captured);
  return JSON.stringify({ config: clean, shots, drama });
}
function flowTrackChanges(project) {
  if (!project.accepted) return;
  const changed = flowSignature(state.config, project.shots || [], project.drama || null) !== project.accepted.signature;
  project.planChanged = changed;
  if (project.result) project.result.outdated = changed || project.result.planSignature !== project.accepted.signature;
}
function flowNav() {
  return `<div class="flow-subnav">${[['home', '今日制作'], ['gallery', '样片广场'], ['queue', '工作队列']].map(([view, label]) => `<button data-action="nav" data-view="${view}" class="${viewState.view === view ? 'active' : ''}" ${viewState.view === view ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</div>`;
}
function flowRecipeCover(recipe) {
  if (recipe.videoFileId) return `<video data-file="${escapeText(recipe.videoFileId)}" controls preload="metadata" playsinline></video>`;
  const item = productCatalog.find(productItem => productItem.id === recipe.productId) || productCatalog.find(productItem => productItem.category === recipe.category);
  return item && recipe.kind !== '漫剧' ? imageMarkup(item) : imageMarkup({name:'漫剧分镜原创示意',image:'media/drama-preview.svg'});
}
function flowRecipeCards(recipes) {
  return `<div class="flow-gallery-grid">${recipes.map(recipe => `<article class="flow-recipe"><div class="flow-recipe-cover">${flowRecipeCover(recipe)}<span class="flow-cover-label">${recipe.videoFileId ? '客户上传成片' : recipe.demo ? '配方示例 · 非生成成片' : '已保存方案 · 无成片'}</span></div><div class="flow-recipe-body"><div class="row between gap8"><h3>${escapeText(recipe.name)}</h3><button class="flow-favorite ${flowCurrent().favorites.includes(recipe.id) ? 'selected' : ''}" data-action="flow-favorite" data-id="${recipe.id}" aria-label="${flowCurrent().favorites.includes(recipe.id) ? '取消收藏' : '收藏'} ${escapeText(recipe.name)}" aria-pressed="${flowCurrent().favorites.includes(recipe.id)}">${icon('book')}</button></div><p>${escapeText(recipe.category)} · ${recipe.duration || 15}s · ${escapeText(recipe.format)}</p><div class="flow-recipe-foot"><span>${recipe.demo ? '示例配方' : '客户私有'}</span>${button('查看并套用', 'flow-recipe-detail', 'sm', `data-id="${recipe.id}"`)}</div></div></article>`).join('')}</div>`;
}
function flowHome() {
  const current = flowCurrent();
  const drafts = current.projects.filter(project => project.status !== '已归档').slice(0, 3);
  const preferred = flowRecipes().filter(recipe => recipe.kind !== '漫剧').sort((left, right) => Number(!right.demo) - Number(!left.demo) || Number(current.favorites.includes(right.id)) - Number(current.favorites.includes(left.id)));
  return `${headline('今日制作', escapeText(current.name), button('直接做视频 ' + icon('plus'), 'guard-direct', 'primary') + button('从样片开始', 'flow-gallery'))}${flowNav()}${guardHomeSwitch()}
    <section class="flow-start"><div class="flow-start-actions">${button(icon('film') + ' 参考片改编', 'flow-reference')}${button(icon('file') + ' 导入已有脚本', 'flow-import')}${button(icon('people') + ' 做一条漫剧', 'flow-drama-start')}</div></section>
    <section class="flow-section"><div class="flow-section-head"><h3>继续制作</h3><button class="link" data-action="nav" data-view="queue">全部任务 ${current.jobs.length}</button></div>${drafts.length ? `<div class="flow-resume-list">${drafts.map(project => `<button class="flow-resume" data-action="flow-resume" data-id="${project.id}"><span class="flow-resume-icon">${icon(project.drama ? 'people' : 'film')}</span><span class="grow"><strong>${escapeText(project.name)}</strong><small>${escapeText(project.drama ? '漫剧' : project.sku)} · ${project.planChanged ? '方案已变更，待重新确认' : project.result ? '待对照检查' : project.accepted ? '方案已确认' : '待确认方案'}</small></span>${icon('arrow')}</button>`).join('')}</div>` : `<div class="flow-empty-inline">没有未完成任务，选一个样片开始即可${button('载入示例客户', 'load-demo', 'ghost sm')}</div>`}</section>
    <section class="flow-section"><div class="flow-section-head"><h3>${current.recipes.length ? '客户常用' : '常用拍法'}</h3><button class="link" data-action="flow-gallery">查看全部</button></div>${flowRecipeCards(preferred.slice(0, 4))}</section>`;
}
function flowGallery() {
  const current = flowCurrent();
  const recipes = flowRecipes().filter(recipe => recipe.kind === flowUi.kind && (flowUi.category === '全部品类' || recipe.category === flowUi.category) && (flowUi.scope === '推荐' || flowUi.scope === '我的收藏' && current.favorites.includes(recipe.id) || flowUi.scope === '客户私有' && !recipe.demo) && `${recipe.name} ${recipe.format} ${recipe.category}`.toLowerCase().includes(flowUi.query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(recipes.length / 12));
  flowUi.page = Math.min(pages, flowUi.page);
  return `${headline('样片广场', '选效果、看所需素材，再套用到当前客户', button('导入已有脚本', 'flow-import'))}${flowNav()}
    <div class="flow-filterbar">${flowTabs('kind', ['电商视频', '漫剧'], flowUi.kind)}${workspaceSelect('样片品类', 'flowCategory', ['全部品类', ...Object.keys(categories).filter(category => flowUi.kind === '漫剧' ? category === '信息流漫剧' : category !== '信息流漫剧')], flowUi.category)}${workspaceSelect('样片范围', 'flowScope', ['推荐', '我的收藏', '客户私有'], flowUi.scope)}<input class="input" id="flowSearch" placeholder="搜索拍法或名称" aria-label="搜索样片" value="${escapeText(flowUi.query)}"></div>
    ${recipes.length ? flowRecipeCards(recipes.slice((flowUi.page - 1) * 12, flowUi.page * 12)) : emptyState('没有匹配的样片', flowUi.scope === '客户私有' ? '确认方案或上传成片后，可保存为客户私有配方' : '换个筛选条件，或清空搜索', button('重置筛选', 'flow-reset'))}
    <div class="pagination"><span class="meta">${recipes.length} 个 · ${flowUi.page} / ${pages} 页</span><div class="row gap8">${button('上一页', 'flow-page', 'sm', `data-direction="-1" ${flowUi.page === 1 ? 'disabled' : ''}`)}${button('下一页', 'flow-page', 'sm', `data-direction="1" ${flowUi.page === pages ? 'disabled' : ''}`)}</div></div>`;
}
function flowTabs(field, options, selected) {
  return `<div class="flow-tabs">${options.map(option => `<button class="${option === selected ? 'active' : ''}" data-action="flow-tab" data-field="${field}" data-value="${option}" aria-pressed="${option === selected}">${option}</button>`).join('')}</div>`;
}
function flowShowRecipe(id) {
  const recipe = flowRecipe(id);
  if (!recipe) return;
  openModal(recipe.name, `<div class="flow-recipe-detail"><div class="flow-detail-cover">${flowRecipeCover(recipe)}<p class="meta">${recipe.videoFileId ? '客户上传成片；不代表模型稳定复现' : '当前为配方与素材示例，不是生成效果证明'}</p></div><div><p class="meta">${escapeText(recipe.category)} · ${recipe.duration}s · ${escapeText(recipe.format)}${recipe.demo ? '' : ' · V' + recipe.version + ' · ' + recipe.status}</p><h3 class="mt">保留拍法，替换商品内容</h3><ol class="flow-shot-outline">${(recipe.roles || []).map((role, index) => `<li><span class="mono">${String(index + 1).padStart(2, '0')}</span><div><strong>${escapeText(role)}</strong><p>${escapeText(recipe.actions?.[index] || recipe.shots?.[index]?.visual || '详见保存脚本')}</p></div></li>`).join('')}</ol><div class="flow-inline-note"><strong>需要准备</strong><p>${escapeText(recipe.need || '商品事实与对应素材；不同SKU必须重新核对')}</p></div><p class="meta mt">套用与编辑不调用视频模型；真实生成报价尚未接入</p>${button(recipe.kind === '漫剧' ? '使用这个故事结构' : '换成我的商品', 'flow-use-recipe', 'primary full mt', `data-id="${id}" ${!recipe.demo && (recipe.status !== '已发布' || recipe.validUntil && recipe.validUntil < guardToday()) ? 'disabled' : ''}`)}${!recipe.demo ? button('导出配方、Prompt 与 Skill', 'flow-export-recipe', 'full mt', `data-id="${id}"`) : ''}</div></div>`, true);
}
function flowChooseProduct(productId) {
  const item = [...productCatalog, ...client().assets].find(asset => asset.id === productId);
  const saved = flowCurrent().facts[productId];
  state.config.productId = productId;
  state.config.claims = saved?.claims || '';
  state.config.price = saved?.price || '';
  state.config.factsConfirmed = Boolean(saved);
  state.config.assets = item && client().assets.some(asset => asset.id === item.id) ? [item.id] : [];
  if (saved) {
    state.config.claimFocus = saved.claimFocus || state.config.claimFocus;
    state.config.evidence = saved.evidence || state.config.evidence;
  }
  if (item?.category && item.category !== '信息流漫剧') state.config.category = item.category;
  guardLoadFacts(productId, saved);
}
function flowApplyRecipe(recipe) {
  if (state.config.draftId) saveDraftIfNeeded();
  const previous = flowCopy(state.config);
  const preset = flowCurrent().preferences.find(item => item.enabled !== false)?.config || {};
  state.config = { ...defaultConfig(), ...flowCopy(preset), ...flowCopy(recipe.config || {}), category: recipe.category, format: recipe.format, hook: recipe.hook || '实物先展示', scene: recipe.scene || '居家窗边', duration: recipe.duration || 15, shotsCount: recipe.roles?.length || 4, recipeId: recipe.id, recipeName: recipe.name, recipeVersion: recipe.version || 1, direct: false, draftId: '', originJobId: null, price: '', claims: '', assets: [], factsConfirmed: false, note: '', factRecords: [], materialRefs: [], knowledgeIds: [], knowledgeSnapshots: [], outputSpec: { aspect: '9:16', resolution: '1080p', model: 'Seedance 2.5（待接入）' }, executionScope: { count: 1, automatic: false, retries: 0, budgetLimit: null } };
  if (!categories[recipe.category].claims.includes(state.config.claimFocus)) state.config.claimFocus = categories[recipe.category].claims[0];
  if (!categories[recipe.category].evidence.includes(state.config.evidence)) state.config.evidence = categories[recipe.category].evidence[0];
  if (!selectedLook() || selectedLook().modelId !== state.config.modelId) state.config.lookId = '';
  if (recipe.modelId) state.config.modelId = recipe.modelId;
  if (recipe.kind === '漫剧') {
    state.config.category = '信息流漫剧';
    state.config.productId = '';
    state.config.modelId = 'none';
    state.config.cta = '无行动文案';
  } else {
    const available = [...productCatalog, ...client().assets].filter(item => item.category === recipe.category || item.kind === '图片' && !item.category);
    flowChooseProduct(available.find(item => item.id === previous.productId)?.id || recipe.productId || available[0]?.id || 'custom');
    state.config.category = recipe.category;
  }
  const project = flowProject();
  project.flow = true;
  project.name = `${recipe.kind === '漫剧' ? '短漫剧' : product().name} · ${recipe.name}`;
  if (recipe.kind === '漫剧') project.drama = flowDefaultDrama();
  flowBuildShots(project, recipe);
  viewState.activeShot = 0;
  flowUi.issue = '';
  persist();
  navigate(recipe.kind === '漫剧' ? 'drama' : 'quick');
}
function flowBuildShots(project, recipe = flowRecipe(state.config.recipeId)) {
  if (!recipe) {
    project.shots = generateScript();
    return;
  }
  const count = recipe.roles?.length || 4;
  const duration = state.config.duration;
  const approved = state.config.claims.trim();
  const item = product();
  project.shots = Array.from({ length: count }, (_, index) => ({
    id: uniqueId('shot'), role: recipe.roles[index], start: index * duration / count, end: (index + 1) * duration / count, scale: index === 0 ? '中景' : index === 2 ? '细节特写' : '近景',
    visual: project.drama ? `${recipe.actions[index]}；${project.drama.scene}；画风：${project.drama.style}` : `${recipe.actions[index]}；当前商品：${item.name}（${item.sku || '待填SKU'}）；${state.config.scene} / ${state.config.camera}`,
    speech: project.drama ? [project.drama.opening, project.drama.response, project.drama.turn, project.drama.ending][index] : index === 0 ? `${state.config.claimFocus}，先看实物。` : index === count - 1 ? `${state.config.price ? `活动价${state.config.price}。` : ''}${state.config.cta}` : approved || '待确认商品卖点',
    assetId: state.config.assets[index % Math.max(1, state.config.assets.length)] || '', clipStart: 0, hook: index === 0 ? state.config.hook : '', locked: false, source: '本地配方编排，非模型编导'
  }));
  project.buildConfig = flowCopy(state.config);
  project.buildDrama = flowCopy(project.drama || null);
}
function flowRefreshShots(project) {
  if (project.importedPrompt || !state.config.recipeId) return;
  const previous = project.buildConfig;
  if (!previous) { flowBuildShots(project); return; }
  if (project.drama && project.buildDrama) {
    const oldDrama = project.buildDrama;
    const fields = ['opening', 'response', 'turn', 'ending'];
    project.shots.forEach((shot, index) => {
      if (shot.speech === oldDrama[fields[index]]) shot.speech = project.drama[fields[index]];
      shot.visual = shot.visual.replace(oldDrama.scene, project.drama.scene).replace(`画风：${oldDrama.style}`, `画风：${project.drama.style}`);
    });
  }
  if (!project.drama) {
    const oldProduct = [...productCatalog, ...client().assets].find(item => item.id === previous.productId);
    const currentProduct = product();
    project.shots.forEach((shot, index) => {
      if (previous.productId !== state.config.productId && oldProduct) {
        shot.visual = shot.visual.split(oldProduct.name).join(currentProduct.name);
        if (oldProduct.sku) shot.visual = shot.visual.split(oldProduct.sku).join(currentProduct.sku || '待填SKU');
      }
      if (previous.claims && shot.speech.includes(previous.claims)) shot.speech = shot.speech.split(previous.claims).join(state.config.claims || '待确认商品卖点');
      if (shot.speech === '待确认商品卖点' && index > 0 && index < project.shots.length - 1 && state.config.claims) shot.speech = state.config.claims;
      if (previous.claimFocus !== state.config.claimFocus && shot.speech === `${previous.claimFocus}，先看实物。`) shot.speech = `${state.config.claimFocus}，先看实物。`;
      const oldClosing = `${previous.price ? `活动价${previous.price}。` : ''}${previous.cta}`;
      if (shot.speech === oldClosing) shot.speech = `${state.config.price ? `活动价${state.config.price}。` : ''}${state.config.cta}`;
      if (previous.productId !== state.config.productId || previous.assets.includes(shot.assetId) && !state.config.assets.includes(shot.assetId)) shot.assetId = state.config.assets[index % Math.max(1, state.config.assets.length)] || '';
    });
  }
  project.buildConfig = flowCopy(state.config);
  project.buildDrama = flowCopy(project.drama || null);
}
function flowRestructureShots(project, count, duration) {
  const oldShots = flowCopy(project.shots);
  const additional = generateScript();
  project.shots = Array.from({ length: count }, (_, index) => ({ ...(oldShots[index] || additional[index] || additional.at(-1)), id: oldShots[index]?.id || uniqueId('shot'), start: index * duration / count, end: (index + 1) * duration / count }));
}
function flowStepbar(step) {
  return `<div class="flow-stepbar"><button data-action="flow-gallery">${icon('back')} 样片</button><div>${['商品 / 角色', '方案确认', '出片 / 审片'].map((label, index) => `<span class="${step === index ? 'active' : ''}" ${step === index ? 'aria-current="step"' : ''}>${index + 1} ${label}</span>`).join('')}</div><span>1 条</span></div>`;
}
function flowQuick() {
  const project = flowProject();
  if (project.drama) return flowDrama();
  const config = state.config;
  const available = [...new Map([...productCatalog.filter(item => item.category === config.category), ...client().assets.filter(item => item.kind === '图片' && (!item.category || item.category === config.category))].map(item => [item.id, item])).values()];
  return `${headline(config.direct ? '直接做视频' : '换成你的商品', escapeText(config.recipeName || config.format), button('逐镜精调', 'flow-fine'))}${flowStepbar(0)}
    <div class="flow-workarea"><section class="card pad"><h3>商品与卖点</h3><div class="setting-grid mt">${selectorField('商品 / SKU', 'flowProduct', [...available, { id: 'custom', name: '上传新商品' }], config.productId)}${selectorField('内容平台', 'flowPlatform', ['抖音', '小红书', 'TikTok', '快手'], config.platform)}</div>
    ${config.direct ? `<details class="workspace-details"><summary>调整品类与拍法 <span>${config.category} · ${config.format}</span></summary><div class="setting-grid">${selectorField('商品品类', 'guardCategory', Object.keys(categories).filter(category => category !== '信息流漫剧'), config.category)}${selectorField('拍法', 'guardFormat', categories[config.category].formats, config.format)}</div></details>` : ''}
    ${available.some(item => item.id === config.productId) ? `<div class="flow-product-row">${imageMarkup(product(), 'file-thumb')}<div><strong>${escapeText(product().name)}</strong><p class="meta">${escapeText(product().sku || '请在资源详情补SKU')} ${flowCurrent().facts[config.productId] ? '· 已带入客户商品资料' : '· 商品信息待确认'}</p></div></div>` : ''}
    ${uploadZone('draftMedia', 'image/*,video/*', '上传商品图或实拍素材', '仅保存在当前浏览器；不执行图片识别')}
    <label class="field mt"><span>本条要讲的已确认卖点</span><textarea id="flowClaims" class="input" placeholder="可从客户知识带入；没有资料时请补充真实事实">${escapeText(config.claims)}</textarea></label>
    <div class="setting-grid">${selectorField('主卖点方向', 'flowFocus', categories[config.category].claims, config.claimFocus)}<label class="field"><span>活动价格（选填）</span><input id="flowPrice" class="input" value="${escapeText(config.price)}" placeholder="留空不报价格"></label></div>
    <details class="workspace-details"><summary>出镜、声音与后期 <span>${escapeText(selectedModel()?.name || '不出镜')} · ${config.subtitle}</span></summary>${flowResources()}<div class="setting-grid mt">${selectorField('字幕', 'flowSubtitle', ['白字黑描边', '干净下方字幕', '无字幕'], config.subtitle)}${selectorField('开场', 'flowHook', hooks, config.hook)}</div></details>
    ${flowUi.issue ? `<p class="flow-error" role="alert">${escapeText(flowUi.issue)}</p>` : ''}<div class="flow-bottom-actions"><span class="meta">编辑与方案编排：不调用视频模型</span>${button('看本条方案 ' + icon('arrow'), 'flow-build-brief', 'primary')}</div></section>
    <aside class="flow-brief-aside"><h3>沿用这个拍法</h3><p>${escapeText(config.recipeName || config.format)}</p><ol>${project.shots.map(shot => `<li><span>${escapeText(shot.role)}</span><small>${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s</small></li>`).join('')}</ol><p class="meta">${escapeText(flowRecipe(config.recipeId)?.need || '商品资料、可用镜头与声音')}</p></aside></div>`;
}
function flowResources() {
  return `<div class="flow-resource-buttons">${[['models', '出镜', selectedModel()?.name || '不出镜'], ['wardrobe', '穿搭', selectedLook()?.name || '原图服装'], ['voices', '声音', selectedVoice()?.name || '无口播']].map(([kind, label, value]) => `<button data-action="workspace-picker" data-kind="${kind}"><small>${label}</small><strong>${escapeText(value)}</strong>${icon('arrow')}</button>`).join('')}</div>`;
}
function flowBrief() {
  const project = flowProject();
  const config = state.config;
  const shots = getShots();
  const valid = project.accepted && !project.planChanged;
  return `${headline('确认这一条的效果', escapeText(project.name), button('返回修改', 'flow-back'))}${flowStepbar(1)}
    <div class="flow-workarea"><section class="card pad"><div class="flow-section-head"><h3>${project.drama ? '故事与角色' : '拍摄方案'}</h3><span class="meta">${config.duration}s · ${shots.length} 镜 · ${config.platform}</span></div>
    <div class="flow-brief-summary"><div><small>前几秒</small><strong>${escapeText(shots[0]?.speech)}</strong><p>${escapeText(shots[0]?.visual.split('；')[0])}</p></div><div><small>${project.drama ? '反转与卡点' : '商品证明'}</small><strong>${escapeText(project.drama ? project.drama.turn : config.claims || '商品卖点尚未填写')}</strong><p>${escapeText(project.drama ? project.drama.ending : config.evidence)}</p></div></div>
    <div class="flow-shot-review">${shots.map((shot, index) => `<div><span class="mono">${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s</span><div><strong>${escapeText(shot.role)}</strong><p class="flow-dialogue">${escapeText(shot.speech)}</p><details class="flow-shot-visual"><summary>画面安排</summary><p>${escapeText(shot.visual)}</p></details></div>${button('改这镜', 'flow-edit-shot', 'ghost sm', `data-index="${index}"`)}</div>`).join('')}</div>
    <details class="workspace-details"><summary>人物、声音、禁用内容与完整提示词</summary><p class="small mt">${project.drama ? escapeText(project.drama.characters.map(character => `${character.name}：${character.identity} / ${character.outfit}`).join('；')) : `${escapeText(selectedModel()?.name || '不出镜')} · ${escapeText(selectedLook()?.name || '原图服装')}`} · ${escapeText(selectedVoice()?.name || '无口播')} · ${config.subtitle}</p><p class="meta mt">禁止新增未经确认的商品功效与价格；人物、商品外观和服装必须与参考一致</p><textarea readonly class="input mt" aria-label="本条完整提示词" style="height:220px">${escapeText(flowPrompt(project))}</textarea></details>
    <div class="flow-inline-note mt">这是本地配方编排的方案，不是模型生成效果。动作与人物一致性仍需用真实成片检查。</div>
    ${project.planChanged ? '<p class="flow-error">方案有变更，需要重新确认；旧版本与成片仍保留</p>' : ''}
    <label class="row small mt"><input type="checkbox" class="checkbox" id="flowApprove" ${valid ? 'checked' : ''}> ${project.drama ? '对白、角色与参考授权已核对，按此方案制作' : '商品资料与参考授权已核对，按此方案制作'}</label>${flowUi.issue ? `<p class="flow-error" role="alert">${escapeText(flowUi.issue)}</p>` : ''}
    <div class="flow-bottom-actions">${button('存为客户配方', 'flow-save-recipe')}${button('确认并创建 1 条产单', 'flow-submit', 'primary')}</div><p class="meta mt">本次 0 积分；仅建待提交任务。模型接口与报价未连接，不会自动生成。</p></section>
    <aside class="flow-brief-aside">${workspacePreview()}<div class="flow-bottom-actions">${button('播放编排预览', 'play-preview', 'sm')}</div></aside></div>`;
}
function flowPrompt(project = flowProject()) {
  const ruleText = guardPromptContext();
  const prompt = compilePrompt(state.config, project.shots) + ruleText;
  if (!project.drama) return prompt;
  const drama = project.drama;
  return XinliuStrategies.compile({config:{...state.config,generationCapability:state.config.generationCapability||'drama'},shots:project.shots,drama}).videoPrompt+ruleText;
}
function flowValidate(project) {
  guardContext(project);
  const guardIssues = [...guardFactIssues(), ...guardMaterialIssues(), ...guardKnowledgeIssues()];
  if (guardIssues.length) return guardIssues.join('；');
  if (project.shots.some(shot => !shot.visual.trim() || !shot.speech.trim() || /待确认商品卖点|此处填写|此镜头需补充/.test(shot.visual + shot.speech))) return '还有待填写的画面或台词，请先补齐';
  if (!project.drama) {
    if (!state.config.claims.trim()) return '请填写或带入已确认的商品卖点';
    const item = product();
    if (!item.image && !item.fileId) return '请先上传当前商品图片';
    if (state.config.modelId !== 'none' && state.config.modelId && !selectedModel()) return '模特引用不可用，请重新选择';
    if (state.config.lookId && !selectedLook()) return '穿搭引用不可用，请重新选择';
    if (state.config.voiceId !== 'none' && state.config.voiceId && !selectedVoice()) return '声音引用不可用，请重新选择';
  } else {
    const drama = project.drama;
    if (![drama.title, drama.premise, drama.opening, drama.response, drama.turn, drama.ending].every(value => value.trim())) return '请补齐故事与四段对白';
    if (drama.characters.some(character => !character.name.trim() || !character.identity.trim() || !character.outfit.trim())) return '请补齐两位角色的名字、身份与固定服装';
    if (drama.characters.some(character => character.modelId !== 'none' && !getModels().some(model => model.id === character.modelId) || character.voiceId !== 'none' && !getVoices().some(voice => voice.id === character.voiceId))) return '角色的模特或声音引用失效，请重新选择';
  }
  return '';
}
function flowSubmit() {
  if(!collabCan('edit'))return collabReject();
  const project = flowProject();
  if(!collabPreflight(project))return;
  flowUi.issue = flowValidate(project);
  if (!document.getElementById('flowApprove')?.checked) flowUi.issue = '请先核对并勾选方案确认';
  if (flowUi.issue) { render(); return; }
  const signature = flowSignature(state.config, project.shots, project.drama || null);
  const existing = client().jobs.find(job => job.projectId === project.id && job.planSignature === signature);
  if (existing) { project.jobId = existing.id; navigate('result'); toast('这版产单已存在，没有重复创建'); return; }
  guardCaptureApproval(project);
  state.config.factsConfirmed = true;
  project.accepted = { config: flowCopy(state.config), shots: flowCopy(project.shots), drama: flowCopy(project.drama || null), prompt: flowPrompt(project), signature, time: new Date().toISOString() };
  project.planChanged = false;
  flowTrackChanges(project);
  flowSnapshot(project, '确认方案');
  const job = { id: uniqueId('job'), projectId: project.id, planSignature: signature, name: project.name, sku: project.drama ? `第${project.drama.episode}集` : product().sku, format: state.config.format, batch: project.drama ? project.drama.title : '样片快捷制作', reviewer: '林川', model: selectedModel()?.name || '按角色设定', voice: selectedVoice()?.name || '无口播', status: '未提交', cost: null, version: client().jobs.filter(item => item.projectId === project.id).length + 1, config: flowCopy(state.config), shots: flowCopy(project.shots), accepted: flowCopy(project.accepted), comments: [], demo: false };
  client().jobs.unshift(job);
  collabRegisterJob(job,project);
  project.jobId = job.id;
  project.status = '待提交';
  collabLog('确认作品方案',project.campaignId,project.name+'；仅创建待提交任务，不执行收费调用');
  collabNotify(project.assignments.producer,project.campaignId,project.name+'：方案已确认，进入制作',project.id);
  persist();
  navigate('result');
}
function flowResult() {
  const project = flowProject();
  const job = client().jobs.find(item => item.id === project.jobId);
  const accepted = project.accepted;
  const shot = accepted?.shots?.[Math.min(flowUi.resultShot, accepted.shots.length - 1)];
  return `${headline('制作与检查', escapeText(project.name), button('返回方案', 'flow-to-brief'))}${flowStepbar(2)}
    <div class="flow-status-strip"><span class="row-status"><i class="dot ${project.result ? 'blue' : ''}"></i>${project.result ? project.result.outdated || project.planChanged ? '方案已修改 · 成片待更新' : '已上传成片 · 待检查' : job ? '产单已建立 · 模型未连接' : '方案尚未确认'}</span><span>本轮视频模型消费 0 积分</span><span>${job ? `V${job.version} · 1 条` : '尚未创建产单'}</span></div>
    <div class="flow-comparison"><section class="card pad"><div class="flow-section-head"><h3>确认的方案</h3><span class="meta">不是生成效果图</span></div>${accepted ? `<div class="flow-compare-preview">${imageMarkup(project.drama ? null : [...productCatalog, ...client().assets].find(item => item.id === accepted.config.productId))}<div><span class="mono">${shot?.start.toFixed(1)}–${shot?.end.toFixed(1)}s</span><h3>${escapeText(shot?.role)}</h3><p>${escapeText(shot?.visual)}</p><blockquote>${escapeText(shot?.speech)}</blockquote></div></div><div class="chips mt">${accepted.shots.map((entry, index) => button(`${index + 1} ${escapeText(entry.role)}`, 'flow-compare-shot', `sm ${flowUi.resultShot === index ? 'primary' : ''}`, `data-index="${index}"`)).join('')}</div>` : '<p class="meta">先返回方案完成确认</p>'}</section>
    <section class="card pad"><div class="flow-section-head"><h3>实际成片</h3><span class="meta">${project.result ? '外部上传' : '未生成'}</span></div>${project.result ? `<video id="flowResultVideo" data-file="${escapeText(project.result.fileId)}" controls playsinline preload="metadata" class="flow-result-video"></video><p class="meta mt">${escapeText(project.result.name)} · ${project.result.duration ? project.result.duration.toFixed(1) + 's' : '时长未知'}</p>${uploadZone('flowResultUpload', 'video/*', '上传新版成片', '替换前保存旧版；不会删除原文件', false)}` : `<div class="flow-result-empty">${icon('film')}<h3>在熟悉的平台生成，也可以回来检查</h3><p>先导出提示词，上传真实成片后逐镜对照<br>这里不会伪造生成结果或等待时间</p>${button('复制本条提示词', 'flow-copy-prompt')}${uploadZone('flowResultUpload', 'video/*', '上传已有成片', '客户自行确认来源与授权', false)}</div>`}</section></div>
    <div class="flow-review-bottom"><section><h3>哪里与预期不一致？</h3><div class="chips mt">${[['script', '表达 / 镜头'], ['product', '商品'], ['people', '人物 / 穿搭'], ['audio', '口播 / 字幕'], ['pace', '节奏']].map(([kind, label]) => button(label, 'flow-revise', '', `data-kind="${kind}"`)).join('')}</div><p class="meta mt">修改先存旧版；上传成片不会被删除。是否能局部生成，需供应商能力支持。</p></section><section><h3>交付与复用</h3><div class="row wrap gap8 mt">${button('二剪素材包 ZIP', 'flow-export', '', flowUi.busy ? 'disabled' : '')}${button('存为优质案例', 'flow-save-recipe')}${button('确认归档', 'flow-archive', 'primary', !project.result || project.planChanged || project.result.outdated || !accepted ? 'disabled' : '')}</div><button class="link mt" data-action="flow-history">版本记录 ${project.history.length}</button></section></div>`;
}
function flowDefaultDrama() {
  return { title: '一场误会', episode: 1, style: '生活漫画', scene: '办公室', premise: '两位同事因为一个日常误会产生分歧，最后通过一个行动解释清楚', opening: '你怎么又把我的东西拿走了？', response: '先别急，你看看桌上。', turn: '原来是我放错了位置。', ending: '下次先问清楚。', continuity: '两位角色不换衣服；同一空间与光线；说话时对应角色入镜', characters: [{ name: '小林', identity: '同事A，直率', outfit: '浅色衬衫', modelId: 'none', voiceId: 'friendly' }, { name: '阿周', identity: '同事B，耐心', outfit: '深色外套', modelId: 'none', voiceId: 'explain' }] };
}
function flowDrama() {
  const project = flowProject();
  if (!project.drama) return `${headline('短漫剧制作', '独立故事、角色和对白，不覆盖当前电商草稿')}${emptyState('从一个故事结构开始', '两位角色，一处反转，先制作一集', button('从故事样片开始', 'flow-drama-start', 'primary'))}`;
  const drama = project.drama;
  return `${headline('短漫剧制作', '先确认两位角色与一处反转，按镜头制作', button('返回样片', 'flow-gallery'))}${flowStepbar(0)}
    <div class="flow-workarea"><section class="card pad"><h3>故事与对白</h3><div class="setting-grid mt"><label class="field"><span>故事名</span><input class="input" data-drama="title" value="${escapeText(drama.title)}"></label><label class="field"><span>集数</span><input class="input" data-drama="episode" type="number" min="1" max="999" value="${drama.episode}"></label>${selectorField('画风', 'flowDramaStyle', ['生活漫画', '都市写实', '轻喜剧插画', '国风漫画'], drama.style)}${selectorField('场景', 'flowDramaScene', scenes, drama.scene)}</div>
    <label class="field"><span>这一集讲什么</span><textarea class="input" data-drama="premise">${escapeText(drama.premise)}</textarea></label>
    <div class="setting-grid">${[['opening', '矛盾开场'], ['response', '人物回应'], ['turn', '反转'], ['ending', '收尾 / 卡点']].map(([field, label]) => `<label class="field"><span>${label}</span><textarea class="input" data-drama="${field}">${escapeText(drama[field])}</textarea></label>`).join('')}</div>
    <details class="workspace-details"><summary>跨镜头连续性要求</summary><textarea class="input mt" data-drama="continuity">${escapeText(drama.continuity)}</textarea></details>${flowUi.issue ? `<p class="flow-error" role="alert">${escapeText(flowUi.issue)}</p>` : ''}<div class="flow-bottom-actions"><span class="meta">角色参考缺失时，仍可规划，不保证一致性</span>${button('看本集分镜方案', 'flow-build-brief', 'primary')}</div></section>
    <aside class="flow-drama-roles">${drama.characters.map((character, index) => `<section class="card pad"><h3>角色 ${index + 1}</h3>${[['name', '名字'], ['identity', '身份 / 性格'], ['outfit', '固定服装']].map(([field, label]) => `<label class="field mt"><span>${label}</span><input class="input" data-character="${index}" data-character-field="${field}" value="${escapeText(character[field])}"></label>`).join('')}<label class="field"><span>模特参考</span><select class="input" data-character="${index}" data-character-field="modelId">${[{ id: 'none', name: '暂不指定' }, ...getModels()].map(model => `<option value="${model.id}" ${model.id === character.modelId ? 'selected' : ''}>${escapeText(model.name)}</option>`).join('')}</select></label><label class="field"><span>音色要求</span><select class="input" data-character="${index}" data-character-field="voiceId">${[{ id: 'none', name: '无口播' }, ...getVoices()].map(voice => `<option value="${voice.id}" ${voice.id === character.voiceId ? 'selected' : ''}>${escapeText(voice.name)}</option>`).join('')}</select></label></section>`).join('')}</aside></div>`;
}
function flowKnowledge() {
  return `${headline('客户知识', '商品事实、制作配方与经验，仅在当前客户复用', button('新增经验', 'flow-add-knowledge'))}${flowTabs('knowledgeTab', ['配方与作品', '商品事实', '经验与规则', '原有预设'], flowUi.knowledgeTab)}
    <div class="flow-section">${flowUi.knowledgeTab === '原有预设' ? preferencesPage() : guardLibraryContent(flowUi.knowledgeTab)}</div>`;
}
function flowSaveRecipe() {
  const project = flowProject();
  openModal('保存客户私有配方', `<form id="flowRecipeForm"><label class="field"><span>配方名称</span><input class="input" name="name" required maxlength="100" value="${escapeText(project.name)}"></label><label class="field"><span>复用时需要什么素材</span><input class="input" name="need" value="${escapeText(flowRecipe(state.config.recipeId)?.need || '商品事实与对应素材')}"></label><label class="field"><span>哪些地方值得保留</span><textarea class="input" name="notes" placeholder="例如：开头直接看上身，不先讲品牌"></textarea></label><p class="meta">保留完整脚本、提示词、素材引用、模型记录和版本；${project.result ? '包含当前上传成片' : '没有成片，只保存方案'}。不会公开给其他客户。</p><button type="submit" class="btn primary full mt">保存到当前客户</button></form>`);
  document.getElementById('flowRecipeForm').onsubmit = event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const prompt = flowPrompt(project);
    const recipe = { id: uniqueId('recipe'), name: form.get('name').trim(), need: form.get('need').trim(), notes: form.get('notes').trim(), kind: project.drama ? '漫剧' : '电商视频', category: state.config.category, productId: state.config.productId, format: state.config.format, hook: state.config.hook, scene: state.config.scene, duration: state.config.duration, roles: project.shots.map(shot => shot.role), actions: project.shots.map(shot => shot.visual), shots: flowCopy(project.shots), config: flowCopy(state.config), drama: flowCopy(project.drama || null), videoFileId: project.result?.fileId || null, prompt, model: { requested: 'Seedance 2.5', actual: project.result ? '外部上传，模型版本未知' : '未调用', seed: null }, assetIds: [...new Set([...state.config.assets, ...project.shots.map(shot => shot.assetId).filter(Boolean)])], history: flowCopy(project.history), skill: { version: 1, inputs: ['商品事实或故事对白', '有权使用的素材'], steps: ['核对资料', '改编镜头', '确认方案', '制作后对照', '交付与复盘'], checks: ['商品事实准确', '人物与服装连续', '卖点有画面证据', '未确认价格不露出'], automaticExecution: false }, created: new Date().toISOString(), clientId: state.activeClient };
    if (project.result?.backendModel) { recipe.model.actual = project.result.backendModel; recipe.model.backendTaskId = project.result.backendTaskId; }
    flowCurrent().recipes.unshift(recipe);
    persist(); closeModal(); toast('完整方案已保存到客户私有配方');
  };
}
function flowEditShot(index) {
  const project = flowProject();
  const shot = project.shots[index];
  if (!shot) return;
  openModal(`修改第 ${index + 1} 镜`, `<form id="flowShotForm"><p class="meta">只修改这一镜；其他镜头不重排</p><label class="field mt"><span>画面与动作</span><textarea class="input" name="visual" required>${escapeText(shot.visual)}</textarea></label><label class="field"><span>台词 / 旁白</span><textarea class="input" name="speech" required>${escapeText(shot.speech)}</textarea></label><button class="btn primary full" type="submit">保存本镜修改</button></form>`);
  document.getElementById('flowShotForm').onsubmit = event => {
    event.preventDefault();
    flowSnapshot(project, `修改第${index + 1}镜前`);
    const form = new FormData(event.target);
    shot.visual = form.get('visual').trim(); shot.speech = form.get('speech').trim(); shot.locked = true;
    saveDraft(); closeModal(); render(); toast('本镜已保存；已确认方案需要重新核对');
  };
}
function flowRevisions() {
  const project = flowProject();
  openModal('版本记录', project.history.length ? `<div class="stack">${project.history.map(version => `<div class="draft-row"><div class="grow"><strong>${escapeText(version.label)}</strong><p class="meta">${escapeText(new Date(version.time).toLocaleString('zh-CN'))} · ${version.shots.length} 镜</p></div>${button('恢复为当前草稿', 'flow-restore', 'sm', `data-id="${version.id}"`)}</div>`).join('')}</div>` : '<p class="meta">确认方案或修改镜头时保存版本</p>', true);
}
function flowRevise(kind) {
  const project = flowProject();
  const impacts = { script: ['表达 / 镜头', '画面与口播可能需要重做；未改动镜头保留'], product: ['商品', '先修改商品事实；涉及商品的镜头需要重新核对'], people: ['人物 / 穿搭', '涉及该人物的镜头需要重新核对，声音与商品资料不变'], audio: ['口播 / 字幕', '只改字幕不需要视频模型；改配音需重新混音'], pace: ['节奏', '先调整镜头时长与剪辑，不默认重新生成画面'] };
  openModal(`修改${impacts[kind][0]}`, `<p class="small">${impacts[kind][1]}</p><p class="meta mt">本次只编辑，不扣视频积分；真实重生成报价未知。旧方案、成片和其他镜头保留。</p><label class="field mt"><span>具体问题（选填）</span><textarea id="flowRevisionNote" class="input" placeholder="例如：3秒处商品颜色不对"></textarea></label>${button('保存旧版并去修改', 'flow-revise-go', 'primary full', `data-kind="${kind}"`)}`);
}
function flowAfterRender() {
  if (viewState.view === 'queue') {
    document.querySelector('.page-head')?.insertAdjacentHTML('afterend', flowNav());
  }
  if (viewState.view === 'studio') {
    document.querySelector('.studio-top')?.insertAdjacentHTML('afterend', `<div class="flow-editor-return"><span>逐镜精调 · 不必重新走全部步骤</span>${button('返回方案确认', 'flow-to-brief', 'sm')}</div>`);
  }
  if (['quick', 'drama', 'brief'].includes(viewState.view)) {
    const project = flowProject();
    if (project.revisionNote) document.querySelector('.flow-stepbar')?.insertAdjacentHTML('afterend', `<div class="flow-inline-note flow-revision-note">${escapeText(project.revisionNote)}</div>`);
  }
  if (viewState.view === 'preferences') {
    document.querySelectorAll('[data-action="flow-export-knowledge"]').forEach(control => {
      control.insertAdjacentHTML('beforebegin', button('用于当前制作', 'flow-apply-knowledge', 'sm', `data-id="${control.dataset.id}"`));
    });
  }
}
function flowResume(id) {
  const project = client().projects.find(item => item.id === id);
  if (!project) return;
  saveDraftIfNeeded();
  state.config = { ...defaultConfig(), ...flowCopy(project.config), draftId: project.id };
  flowUi.issue = ''; flowUi.resultShot = 0; viewState.activeShot = 0;
  persist();
  navigate(project.result || project.accepted ? 'result' : project.flow ? project.drama ? 'drama' : 'quick' : 'studio');
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'nav' && ['quick', 'brief', 'drama', 'result'].includes(viewState.view)) saveDraft();
  if (action === 'nav' && target.dataset.view === 'studio') {
    const currentDraft = client().projects.find(item => item.id === state.config.draftId);
    if (!currentDraft || currentDraft.flow) {
      event.stopImmediatePropagation();
      navigate(currentDraft ? currentDraft.accepted || currentDraft.result ? 'result' : currentDraft.drama ? 'drama' : 'quick' : 'gallery');
      return;
    }
  }
  const flowJob = client().jobs.find(item => item.id === target.dataset.id && item.projectId);
  if (['new-project', 'enter', 'open-project'].includes(action) || ['review-job', 'job-detail', 'return-job', 'deliver-job'].includes(action) && flowJob) {
    event.stopImmediatePropagation();
    if (action === 'enter') { state.signedIn = true; persist(); navigate(state.startView === '队列优先' ? 'queue' : 'home'); }
    if (action === 'new-project') guardDirectStart();
    if (action === 'open-project') flowResume(target.dataset.id);
    if (['review-job', 'job-detail', 'return-job', 'deliver-job'].includes(action)) {
      const job = client().jobs.find(item => item.id === target.dataset.id);
      if (job?.projectId && client().projects.some(project => project.id === job.projectId)) flowResume(job.projectId);
      else openJob(target.dataset.id, true);
    }
    return;
  }
  if (!action.startsWith('flow-')) return;
  event.stopImmediatePropagation();
  const project = ['home', 'gallery', 'preferences', 'queue', 'login'].includes(viewState.view) ? null : flowProject();
  if (project&&collabCan('edit',collabCampaign(project.campaignId))) saveDraft();
  switch (action) {
    case 'flow-gallery': flowUi.kind = '电商视频'; flowUi.category = '全部品类'; flowUi.page = 1; navigate('gallery'); break;
    case 'flow-recipe-detail': flowShowRecipe(target.dataset.id); break;
    case 'flow-use-recipe': {
      const recipe = flowRecipe(target.dataset.id);
      if (!recipe) break;
      if (!recipe.demo && (recipe.status !== '已发布' || recipe.validUntil && recipe.validUntil < guardToday())) { toast('请先核对并发布配方，过期内容不能复用'); break; }
      flowApplyRecipe(recipe);
      if (!recipe.demo && recipe.shots) {
        const draft = flowProject();
        if (!recipe.drama) {
          draft.shots = flowCopy(recipe.shots);
          draft.buildConfig = flowCopy(recipe.config);
          flowRefreshShots(draft);
        }
        if (recipe.drama) { draft.drama = flowCopy(recipe.drama); draft.shots = flowCopy(recipe.shots); }
        saveDraft(); render();
      }
      break;
    }
    case 'flow-favorite': { const current = flowCurrent(); current.favorites = current.favorites.includes(target.dataset.id) ? current.favorites.filter(id => id !== target.dataset.id) : [...current.favorites, target.dataset.id]; persist(); render(); break; }
    case 'flow-tab': flowUi[target.dataset.field] = target.dataset.value; flowUi.page = 1; flowUi.category = '全部品类'; render(); break;
    case 'flow-reset': flowUi.query = ''; flowUi.category = '全部品类'; flowUi.scope = '推荐'; flowUi.page = 1; render(); break;
    case 'flow-page': flowUi.page += Number(target.dataset.direction); render(); break;
    case 'flow-resume': flowResume(target.dataset.id); break;
    case 'flow-build-brief': {
      flowRefreshShots(project);
      if (project.drama) project.name = `${project.drama.title} · 第${project.drama.episode}集`;
      flowUi.issue = flowValidate(project);
      saveDraft();
      if (flowUi.issue) render(); else navigate('brief');
      break;
    }
    case 'flow-submit': flowSubmit(); break;
    case 'flow-to-brief': flowUi.issue = ''; if (collabCan('edit', collabCampaign(project.campaignId))) { flowRefreshShots(project); saveDraft(); } navigate('brief'); break;
    case 'flow-back': flowUi.issue = ''; navigate(project.drama ? 'drama' : 'quick'); break;
    case 'flow-fine': viewState.stage = 2; viewState.activeShot = 0; navigate('studio'); break;
    case 'flow-edit-shot': flowEditShot(Number(target.dataset.index)); break;
    case 'flow-copy-prompt': flowCopyPrompt(project); break;
    case 'flow-compare-shot': {
      flowUi.resultShot = Number(target.dataset.index); render();
      const video = document.getElementById('flowResultVideo');
      const seconds = project.accepted.shots[flowUi.resultShot].start;
      if (video) video.addEventListener('loadedmetadata', () => { video.currentTime = seconds; }, { once: true });
      break;
    }
    case 'flow-revise': flowRevise(target.dataset.kind); break;
    case 'flow-revise-go': {
      const note = document.getElementById('flowRevisionNote').value.trim();
      flowSnapshot(project, '返工前');
      project.revisionNote = note || '按对照检查调整本条';
      project.status = '修改中';
      persist();
      closeModal();
      const kind = target.dataset.kind;
      if (kind === 'product') navigate('quick');
      else if (kind === 'people' && project.drama) navigate('drama');
      else {
        viewState.stage = { script: 2, people: 1, audio: 3, pace: 2 }[kind] || 0;
        navigate('studio');
      }
      break;
    }
    case 'flow-history': flowRevisions(); break;
    case 'flow-restore': {
      const version = project.history.find(item => item.id === target.dataset.id);
      if (!version) break;
      flowSnapshot(project, '恢复前备份');
      state.config = { ...defaultConfig(), ...flowCopy(version.config), draftId: project.id };
      project.shots = flowCopy(version.shots); project.drama = flowCopy(version.drama); project.result = flowCopy(version.result);
      project.accepted = flowCopy(version.accepted); project.planChanged = false;
      project.buildConfig = flowCopy(state.config); project.buildDrama = flowCopy(project.drama);
      project.status = '编辑中';
      saveDraft(); closeModal(); navigate('brief'); toast('已恢复草稿，当前版本另有备份'); break;
    }
    case 'flow-save-recipe': flowSaveRecipe(); break;
    case 'flow-export-recipe': {
      const recipe = flowRecipe(target.dataset.id);
      if (!recipe || recipe.demo) break;
      downloadText('客户制作配方.json', JSON.stringify(recipe, null, 2));
      downloadText('优质作品提示词.txt', recipe.prompt, 'text/plain;charset=utf-8');
      downloadText('制作配方-Skill.md', `# ${recipe.name}\n\n客户私有制作配方，非自动运行或模型训练。\n\n## 输入\n${recipe.skill.inputs.map(input => '- ' + input).join('\n')}\n\n## 步骤\n${recipe.skill.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n## 检查\n${recipe.skill.checks.map(check => '- ' + check).join('\n')}\n\n## 人工保留的经验\n${recipe.notes || '未填写'}\n\n## 实际模型记录\n${recipe.model.actual}\n\n## 原始提示词\n${recipe.prompt}`, 'text/markdown;charset=utf-8');
      break;
    }
    case 'flow-apply-knowledge': guardUseKnowledge(target.dataset.id); break;
    case 'flow-drama-start': flowApplyRecipe(flowRecipe('comic')); break;
    case 'flow-reference':
      openModal('从参考片开始', `<p class="small">上传后读取真实画面与时间码，人工补充对白和改编要求；当前不自动执行ASR或切镜识别。</p><div class="row gap8 mt">${button('去拆解参考片', 'flow-reference-go', 'primary')}${button('导入已有逐镜脚本', 'flow-import')}</div>`);
      break;
    case 'flow-reference-go': workspaceUi.resourceTab = 'reference'; navigate('resources'); break;
    case 'flow-import': flowImportDialog(); break;
    case 'flow-add-knowledge': guardLibraryDialog(); break;
    case 'flow-delete-fact': delete flowCurrent().facts[target.dataset.id]; persist(); render(); break;
    case 'flow-export-knowledge': downloadText('客户经验.json', JSON.stringify(flowCurrent().knowledge.find(item => item.id === target.dataset.id), null, 2)); break;
    case 'flow-export': flowExportPackage(project).catch(error => toast(error.message)); break;
    case 'flow-archive': guardReviewDialog(); break;
  }
}, true);

document.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'flowSearch') {
    const position = target.selectionStart; flowUi.query = target.value; flowUi.page = 1; render();
    const replacement = document.getElementById('flowSearch'); replacement.focus(); replacement.setSelectionRange(position, position); return;
  }
  const configFields = { flowClaims: 'claims', flowPrice: 'price' };
  if (configFields[target.id]) {
    state.config[configFields[target.id]] = target.value; state.config.factsConfirmed = false; saveDraft(); return;
  }
  if (target.dataset.drama || target.dataset.character !== undefined) {
    const project = flowProject();
    if (target.dataset.drama) project.drama[target.dataset.drama] = target.dataset.drama === 'episode' ? Math.max(1, Math.min(999, Number(target.value) || 1)) : target.value;
    else project.drama.characters[Number(target.dataset.character)][target.dataset.characterField] = target.value;
    saveDraft();
  }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'flowResultUpload') {
    event.stopImmediatePropagation(); flowUploadResult(target.files[0]).catch(error => toast(error.message)); return;
  }
  if (target.id === 'activeClient') { flowUi.query = ''; flowUi.category = '全部品类'; flowUi.scope = '推荐'; flowUi.resultShot = 0; flowUi.issue = ''; }
  if (target.id === 'flowCategory' || target.id === 'flowScope') { flowUi[target.id === 'flowCategory' ? 'category' : 'scope'] = target.value; flowUi.page = 1; render(); return; }
  const configFields = { flowPlatform: 'platform', flowSubtitle: 'subtitle', flowHook: 'hook', flowFocus: 'claimFocus' };
  if (target.id === 'flowProduct') { flowChooseProduct(target.value); saveDraft(); render(); }
  if (configFields[target.id]) { state.config[configFields[target.id]] = target.value; saveDraft(); render(); }
  if (target.id === 'flowDramaStyle' || target.id === 'flowDramaScene') { flowProject().drama[target.id === 'flowDramaStyle' ? 'style' : 'scene'] = target.value; saveDraft(); }
  if (target.dataset.character !== undefined) { flowProject().drama.characters[Number(target.dataset.character)][target.dataset.characterField] = target.value; saveDraft(); }
}, true);
async function flowCopyPrompt(project) {
  try { await navigator.clipboard.writeText(flowPrompt(project)); toast('本条提示词已复制'); }
  catch { downloadText('本条提示词.txt', flowPrompt(project), 'text/plain;charset=utf-8'); toast('剪贴板不可用，已下载文本'); }
}
async function flowUploadResult(file) {
  if (!file) return;
  if(!collabCan('edit'))throw new Error('当前演示身份不能上传成片');
  if (!file.type.startsWith('video/') || file.size > 120 * 1024 * 1024) throw new Error('请选择120MB以内的视频文件');
  const owner = client(); const project = flowProject(); const scope = state.activeClient;
  if(!collabCan('edit',collabCampaign(project.campaignId)))throw new Error('当前演示身份不能上传或替换成片');
  const planSignature = project.accepted?.signature || null;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  let duration;
  let width;
  let height;
  try {
    duration = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('读取视频超时')), 10000);
      video.onloadedmetadata = () => { clearTimeout(timer); width = video.videoWidth; height = video.videoHeight; resolve(Number.isFinite(video.duration) ? video.duration : null); };
      video.onerror = () => { clearTimeout(timer); reject(new Error('浏览器无法播放此格式，请改用MP4或WebM')); };
      video.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  const fileId = await keepFile(file, scope);
  project.history ||= [];
  project.history.unshift({ id: uniqueId('version'), label: '上传成片前', time: new Date().toISOString(), config: flowCopy(project.config), shots: flowCopy(project.shots), accepted: flowCopy(project.accepted || null), drama: flowCopy(project.drama || null), result: flowCopy(project.result || null) });
  project.result = { fileId, name: file.name, duration, width, height, type: file.type, planSignature, source: '客户外部上传', outdated: Boolean(project.planChanged) || planSignature !== project.accepted?.signature, uploaded: new Date().toISOString() };
  project.stageOverride = null;
  project.blockReason = '';
  const job = owner.jobs.find(item => item.id === project.jobId);
  if (job) { job.fileId = fileId; job.status = project.result.outdated ? '需重做' : '待审片'; }
  collabLog('上传作品成片',project.campaignId,file.name+'；外部上传，不是系统模型生成');
  collabNotify(project.assignments.reviewer,project.campaignId,project.name+'：成片等待检查',project.id);
  persist();
  if (state.activeClient === scope && state.config.draftId === project.id) render();
  toast('真实成片已保存；可按确认方案逐镜对照');
}
function flowImportDialog() {
  openModal('导入已有提示词或分镜', `<form id="flowImportForm"><label class="field"><span>商品品类</span><select class="input" name="category">${Object.keys(categories).filter(category => category !== '信息流漫剧').map(category => `<option>${category}</option>`).join('')}</select></label><label class="field"><span>粘贴提示词，或本系统导出的脚本JSON</span><textarea class="input" name="content" required style="height:220px" placeholder="保留原有制作方法；JSON需含shots，或config与shots"></textarea></label><p class="meta">仅导入文本，不执行代码；商品事实、素材与角色仍需核对。跨客户不导入文件引用。</p><p id="flowImportError" class="flow-error" role="alert"></p><button type="submit" class="btn primary full">导入并精调</button></form>`, true);
  document.getElementById('flowImportForm').onsubmit = event => {
    event.preventDefault();
    const form = new FormData(event.target); const text = form.get('content').trim();
    try {
      if (text.length > 200000) throw new Error('请将脚本控制在20万字以内');
      let payload = null;
      if (text.startsWith('{') || text.startsWith('[')) payload = JSON.parse(text);
      const rawShots = Array.isArray(payload) ? payload : payload?.shots;
      if (payload && (!Array.isArray(rawShots) || !rawShots.length || rawShots.length > 100)) throw new Error('JSON需要1–100个镜头，每镜包含visual、speech与有效时间码');
      if (rawShots?.some((shot, index) => typeof shot.visual !== 'string' || typeof shot.speech !== 'string' || !Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.start < 0 || shot.end <= shot.start || index > 0 && shot.start < rawShots[index - 1].end)) throw new Error('检查画面、台词和时间码；镜头不能重叠或倒序');
      const category = form.get('category');
      state.config = { ...defaultConfig(), category, format: categories[category].style, productId: productCatalog.find(item => item.category === category)?.id || 'custom', draftId: '', claims: '', price: '', factsConfirmed: false, assets: [], note: payload ? '外部脚本导入，事实待核对' : text };
      const project = flowProject(); project.flow = true; project.importedPrompt = payload ? '' : text;
      if (rawShots) { project.shots = rawShots.map((shot, index) => ({ id: uniqueId('shot'), role: typeof shot.role === 'string' ? shot.role : `镜头${index + 1}`, visual: shot.visual, speech: shot.speech, start: shot.start, end: shot.end, scale: typeof shot.scale === 'string' ? shot.scale : '中景', assetId: '', clipStart: 0, locked: true, source: '外部文本导入' })); state.config.duration = rawShots.at(-1).end; state.config.shotsCount = rawShots.length; }
      saveDraft(); closeModal(); viewState.stage = rawShots ? 2 : 0; navigate('studio'); toast('原有文本已保留，未调用模型');
    } catch (error) { document.getElementById('flowImportError').textContent = error.message; }
  };
}

function flowCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function flowZip(entries) {
  const encoder = new TextEncoder(); const local = []; const central = []; let offset = 0; let centralSize = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name); const bytes = entry.bytes; const crc = flowCrc32(bytes);
    const header = new Uint8Array(30 + name.length); const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(12, 0x5821, true); view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true); view.setUint16(26, name.length, true); header.set(name, 30);
    const directory = new Uint8Array(46 + name.length); const info = new DataView(directory.buffer);
    info.setUint32(0, 0x02014b50, true); info.setUint16(4, 20, true); info.setUint16(6, 20, true); info.setUint16(8, 0x0800, true); info.setUint16(14, 0x5821, true); info.setUint32(16, crc, true); info.setUint32(20, bytes.length, true); info.setUint32(24, bytes.length, true); info.setUint16(28, name.length, true); info.setUint32(42, offset, true); directory.set(name, 46);
    local.push(header, bytes); central.push(directory); offset += header.length + bytes.length; centralSize += directory.length;
  }
  const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}
async function flowExportPackage(project) {
  if(!collabCan('export',collabCampaign(project.campaignId)))throw new Error('没有源素材导出权限');
  if (flowUi.busy) return;
  flowUi.busy = true;
  const owner = client(); const config = flowCopy(state.config); const shots = flowCopy(project.shots); const captured = flowCopy(project); const prompt = flowPrompt(project);
  const encode = new TextEncoder(); const entries = []; const assets = []; const missing = [];
  const text = (name, content) => entries.push({ name, bytes: encode.encode(content) });
  const safeName = name => name.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_');
  try {
    const model = getModels().find(item => item.id === config.modelId);
    const look = owner.looks.find(item => item.id === config.lookId);
    const voice = getVoices().find(item => item.id === config.voiceId);
    const candidates = [...shots.map(shot => owner.assets.find(item => item.id === shot.assetId)), ...config.assets.map(id => owner.assets.find(item => item.id === id)), product(), model, voice, ...(look?.parts || []).map(id => getGarments().find(item => item.id === id))];
    if (captured.drama) for (const character of captured.drama.characters) candidates.push(getModels().find(item => item.id === character.modelId), getVoices().find(item => item.id === character.voiceId));
    let total = 0;
    const unique = [...new Map(candidates.filter(item => item?.image || item?.fileId).map(item => [item.id, item])).values()];
    for (const item of unique) {
      let blob;
      if (item.fileId) blob = await readFile(item.fileId);
      else { const response = await fetch(item.image); if (!response.ok) throw new Error(`无法读取${item.name}`); blob = await response.blob(); }
      if (!blob) { missing.push(item.name); continue; }
      total += blob.size;
      if (total > 220 * 1024 * 1024) throw new Error('素材包超过220MB，请减少引用或单独下载大视频');
      const extension = blob.type.includes('image') ? blob.type.includes('svg') ? '.svg' : blob.type.includes('png') ? '.png' : '.jpg' : blob.type.includes('audio') ? '.audio' : blob.type.includes('video') ? '.webm' : '.bin';
      const filename = `素材/${safeName(item.id)}_${safeName(item.name || '素材')}${/\.[a-z0-9]{2,5}$/i.test(item.name || '') ? '' : extension}`;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      entries.push({ name: filename, bytes });
      const sha256 = window.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('') : null;
      assets.push({ id: item.id, name: item.name, path: filename, bytes: bytes.length, sha256, authority: item.authority || '需客户核对', rawSource: true });
    }
    if (captured.result) {
      const file = await readFile(captured.result.fileId);
      if (file) {
        if (total + file.size > 340 * 1024 * 1024) throw new Error('素材与成片超过340MB，请分开交付');
        entries.push({ name: `成片/${safeName(captured.result.name)}`, bytes: new Uint8Array(await file.arrayBuffer()) });
      } else missing.push('实际成片');
    }
    const manifest = { schema: 'commerce-edit-package', version: 1, client: owner.name, project: captured.name, config, shots, drama: captured.drama || null, approvedPlan: captured.accepted || null, planChanged: Boolean(captured.planChanged), assets, missing, timeline: shots.map(shot => ({ shotId: shot.id, source: assets.find(asset => asset.id === shot.assetId)?.path || null, in: shot.clipStart || 0, start: shot.start, end: shot.end, subtitle: shot.speech })), output: '原始素材与时间轴清单，不是剪映工程，未裁切源视频', model: '未调用；外部成片模型版本未知', history: captured.history, review: captured.result?.review || null, deliveries: captured.deliveries || [] };
    text('制作清单.json', JSON.stringify(manifest, null, 2));
    text('字幕.srt', subtitleSrt(shots));
    text('提示词.txt', prompt);
    text('二剪说明.txt', `这是可导入剪映素材库的源素材包，不是可直接打开的剪映草稿。\n1. 导入素材目录，按制作清单里的start/end与in设置镜头顺序和片段起点。\n2. 单独导入字幕.srt；声音文件可作为独立音轨使用。系统试听音色不在包中。\n3. 素材为原始文件，未自动裁成无字幕镜头；外部成片若已烧录字幕，无法自动拆层。\n4. 示例人像与图片不是商品证明，商用前确认所有来源与授权。\n5. 缺失文件：${missing.join('、') || '无'}。\n6. 当前${captured.planChanged ? '方案有变更，旧成片未更新' : '以清单与人工确认版本为准'}。\n未执行MP4转码、视频模型、配音生成、剪映工程或服务端上传。`);
    const blob = flowZip(entries); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = safeName(captured.name) + '_二剪素材包.zip'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast(missing.length ? `已导出，${missing.length}项缺失详见说明` : '素材、独立字幕与时间轴已打包');
  } finally { flowUi.busy = false; }
}
