'use strict';

const featureUi = { knowledgeTab: '已保存知识', assetFilter: '全部', assetPage: 1, query: '', hotspotQuery: '', hotspotCategory: '全部品类', aiBusy: false, aiPlan: null, stop: false };
const XLTeam = {
  initialize() {
    state.teams ||= [{ id: 'default', name: '曜石电商 · 内容组', desc: '', clientIds: Object.keys(state.clients), memberIds: [], budget: null }];
    if (!state.teams.some(team => team.id === 'default')) state.teams.unshift({ id: 'default', name: '曜石电商 · 内容组', desc: '', clientIds: Object.keys(state.clients), memberIds: [] });
    state.activeTeam ||= 'default';
    if (!state.teams.some(team => team.id === state.activeTeam)) state.activeTeam = 'default';
    const team = this.current();
    team.memberIds ||= [];
    team.clientIds = (team.clientIds || []).filter(id => Object.hasOwn(state.clients, id));
    return team;
  },
  current() { return state.teams.find(team => team.id === state.activeTeam); },
  visibleClients() { return this.current()?.clientIds || []; },
  accessible(team, actor = collabActor()) { return ['owner', 'admin'].includes(actor.role) || team.id === 'default' || team.memberIds?.includes(actor.id); },
  switch(id) {
    const team = state.teams.find(item => item.id === id);
    if (!team || !this.accessible(team)) return collabReject();
    if (['studio', 'quick', 'brief', 'drama', 'result'].includes(viewState.view) && collabCan('edit')) saveDraftIfNeeded();
    state.activeTeam = id;
    const clients = team.clientIds.filter(clientId => collabClientAllowed(clientId));
    if (!clients.includes(state.activeClient) && clients.length) state.activeClient = clients[0];
    state.config = defaultConfig();
    collabUi.client = 'all'; collabUi.projectId = ''; collabUi.selected.clear();
    viewState.selectedAssets.clear(); viewState.selectedJobs.clear(); viewState.batch = null;
    featureUi.query = ''; featureUi.assetPage = 1; featureUi.aiPlan = null;
    workspaceUi.resourceReturn = null;
    persist(); closeModal(); navigate('projects');
  }
};
function extensionNormalize() {
  XLTeam.initialize();
  client().hotspots ||= [];
  client().labelEvents ||= [];
  return client();
}
function teamContextAvailable() {
  const actor = collabActor();
  return XLTeam.accessible(XLTeam.current(), actor) && XLTeam.visibleClients().some(id => actor.clientIds.includes('*') || actor.clientIds.includes(id));
}
function teamEmptyPage() {
  return headline('当前团队没有可访问客户', '', collabCan('team') ? button('设置团队范围', 'feature-team-edit', '', `data-id="${XLTeam.current().id}"`) : '') + emptyState('没有授权客户', '选择其他团队，或由管理员设置客户范围');
}
function teamListPage() {
  return `${headline('团队列表', '', collabCan('team') ? button('新建团队', 'feature-team-create', 'primary') : '')}<section class="card table-wrap"><table><thead><tr><th>团队</th><th>成员</th><th>客户范围</th><th>计划预算</th><th>操作</th></tr></thead><tbody>${state.teams.filter(team => XLTeam.accessible(team)).map(team => `<tr><td><strong>${escapeText(team.name)}</strong>${team.id === state.activeTeam ? badge('当前') : ''}<p class="meta">${escapeText(team.desc || '')}</p></td><td>${team.id === 'default' ? '默认成员' : team.memberIds.length || '未分配'}</td><td>${team.clientIds.map(id => escapeText(state.clients[id]?.name || id)).join('、') || '未分配'}</td><td>${collabCan('finance') ? team.budget == null ? '未设置' : team.budget + ' 计划积分' : '无权限'}</td><td><div class="row gap8">${button('切换', 'feature-team-switch', 'sm', `data-id="${team.id}" ${state.activeTeam === team.id ? 'disabled' : ''}`)}${collabCan('team') ? button('编辑', 'feature-team-edit', 'sm', `data-id="${team.id}"`) + button('移除', 'feature-team-remove', 'ghost sm', `data-id="${team.id}" ${team.id === 'default' ? 'disabled' : ''}`) : ''}</div></td></tr>`).join('')}</tbody></table></section>`;
}
function teamEditDialog(id = '') {
  if (!collabCan('team')) return collabReject();
  const team = state.teams.find(item => item.id === id);
  openModal(team ? '编辑团队' : '新建团队', `<form id="featureTeamForm"><label class="field"><span>名称</span><input name="name" required maxlength="80" class="input" value="${escapeText(team?.name || '')}"></label><label class="field"><span>描述（选填）</span><input name="desc" maxlength="200" class="input" value="${escapeText(team?.desc || '')}"></label><h3>客户范围</h3><div class="collab-member-checks mt">${Object.entries(state.clients).map(([clientId, current]) => `<label><input type="checkbox" class="checkbox" name="clients" value="${clientId}" ${team?.clientIds.includes(clientId) ? 'checked' : ''}> ${escapeText(current.name)}</label>`).join('')}</div><details class="workspace-details"><summary>成员与计划预算</summary><div class="collab-member-checks mt">${collabState().members.filter(member => member.active).map(member => `<label><input name="members" class="checkbox" type="checkbox" value="${member.id}" ${team?.memberIds.includes(member.id) ? 'checked' : ''}> ${escapeText(member.name)}</label>`).join('')}</div><label class="field mt"><span>团队计划预算（选填，不是钱包或扣费）</span><input name="budget" class="input" type="number" min="0" value="${team?.budget ?? ''}"></label></details><p class="meta mt">团队范围与个人授权取交集；本地分组不代表服务端租户隔离。移除团队不会删除客户、素材和项目。</p><button type="submit" class="btn primary mt">保存团队</button></form>`, true);
  document.getElementById('featureTeamForm').onsubmit = event => {
    event.preventDefault();
    if (!collabCan('team')) return collabReject();
    const data = new FormData(event.target);
    if (!data.get('name').trim() || data.get('budget') !== '' && (!Number.isFinite(Number(data.get('budget'))) || Number(data.get('budget')) < 0)) { toast('请输入团队名称及有效的非负预算'); return; }
    const item = team || { id: uniqueId('team') };
    Object.assign(item, { name: data.get('name').trim(), desc: data.get('desc').trim(), clientIds: data.getAll('clients'), memberIds: data.getAll('members'), budget: data.get('budget') === '' ? null : Number(data.get('budget')) });
    if (!team) state.teams.push(item);
    collabLog('维护本地团队', '', item.name + '；不改变客户个人授权');
    persist(); closeModal();
    if (state.activeTeam === item.id) XLTeam.switch(item.id); else render();
  };
}
function featureAssetList() {
  const records = extensionNormalize().assets.filter(asset => (featureUi.assetFilter === '全部' || featureUi.assetFilter === '未打标' ? featureUi.assetFilter === '全部' || !asset.mark : asset.mark === (featureUi.assetFilter === '好素材' ? 'good' : 'bad')) && `${asset.name} ${asset.sku || ''}`.toLowerCase().includes(featureUi.query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(records.length / 12)); featureUi.assetPage = Math.min(pages, featureUi.assetPage);
  return `${headline('素材评价', '', button('返回资源中心', 'nav', '', 'data-view="resources"'))}<div class="toolbar">${workspaceSelect('评价筛选', 'featureAssetFilter', ['全部', '未打标', '好素材', '差素材'], featureUi.assetFilter)}<input class="input search" id="featureAssetQuery" placeholder="素材名称或SKU" aria-label="搜索评价素材" value="${escapeText(featureUi.query)}"></div>${records.length ? `<div class="asset-grid">${records.slice((featureUi.assetPage - 1) * 12, featureUi.assetPage * 12).map(asset => `<article class="card asset-card"><div class="asset-image">${imageMarkup(asset)}</div><div class="asset-body"><h3>${escapeText(asset.name)}</h3><p class="meta">${escapeText(asset.sku || '未关联SKU')} · ${asset.mark === 'good' ? '好素材' : asset.mark === 'bad' ? '差素材' : '未评价'}</p><p class="small">${escapeText(asset.markReason || '')}</p>${button('评价 / 编辑', 'feature-label', 'sm', `data-id="${asset.id}"`)}</div></article>`).join('')}</div><div class="pagination"><span>${records.length}项 · ${featureUi.assetPage}/${pages}</span><div class="row gap8">${button('上一页', 'feature-label-page', 'sm', `data-direction="-1" ${featureUi.assetPage === 1 ? 'disabled' : ''}`)}${button('下一页', 'feature-label-page', 'sm', `data-direction="1" ${featureUi.assetPage === pages ? 'disabled' : ''}`)}</div></div>` : emptyState('没有匹配素材', '先上传或调整筛选', button('返回素材库', 'nav', '', 'data-view="resources'))}`;
}
function assetLabelDialog(id) {
  const asset = client().assets.find(item => item.id === id);
  if (!asset || !collabCan('edit')) return collabReject();
  openModal('素材评价与商品资料', `<form id="featureAssetForm"><div class="setting-grid">${selectorField('评价', 'featureMark', [{ id: '', name: '未评价' }, { id: 'good', name: '好素材' }, { id: 'bad', name: '差素材' }], asset.mark || '')}${selectorField('品类', 'featureLabelCategory', Object.keys(categories), asset.category || state.config.category)}<label class="field"><span>SKU</span><input name="sku" class="input" value="${escapeText(asset.sku || '')}"></label><label class="field"><span>关联编导（选填）</span><select class="input" name="director"><option value="">未记录</option>${collabState().members.filter(member => member.active).map(member => `<option value="${member.id}" ${asset.directorId === member.id ? 'selected' : ''}>${escapeText(member.name)}</option>`).join('')}</select></label></div><label class="field"><span>原因</span><textarea name="reason" class="input" maxlength="1600" placeholder="具体镜头、时间码、值得保留或需要避免的地方">${escapeText(asset.markReason || '')}</textarea></label><label class="field"><span>素材标签（逗号分隔，选填）</span><input class="input" name="tags" maxlength="500" value="${escapeText((asset.tags || []).join(','))}"></label><details class="workspace-details"><summary>商品规格与价格资料</summary><div class="setting-grid mt"><label class="field"><span>规格 / 型号</span><input name="spec" class="input" value="${escapeText(asset.productSpec || '')}"></label><label class="field"><span>活动价格</span><input name="price" class="input" value="${escapeText(asset.activityPrice || '')}"></label><label class="field"><span>价格有效至</span><input name="until" type="date" class="input" value="${asset.priceUntil || ''}"></label></div><p class="meta">资料仅保存，未经核对不自动作为商品事实；换SKU不继承旧价格。</p></details><p id="featureAssetError" class="guard-error" role="alert"></p><button class="btn primary" type="submit">保存评价</button></form>`, true);
  document.getElementById('featureAssetForm').onsubmit = event => {
    event.preventDefault();
    if (!collabCan('edit')) return collabReject();
    const form = new FormData(event.target); const mark = document.getElementById('featureMark').value; const reason = form.get('reason').trim();
    if (mark && !reason) { document.getElementById('featureAssetError').textContent = '好/差评价都需要具体原因'; return; }
    const sku = form.get('sku').trim();
    if (sku !== (asset.sku || '') && (asset.sku || client().facts?.[id] || client().projects.some(work => work.config?.productId === id))) {
      document.getElementById('featureAssetError').textContent = '更换SKU请新增商品素材；已有SKU、事实与作品不能被评价表单静默改写'; return;
    }
    asset.labelHistory ||= [];
    asset.labelHistory.push({ mark: asset.mark || null, reason: asset.markReason || '', by: asset.markedBy || null, at: asset.markedAt || null });
    Object.assign(asset, { mark: mark || null, markReason: reason, category: document.getElementById('featureLabelCategory').value, sku: form.get('sku').trim(), directorId: form.get('director'), tags: form.get('tags').split(/[,，]/).map(tag => tag.trim()).filter(Boolean).slice(0, 12), productSpec: form.get('spec').trim(), activityPrice: form.get('price').trim(), priceUntil: form.get('until'), markedBy: collabActor().id, markedAt: new Date().toISOString(), markedTeamId: state.activeTeam });
    extensionNormalize().labelEvents.push({ id: uniqueId('label-event'), assetId: id, mark, reason, actorId: collabActor().id, teamId: state.activeTeam, at: asset.markedAt });
    const campaign = collabState().campaigns.find(item => item.clientId === state.activeClient && collabVisible(item));
    const message = `${asset.name}：${mark === 'good' ? '好素材' : mark === 'bad' ? '差素材' : '取消评价'}，${reason}`;
    if (campaign) collabNotify(campaign.leadId, campaign.id, message);
    else collabState().notifications.unshift({ id: uniqueId('notice'), memberId: collabActor().id, clientId: state.activeClient, message, read: false, at: asset.markedAt });
    persist(); closeModal(); render(); toast('评价已保存；提炼并发布后才能用于新方案');
  };
}
function labelStatistics() {
  const clients = collabAccessibleClients();
  const assets = clients.flatMap(clientId => state.clients[clientId].assets.map(asset => ({ ...asset, clientId })));
  const good = assets.filter(asset => asset.mark === 'good'); const bad = assets.filter(asset => asset.mark === 'bad');
  const directors = collabState().members.map(member => {
    const records = assets.filter(asset => asset.directorId === member.id && asset.mark);
    return { member, count: records.length, good: records.filter(asset => asset.mark === 'good').length };
  }).filter(row => row.count).sort((left, right) => right.good / right.count - left.good / left.count);
  return `${headline('打标统计', '')}<div class="feature-label-metrics"><div><small>当前范围素材</small><strong>${assets.length}</strong></div><div><small>已评价</small><strong>${good.length + bad.length}</strong></div><div><small>好 / 差</small><strong>${good.length} / ${bad.length}</strong></div><div><small>好素材率（已评价中）</small><strong>${good.length + bad.length ? (good.length / (good.length + bad.length) * 100).toFixed(1) + '%' : '—'}</strong></div></div><div class="feature-stat-layout"><section class="card table-wrap"><table><thead><tr><th>关联编导</th><th>已评价样本</th><th>好素材</th><th>好素材率</th></tr></thead><tbody>${directors.map(row => `<tr><td>${escapeText(row.member.name)}</td><td>${row.count}</td><td>${row.good}</td><td>${(row.good / row.count * 100).toFixed(1)}%</td></tr>`).join('') || '<tr><td colspan="4">没有编导归属样本；不把打标人误当成编导</td></tr>'}</tbody></table></section><section class="card pad"><h3>差素材原因</h3>${Object.keys(categories).map(category => {
    const group = bad.filter(asset => asset.category === category);
    const reasons = [...new Set(group.map(asset => asset.markReason).filter(Boolean))].slice(0, 5);
    return reasons.length ? `<details class="workspace-details"><summary>${category} · ${group.length}条</summary>${reasons.map(reason => `<p class="small mt">${escapeText(reason)}</p>`).join('')}</details>` : '';
  }).join('') || '<p class="meta mt">暂无评价样本</p>'}</section></div><p class="meta mt">人工评价，不代表转化率；未评价素材不算差素材。生成数只以真实生成任务为准，不用资产总数冒充。</p>`;
}
function knowledgeExtractionPage() {
  const assets = extensionNormalize().assets.filter(asset => asset.mark && asset.markReason);
  return `${headline('素材提炼', '', button('整理评价（不调用模型）', 'feature-derive-rules', 'primary') + button('视频AI提炼', 'feature-ai-prepare') + button('查看后端任务', 'generation-tasks'))}<div class="feature-table-context">当前客户已评价 ${assets.length} 条 · 只整理已记录的原因，不伪造画面分析</div>${assets.length ? `<section class="card table-wrap"><table><thead><tr><th>选择</th><th>素材 / SKU</th><th>评价</th><th>原因</th><th>来源</th></tr></thead><tbody>${assets.slice(0, 50).map(asset => `<tr><td><input type="checkbox" class="checkbox" data-learning-asset="${asset.id}" ${viewState.selectedAssets.has(asset.id) ? 'checked' : ''} aria-label="选择 ${escapeText(asset.name)}"></td><td>${escapeText(asset.name)}<p class="meta">${escapeText(asset.sku || '')}</p></td><td>${asset.mark === 'good' ? '好' : '差'}</td><td>${escapeText(asset.markReason)}</td><td>${asset.kind} · ${escapeText(collabName(asset.markedBy))}</td></tr>`).join('')}</tbody></table></section>` : emptyState('先评价素材', '记录具体好/差原因再提炼', button('去素材评价', 'nav', '', 'data-view="labels'))}<p class="meta mt">提炼结果保存为知识草稿；必须人工核对发布、按客户和品类选用，才进入新Prompt。最多50条展示，可先在素材评价筛选。</p>`;
}
function teamExpensePage() {
  if (!collabCan('finance')) return collabDenied();
  const team = XLTeam.current();
  return `${headline('团队费用', '', button('刷新记录', 'feature-expenses-refresh'))}<div class="feature-table-context">${escapeText(team.name)} · 计划预算 ${team.budget == null ? '未设置' : team.budget + ' 积分'}</div><section id="featureTeamExpenses" class="card pad" aria-live="polite">正在读取调用记录…</section><p class="meta mt">按任务创建时的团队快照归属，每个可访问客户最近100条记录。估价不是供应商扣费；旧任务未标团队时不自动归入当前团队。计划预算不是钱包，也不代表供应商强制扣费上限。</p>`;
}
async function loadTeamExpenses() {
  if (!collabCan('finance')) return;
  const teamId = state.activeTeam;
  const actorId = collabActor().id;
  const clientIds = collabAccessibleClients();
  const panel = document.getElementById('featureTeamExpenses');
  if (!panel) return;
  try {
    const groups = await Promise.all(clientIds.map(async clientId => (await generationRequest('/api/tasks?clientId=' + encodeURIComponent(clientId))).tasks));
    if (!panel.isConnected || teamId !== state.activeTeam || actorId !== collabActor().id) return;
    const tasks = groups.flat();
    const owned = tasks.filter(task => task.teamId === teamId);
    const priced = owned.filter(task => Number.isFinite(task.quote?.credits));
    const estimate = priced.reduce((sum, task) => sum + task.quote.credits, 0);
    panel.innerHTML = `<div class="feature-label-metrics"><div><small>本团队任务</small><strong>${owned.length}</strong></div><div><small>有报价记录</small><strong>${priced.length}</strong></div><div><small>报价合计（积分）</small><strong>${estimate}</strong></div><div><small>待确认状态</small><strong>${owned.filter(task => task.status === 'unknown').length}</strong></div></div><div class="table-wrap"><table><thead><tr><th>任务</th><th>客户 / 类型</th><th>状态</th><th>估价积分</th><th>费用状态</th></tr></thead><tbody>${owned.map(task => `<tr><td>${escapeText(task.id.slice(0, 12))}</td><td>${escapeText(state.clients[task.clientId]?.name || task.clientId)} / ${escapeText(task.kind)}</td><td>${escapeText(task.status)}</td><td>${Number.isFinite(task.quote?.credits) ? task.quote.credits : '未报价'}</td><td>${escapeText(task.financialStatus)}</td></tr>`).join('') || '<tr><td colspan="5">当前团队暂无任务记录</td></tr>'}</tbody></table></div><p class="meta mt">当前可访问范围另有 ${tasks.filter(task => !task.teamId).length} 条历史任务未记录团队，未计入本团队。</p>`;
  } catch (error) { if (panel.isConnected) panel.textContent = '费用记录未读取成功：' + error.message; }
}
function deriveLearningRules() {
  if (!collabCan('edit')) return collabReject();
  const selected = client().assets.filter(asset => viewState.selectedAssets.has(asset.id) && asset.mark && asset.markReason);
  if (!selected.length || selected.length > 50) { toast('请选择1–50条已评价素材'); return; }
  const grouped = new Map();
  for (const asset of selected) {
    const category = asset.category || state.config.category;
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(asset);
  }
  for (const [category, assets] of grouped) {
    const good = [...new Set(assets.filter(asset => asset.mark === 'good').map(asset => asset.markReason))];
    const bad = [...new Set(assets.filter(asset => asset.mark === 'bad').map(asset => asset.markReason))];
    client().knowledge.unshift({ id: uniqueId('knowledge'), title: `${category} · 人工评价整理`, content: `${good.length ? '值得保留的表达：\n' + good.map(reason => '- ' + reason).join('\n') : ''}\n${bad.length ? '需要避免的问题：\n' + bad.map(reason => '- ' + reason).join('\n') : ''}`, version: 1, versions: [], status: '草稿', owner: collabActor().name, category, scope: '当前客户', source: '人工打标原因整理，不是AI视觉分析', sourceAssetIds: assets.map(asset => asset.id), sourceMarks: assets.map(asset => ({ id: asset.id, mark: asset.mark, reason: asset.markReason, at: asset.markedAt })), teamId: state.activeTeam, created: new Date().toISOString() });
  }
  persist(); viewState.selectedAssets.clear(); featureUi.knowledgeTab = '已保存知识'; flowUi.knowledgeTab = '经验与规则'; guardUi.libraryFilter = '全部状态'; navigate('preferences'); toast(`按${grouped.size}个品类建立知识草稿，尚未发布`);
}
function hotspotPage() {
  const records = extensionNormalize().hotspots.filter(item => (featureUi.hotspotCategory === '全部品类' || item.category === featureUi.hotspotCategory) && `${item.name} ${item.description}`.toLowerCase().includes(featureUi.hotspotQuery.toLowerCase()));
  return `${headline('热点与内容梗', '', button('新增热点', 'feature-hotspot-new', 'primary'))}<div class="toolbar">${workspaceSelect('适用品类', 'featureHotspotCategory', ['全部品类', ...Object.keys(categories)], featureUi.hotspotCategory)}<input class="input search" id="featureHotspotQuery" aria-label="搜索热点" placeholder="名称或表达" value="${escapeText(featureUi.hotspotQuery)}"></div>${records.length ? `<div class="card">${records.map(item => `<div class="draft-row"><div class="grow"><strong>${escapeText(item.name)}</strong><p class="small mt">${escapeText(item.description)}</p><p class="meta">${escapeText(item.category)} · ${item.expires ? '有效至' + item.expires : '未设置期限'} · ${escapeText(item.source)}</p></div><div class="row gap8">${button('用于当前方案', 'feature-hotspot-apply', 'sm', `data-id="${item.id}" ${item.expires && item.expires < guardToday() ? 'disabled' : ''}`)}${button('编辑', 'feature-hotspot-edit', 'ghost sm', `data-id="${item.id}"`)}</div></div>`).join('')}</div>` : emptyState('没有热点记录', '添加有来源且适用当前品类的内容表达，不抓取未授权作品')}`;
}
function hotspotDialog(id = '') {
  if (!collabCan('edit')) return collabReject();
  const existing = client().hotspots.find(item => item.id === id);
  openModal('内容热点', `<form id="featureHotspotForm"><label class="field"><span>名称</span><input name="name" class="input" required maxlength="80" value="${escapeText(existing?.name || '')}"></label><label class="field"><span>表达与使用限制</span><textarea name="description" class="input" required maxlength="1800">${escapeText(existing?.description || '')}</textarea></label>${selectorField('品类', 'featureHotspotFormCategory', ['全部品类', ...Object.keys(categories)], existing?.category || state.config.category)}<label class="field"><span>来源说明 / 链接</span><input name="source" class="input" required value="${escapeText(existing?.source || '')}"></label><label class="field"><span>有效至（选填）</span><input name="expires" class="input" type="date" value="${existing?.expires || ''}"></label><button class="btn primary" type="submit">保存</button></form>`);
  document.getElementById('featureHotspotForm').onsubmit = event => {
    event.preventDefault();
    if (!collabCan('edit')) return collabReject();
    const form = new FormData(event.target); const item = existing || { id: uniqueId('hotspot'), version: 0 };
    if (![form.get('name'), form.get('description'), form.get('source')].every(value => value.trim())) { toast('名称、表达及来源不能为空'); return; }
    Object.assign(item, { name: form.get('name').trim(), description: form.get('description').trim(), source: form.get('source').trim(), category: document.getElementById('featureHotspotFormCategory').value, expires: form.get('expires'), version: item.version + 1 });
    if (!existing) client().hotspots.unshift(item);
    persist(); closeModal(); render();
  };
}
function featureAfterRender() {
  const currentTeam = XLTeam.current();
  const workspace = document.querySelector('.workspace-sidebar .workspace');
  if (workspace) {
    workspace.innerHTML = '<div id="featureTeamSelect"></div>';
    const select = new CustomSelect({ container: document.getElementById('featureTeamSelect'), label: '当前团队', options: state.teams.filter(team => XLTeam.accessible(team)).map(team => ({ value: team.id, label: team.name })), value: currentTeam.id, onChange: value => XLTeam.switch(value) });
    select.root.customSelect = select;
  }
  enhanceSelect(document.getElementById('activeClient') || document.getElementById('collabGlobalClient'));
  if (!teamContextAvailable()) return;
  if (['resources', 'assets'].includes(viewState.view) && workspaceUi.resourceTab === 'assets') {
    document.querySelector('.page-head .row')?.insertAdjacentHTML('beforeend', button('素材评价', 'nav', '', 'data-view="labels"'));
    document.querySelectorAll('[data-action="asset-detail"]').forEach(control => control.insertAdjacentHTML('beforebegin', button('评价', 'feature-label', 'ghost sm', `data-id="${control.dataset.id}"`)));
  }
  if (viewState.view === 'preferences') {
    document.querySelector('.page-head')?.insertAdjacentHTML('afterend', `<div class="tabs feature-knowledge-tabs">${['已保存知识', '素材提炼', '热点与内容梗'].map(tab => `<button data-action="feature-knowledge-tab" data-value="${tab}" class="${featureUi.knowledgeTab === tab ? 'active' : ''}">${tab}</button>`).join('')}</div>`);
    if (featureUi.knowledgeTab !== '已保存知识') {
      const main = document.querySelector('main');
      [...main.children].filter(element => !element.classList.contains('page-head') && !element.classList.contains('feature-knowledge-tabs')).forEach(element => element.remove());
      main.insertAdjacentHTML('beforeend', featureUi.knowledgeTab === '素材提炼' ? knowledgeExtractionPage() : hotspotPage());
      main.querySelectorAll(':scope>.page-head').forEach((element, index) => { if (index > 0) element.classList.add('feature-inner-head'); });
    }
  }
  if (viewState.view === 'settings') {
    const tabs = document.querySelector('main>.tabs');
    if (tabs && collabCan('team')) {
      for (const tab of ['团队列表', '打标统计', '团队费用']) {
        const existing = [...tabs.querySelectorAll('button')].find(buttonElement => buttonElement.textContent === tab);
        if (existing) existing.dataset.action = 'feature-management-tab';
      }
    }
    if (['团队列表', '打标统计', '团队费用'].includes(collabUi.teamTab)) {
      const main = document.querySelector('main');
      const heading = main.querySelector(':scope>.page-head');
      [...main.children].filter(element => element !== heading && !element.classList.contains('tabs')).forEach(element => element.remove());
      main.insertAdjacentHTML('beforeend', collabUi.teamTab === '团队列表' ? teamListPage() : collabUi.teamTab === '打标统计' ? labelStatistics() : teamExpensePage());
      main.querySelectorAll(':scope>.page-head').forEach((element, index) => { if (index > 0) element.classList.add('feature-inner-head'); });
      if (collabUi.teamTab === '团队费用') loadTeamExpenses();
    }
    if (collabUi.teamTab === '出片API') document.querySelector('main>.card')?.insertAdjacentHTML('beforeend', `<div class="output-choice"><div><h3>视频理解（Gemini协议）</h3><p>使用服务端vision provider。Key不进入浏览器，local文件需供应商显式支持inline视频；未知价格不调用。</p></div>${button('检查服务端配置', 'generation-settings', 'sm')}</div>`);
  }
  hydrateFiles();
}
document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control || !control.dataset.action.startsWith('feature-') || control.dataset.action === 'feature-ai-quotes') return;
  event.preventDefault(); event.stopImmediatePropagation();
  const action = control.dataset.action; const id = control.dataset.id;
  if (action.startsWith('feature-team-') && !['feature-team-switch'].includes(action) && !collabCan('team')) return collabReject();
  if (!action.startsWith('feature-team-') && !['feature-management-tab', 'feature-knowledge-tab', 'feature-label-page', 'feature-expenses-refresh', 'feature-notice-read', 'feature-ai-stop'].includes(action) && !collabCan('edit')) return collabReject();
  switch (action) {
    case 'feature-team-create': teamEditDialog(); break;
    case 'feature-team-edit': teamEditDialog(id); break;
    case 'feature-team-switch': XLTeam.switch(id); break;
    case 'feature-team-remove':
      if (id === 'default') return;
      openModal('移除团队分组', `<p>只移除分组，不删除客户、素材、成员、项目或交付。</p>${button('确认移除', 'feature-team-remove-confirm', 'primary mt', `data-id="${id}"`)}`); break;
    case 'feature-team-remove-confirm':
      if (id === 'default') return;
      state.teams = state.teams.filter(team => team.id !== id); persist();
      if (state.activeTeam === id) XLTeam.switch('default'); else { closeModal(); render(); } break;
    case 'feature-label': assetLabelDialog(id); break;
    case 'feature-label-page': featureUi.assetPage += Number(control.dataset.direction); render(); break;
    case 'feature-knowledge-tab': featureUi.knowledgeTab = control.dataset.value; render(); break;
    case 'feature-management-tab': if (!collabCan('team')) return collabReject(); collabUi.teamTab = control.dataset.value; render(); break;
    case 'feature-expenses-refresh': loadTeamExpenses(); break;
    case 'feature-notice-read': {
      const notice = collabState().notifications.find(item => item.id === id && item.memberId === collabActor().id && collabNoticeVisible(item));
      if (!notice) return collabReject();
      notice.read = true; persist(); closeModal(); render();
      document.querySelector('[data-action="collab-notifications"]')?.click(); break;
    }
    case 'feature-derive-rules': deriveLearningRules(); break;
    case 'feature-hotspot-new': hotspotDialog(); break;
    case 'feature-hotspot-edit': hotspotDialog(id); break;
    case 'feature-hotspot-apply': {
      const item = client().hotspots.find(record => record.id === id);
      const work = client().projects.find(record => record.id === state.config.draftId);
      if (!item || !work || item.expires && item.expires < guardToday() || item.category !== '全部品类' && item.category !== state.config.category) { toast('没有当前草稿，或热点已过期/品类不适用'); break; }
      flowSnapshot(work, '选用热点前'); state.config.hotspotSnapshot = collabCopy(item);
      state.config.note = (state.config.note ? state.config.note + '\n' : '') + `热点表达参考：${item.description}；不得新增商品功效或冒用原作品`;
      saveDraft(); toast('热点已加入当前方案，修改后须重新确认'); break;
    }
    case 'feature-ai-prepare': prepareVideoLearning().catch(error => toast(error.message)); break;
    case 'feature-ai-run': runVideoLearning().catch(error => toast(error.message)); break;
    case 'feature-ai-stop': featureUi.stop = true; toast('当前已发送调用继续核对，后续不再发送'); break;
  }
}, true);
document.addEventListener('change', event => {
  const input = event.target;
  if (input.id === 'featureAssetFilter') { featureUi.assetFilter = input.value; featureUi.assetPage = 1; render(); }
  if (input.id === 'featureHotspotCategory') { featureUi.hotspotCategory = input.value; render(); }
  if (input.dataset.learningAsset) { input.checked ? viewState.selectedAssets.add(input.dataset.learningAsset) : viewState.selectedAssets.delete(input.dataset.learningAsset); }
});
document.addEventListener('input', event => {
  const input = event.target;
  const field = input.id === 'featureAssetQuery' ? 'query' : input.id === 'featureHotspotQuery' ? 'hotspotQuery' : '';
  if (!field) return;
  const position = input.selectionStart; featureUi[field] = input.value; featureUi.assetPage = 1; render();
  const replacement = document.getElementById(input.id); replacement.focus(); replacement.setSelectionRange(position, position);
});
async function prepareVideoLearning() {
  if (featureUi.aiBusy || !collabCan('generate')) return collabReject();
  const selected = client().assets.filter(asset => viewState.selectedAssets.has(asset.id) && asset.kind === '视频' && asset.mark && asset.markReason);
  if (!selected.length || selected.length > 5) { toast('请选择1–5条已评价视频'); return; }
  const config = await generationRequest('/api/config');
  if (!config.providers.vision?.ready || config.providers.vision.protocol !== 'gemini-content') { toast('服务端Gemini协议vision provider未配置；规则整理仍可用，不伪装AI分析'); return; }
  featureUi.aiPlan = { clientId: state.activeClient, teamId: state.activeTeam, actorId: collabActor().id, selected: collabCopy(selected), records: [], provider: config.providers.vision };
  openModal('视频理解：准备与费用', `<p class="small">选中${selected.length}条视频，最多5条逐条调用；先上传本地文件并准备估价，下一步再次确认才运行Gemini。</p><p class="meta mt">仅支持服务端明确允许的inline视频；不把blob链接传给模型，也不在浏览器保存API Key。</p><label class="row mt small"><input type="checkbox" class="checkbox" id="featureAnalysisRights"> 我确认这些视频的处理授权与客户范围</label><p id="featureAnalysisError" role="alert" class="guard-error"></p>${button('准备各条估价（不分析）', 'feature-ai-quotes', 'primary mt')}`, true);
}
async function videoLearningQuotes() {
  const plan = featureUi.aiPlan;
  if (featureUi.aiBusy) return;
  if (!plan || !document.getElementById('featureAnalysisRights')?.checked) { document.getElementById('featureAnalysisError').textContent = '请核对视频授权'; return; }
  featureUi.aiBusy = true;
  plan.records = [];
  document.querySelector('[data-action="feature-ai-quotes"]').disabled = true;
  try {
    for (const asset of plan.selected) {
      if (plan.clientId !== state.activeClient || plan.teamId !== state.activeTeam || plan.actorId !== collabActor().id) throw new Error('上下文已变化，停止准备');
      const roles = await generationUpload({ item: asset, role: 'reference_video' }, asset.publicUrl || '', plan.clientId);
      const input = { config: { ...defaultConfig(), teamId: plan.teamId, category: asset.category || '服饰鞋包', duration: 120, videoAnalysis: true, analysisLabel: asset.mark, analysisReason: asset.markReason }, shots: [{ start: 0, end: 120, role: '参考内容分析', visual: '只分析输入视频，不生成', speech: '返回候选JSON' }] };
      const task = (await generationRequest('/api/tasks', { clientId: plan.clientId, workId: asset.id, campaignId: `analysis-${plan.teamId}`, kind: 'vision', input, assets: [roles], idempotencyKey: uniqueId('analysis') })).task;
      const quote = (await generationRequest(`/api/tasks/${task.id}/quote`, { clientId: plan.clientId })).quote;
      plan.records.push({ asset, task, quote });
    }
    if (plan.clientId !== state.activeClient || plan.teamId !== state.activeTeam || plan.actorId !== collabActor().id) throw new Error('上下文已变化，请重新选择视频');
    const total = plan.records.reduce((sum, record) => sum + record.quote.credits, 0);
    openModal('确认视频理解费用', `<p>${plan.records.length}条 · ${total}估价积分，价格来源为服务端配置，实际费用需供应商核对。</p><label class="row small mt"><input type="checkbox" class="checkbox" id="featureAnalysisSpend"> 授权本次逐条分析，不自动重试；结果作为知识草稿</label><p id="featureAnalysisError" role="alert" class="guard-error"></p>${button('确认分析（可能收费）', 'feature-ai-run', 'primary mt')}`);
  } catch (error) { const panel = document.getElementById('featureAnalysisError'); if (panel) panel.textContent = error.message; else toast(error.message); }
  finally { featureUi.aiBusy = false; const buttonElement = document.querySelector('[data-action="feature-ai-quotes"]'); if (buttonElement) buttonElement.disabled = false; }
}
async function runVideoLearning() {
  const plan = featureUi.aiPlan;
  if (!plan || featureUi.aiBusy || !collabCan('generate') || !document.getElementById('featureAnalysisSpend')?.checked) { const panel = document.getElementById('featureAnalysisError'); if (panel) panel.textContent = '请明确授权本次分析费用'; return; }
  featureUi.aiBusy = true; featureUi.stop = false;
  openModal('视频提炼进行中', `<p id="featureAnalysisProgress" class="small">等待第一条调用</p>${button('停止后续调用', 'feature-ai-stop', 'mt')}<p class="meta mt">当前已发送请求无法声称已取消；只停止后续，不重试状态未知任务。</p>`);
  try {
    for (const [index, record] of plan.records.entries()) {
      if (featureUi.stop || plan.clientId !== state.activeClient || plan.teamId !== state.activeTeam || plan.actorId !== collabActor().id || !collabCan('generate')) { featureUi.stop = true; break; }
      const progress = document.getElementById('featureAnalysisProgress'); if (progress) progress.textContent = `正在分析 ${index + 1}/${plan.records.length}：${record.asset.name}`;
      const result = (await generationRequest(`/api/tasks/${record.task.id}/submit`, { clientId: plan.clientId, quoteId: record.quote.id, acceptedCredits: record.quote.credits, authorized: true, budgetLimit: record.quote.credits })).task;
      record.task = result;
      if (result.status !== 'succeeded' || !result.output?.text) { featureUi.stop = true; toast('调用未确认成功，停止后续；请在后端任务核对，不自动重试'); break; }
      const destination = state.clients[plan.clientId];
      destination.knowledge.unshift({ id: uniqueId('knowledge'), title: record.asset.name + ' · 视频分析候选', content: result.output.text.slice(0, 14000), category: record.asset.category || '全部品类', status: '草稿', version: 1, versions: [], owner: collabName(plan.actorId), scope: '当前客户', source: '服务端Gemini视频理解，候选需人工核对', sourceAssetIds: [record.asset.id], backendTaskId: result.id, teamId: plan.teamId, created: new Date().toISOString() });
      persist();
    }
    closeModal(); featureUi.knowledgeTab = '已保存知识'; flowUi.knowledgeTab = '经验与规则'; guardUi.libraryFilter = '全部状态'; render(); toast(featureUi.stop ? '后续分析已停止；成功候选保存为草稿，未确认任务请在素材提炼的后端任务中核对' : '已成功返回的候选保存为草稿，核对发布后再复用');
  } finally { featureUi.aiBusy = false; }
}
document.addEventListener('click', event => {
  const control = event.target.closest('[data-action="feature-ai-quotes"]');
  if (!control) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (!collabCan('generate')) return collabReject();
  videoLearningQuotes().catch(error => toast(error.message));
}, true);
