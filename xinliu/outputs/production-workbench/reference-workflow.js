'use strict';

const referenceUi = { selected: new Set(), returnView: '', originalShotId: '' };

function referenceSnapshot(reference) {
  return { name: reference.name, fileId: reference.fileId, duration: reference.duration, revision: reference.revision || 1, shots: collabCopy(reference.shots), source: reference.source || '客户上传', capturedAt: new Date().toISOString(), authority: reference.authority || client().assets.find(asset => asset.fileId === reference.fileId)?.authority || '客户需核对授权' };
}
function referencePlanDialog(single = false) {
  if (!collabCan('edit')) return collabReject();
  const reference = client().reference;
  if (!reference || !saveReferenceShot(false)) return;
  const existing = client().projects.find(work => work.id === state.config.draftId);
  if (existing && !collabCan('edit', collabCampaign(existing.campaignId))) return collabReject();
  referenceUi.selected = single ? new Set([viewState.referenceFrame]) : new Set(reference.shots.map((shot, index) => index));
  const options = existing?.shots?.map((shot, index) => ({ id: shot.id, name: `${index + 1} ${shot.role}` })) || [];
  openModal('选取参考镜头，改成自己的内容', `<form id="referencePlanForm"><p class="meta">当前${existing ? '制作' : '新建草稿'}：${escapeText(product().name)}。只复制时间结构与参考说明，不自动复制原台词、人物、商品或音轨。</p>
    <div class="reference-choice-list">${reference.shots.map((shot, index) => `<label><input type="checkbox" class="checkbox" name="shots" value="${index}" ${referenceUi.selected.has(index) ? 'checked' : ''}><span>${shot.frameId ? imageMarkup({ fileId: shot.frameId, name: '真实参考帧' }, 'reference-choice-frame') : icon('film')}</span><span class="grow"><strong>第${index + 1}镜 · ${escapeText(shot.role || '镜头')}</strong><small>${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s · ${escapeText(shot.adapt || shot.visual || '待填写拆解')}</small></span></label>`).join('')}</div>
    <div class="setting-grid mt">${selectorField('怎么借鉴', 'referenceIntent', ['借镜头与节奏', '参考动作与机位', '仅参考场景与光线'], '借镜头与节奏')}${selectorField('作用范围', 'referencePlacement', existing && options.length ? ['替换当前一镜', '建立整条改编草稿'] : ['建立整条改编草稿'], single && existing && options.length ? '替换当前一镜' : '建立整条改编草稿')}</div>
    ${options.length ? selectorField('目标镜头（只换一镜时）', 'referenceTargetShot', options, options[Math.min(viewState.activeShot, options.length - 1)].id) : ''}
    <label class="row small mt"><input type="checkbox" class="checkbox" id="referenceRights"> 已确认参考来源与使用范围，原商品与人物不会默认沿用</label><p id="referencePlanError" class="guard-error" role="alert"></p><div class="row wrap gap8 mt">${button('应用选中镜头', 'reference-apply-plan', 'primary')}${button('返回拆解', 'close-modal')}</div><p class="meta mt">仅本地编排，不生成视频、不保证动作复刻。替换前保存旧版，其他镜头不重排。</p></form>`, true);
}
function referenceApplyPlan() {
  const reference = client().reference;
  if (!reference || !collabCan('edit')) return collabReject();
  const indexes = [...document.querySelectorAll('#referencePlanForm input[name="shots"]:checked')].map(input => Number(input.value));
  const placement = document.getElementById('referencePlacement').value;
  if (!indexes.length || placement === '替换当前一镜' && indexes.length !== 1) { document.getElementById('referencePlanError').textContent = '请选择参考镜头；只换一镜时必须只选择一个'; return; }
  if (!document.getElementById('referenceRights').checked) { document.getElementById('referencePlanError').textContent = '先核对参考来源与使用范围'; return; }
  const selected = indexes.map(index => ({ ...reference.shots[index], originalIndex: index }));
  if (selected.some(shot => !Number.isFinite(shot.start) || !Number.isFinite(shot.end) || shot.end <= shot.start || shot.start < 0 || shot.end > reference.duration + .01)) { document.getElementById('referencePlanError').textContent = '参考时间码无效，请先校对切点'; return; }
  const intent = document.getElementById('referenceIntent').value;
  const source = referenceSnapshot(reference);
  const oldWork = client().projects.find(work => work.id === state.config.draftId);
  if (oldWork && !collabPreflight(oldWork)) return;
  const evidenceRole = intent === '参考动作与机位' ? '实际操作' : intent === '仅参考场景与光线' ? '场景与光线' : '镜头与节奏';
  const provenance = shot => ({ referenceFileId: source.fileId, referenceName: source.name, referenceRevision: source.revision, originalIndex: shot.originalIndex, start: shot.start, end: shot.end, frameId: shot.frameId || null, intent, visual: shot.visual || '', speech: shot.speech || '', audio: shot.audio || '', text: shot.text || '', authority: source.authority });
  const visual = shot => shot.adapt?.trim() || `为当前商品${product().name}改编${intent}，保持自己的商品、人物与确认事实；原片只作${evidenceRole}参考，请核对具体动作`;
  let work;
  if (placement === '替换当前一镜') {
    work = flowProject();
    const targetId = document.getElementById('referenceTargetShot').value;
    const target = work.shots.find(shot => shot.id === targetId);
    if (!target) { document.getElementById('referencePlanError').textContent = '目标镜头已变化，请重新选择'; return; }
    flowSnapshot(work, '单镜参考改编前');
    target.visual = visual(selected[0]);
    target.reference = provenance(selected[0]);
    target.locked = true;
    referenceUi.originalShotId = target.id;
    viewState.activeShot = work.shots.findIndex(shot => shot.id === target.id);
  } else {
    if (oldWork) saveDraft();
    const config = collabCopy(state.config);
    state.config = { ...config, draftId: '', originJobId: null, recipeId: '', recipeName: '参考片改编', inputApproval: null };
    work = flowProject();
    work.flow = true;
    work.name = `${product().name} · 参考改编`;
    let elapsed = 0;
    work.shots = selected.map((shot, index) => {
      const duration = Math.round((shot.end - shot.start) * 1000) / 1000;
      const created = { id: uniqueId('shot'), start: elapsed, end: elapsed + duration, role: shot.role || `镜头${index + 1}`, scale: shot.scale || '中景', visual: visual(shot), speech: index === 0 ? `${state.config.claimFocus}，先看实物。` : index === selected.length - 1 ? state.config.cta : state.config.claims || '待确认商品卖点', assetId: state.config.assets[0] || '', clipStart: 0, locked: true, source: '客户参考片 + 人工改编', reference: provenance(shot) };
      elapsed = created.end;
      return created;
    });
    state.config.duration = elapsed;
    state.config.shotsCount = work.shots.length;
    viewState.activeShot = 0;
  }
  state.config.referenceContext = { source, intent, selectedIndexes: indexes, authorization: { clientId: state.activeClient, by: collabActor().id, confirmedAt: new Date().toISOString() } };
  state.config.generationCapability = 'reference';
  const asset = client().assets.find(item => item.fileId === source.fileId);
  if (asset) {
    state.config.assets = [...new Set([...state.config.assets, asset.id])];
    const ref = state.config.materialRefs?.find(item => item.assetId === asset.id);
    if (ref) ref.role = evidenceRole;
    else (state.config.materialRefs ||= []).push({ assetId: asset.id, name: asset.name, version: guardVersion(asset), authorityAtUse: asset.authority, role: evidenceRole });
  }
  saveDraft();
  collabLog('参考镜头改编', work.campaignId, `${placement}；${indexes.length}镜；${intent}；不自动复制原台词`);
  persist(); closeModal(); viewState.stage = 2; navigate('studio'); toast('参考已关联，当前商品与原台词分开保留；未生成视频');
}
function referenceComparisonMarkup(work) {
  const referenced = work?.shots?.filter(shot => shot.reference);
  if (!referenced?.length) return '';
  return `<details class="reference-plan-comparison"><summary>参考与本条改编 <span>${referenced.length} 镜 · 人工对照</span></summary><div class="reference-comparison-list">${referenced.map(shot => `<div><div>${shot.reference.frameId ? imageMarkup({ fileId: shot.reference.frameId, name: '真实参考帧' }, 'reference-compare-frame') : icon('film')}<strong>${escapeText(shot.reference.referenceName)} · 第${shot.reference.originalIndex + 1}镜</strong><small>原片 ${shot.reference.start.toFixed(1)}–${shot.reference.end.toFixed(1)}s</small><p>${escapeText(shot.reference.visual || '原片画面描述待补充')}</p><p class="meta">原片台词仅用于对照：${escapeText(shot.reference.speech || '未记录')}</p></div><div><strong>${escapeText(shot.role)}</strong><small>本条 ${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s · ${escapeText(shot.reference.intent)}</small><p>${escapeText(shot.visual)}</p><p>${escapeText(shot.speech)}</p>${button('只改这镜', 'flow-edit-shot', 'ghost sm', `data-index="${work.shots.indexOf(shot)}"`)}</div></div>`).join('')}</div><p class="meta">参考是固定来源记录，不是生成效果证明；授权参考不等于可以直接搬运原片。</p></details>`;
}
function referenceAfterRender() {
  if (viewState.view === 'reference' || viewState.view === 'resources' && workspaceUi.resourceTab === 'reference') {
    const action = document.querySelector('[data-action="apply-reference"]');
    if (action) {
      action.dataset.action = 'reference-select-plan';
      action.textContent = '选镜头改编';
      action.insertAdjacentHTML('beforebegin', button('只借当前镜头', 'reference-one-shot', 'sm'));
    }
  }
  if (['studio', 'brief', 'result'].includes(viewState.view)) {
    const work = client().projects.find(item => item.id === state.config.draftId);
    const markup = referenceComparisonMarkup(work);
    if (markup) document.querySelector('.flow-stepbar,.studio-top')?.insertAdjacentHTML('afterend', markup);
    if (work?.accepted && !work.demo && collabCan('edit', collabCampaign(work.campaignId))) document.querySelector('.page-head,.studio-top')?.insertAdjacentHTML('afterend', `<div class="reference-variants-entry"><span>第一条确认后，再测试一个变量</span>${button('场景变体排产', 'reference-scene-variants', 'sm')}</div>`);
  }
  hydrateFiles();
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || !['reference-one-shot', 'reference-select-plan', 'reference-apply-plan', 'reference-scene-variants'].includes(target.dataset.action)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (!collabCan('edit')) return collabReject();
  switch (target.dataset.action) {
    case 'reference-one-shot': referencePlanDialog(true); break;
    case 'reference-select-plan': referencePlanDialog(false); break;
    case 'reference-apply-plan': referenceApplyPlan(); break;
    case 'reference-scene-variants':
      saveDraft();
      workspaceUi.batchMode = 'scenes';
      viewState.batch = { products: [state.config.productId], formats: [state.config.format], hooks: [state.config.hook], models: [state.config.modelId], voices: [state.config.voiceId], scenes: [scenes.find(scene => scene !== state.config.scene)], limit: 3, name: `${product().sku} · 场景测试`, reviewer: collabName(flowProject().assignments.director) };
      navigate('batch'); break;
  }
}, true);
