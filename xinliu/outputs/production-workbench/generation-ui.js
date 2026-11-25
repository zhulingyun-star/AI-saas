'use strict';

const generationUi = { csrf: '', busy: false, status: null, taskId: '', taskClientId: '', sourceWorkId: '', kind: 'video', pending: null };
async function generationRequest(route, body = null) {
  if (location.protocol === 'file:') throw new Error('离线文件只用于页面体验；出片接口请用本地网站 http://127.0.0.1:8767/');
  if (authState.required && !authState.authenticated) throw new Error('请先登录管理员账号');
  if (authState.required) generationUi.csrf = authState.csrf;
  if (!generationUi.csrf) {
    const response = await fetch('/api/session', { method: 'POST', headers: { 'X-Xinliu-Local': '1' }, credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || '后端会话不可用，请重启新版服务');
    generationUi.csrf = data.csrf;
  }
  const response = await fetch(route, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Xinliu-CSRF': generationUi.csrf } : {}, credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined });
  let data;
  try { data = await response.json(); } catch { throw new Error('API没有返回JSON，可能仍在运行旧静态服务，请用“启动网站”重启'); }
  if (!response.ok) {
    if (response.status === 401) generationUi.csrf = '';
    throw new Error(data.error?.message || '接口请求失败');
  }
  return data;
}
function generationCapabilityMarkup(work) {
  const config = state.config;
  const capability = config.generationCapability || (work.drama ? 'drama' : 'commerce');
  const videos = client().assets.filter(asset => asset.kind === '视频' && asset.fileId);
  return `<details class="generation-capability"><summary>制作能力与独立策略 <span>${XinliuStrategies.capabilities[capability]?.name || '商品图出片'}</span></summary><div class="setting-grid mt">${button('使用4秒低成本规格', 'generation-low-cost', 'sm')}<label class="row small"><input type="checkbox" class="checkbox" id="generationAudio" ${config.generateAudio === true ? 'checked' : ''}>生成声音</label>${selectorField('制作能力', 'generationCapability', Object.entries(XinliuStrategies.capabilities).map(([id, item]) => ({ id, name: item.name })), capability)}<label class="field"><span>商品细类（选填）</span><input class="input" id="generationSubcategory" value="${escapeText(config.subcategory || '')}" placeholder="例如：外套 / 宠物食品 / 折叠器具"></label></div>
    ${capability === 'motion' ? `<div class="generation-motion-note">动作迁移需要目标人物图、商品图及真实动作视频，不是普通图生视频。后端只向明确声明支持 motion 的供应商提交。</div><div class="setting-grid mt">${selectorField('动作视频', 'generationMotionAsset', [{ id: '', name: '选择已上传的视频' }, ...videos.map(asset => ({ id: asset.id, name: asset.name }))], config.motion?.assetId || '')}${selectorField('迁移范围', 'generationMotionScope', ['身体与表情', '身体动作', '手部操作', '运镜参考'], config.motion?.scope || '身体与表情')}<label class="field"><span>片段开始（秒）</span><input type="number" min="0" step=".1" id="generationMotionStart" class="input" value="${config.motion?.start || 0}"></label><label class="field"><span>片段结束（秒）</span><input type="number" min=".1" step=".1" id="generationMotionEnd" class="input" value="${config.motion?.end || config.duration}"></label></div><label class="field"><span>关键动作与接触关系（选填）</span><textarea class="input" id="generationMotionDescription">${escapeText(config.motion?.description || '')}</textarea></label>${button('选择目标人物', 'workspace-picker', 'sm', 'data-kind="models"')}` : ''}
    <p class="meta mt">策略独立编译为视觉识别、编导方案、视频执行三种Prompt；提示词不等于供应商已经支持该能力。</p></details>`;
}
function generationAfterRender() {
  const work = client().projects.find(item => item.id === state.config.draftId);
  if (['quick', 'studio', 'brief', 'drama'].includes(viewState.view) && work && collabCan('edit', collabCampaign(work.campaignId))) {
    const anchor = document.querySelector('.flow-workarea>.card .flow-bottom-actions,.studio-editor>.card');
    if (anchor) anchor.insertAdjacentHTML('beforebegin', generationCapabilityMarkup(work));
    if (['quick', 'drama'].includes(viewState.view)) document.querySelector('.generation-capability')?.insertAdjacentHTML('beforeend', `<details class="workspace-details"><summary>模型辅助（需另行确认费用）</summary><div class="row wrap gap8 mt">${button('图片理解候选', 'generation-prepare', 'sm', 'data-kind="vision"')}${button('编导方案候选', 'generation-prepare', 'sm', 'data-kind="text"')}</div><p class="meta mt">不自动运行；识别不直接成为事实，方案不自动进入视频生成。</p></details>`);
  }
  if (['brief', 'result'].includes(viewState.view) && work?.accepted) {
    const jobs = work.backendTasks || [];
    document.querySelector('.page-head')?.insertAdjacentHTML('afterend', `<div class="generation-test-bar"><div><strong>真实出片联调</strong><p>上传素材 → 服务端准备 → 报价 → 明确确认才调用；供应商未配置时拦截</p></div><div class="row wrap gap8">${button('检查供应商接口', 'generation-settings', 'sm')}${button('准备视频出片', 'generation-prepare', 'primary sm', `data-kind="video" ${work.planChanged || generationUi.busy || !collabCan('generate', collabCampaign(work.campaignId)) ? 'disabled' : ''}`)}${jobs.length ? button('查看后端任务', 'generation-tasks', 'sm') : ''}</div></div>`);
  }
  if (viewState.view === 'runs') document.querySelector('.page-head')?.insertAdjacentHTML('afterend', `<div class="generation-test-bar"><span>真实后端任务与本地演示分别显示</span>${button('查询当前客户后端任务', 'generation-tasks', 'sm')}</div>`);
  if (viewState.view === 'result' && work?.backendTasks?.length) {
    const fee = document.querySelector('.flow-status-strip>span:nth-child(2)');
    if (fee) fee.textContent = '后端调用费用以任务授权与供应商对账为准';
    if (work.result?.backendTaskId) {
      const label = document.querySelector('.flow-comparison>.card:nth-child(2) .flow-section-head>.meta');
      if (label) label.textContent = '后端供应商结果';
    }
  }
}
function generationSettingsMarkup() {
  return `<section class="card pad"><div class="flow-section-head"><h3>光影云出片API</h3>${button('检查接口状态', 'generation-settings', 'sm')}</div><p class="small">本地地址 <code>/api/health</code>；生成路径 <code>/api/tasks</code> → <code>/quote</code> → <code>/submit</code> → <code>/refresh</code> → <code>/result</code></p><p class="mt"><a class="link" href="/api.html" target="_blank" rel="noopener">接口文档与OpenAPI</a></p><div class="generation-endpoints mt"><div><strong>视觉识别</strong><span>独立供应商与报价，候选事实需核对</span></div><div><strong>编导模型</strong><span>独立Prompt，不自动进入视频生成</span></div><div><strong>视频 / 动作迁移</strong><span>按能力声明、时长、画幅和报价拦截</span></div></div><p class="meta mt">仅使用SilvaMux；URL和模型内置，Key由后端 <code>silvamux.private.cjs</code> 读取，仅供后端读取，不进入前端。短片试运行仅开放480p。</p><details class="workspace-details"><summary>联调能力与安全边界</summary><p class="small mt">当前是回环地址、单操作者测试服务，具备文件与任务落盘、幂等提交、超时未知保护、结果转存和视频Range读取。不是生产团队登录、多租户隔离或实际费用结算。</p><p class="small mt">视频生成的参考文件仍需授权公网HTTPS URL；视频理解使用服务端上传文件的video_url数据。图片仅在供应商支持时使用data URI。不会自动暴露本机文件或跨客户传素材。</p></details></section>`;
}
async function generationSettings() {
  openModal('出片接口状态', '<p class="meta">正在检查本地API，不调用模型</p>');
  try {
    const config = await generationRequest('/api/config');
    generationUi.status = config;
    openModal('出片接口状态', `<div class="stack">${Object.entries(config.providers).map(([kind, provider]) => `<div class="draft-row"><div class="grow"><strong>${{ vision: '图片理解', text: '文本编导', video: '视频生成' }[kind]} · ${provider.ready ? '已配置，尚需实测' : '未配置'}</strong><p class="meta">${escapeText(provider.id || 'custom')} / ${escapeText(provider.model || '缺少真实模型ID与服务器密钥')} · ${provider.pricingConfigured ? '有配置估价' : '报价未知'}</p>${kind === 'video' ? `<p class="meta">供应商声明：${escapeText(provider.capabilities.join(' / ') || '尚无能力声明')}</p>` : ''}</div></div>`).join('')}<p class="small">${escapeText(config.note)}</p><p class="meta">检查状态不验证密钥、供应商质量或实际出片。已配置不代表已验证上游权限、模型质量或实际扣费；调用前仍需逐次确认报价。</p></div>`, true);
  } catch (error) { openModal('出片接口尚未可用', `<p class="guard-error">${escapeText(error.message)}</p><p class="meta mt">请双击启动网站，运行新版后端；当前不生成、不扣费。</p>`); }
}
function generationCandidates(kind, work) {
  const config = state.config;
  const productItem = product();
  const model = work.drama ? getModels().find(item => item.id === work.drama.characters[0]?.modelId) : selectedModel();
  const video = client().assets.find(item => item.id === config.motion?.assetId) || client().assets.find(item => item.fileId === config.referenceContext?.source?.fileId);
  const rows = [];
  if (!work.drama && kind !== 'text') rows.push({ item: productItem, role: 'product_image', label: '商品图片' });
  if (!work.drama && kind !== 'text') for (const ref of config.materialRefs || []) {
    if (ref.role !== '商品外观' || ref.assetId === productItem.id) continue;
    const item = client().assets.find(asset => asset.id === ref.assetId);
    if (item?.kind === '图片' && !rows.some(row => row.item?.id === item.id)) rows.push({ item, role: 'product_image', label: '商品多角度参考' });
  }
  if (kind === 'video' && (model || ['motion', 'dialogue', 'drama'].includes(config.generationCapability || (work.drama ? 'drama' : 'commerce')))) rows.push({ item: model, role: 'character_image', label: '目标人物图片' });
  if (kind === 'video' && selectedLook()) for (const partId of selectedLook().parts || []) rows.push({ item: getGarments().find(item => item.id === partId), role: 'garment_image', label: '固定服装参考' });
  if (kind === 'video' && config.generateAudio === true && selectedVoice()?.fileId) rows.push({ item: selectedVoice(), role: 'voice_audio', label: '真人音频参考' });
  if (kind === 'video' && (config.generationCapability === 'motion' || config.generationCapability === 'reference')) rows.push({ item: video, role: config.generationCapability === 'motion' ? 'motion_video' : 'reference_video', label: '动作 / 参考视频' });
  return rows;
}
function generationPrepareDialog(kind) {
  const work = flowProject();
  if (!collabCan('generate', collabCampaign(work.campaignId))) return collabReject();
  if (kind === 'video' && (work.planChanged || !work.accepted)) { toast('先确认当前方案，修改后不能按旧版提交'); return; }
  if (kind !== 'text' && (product().illustration || product().sku?.startsWith('DEMO-')) && !work.drama) { toast('示意图用于页面体验，请上传真实商品图再出片'); return; }
  const candidates = generationCandidates(kind, work);
  if (candidates.some(candidate => !candidate.item?.fileId && !candidate.item?.image)) { toast('缺少当前能力需要的商品、人物或动作视频，请先补素材'); return; }
  generationUi.pending = { workId: work.id, clientId: state.activeClient, campaignId: work.campaignId, input: { config: { ...collabCopy(state.config), teamId: state.activeTeam || 'default' }, shots: collabCopy(work.shots), product: collabCopy(product()), model: selectedModel() ? collabCopy(selectedModel()) : null, look: selectedLook() ? collabCopy(selectedLook()) : null, voice: selectedVoice() ? collabCopy(selectedVoice()) : null, drama: collabCopy(work.drama || null) }, candidates, signature: flowSignature(state.config, work.shots, work.drama || null), kind };
  openModal('准备出片素材与报价', `<p class="small">本次${{ video: '视频生成', vision: '图片理解', text: '编导方案' }[kind]}，只准备一条，不自动重试。${kind === 'video' ? `${state.config.duration}秒 / ${escapeText(state.config.outputSpec?.resolution || '480p')} / ${state.config.generateAudio === true ? '有声' : '无声'}。` : ''}下一步上传到本地后端并获取配置报价；尚不调用收费模型。</p><div class="generation-assets mt">${candidates.map((candidate, index) => `<div>${imageMarkup(candidate.item, 'file-thumb')}<div class="grow"><strong>${candidate.label}：${escapeText(candidate.item.name)}</strong><label class="field mt"><span>供应商可访问的HTTPS URL（图片data URI支持时可留空）</span><input class="input" data-generation-url="${index}" value="${escapeText(state.generationPublicUrls?.[candidate.item.id] || '')}" placeholder="https://你的授权素材存储/文件"></label></div></div>`).join('')}</div>
    <label class="row small mt"><input type="checkbox" class="checkbox" id="generationAssetRights"> 我确认商品、人物与参考视频可供该供应商处理；示例人像不能默认商用</label><p class="meta mt">本地测试上传限制16MB。视频没有公网URL会在报价前拦截，不开放本机文件给外部访问。</p><p class="guard-error" id="generationError" role="alert"></p>${button('上传素材并准备报价（不生成）', 'generation-quote', 'primary full mt')}`, true);
  hydrateFiles();
}
async function generationUpload(candidate, url, clientId) {
  const item = candidate.item;
  let base64 = null; let type = candidate.role.endsWith('_video') ? 'video/mp4' : candidate.role === 'voice_audio' ? 'audio/mpeg' : 'image/jpeg';
  if (!url) {
    let blob;
    if (item.fileId) blob = await readFile(item.fileId);
    else { const response = await fetch(item.image); if (!response.ok) throw new Error('素材读取失败'); blob = await response.blob(); }
    if (!blob || blob.size > 16 * 1024 * 1024) throw new Error('文件缺失或超过16MB；请提供授权公网素材URL');
    type = blob.type;
    base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
  }
  const result = await generationRequest('/api/assets', { clientId, name: item.name, type, base64, url: url || null });
  return { assetId: result.asset.id, role: candidate.role };
}
async function generationQuote() {
  if (generationUi.busy) return;
  if (!document.getElementById('generationAssetRights')?.checked) { document.getElementById('generationError').textContent = '请先核对素材与人物授权'; return; }
  const pending = generationUi.pending;
  if (!generationContextMatches(pending)) { toast('制作上下文已变化，请重新准备'); return; }
  const urls = [...document.querySelectorAll('[data-generation-url]')].map(input => input.value.trim());
  const errorPanel = document.getElementById('generationError');
  generationUi.busy = true;
  document.querySelector('[data-action="generation-quote"]').disabled = true;
  try {
    const config = await generationRequest('/api/config');
    if (!config.providers[pending.kind]?.ready) throw new Error('供应商尚未配置，不上传素材或发起生成。先配置服务器URL、真实模型ID、报价和环境密钥。');
    const assets = [];
    for (let index = 0; index < pending.candidates.length; index++) assets.push(await generationUpload(pending.candidates[index], urls[index], pending.clientId));
    const bytes = new TextEncoder().encode(JSON.stringify({ input: pending.input, assets }));
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const result = await generationRequest('/api/tasks', { clientId: pending.clientId, workId: pending.workId, campaignId: pending.campaignId, kind: pending.kind, input: pending.input, assets, idempotencyKey: digest });
    generationUi.taskId = result.task.id;
    generationUi.taskClientId = pending.clientId;
    generationUi.sourceWorkId = pending.workId;
    const work = client().projects.find(item => item.id === pending.workId);
    work.backendTasks ||= [];
    if (!work.backendTasks.some(item => item.id === result.task.id)) work.backendTasks.push({ id: result.task.id, clientId: pending.clientId, kind: pending.kind, planSignature: pending.signature });
    state.generationPublicUrls ||= {};
    pending.candidates.forEach((candidate, index) => { state.generationPublicUrls[candidate.item.id] = urls[index]; });
    persist();
    const { quote } = await generationRequest(`/api/tasks/${result.task.id}/quote`, { clientId: pending.clientId });
    generationUi.quote = quote;
    openModal('确认本次模型调用费用', `<div class="generation-quote-total"><span>${{ video: '视频生成', vision: '图片理解', text: '文本编导' }[pending.kind]} · 1次调用</span><strong>${quote.credits} 估价积分</strong></div><p class="small">${quote.spec ? `${quote.spec.duration}秒 / ${escapeText(quote.spec.resolution)} / ${quote.spec.generate_audio ? '有声' : '无声'}。` : ''}${escapeText(quote.source)}。确认后会向你的供应商发请求，可能产生实际费用；本地预留不是供应商结算，不自动重试。</p><label class="field mt"><span>本次授权费用上限</span><input type="number" min="${quote.credits}" class="input" id="generationSpendCap" value="${quote.credits}"></label><label class="row small"><input type="checkbox" class="checkbox" id="generationSpendApproved"> 我授权本次调用及上述估价，费用需后续核对</label><p id="generationError" class="guard-error" role="alert"></p>${button('确认调用模型（可能扣费）', 'generation-submit', 'primary full mt')}`, true);
  } catch (error) {
    if (errorPanel?.isConnected) errorPanel.textContent = error.message; else toast(error.message);
  } finally { generationUi.busy = false; const control = document.querySelector('[data-action="generation-quote"]'); if (control) control.disabled = false; }
}
async function generationSubmit() {
  if (generationUi.busy) return;
  const panel = document.getElementById('generationError');
  const approved = document.getElementById('generationSpendApproved')?.checked;
  const budgetLimit = Number(document.getElementById('generationSpendCap')?.value);
  if (!approved || !Number.isFinite(budgetLimit) || budgetLimit < generationUi.quote.credits) { panel.textContent = '需要明确费用授权及有效上限'; return; }
  const pending = generationUi.pending;
  if (!generationContextMatches(pending) || !collabCan('generate', collabCampaign(pending.campaignId))) { panel.textContent = '方案、客户或权限已变化，请重新准备'; return; }
  generationUi.busy = true;
  document.querySelector('[data-action="generation-submit"]').disabled = true;
  try {
    const result = await generationRequest(`/api/tasks/${generationUi.taskId}/submit`, { clientId: generationUi.taskClientId, quoteId: generationUi.quote.id, acceptedCredits: generationUi.quote.credits, authorized: true, budgetLimit });
    generationTaskDialog(result.task);
  } catch (error) { if (panel.isConnected) panel.textContent = error.message; toast('调用状态请查后端任务，不自动重发：' + error.message); }
  finally { generationUi.busy = false; }
}
function generationTaskDialog(task) {
  generationUi.taskId = task.id; generationUi.taskClientId = task.clientId; generationUi.sourceWorkId = task.workId;
  generationUi.lastTask = task;
  const labels = { draft: '未调用', submitting: '提交中', running: '生成中', queued: '排队', unknown: '状态未知，先核对', succeeded: '结果已返回', failed: '供应商声明失败', rejected: '提交被拒绝，未创建任务', result_unavailable: '结果获取失败，可查单，不重生成' };
  openModal('真实后端任务', `<div class="summary-fields"><div><label>任务</label>${escapeText(task.id)}</div><div><label>状态</label>${labels[task.status] || task.status}</div><div><label>供应商 / 模型</label>${escapeText(task.provider || 'custom')} / ${escapeText(task.model || '未提交')}</div><div><label>上游编号</label>${escapeText(task.upstreamId || '尚无编号')}</div><div><label>策略</label>${escapeText(task.strategyId)} v${task.strategyVersion}</div></div><p class="meta mt">${escapeText(task.financialStatus)}</p>${task.error ? `<p class="guard-error">${escapeText(task.error)}</p>` : ''}${task.resultUrl ? `<video controls class="flow-result-video mt" src="${escapeText(task.resultUrl + '?clientId=' + encodeURIComponent(task.clientId))}"></video>` : task.output?.text ? `<label class="field mt"><span>模型返回（人工核对，不自动执行）</span><textarea readonly class="input" style="height:240px">${escapeText(task.output.text)}</textarea></label>` : '<p class="meta mt">没有可播放结果时不使用示例视频冒充模型生成</p>'}<div class="row wrap gap8 mt">${task.kind === 'video' && task.upstreamId && !['succeeded', 'failed', 'rejected'].includes(task.status) ? button('查询上游状态（不重新生成）', 'generation-refresh') : ''}${task.resultUrl ? button('带入当前作品待审片', 'generation-import-result', 'primary') : task.output?.text ? button('保存候选到当前草稿（需核对）', 'generation-adopt-candidate', 'primary') : ''}${button('返回任务列表', 'generation-tasks')}</div>`, true);
}
function generationContextMatches(pending) {
  const work = client().projects.find(item => item.id === pending?.workId);
  return Boolean(work && pending.clientId === state.activeClient && state.config.draftId === work.id && flowSignature(state.config, work.shots, work.drama || null) === pending.signature && (pending.kind !== 'video' || work.accepted?.signature === pending.signature && !work.planChanged));
}
function generationAdoptCandidate() {
  const task = generationUi.lastTask;
  const work = client().projects.find(item => item.id === task?.workId);
  const saved = work?.backendTasks?.find(item => item.id === task.id);
  if (!work || state.activeClient !== task.clientId || state.config.draftId !== work.id || !saved || flowSignature(state.config, work.shots, work.drama || null) !== saved.planSignature || !collabCan('edit', collabCampaign(work.campaignId))) { toast('草稿已改变，请回到原输入版本核对候选，不能直接覆盖'); return; }
  let candidate;
  try { candidate = JSON.parse(task.output.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { toast('模型输出不是结构化JSON，请人工复制核对，不自动执行'); return; }
  if (task.kind === 'vision') {
    const rows = [...(Array.isArray(candidate.visibleFacts) ? candidate.visibleFacts : []), ...(Array.isArray(candidate.inferences) ? candidate.inferences : [])].filter(item => typeof item.label === 'string' && ['string', 'number'].includes(typeof item.value)).slice(0, 30);
    flowSnapshot(work, '采纳识别候选前');
    state.config.factRecords ||= [];
    for (const row of rows) state.config.factRecords.push({ id: uniqueId('fact'), key: uniqueId('vision'), label: row.label.slice(0, 120), value: String(row.value).slice(0, 2000), sourceType: '模型推断', sourceId: state.config.productId, sourceVersion: guardVersion(product()), sourceNote: `后端识别候选 ${task.id}，需人工核对`, confirmed: false, validUntil: '', useInVideo: false, productId: state.config.productId });
    saveDraft(); closeModal(); guardFactsDialog(); toast('候选已保存，默认不用于宣传，请核对来源与事实');
  } else {
    const shots = candidate.shots;
    if (!Array.isArray(shots) || !shots.length || shots.length > 100 || shots.some((shot, index) => typeof shot.visual !== 'string' || typeof shot.speech !== 'string' || !Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.start < 0 || shot.end <= shot.start || shot.end > state.config.duration + .1 || index && shot.start < shots[index - 1].end - .01)) { toast('镜头结构或时间码不符合本条规格，需人工修正'); return; }
    flowSnapshot(work, '采纳编导候选前');
    work.shots = shots.map((shot, index) => ({ id: uniqueId('shot'), role: typeof shot.role === 'string' ? shot.role : '镜头' + (index + 1), visual: shot.visual, speech: shot.speech, start: shot.start, end: shot.end, scale: '按方案', assetId: '', clipStart: 0, locked: false, source: '后端编导候选，人工待确认' }));
    state.config.shotsCount = shots.length; saveDraft(); closeModal(); navigate('brief'); toast('编导候选已带入，旧稿保留；重新确认后才可出片');
  }
}
async function generationTasks() {
  openModal('后端任务列表', '<p class="meta">查询本地持久化任务，不调用生成模型</p>');
  try {
    const result = await generationRequest('/api/tasks?clientId=' + encodeURIComponent(state.activeClient));
    openModal('后端任务列表', result.tasks.length ? `<div class="stack">${result.tasks.map(task => `<div class="draft-row"><div class="grow"><strong>${escapeText(task.kind)} · ${escapeText(task.status)}</strong><p class="meta">${escapeText(task.id)} · ${escapeText(task.strategyId)}</p></div>${button('查看', 'generation-task-detail', 'sm', `data-id="${task.id}"`)}</div>`).join('')}</div>` : '<p class="meta">当前客户尚无后端任务。页面演示产单不会自动调用模型。</p>', true);
  } catch (error) { openModal('后端查询失败', `<p class="guard-error">${escapeText(error.message)}</p>`); }
}
async function generationImportResult() {
  if (generationUi.busy) return;
  const work = client().projects.find(item => item.id === generationUi.sourceWorkId);
  const reference = work?.backendTasks?.find(item => item.id === generationUi.taskId);
  if (!work || state.config.draftId !== work.id || state.activeClient !== generationUi.taskClientId || work.planChanged || work.accepted?.signature !== reference?.planSignature || !collabCan('edit', collabCampaign(work.campaignId))) { toast('必须回到该任务对应的已确认作品版本；不能把旧结果覆盖新方案'); return; }
  generationUi.busy = true;
  try {
    const response = await fetch(`/api/tasks/${generationUi.taskId}/result?clientId=${encodeURIComponent(state.activeClient)}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('结果未就绪或本地会话过期');
    const blob = await response.blob();
    const file = new File([blob], `光影云_${generationUi.taskId}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`, { type: blob.type });
    await flowUploadResult(file);
    work.result.source = '后端供应商结果'; work.result.backendTaskId = generationUi.taskId;
    work.result.backendModel = generationUi.lastTask?.model || '供应商模型待核对';
    persist(); closeModal(); navigate('result'); toast('真实结果已带入对应方案，等待人工检查');
  } catch (error) { toast(error.message); } finally { generationUi.busy = false; render(); }
}
document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control || !control.dataset.action.startsWith('generation-')) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const work = client().projects.find(item => item.id === state.config.draftId);
  const action = control.dataset.action;
  const project = work ? collabCampaign(work.campaignId) : null;
  const readActions = ['generation-tasks', 'generation-task-detail', 'generation-refresh'];
  const permitted = readActions.includes(action) ? collabCan('manage', project) || collabCan('generate', project) : collabCan(action === 'generation-settings' ? 'finance' : ['generation-import-result', 'generation-adopt-candidate'].includes(action) ? 'edit' : 'generate', project);
  if (!permitted) return collabReject();
  switch (action) {
    case 'generation-low-cost':
      openModal('使用4秒低成本规格', `<p>将当前方案改为4秒、480p、无声，保留第一镜。原方案存入历史；修改后需重新确认。</p>${button('应用并重新编辑方案', 'generation-apply-low-cost', 'primary mt')}`); break;
    case 'generation-apply-low-cost':
      if (!work || !collabCan('edit', project)) return collabReject();
      flowSnapshot(work, '应用4秒测试规格前');
      state.config.duration = 4; state.config.shotsCount = 1; state.config.generateAudio = false;
      state.config.outputSpec = { aspect: state.config.outputSpec?.aspect || '9:16', resolution: '480p', model: 'doubao-seedance-2-0-260128' };
      flowRestructureShots(work, 1, 4); saveDraft(); closeModal(); render(); break;
    case 'generation-settings': generationSettings(); break;
    case 'generation-prepare': generationPrepareDialog(control.dataset.kind || 'video'); break;
    case 'generation-quote': generationQuote(); break;
    case 'generation-submit': generationSubmit(); break;
    case 'generation-tasks': generationTasks(); break;
    case 'generation-task-detail': generationRequest(`/api/tasks/${control.dataset.id}?clientId=${encodeURIComponent(state.activeClient)}`).then(result => generationTaskDialog(result.task)).catch(error => toast(error.message)); break;
    case 'generation-refresh': generationRequest(`/api/tasks/${generationUi.taskId}/refresh`, { clientId: generationUi.taskClientId }).then(result => generationTaskDialog(result.task)).catch(error => toast(error.message)); break;
    case 'generation-import-result': generationImportResult(); break;
    case 'generation-adopt-candidate': generationAdoptCandidate(); break;
  }
}, true);
document.addEventListener('change', event => {
  const target = event.target;
  const fields = { generationCapability: 'generationCapability', generationSubcategory: 'subcategory' };
  if (target.id === 'generationAudio') { state.config.generateAudio = target.checked; saveDraft(); render(); }
  if (fields[target.id]) { state.config[fields[target.id]] = target.value; if (target.id === 'generationCapability' && target.value === 'motion') state.config.motion ||= { scope: '身体与表情', start: 0, end: state.config.duration, description: '', assetId: '' }; saveDraft(); render(); }
  const motionFields = { generationMotionAsset: 'assetId', generationMotionScope: 'scope', generationMotionStart: 'start', generationMotionEnd: 'end', generationMotionDescription: 'description' };
  if (motionFields[target.id]) { state.config.motion ||= {}; state.config.motion[motionFields[target.id]] = target.type === 'number' ? Number(target.value) : target.value; saveDraft(); }
});
