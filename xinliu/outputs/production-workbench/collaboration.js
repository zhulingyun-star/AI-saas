'use strict';

const collabRoles = {
  owner: { name: '企业所有者', edit: true, manage: true, review: true, team: true, finance: true, export: true, publish: true, generate: true },
  admin: { name: '管理员', edit: false, manage: true, review: false, team: true, finance: true, export: false, publish: false, generate: false },
  lead: { name: '项目负责人', edit: true, manage: true, review: false, team: false, finance: false, export: true, publish: false, generate: false },
  maker: { name: '制作成员', edit: true, manage: false, review: false, team: false, finance: false, export: false, publish: false, generate: false },
  reviewer: { name: '审核成员', edit: false, manage: false, review: true, team: false, finance: false, export: false, publish: false, generate: false },
  guest: { name: '外部客户', edit: false, manage: false, review: false, team: false, finance: false, export: false, publish: false, generate: false }
};
const collabStages = { director: '编导', producer: '制作', editor: '剪辑', reviewer: '审核' };
const collabPhases = ['待方案确认', '待资源补齐', '待制作', '待剪辑', '待审片', '需修改', '已交付'];
const collabUi = { client: 'all', query: '', projectStatus: '进行中', projectPage: 1, projectId: '', tab: '内容', workFilter: '全部', workQuery: '', workPage: 1, selected: new Set(), taskScope: '我的待办', stage: '全部阶段', taskQuery: '', taskPage: 1, teamTab: '成员与权限', notification: false, runStatus: '全部状态', runQuery: '', runPage: 1 };
const collabCopy = value => JSON.parse(JSON.stringify(value));

function collabState() {
  state.collaboration ||= { actorId: 'member-lin', members: [{ id: 'member-lin', name: '林川', role: 'owner', clientIds: ['*'], projectIds: ['*'], active: true, weeklyCapacity: 30, grants: {} }], campaigns: [], activity: [], notifications: [], activeByClient: {}, demoLoaded: false, limits: { parallel: 4, projectParallel: 2 } };
  return state.collaboration;
}
function collabActor() { return collabState().members.find(member => member.id === collabState().actorId && member.active) || {id:'inactive',name:'停用身份',role:'guest',active:false,clientIds:[],projectIds:[],grants:{}}; }
function collabName(id) { return collabState().members.find(member => member.id === id)?.name || '未分配'; }
function collabCampaign(id) { return collabState().campaigns.find(project => project.id === id); }
function collabClientAllowed(clientId, member = collabActor()) { return Boolean(member?.active && (!state.teams || member.role === 'guest' || XLTeam.visibleClients().includes(clientId)) && (member.clientIds.includes('*') || member.clientIds.includes(clientId))); }
function collabVisible(project, member = collabActor()) {
  return Boolean(project && collabClientAllowed(project.clientId, member) && (['owner', 'admin'].includes(member.role) || member.projectIds.includes('*') || member.projectIds.includes(project.id) || project.memberIds.includes(member.id)));
}
function collabCan(capability, project = null, member = collabActor()) {
  if (!member.active || member.role === 'guest') return false;
  const allowed = member.grants?.[capability] ?? collabRoles[member.role][capability];
  if (!allowed) return false;
  if (project && !collabVisible(project, member)) return false;
  if (project?.status === '已归档' && capability === 'edit') return false;
  if (capability === 'manage' && member.role === 'lead' && project && project.leadId !== member.id) return false;
  return !project || collabClientAllowed(project.clientId, member);
}
function collabAccessibleClients() { return Object.keys(state.clients).filter(id => collabClientAllowed(id)); }
function collabLog(action, projectId, detail) {
  const store = collabState();
  store.activity.unshift({ id: uniqueId('event'), actor: collabActor().id, action, projectId, detail, at: new Date().toISOString() });
}
function collabNotify(memberId, campaignId, message, workId = '') {
  if (!memberId) return;
  collabState().notifications.unshift({ id: uniqueId('notice'), memberId, campaignId, message, workId, read: false, at: new Date().toISOString() });
}
function collabNoticeVisible(notice) {
  return notice.campaignId ? collabVisible(collabCampaign(notice.campaignId)) : Boolean(notice.clientId && collabClientAllowed(notice.clientId));
}
function collabNewCampaign(clientId, name = '日常素材', values = {}) {
  const actorId = collabActor().id;
  const project = { id: uniqueId('campaign'), clientId, name, leadId: actorId, memberIds: [actorId], assignments: { director: actorId, producer: actorId, editor: actorId, reviewer: actorId }, dueDate: '', target: null, budgetLimit: null, priority: '普通', status: '进行中', brief: '', targetHistory: [], created: new Date().toISOString(), updated: new Date().toISOString(), ...values };
  collabState().campaigns.unshift(project);
  return project;
}
function collabDefaultCampaign(clientId) {
  const store = collabState();
  let project = collabCampaign(store.activeByClient[clientId]);
  if (!project || !collabVisible(project) || project.status !== '进行中') project = store.campaigns.find(item => item.clientId === clientId && item.status === '进行中' && collabVisible(item));
  if (!project && collabCan('manage') && collabClientAllowed(clientId)) project = collabNewCampaign(clientId);
  if (project) store.activeByClient[clientId] = project.id;
  return project;
}
function collabRegisterWork(work, clientId = state.activeClient) {
  if (!work.campaignId) work.campaignId = collabDefaultCampaign(clientId)?.id || '';
  const project = collabCampaign(work.campaignId);
  work.assignments ||= collabCopy(project?.assignments || { director: collabActor().id, producer: collabActor().id, editor: collabActor().id, reviewer: collabActor().id });
  work.dueDate ||= project?.dueDate || '';
  work.effort ||= 2;
  work.editVersion ||= 1;
  work.owner = collabName(work.assignments.director);
}
function collabRegisterJob(job, work = null) {
  const campaign = work ? collabCampaign(work.campaignId) : collabDefaultCampaign(state.activeClient);
  job.campaignId = campaign?.id || '';
  if(!work&&campaign){
    const config=collabCopy(job.config||defaultConfig());
    if(config.productId!==state.config.productId){config.factRecords=[];config.materialRefs=[];config.factsConfirmed=false;}
    work={id:uniqueId('work'),name:job.name,sku:job.sku,format:job.format,campaignId:campaign.id,config,shots:collabCopy(job.shots||[]),history:[],flow:true,originJobId:job.id,status:job.status,dueDate:campaign.dueDate,assignments:collabCopy(campaign.assignments),effort:2,editVersion:1,variation:collabCopy(job.variation || null)};
    work.config.draftId=work.id;work.config.originJobId=job.id;job.projectId=work.id;
    state.clients[campaign.clientId].projects.unshift(work);
  }
  if (work) {
    job.assignments = collabCopy(work.assignments);
    job.reviewer = collabName(work.assignments.reviewer);
    job.operatorId = collabActor().id;
  }
}
function collabWorks(project) { return state.clients[project.clientId]?.projects.filter(work => work.campaignId === project.id) || []; }
function collabPhase(work) {
  const project=collabCampaign(work.campaignId);
  const job=project?state.clients[project.clientId].jobs.find(item=>item.projectId===work.id&&item.collabQueueStatus):null;
  if(job?.collabQueueStatus==='状态未知')return '状态待核对';
  if(job?.collabQueueStatus==='暂停未提交')return '排队已暂停';
  if(['排队','生成中','结果获取'].includes(job?.collabQueueStatus))return '等待系统';
  if (work.collabPhase) return work.collabPhase;
  if (work.status === '已归档' && work.deliveries?.length) return '已交付';
  if (work.status === '需修改' || work.result?.review?.status === '需修改' || work.planChanged) return '需修改';
  if (work.stageOverride) return work.stageOverride;
  if (work.result) return '待审片';
  if (work.status === '待剪辑') return '待剪辑';
  if (work.accepted) return '待制作';
  if (!work.config?.claims?.trim() && !work.drama) return '待资源补齐';
  return '待方案确认';
}
function collabStage(work) {
  return { '等待系统':'producer','排队已暂停':'producer','状态待核对':'producer','待资源补齐': 'director', '待方案确认': 'director', '待制作': 'producer', '待剪辑': 'editor', '待审片': 'reviewer', '需修改': work.returnStage || 'producer', '已交付': 'reviewer' }[collabPhase(work)] || 'director';
}
function collabWorkOwner(work) { return work.assignments?.[collabStage(work)]; }
function collabWorkRows() {
  return collabState().campaigns.filter(project => collabVisible(project)).flatMap(project => collabWorks(project).map(work => ({ project, work })));
}
function collabCounts(project) {
  const works = collabWorks(project);
  const delivered = works.filter(work => collabPhase(work) === '已交付').length;
  const needsReview = works.filter(work => collabPhase(work) === '待审片').length;
  const blocked = works.filter(work => ['需修改', '待资源补齐'].includes(collabPhase(work))).length;
  const unknown = (state.clients[project.clientId]?.jobs || []).filter(job => job.campaignId === project.id && job.collabQueueStatus === '状态未知').length;
  return { works: works.length, delivered, needsReview, blocked, unknown };
}
function collabButton(label, action, capability, project, attributes = '', style = '') {
  return button(label, action, style, `${attributes} ${collabCan(capability, project) ? '' : 'disabled title="当前演示身份没有此操作权限"'}`);
}
function collabTabs() {
  return `<div class="flow-subnav collab-subnav">${[['projects', '项目总览'], ['tasks', '我的待办'], ['runs', '生成任务'], ['home', '快捷制作'], ['gallery', '样片广场']].map(([view, label]) => `<button data-action="nav" data-view="${view}" class="${viewState.view === view ? 'active' : ''}">${label}</button>`).join('')}</div>`;
}
function collabRunRows() {
  return collabState().campaigns.filter(project => collabVisible(project)).flatMap(project => state.clients[project.clientId].jobs.filter(job => job.campaignId === project.id).map(job => ({ project, job })));
}
function collabRunStatus(job) {
  if (job.collabQueueStatus) return job.collabQueueStatus;
  if (job.fileId) return '外部成片已回传';
  return ['待资源确认', '待脚本确认'].includes(job.status) ? '待内容确认' : '待供应商提交';
}
function collabRuns() {
  const rows = collabRunRows().filter(({ project, job }) => (collabUi.client === 'all' || project.clientId === collabUi.client) && (collabUi.runStatus === '全部状态' || collabRunStatus(job) === collabUi.runStatus) && `${job.name} ${job.id} ${project.name}`.toLowerCase().includes(collabUi.runQuery.toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  collabUi.runPage = Math.min(pages, collabUi.runPage);
  return `${headline('生成任务', '模型调用与人员待办分开；一次重试是新任务，不是新作品')}${collabTabs()}<div class="collab-local-note">真实供应商未连接；排队、运行、状态未知均为明确标记的示例。没有真实查单、重试、取消或扣费。</div>
    <div class="toolbar collab-toolbar">${selectorField('任务状态', 'collabRunStatus', ['全部状态', '待内容确认', '待供应商提交', '排队', '生成中', '结果获取', '状态未知', '暂停未提交', '外部成片已回传'], collabUi.runStatus)}<input class="input search" id="collabRunQuery" aria-label="搜索生成任务" placeholder="任务、项目或编号" value="${escapeText(collabUi.runQuery)}"><span class="meta">${rows.length} 个任务记录，不能作为合格视频数量</span></div>
    ${rows.length ? `<section class="card table-wrap"><table class="collab-runs-table"><thead><tr><th>任务 / 对应作品</th><th>客户 / 项目</th><th>执行状态</th><th>调用版本 / 上游编号</th><th>费用</th><th>操作</th></tr></thead><tbody>${rows.slice((collabUi.runPage - 1) * 20, collabUi.runPage * 20).map(({ project, job }) => `<tr><td><strong>${escapeText(job.name)}</strong>${job.demo ? '<span class="collab-demo-tag">示例</span>' : ''}<p class="meta">${escapeText(job.id)}</p></td><td>${escapeText(state.clients[project.clientId].name)}<p class="meta">${escapeText(project.name)}</p></td><td>${collabRunStatus(job)}${collabRunStatus(job) === '状态未知' ? '<p class="collab-warning">先核对，不自动重发</p>' : ''}</td><td>V${job.version || 1}<p class="meta">${escapeText(job.upstreamId || '未产生真实上游编号')}</p></td><td>${collabCan('finance', project) ? Number.isFinite(job.cost) ? `${job.cost} 示例积分，非结算` : '尚未报价' : '无费用查看权限'}</td><td>${button('查看任务', 'collab-run-detail', 'sm', `data-id="${job.id}"`)}</td></tr>`).join('')}</tbody></table>${collabPagination('run', rows.length, collabUi.runPage, pages)}</section>` : emptyState('没有匹配的生成任务', '完成方案确认后建立待提交任务；不会因为进入此页自动调用模型')}`;
}
function collabRunDialog(id) {
  const row = collabRunRows().find(item => item.job.id === id);
  if (!row) return collabReject();
  const { project, job } = row;
  openModal('生成任务详情', `<p class="meta">${escapeText(project.name)} · ${escapeText(job.id)}</p><div class="summary-fields mt"><div><label>执行状态</label>${collabRunStatus(job)}${job.demo ? '（示例）' : ''}</div><div><label>上游编号</label>${escapeText(job.upstreamId || '未提交供应商')}</div><div><label>绑定作品</label>${escapeText(job.projectId || '旧记录未关联')}</div><div><label>计划版本</label>V${job.version || 1}</div></div><p class="small mt">${collabRunStatus(job) === '状态未知' ? '状态未知不意味着失败；先查单与对账。当前没有真实供应商接口，不提供自动重发按钮。' : collabRunStatus(job) === '外部成片已回传' ? '这是用户上传成片，并不是系统已运行视频模型。' : '本记录用于上下文与排产。真实提交、取消、结果获取和费用必须由服务端供应商适配执行。'}</p>${job.variation ? `<div class="notice mt">单变量：${escapeText(job.variation.dimension)} · 来源作品 ${escapeText(job.variation.sourceWorkId || '未记录')} · 每条都需重新核对</div>` : ''}<div class="row gap8 mt">${job.projectId && collabFindWork(job.projectId) ? button('查看关联作品', 'collab-open-work', '', `data-id="${job.projectId}"`) : ''}${button('查看调度计划', 'collab-open-scheduling')}</div>`, true);
}
function collabProjectFilters() {
  return `<div class="toolbar collab-toolbar">${selectorField('项目状态', 'collabProjectStatus', ['进行中', '已归档', '全部项目'], collabUi.projectStatus)}<input class="input search" id="collabProjectQuery" aria-label="搜索项目" placeholder="项目名、客户或编号" value="${escapeText(collabUi.query)}">${button('重置', 'collab-reset', 'ghost sm')}<span class="meta">客户范围沿用顶部选择</span></div>`;
}
function collabPortfolio() {
  const actor = collabActor();
  if (actor.role === 'guest') return collabGuest();
  const projects = collabState().campaigns.filter(project => collabVisible(project) && (collabUi.client === 'all' || project.clientId === collabUi.client) && (collabUi.projectStatus === '全部项目' || project.status === collabUi.projectStatus) && `${project.name} ${project.id} ${state.clients[project.clientId]?.name}`.toLowerCase().includes(collabUi.query.toLowerCase())).sort((left, right) => {
    const rightCounts = collabCounts(right); const leftCounts = collabCounts(left);
    return Number(right.priority === '加急') - Number(left.priority === '加急') || Number(rightCounts.blocked + rightCounts.unknown > 0) - Number(leftCounts.blocked + leftCounts.unknown > 0) || (left.dueDate || '9999').localeCompare(right.dueDate || '9999');
  });
  const pageCount = Math.max(1, Math.ceil(projects.length / 12));
  collabUi.projectPage = Math.min(pageCount, collabUi.projectPage);
  return `${headline('项目总览', '按交付项目管理，制作草稿与模型产单分别计数', collabButton('新建交付项目 ' + icon('plus'), 'collab-new-project', 'manage', null, '', 'primary'))}${collabTabs()}
    ${!collabState().demoLoaded && collabCan('team') ? `<div class="collab-demo-start"><span>想体验十项目同时排产？示例只新增演示记录，不覆盖现有素材。</span>${button('载入十项目示例', 'collab-load-demo', 'sm')}</div>` : ''}
    ${collabProjectFilters()}${projects.length ? `<section class="card"><div class="table-wrap"><table class="collab-project-table"><thead><tr><th>客户 / 交付项目</th><th>项目负责人</th><th>交付截止</th><th>交付 / 目标</th><th>阻塞与下一步</th><th>操作</th></tr></thead><tbody>${projects.slice((collabUi.projectPage - 1) * 12, collabUi.projectPage * 12).map(project => {
      const count = collabCounts(project);
      const overdue = project.dueDate && project.dueDate < guardToday() && (!project.target || count.delivered < project.target);
      return `<tr><td><strong>${escapeText(project.name)}</strong>${project.demo ? '<span class="collab-demo-tag">示例</span>' : ''}<p class="meta">${escapeText(state.clients[project.clientId].name)} · ${escapeText(project.id.slice(-9))}</p></td><td>${escapeText(collabName(project.leadId))}</td><td class="${overdue ? 'collab-warning' : ''}">${escapeText(project.dueDate || '未设置')} ${overdue ? '· 逾期' : ''}</td><td><strong class="mono">${count.delivered} / ${project.target ?? '未定'}</strong><p class="meta">${count.works} 条作品 · ${project.demo ? '演示交付数量' : '固定版交付'}</p></td><td>${count.blocked ? button(`${count.blocked} 条需处理`, 'collab-open-project', 'ghost sm', `data-id="${project.id}" data-filter="需处理"`) : '<span class="meta">无内容阻塞</span>'}${count.needsReview ? button(`${count.needsReview} 条待审片`, 'collab-open-project', 'ghost sm', `data-id="${project.id}" data-filter="待审片"`) : ''}${count.unknown ? `<p class="collab-warning">${count.unknown} 条上游状态未知 · 查单优先</p>` : ''}</td><td>${button('进入项目', 'collab-open-project', 'sm', `data-id="${project.id}"`)}</td></tr>`;
    }).join('')}</tbody></table></div>${collabPagination('project', projects.length, collabUi.projectPage, pageCount)}</section>` : emptyState('没有匹配项目', '更换筛选，或建立一次明确的交付项目', button('重置筛选', 'collab-reset'))}`;
}
function collabPagination(kind, count, page, pages) {
  return `<div class="pagination"><span class="meta">${count} 项 · ${page} / ${pages} 页</span><div class="row gap8">${button('上一页', 'collab-page', 'sm', `data-kind="${kind}" data-direction="-1" ${page === 1 ? 'disabled' : ''}`)}${button('下一页', 'collab-page', 'sm', `data-kind="${kind}" data-direction="1" ${page === pages ? 'disabled' : ''}`)}</div></div>`;
}
function collabProjectDetail() {
  const project = collabCampaign(collabUi.projectId || collabState().lastProjectId);
  if (!collabVisible(project)) return collabDenied();
  collabUi.projectId=project.id;
  const count = collabCounts(project);
  const controls = collabButton('项目设置', 'collab-edit-project', 'manage', project, `data-id="${project.id}"`) + collabButton(project.status === '已归档' ? '恢复项目' : '归档项目', 'collab-project-lifecycle', 'manage', project, `data-id="${project.id}"`) + collabButton('在此项目做视频', 'collab-project-create', 'edit', project, `data-id="${project.id}"`, 'primary');
  return `${headline(escapeText(project.name), `${escapeText(state.clients[project.clientId].name)} · ${project.demo ? '示例项目 · ' : ''}负责人 ${escapeText(collabName(project.leadId))}`, controls)}
    <div class="collab-context">${button('返回项目总览', 'nav', 'ghost sm', 'data-view="projects"')}<span>${count.delivered} / ${project.target ?? '未定'} 条交付 · 截止 ${project.dueDate || '未设置'}</span>${project.priority === '加急' ? '<span class="collab-warning">加急</span>' : ''}</div>
    <div class="tabs">${['内容', '分工', '活动'].map(tab => `<button class="${collabUi.tab === tab ? 'active' : ''}" data-action="collab-project-tab" data-value="${tab}">${tab}</button>`).join('')}</div>
    ${collabUi.tab === '分工' ? collabProjectPeople(project) : collabUi.tab === '活动' ? collabActivities(project.id) : collabProjectWorks(project)}`;
}
function collabProjectWorks(project) {
  const works = collabWorks(project).filter(work => (collabUi.workFilter === '全部' || collabUi.workFilter === '需处理' && ['需修改', '待资源补齐'].includes(collabPhase(work)) || collabPhase(work) === collabUi.workFilter) && `${work.name} ${work.sku}`.toLowerCase().includes(collabUi.workQuery.toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(works.length / 20));
  collabUi.workPage = Math.min(pageCount, collabUi.workPage);
  const visible = works.slice((collabUi.workPage - 1) * 20, collabUi.workPage * 20);
  const selected = works.filter(work => collabUi.selected.has(work.id));
  return `<div class="collab-work-summary"><p>${escapeText(project.brief || '在此项目集中管理商品制作、改稿与交付')}</p>${collabCan('finance', project) ? `<span class="meta">项目计划预算 ${project.budgetLimit == null ? '未设置' : project.budgetLimit + ' 积分'} · 实际费用未知</span>` : ''}</div>
    <div class="toolbar collab-toolbar">${selectorField('内容状态', 'collabWorkFilter', ['全部', '需处理', ...collabPhases,'等待系统','状态待核对','排队已暂停'], collabUi.workFilter)}<input id="collabWorkQuery" class="input search" placeholder="作品名或SKU" aria-label="搜索项目作品" value="${escapeText(collabUi.workQuery)}">${button('选择全部筛选结果', 'collab-select-filtered', 'sm', works.length ? '' : 'disabled')}<span class="meta">按作品计数，不把重试算新作品</span></div>
    ${visible.length ? `<section class="card"><div class="table-wrap"><table class="collab-work-table"><thead><tr><th><input class="checkbox" type="checkbox" id="collabSelectPage" aria-label="选择本页作品" ${visible.every(work => collabUi.selected.has(work.id)) ? 'checked' : ''}></th><th>作品 / SKU</th><th>当前阶段</th><th>下一步责任人</th><th>截止</th><th>下一步</th></tr></thead><tbody>${visible.map(work => `<tr><td><input type="checkbox" class="checkbox" data-collab-select="${work.id}" aria-label="选择 ${escapeText(work.name)}" ${collabUi.selected.has(work.id) ? 'checked' : ''}></td><td><strong>${escapeText(work.name)}</strong>${work.demo ? '<span class="collab-demo-tag">示例</span>' : ''}<p class="meta">${escapeText(work.sku || '待补SKU')} · ${escapeText(work.format || '')} · 草稿V${work.editVersion || 1}</p></td><td>${collabPhase(work)}${work.blockReason ? `<p class="collab-warning">${escapeText(work.blockReason)}</p>` : ''}</td><td>${escapeText(collabName(collabWorkOwner(work)))}<p class="meta">${collabStages[collabStage(work)]}</p></td><td>${escapeText(work.dueDate || project.dueDate || '未设置')}</td><td>${button(work.demo ? '查看任务' : collabPhase(work) === '待审片' ? '去审片' : '继续制作', 'collab-open-work', 'sm', `data-id="${work.id}"`)}</td></tr>`).join('')}</tbody></table></div>${collabPagination('work', works.length, collabUi.workPage, pageCount)}</section>` : emptyState('没有匹配作品', '调整状态或搜索，已创建的作品仍保留')}
    ${selected.length ? `<div class="bulk-bar"><span>已选 ${selected.length} 条${selected.length > visible.length ? ' · 包含非本页筛选结果' : ' · 本页或手动选择'}</span><div class="row wrap gap8">${collabButton('分配 / 改截止', 'collab-bulk', 'manage', project)}${button('取消选择', 'collab-clear-selection', 'ghost')}</div></div>` : ''}`;
}
function collabTasks() {
  let rows = collabWorkRows().filter(({ project, work }) => {
    const phase=collabPhase(work);
    const waiting=['等待系统','排队已暂停'].includes(phase);
    const scope=collabUi.taskScope==='团队任务'&&collabCan('manage')||collabWorkOwner(work)===collabActor().id&&(collabUi.taskScope==='等待系统'?waiting:!waiting);
    return phase!=='已交付'&&scope&&(collabUi.client==='all'||collabUi.client===project.clientId)&&(collabUi.stage==='全部阶段'||collabStages[collabStage(work)]===collabUi.stage)&&`${work.name} ${project.name} ${work.sku}`.toLowerCase().includes(collabUi.taskQuery.toLowerCase());
  });
  rows.sort((left, right) => Number(collabPhase(right.work) === '需修改') - Number(collabPhase(left.work) === '需修改') || (left.work.dueDate || left.project.dueDate || '9999').localeCompare(right.work.dueDate || right.project.dueDate || '9999'));
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  collabUi.taskPage = Math.min(pages, collabUi.taskPage);
  return `${headline('我的待办', `${escapeText(collabActor().name)} · 当前接力步骤与等待系统分开，不把模型等待算成人工工作量`)}${collabTabs()}<div class="toolbar collab-toolbar">${selectorField('任务范围', 'collabTaskScope', collabCan('manage') ? ['我的待办', '等待系统', '团队任务'] : ['我的待办','等待系统'], collabUi.taskScope)}${selectorField('处理阶段', 'collabTaskStage', ['全部阶段', ...Object.values(collabStages)], collabUi.stage)}<input id="collabTaskQuery" class="input search" placeholder="作品、项目或SKU" aria-label="搜索待办" value="${escapeText(collabUi.taskQuery)}"></div>
    ${rows.length ? `<section class="card"><div class="table-wrap"><table><thead><tr><th>作品</th><th>客户 / 项目</th><th>需要处理</th><th>责任人 / 截止</th><th>操作</th></tr></thead><tbody>${rows.slice((collabUi.taskPage - 1) * 20, collabUi.taskPage * 20).map(({ project, work }) => `<tr><td><strong>${escapeText(work.name)}</strong>${work.demo ? '<span class="collab-demo-tag">示例</span>' : ''}</td><td>${escapeText(state.clients[project.clientId].name)}<p class="meta">${escapeText(project.name)}</p></td><td>${collabPhase(work)}<p class="meta">${escapeText(work.blockReason || work.revisionNote || '按当前方案处理')}</p></td><td>${escapeText(collabName(collabWorkOwner(work)))}<p class="meta">${work.dueDate || project.dueDate || '未设置'}</p></td><td>${button('处理这条', 'collab-open-work', 'sm', `data-id="${work.id}"`)}</td></tr>`).join('')}</tbody></table></div>${collabPagination('task', rows.length, collabUi.taskPage, pages)}</section>` : emptyState('当前没有需要你处理的任务', '等待分配或接力；不是所有进行中的视频都需要你操作')}`;
}
function collabMemberOptions(project = null) {
  return collabState().members.filter(member => member.active && member.role !== 'guest' && (!project || collabVisible(project, member))).map(member => ({ id: member.id, name: `${member.name} · ${collabRoles[member.role].name}` }));
}
function collabProjectPeople(project) {
  return `<section class="card pad"><div class="flow-section-head"><h3>默认分工</h3>${collabButton('调整项目默认', 'collab-edit-project', 'manage', project, `data-id="${project.id}"`)}</div><div class="collab-stage-people">${Object.entries(collabStages).map(([stage, label]) => `<div><small>${label}</small><strong>${escapeText(collabName(project.assignments[stage]))}</strong></div>`).join('')}</div><p class="meta mt">新作品继承默认分工；修改默认不覆盖已经分配的作品。每条作品当前只有一个下一步责任人。</p></section><section class="card mt pad"><h3>项目成员</h3>${project.memberIds.map(id => `<div class="draft-row"><div class="grow"><strong>${escapeText(collabName(id))}</strong><p class="meta">${collabRoles[collabState().members.find(member => member.id === id)?.role || 'maker'].name}</p></div></div>`).join('')}</section>`;
}
function collabActivities(projectId = '') {
  const items = collabState().activity.filter(event => !projectId || event.projectId === projectId).filter(event => !event.projectId ? collabCan('team') : collabVisible(collabCampaign(event.projectId))).slice(0, 40);
  return `<section class="card">${items.length ? items.map(event => `<div class="draft-row"><div class="grow"><strong>${escapeText(collabName(event.actor))} · ${escapeText(event.action)}</strong><p class="small mt">${escapeText(event.detail)}</p><p class="meta mt">${escapeText(new Date(event.at).toLocaleString('zh-CN'))}</p></div></div>`).join('') : '<div class="pad meta">暂无项目操作记录</div>'}</section>`;
}
function collabProjectForm(id = '') {
  const existing = collabCampaign(id);
  if (!collabCan('manage', existing)) return collabReject();
  const project = existing || { clientId: state.activeClient, name: '', target: '', dueDate: '', leadId: collabActor().id, memberIds: [collabActor().id], assignments: { director: collabActor().id, producer: collabActor().id, editor: collabActor().id, reviewer: collabActor().id }, priority: '普通', budgetLimit: '', brief: '' };
  const members = collabMemberOptions(existing);
  openModal(existing ? '项目设置' : '新建交付项目', `<form id="collabProjectForm"><div class="setting-grid"><label class="field"><span>项目名</span><input class="input" name="name" required maxlength="100" value="${escapeText(project.name)}" placeholder="例如：双11服饰上新素材"></label>${selectorField('所属客户', 'collabProjectClient', collabAccessibleClients().map(clientId => ({ id: clientId, name: state.clients[clientId].name })), project.clientId, existing ? 'disabled' : '')}${selectorField('项目负责人', 'collabProjectLead', members, project.leadId)}<label class="field"><span>交付截止</span><input type="date" class="input" name="dueDate" value="${project.dueDate}"></label><label class="field"><span>目标交付量（选填）</span><input class="input" name="target" type="number" min="1" max="100000" step="1" value="${project.target ?? ''}"></label>${selectorField('优先级', 'collabPriority', ['普通', '加急'], project.priority)}</div><label class="field"><span>简要交付要求</span><textarea class="input" name="brief">${escapeText(project.brief)}</textarea></label><details class="workspace-details"><summary>项目成员与默认分工</summary><div class="collab-member-checks mt">${members.map(member => `<label><input type="checkbox" name="members" value="${member.id}" class="checkbox" ${project.memberIds.includes(member.id) ? 'checked' : ''}> ${escapeText(member.name)}</label>`).join('')}</div><div class="setting-grid mt">${Object.entries(collabStages).map(([stage, label]) => selectorField(label, `collabDefault-${stage}`, members, project.assignments[stage])).join('')}</div></details>${collabCan('finance', existing) ? `<label class="field mt"><span>项目预算上限（计划积分，选填）</span><input class="input" type="number" min="0" name="budget" value="${project.budgetLimit ?? ''}"></label><p class="meta">当前不预留、不扣费，不代表上游生成授权</p>` : ''}<p id="collabFormError" class="guard-error" role="alert"></p><button class="btn primary full mt" type="submit">保存项目</button></form>`, true);
  document.getElementById('collabProjectForm').onsubmit = event => {
    event.preventDefault();
    if (!collabCan('manage', existing)) return collabReject();
    const form = new FormData(event.target);
    const clientId = existing?.clientId || document.getElementById('collabProjectClient').value;
    const leadId = document.getElementById('collabProjectLead').value;
    const assignments = Object.fromEntries(Object.keys(collabStages).map(stage => [stage, document.getElementById(`collabDefault-${stage}`).value]));
    const memberIds = [...new Set([...form.getAll('members'), leadId, ...Object.values(assignments)])];
    if (!collabClientAllowed(clientId) || memberIds.some(memberId => !collabClientAllowed(clientId, collabState().members.find(member => member.id === memberId)))) { document.getElementById('collabFormError').textContent = '成员必须拥有该客户的数据范围，先由管理员授权'; return; }
    const values = { clientId, name: form.get('name').trim(), leadId, assignments, memberIds, dueDate: form.get('dueDate'), target: form.get('target') === '' ? null : Number(form.get('target')), priority: document.getElementById('collabPriority').value, brief: form.get('brief').trim(), updated: new Date().toISOString() };
    if (collabCan('finance', existing)) values.budgetLimit = form.get('budget') === '' ? null : Number(form.get('budget'));
    const project = existing || collabNewCampaign(clientId);
    if (existing && existing.target !== values.target) project.targetHistory.push({ previous: existing.target, next: values.target, by: collabActor().id, at: new Date().toISOString() });
    Object.assign(project, values);
    collabLog(existing ? '更新项目设置' : '新建交付项目', project.id, `${project.name}；目标${project.target ?? '未定'}，默认分工仅作用于新作品`);
    collabState().activeByClient[clientId] = project.id;
    persist(); closeModal(); collabOpenProject(project.id);
  };
}
function collabFindWork(id) {
  for (const [clientId, current] of Object.entries(state.clients)) {
    const work = current.projects.find(item => item.id === id);
    if (work) return { work, clientId, project: collabCampaign(work.campaignId) };
  }
  return null;
}
function collabOpenProject(id, filter = '全部') {
  const project = collabCampaign(id);
  if (!collabVisible(project)) return collabReject();
  saveDraftIfNeeded();
  state.activeClient = project.clientId;
  state.config = defaultConfig();
  collabUi.projectId = id; collabUi.workFilter = filter; collabUi.workQuery = ''; collabUi.workPage = 1; collabUi.tab = '内容'; collabUi.selected.clear();
  collabState().lastProjectId=id;
  collabState().activeByClient[project.clientId] = id;
  viewState.selectedJobs.clear(); viewState.selectedAssets.clear(); viewState.batch = null; workspaceUi.resourceReturn = null;
  persist(); navigate('project');
}
function collabOpenWork(id) {
  const found = collabFindWork(id);
  if (!found || !collabVisible(found.project)) return collabReject();
  const { work, project } = found;
  if (work.demo) return collabWorkDialog(found);
  saveDraftIfNeeded();
  state.activeClient = found.clientId;
  state.config = { ...defaultConfig(), ...collabCopy(work.config), draftId: work.id };
  collabState().activeByClient[found.clientId] = project.id;
  viewState.activeShot = 0; collabUi.projectId = project.id;
  persist();
  if (!collabCan('edit', project)) {
    if (collabCan('review', project) && work.result) navigate('result');
    else collabWorkDialog(found);
  } else navigate(work.accepted || work.result ? 'result' : work.flow ? work.drama ? 'drama' : 'quick' : 'studio');
}
function collabWorkDialog({ work, project }) {
  const editable = !['等待系统','状态待核对','排队已暂停'].includes(collabPhase(work))&&(collabCan('manage', project) || collabCan('edit', project) && collabWorkOwner(work) === collabActor().id || collabCan('review', project) && collabStage(work) === 'reviewer' && collabWorkOwner(work) === collabActor().id);
  openModal(work.name, `<div class="collab-task-detail"><p class="meta">${escapeText(project.name)} · ${work.demo ? '示例任务，无真实生成视频；修改状态仅演示接力' : '制作任务'}</p><div class="summary-fields mt"><div><label>当前阶段</label>${collabPhase(work)}</div><div><label>下一步</label>${escapeText(collabName(collabWorkOwner(work)))} · ${collabStages[collabStage(work)]}</div><div><label>人工工作量估计</label>${work.effort} 点，不是模型时长</div><div><label>截止</label>${work.dueDate || project.dueDate || '未设置'}</div></div><p class="small mt">${escapeText(work.blockReason || work.revisionNote || '按确认方案处理，结果由对应责任人检查')}</p>
    <div class="setting-grid mt">${Object.entries(collabStages).map(([stage, label]) => selectorField(label, `collabWork-${stage}`, collabMemberOptions(project), work.assignments?.[stage], collabCan('manage', project) ? '' : 'disabled')).join('')}</div>
    ${work.demo ? `<div class="setting-grid">${selectorField('下一阶段', 'collabNextPhase', collabPhases, collabPhase(work), editable ? '' : 'disabled')}${selectorField('退回给', 'collabReturnStage', Object.entries(collabStages).map(([stage, name]) => ({ id: stage, name })), work.returnStage || 'producer', editable ? '' : 'disabled')}</div><label class="field"><span>修改意见 / 阻塞原因</span><textarea class="input" id="collabWorkNote" ${editable ? '' : 'disabled'}>${escapeText(work.blockReason || '')}</textarea></label>` : ''}
    <div class="row gap8 wrap">${collabCan('manage', project) ? button('保存分工', 'collab-save-work-assignees', '', `data-id="${work.id}"`) : ''}${work.demo ? button('保存接力状态（示例）', 'collab-save-work-phase', 'primary', `data-id="${work.id}" ${editable ? '' : 'disabled'}`) : ''}</div></div>`, true);
}
function collabHandoffDialog(id) {
  const found = collabFindWork(id);
  if (!found || found.work.demo || !found.work.accepted || !(collabCan('manage', found.project) || collabCan('edit', found.project) && collabWorkOwner(found.work) === collabActor().id)) return collabReject();
  if (['等待系统', '状态待核对', '排队已暂停'].includes(collabPhase(found.work))) return collabReject();
  openModal('移交下一步，不重新生成', `<p class="small">${escapeText(found.work.name)} · 保留当前方案、文件与版本；只调整人员接力，不创建生成任务。</p>${selectorField('下一步', 'collabHandoffStep', found.work.result ? ['交给剪辑', '提交审片'] : ['交给剪辑'], '交给剪辑')}<p class="meta">剪辑：${escapeText(collabName(found.work.assignments.editor))} · 审核：${escapeText(collabName(found.work.assignments.reviewer))}</p><label class="field mt"><span>交接说明${found.work.result ? '（选填）' : '（必填，说明已有素材在哪里）'}</span><textarea class="input" id="collabHandoffNote" placeholder="保留哪些镜头、需要改什么、素材在哪里"></textarea></label><p id="collabHandoffError" class="guard-error" role="alert"></p>${button('确认移交', 'collab-confirm-handoff', 'primary mt', `data-id="${id}"`)}`);
}
function collabBulkDialog() {
  const project = collabCampaign(collabUi.projectId);
  if (!collabCan('manage', project)) return collabReject();
  const works = collabWorks(project).filter(work => collabUi.selected.has(work.id));
  openModal('批量分配与排期', `<p class="small">本次只处理当前项目的${works.length}条选中作品，不发起模型任务</p>${selectorField('调整阶段', 'collabBulkStage', Object.entries(collabStages).map(([id, name]) => ({ id, name })), 'producer')}${selectorField('责任人', 'collabBulkOwner', collabMemberOptions(project), project.assignments.producer)}<label class="field"><span>新截止（选填，不填保持原值）</span><input class="input" id="collabBulkDue" type="date"></label>${button('确认批量更新', 'collab-commit-bulk', 'primary full')}<p class="meta mt">历史作者、方案和成片不变；每位责任人收到一条汇总提醒</p>`);
}
function collabTeam() {
  if (!collabCan('team') && !collabCan('manage')) return collabDenied();
  const tabs = collabCan('team') ? ['成员与权限', '工作负荷', '调度计划', '活动记录', '接口与费用', '出片API', '团队列表', '打标统计', '团队费用'] : ['工作负荷', '调度计划'];
  if (!tabs.includes(collabUi.teamTab)) collabUi.teamTab = tabs[0];
  return `${headline('团队与生产管理', '组织范围、人员工作量与上游并发分开管理', collabCan('team') && collabUi.teamTab === '成员与权限' ? button('添加演示成员', 'collab-add-member', 'primary') : '')}
    <div class="tabs">${tabs.map(tab => `<button class="${collabUi.teamTab === tab ? 'active' : ''}" data-action="collab-team-tab" data-value="${tab}">${tab}</button>`).join('')}</div>
    <div class="collab-local-note">本地协作演示：没有真实邀请、登录授权、多人同步或上游调度。角色切换只用于体验页面。</div>
    ${collabUi.teamTab === '成员与权限' ? collabMembersPage() : collabUi.teamTab === '工作负荷' ? collabWorkload() : collabUi.teamTab === '调度计划' ? collabScheduling() : collabUi.teamTab === '活动记录' ? collabActivities() : collabUi.teamTab === '出片API' ? generationSettingsMarkup() : collabCan('finance') ? settingsPage() : collabDenied()}`;
}
function collabMembersPage() {
  return `<section class="card table-wrap"><table><thead><tr><th>成员</th><th>角色模板</th><th>客户 / 项目范围</th><th>附加权限</th><th>状态</th><th>操作</th></tr></thead><tbody>${collabState().members.map(member => `<tr><td><strong>${escapeText(member.name)}</strong></td><td>${collabRoles[member.role].name}</td><td>${member.clientIds.includes('*') ? '全部客户' : member.clientIds.map(id => escapeText(state.clients[id]?.name || id)).join('、') || '无客户'}<p class="meta">${member.projectIds.includes('*') ? '范围内全部项目' : `${member.projectIds.length} 项指定项目 + 项目成员范围`}</p></td><td>${['generate', 'export', 'publish', 'finance'].filter(capability => member.grants?.[capability] ?? collabRoles[member.role][capability]).map(capability => ({ generate: '收费提交', export: '源素材导出', publish: '知识发布', finance: '费用可见' }[capability])).join('、') || '无'}</td><td>${member.active ? '可用' : '已停用'}</td><td>${member.role === 'owner' ? '<span class="meta">所有权不在此转移</span>' : button('设置范围', 'collab-edit-member', 'sm', `data-id="${member.id}"`)}</td></tr>`).join('')}</tbody></table></section><p class="meta mt">编辑不代表可花积分；管理员不默认代替内容审核。外部客户仅查看明确分享的交付记录。</p>`;
}
function collabMemberForm(id = '') {
  if (!collabCan('team')) return collabReject();
  const existing = collabState().members.find(member => member.id === id);
  if (existing?.role === 'owner') return collabReject();
  const member = existing || { name: '', role: 'maker', clientIds: [], projectIds: [], active: true, weeklyCapacity: 20, grants: {} };
  openModal('演示成员与权限', `<form id="collabMemberForm"><p class="meta">保存本地权限配置，不发送邀请，不创建真实企业账号</p><div class="setting-grid mt"><label class="field"><span>成员名称</span><input class="input" name="name" required maxlength="60" value="${escapeText(member.name)}"></label>${selectorField('角色模板', 'collabMemberRole', Object.entries(collabRoles).filter(([role]) => role !== 'owner').map(([role, data]) => ({ id: role, name: data.name })), member.role)}<label class="field"><span>每周估计容量（点）</span><input class="input" name="capacity" type="number" min="1" max="1000" value="${member.weeklyCapacity}"></label></div><h3 class="mt">客户数据范围</h3><div class="collab-member-checks mt">${Object.entries(state.clients).map(([clientId, data]) => `<label><input class="checkbox" type="checkbox" name="clients" value="${clientId}" ${member.clientIds.includes('*') || member.clientIds.includes(clientId) ? 'checked' : ''}> ${escapeText(data.name)}</label>`).join('')}</div><details class="workspace-details"><summary>限定项目与附加能力</summary><label class="row small mt"><input type="checkbox" class="checkbox" name="allProjects" ${member.projectIds.includes('*') ? 'checked' : ''}> 范围内全部项目（否则仅指定项目或项目成员）</label><div class="collab-member-checks mt">${collabState().campaigns.map(project => `<label><input type="checkbox" class="checkbox" name="projects" value="${project.id}" ${member.projectIds.includes(project.id) ? 'checked' : ''}> ${escapeText(project.name)}</label>`).join('')}</div><div class="collab-member-checks mt">${[['generate', '允许收费提交（当前不执行）'], ['export', '允许导出源素材'], ['publish', '允许发布知识'], ['finance', '允许查看费用'], ['review', '允许审核交付']].map(([capability, name]) => `<label><input type="checkbox" class="checkbox" name="grants" value="${capability}" ${(member.grants?.[capability] ?? collabRoles[member.role][capability]) ? 'checked' : ''}> ${name}</label>`).join('')}</div></details><p id="collabMemberError" class="guard-error" role="alert"></p><button type="submit" class="btn primary full mt">保存演示权限</button>${existing ? button('停用并移交任务', 'collab-disable-member', 'full mt', `data-id="${id}"`) : ''}</form>`, true);
  document.getElementById('collabMemberForm').onsubmit = event => {
    event.preventDefault();
    if (!collabCan('team')) return collabReject();
    const form = new FormData(event.target); const clientIds = form.getAll('clients'); const projectIds = form.has('allProjects') ? ['*'] : form.getAll('projects');
    if (projectIds.some(projectId => projectId !== '*' && !clientIds.includes(collabCampaign(projectId)?.clientId))) { document.getElementById('collabMemberError').textContent = '指定项目必须包含在客户范围内'; return; }
    const role = document.getElementById('collabMemberRole').value;
    const grants = Object.fromEntries(['generate', 'export', 'publish', 'finance', 'review'].map(capability => [capability, form.getAll('grants').includes(capability)]));
    if (existing) {
      const proposed = { ...existing, role, clientIds, projectIds, grants };
      const lost = collabState().campaigns.some(project => project.leadId === existing.id && !collabVisible(project, proposed) || collabWorks(project).some(work => collabPhase(work) !== '已交付' && Object.values(work.assignments || {}).includes(existing.id) && !collabVisible(project, proposed)));
      if (lost) { document.getElementById('collabMemberError').textContent = '该成员仍有范围外未完成任务或负责项目；请先移交，再缩小权限范围'; return; }
    }
    const updated = existing || { id: uniqueId('member'), active: true };
    Object.assign(updated, { name: form.get('name').trim(), role, clientIds, projectIds, weeklyCapacity: Number(form.get('capacity')), grants });
    if (!existing) collabState().members.push(updated);
    collabLog('更新演示成员权限', '', `${updated.name}：${collabRoles[role].name}；客户范围${clientIds.length}项`);
    persist(); closeModal(); render();
  };
}
function collabWorkload() {
  const rows = collabWorkRows().filter(({ work }) => !['已交付','等待系统','排队已暂停'].includes(collabPhase(work)));
  return `<p class="meta mb">按当前阶段的人工估计工作量汇总；1点为团队相对工作量，不是实际工时或模型并发。可从分工调整，不自动派单。</p><section class="card">${collabState().members.filter(member => member.active && member.role !== 'guest').map(member => {
    const assigned = rows.filter(({ work }) => collabWorkOwner(work) === member.id);
    const weekly = assigned.filter(({ work, project }) => { const due = work.dueDate || project.dueDate; return !due || due <= collabDate(7); });
    const points = weekly.reduce((sum, { work }) => sum + work.effort, 0);
    return `<div class="collab-load-row"><div><strong>${escapeText(member.name)}</strong><p class="meta">${collabRoles[member.role].name}</p></div><div class="grow"><div class="collab-load-track"><i style="width:${Math.min(100, points / member.weeklyCapacity * 100)}%" class="${points > member.weeklyCapacity ? 'over' : ''}"></i></div><p class="meta">未来7天或未排期：${weekly.length} 条 · ${points} / ${member.weeklyCapacity} 点</p></div>${button('查看分配', 'collab-person-work', 'sm', `data-id="${member.id}"`)}</div>`;
  }).join('')}</section>`;
}
function collabScheduling() {
  const projects = collabState().campaigns.filter(project => collabVisible(project));
  const jobs = projects.flatMap(project => (state.clients[project.clientId]?.jobs || []).filter(job => job.campaignId === project.id).map(job => ({ project, job })));
  const queued = jobs.filter(({ job }) => ['排队', '暂停未提交'].includes(job.collabQueueStatus));
  const running = jobs.filter(({ job }) => ['生成中', '结果获取'].includes(job.collabQueueStatus));
  const unknown = jobs.filter(({ job }) => job.collabQueueStatus === '状态未知');
  return `<div class="collab-schedule-summary"><span>示例占用 ${running.length} · 待排 ${queued.length} · 状态未知 ${unknown.length}</span>${collabCan('team') ? `<div class="row gap8">${selectorField('企业并发计划', 'collabParallel', ['2', '4', '6', '8'], String(collabState().limits.parallel))}${button('保存计划', 'collab-save-limits', 'sm')}</div>` : ''}</div><p class="meta mb">仅规划，不执行上游；单项目计划最多${collabState().limits.projectParallel}个槽位。未知状态先查单，不自动重发；暂停只影响未提交任务。</p>
    <section class="card"><div class="table-wrap"><table><thead><tr><th>项目</th><th>上游队列（示例）</th><th>当前占用 / 待排</th><th>处理</th></tr></thead><tbody>${projects.map(project => {
      const projectJobs = jobs.filter(row => row.project.id === project.id);
      return `<tr><td>${escapeText(project.name)}</td><td>${projectJobs.filter(({ job }) => job.collabQueueStatus === '状态未知').length ? '<span class="collab-warning">有未知任务，需人工核对</span>' : project.paused ? '未提交任务已暂停' : '等待公平分配'}</td><td>${projectJobs.filter(({ job }) => ['生成中', '结果获取'].includes(job.collabQueueStatus)).length} / ${projectJobs.filter(({ job }) => job.collabQueueStatus === '排队').length}</td><td>${collabButton(project.paused ? '恢复未提交' : '暂停未提交', 'collab-pause-project', 'manage', project, `data-id="${project.id}"`, 'sm')}</td></tr>`;
    }).join('')}</tbody></table></div></section>
    <section class="card mt pad"><h3>下一轮公平调度预览</h3><p class="meta mt">按项目轮转，并遵守企业与单项目槽位；仅示例待排任务可预览，不自动提交真实产单</p>${button('计算下一轮（不执行）', 'collab-plan-slots', 'mt')}${collabUi.schedulePreview ? `<div class="collab-slot-preview mt">${collabUi.schedulePreview.map(row => `<div>${escapeText(row.projectName)}<p class="meta">${escapeText(row.jobName)}</p></div>`).join('') || '<p class="meta">没有空闲槽位或可排任务</p>'}</div>` : ''}</section>`;
}
function collabPlanSlots() {
  const store = collabState();
  const projects = store.campaigns.filter(project => collabVisible(project) && !project.paused && project.status === '进行中');
  const running = store.campaigns.flatMap(project => (state.clients[project.clientId]?.jobs || []).filter(job => job.campaignId === project.id && ['生成中', '结果获取', '状态未知'].includes(job.collabQueueStatus)));
  let available = Math.max(0, store.limits.parallel - running.length);
  const picks = []; const counts = {};
  const queues = projects.map(project => ({ project, jobs: state.clients[project.clientId].jobs.filter(job => job.campaignId === project.id && job.demo && job.collabQueueStatus === '排队') }));
  for (let round = 0; round < store.limits.projectParallel && available; round++) {
    for (const { project, jobs } of queues) {
      const occupied = running.filter(job => job.campaignId === project.id).length + (counts[project.id] || 0);
      if (occupied >= store.limits.projectParallel || !jobs.length || available <= 0) continue;
      const job = jobs.shift(); picks.push({ projectName: project.name, jobName: job.name, jobId: job.id }); available--; counts[project.id] = (counts[project.id] || 0) + 1;
    }
  }
  return picks;
}
function collabDemoLoad() {
  if (!collabCan('team') || collabState().demoLoaded) return;
  const store = collabState();
  const clientIds = Object.keys(state.clients);
  const members = [
    { id: 'demo-qiao', name: '周乔', role: 'lead', clientIds, projectIds: ['*'], weeklyCapacity: 24, grants: {} },
    { id: 'demo-chen', name: '陈序', role: 'maker', clientIds: [clientIds[0]], projectIds: ['*'], weeklyCapacity: 20, grants: {} },
    { id: 'demo-xu', name: '许宁', role: 'maker', clientIds, projectIds: ['*'], weeklyCapacity: 24, grants: { export: true } },
    { id: 'demo-review', name: '沈言', role: 'reviewer', clientIds, projectIds: ['*'], weeklyCapacity: 30, grants: {} },
    { id: 'demo-admin', name: '顾衡', role: 'admin', clientIds, projectIds: ['*'], weeklyCapacity: 20, grants: {} },
    { id: 'demo-guest', name: '品牌客户', role: 'guest', clientIds: [clientIds[0]], projectIds: [], weeklyCapacity: 0, grants: {} }
  ];
  members.forEach(member => { if (!store.members.some(item => item.id === member.id)) store.members.push({ ...member, active: true, demo: true }); });
  const titles = ['双11上新', '冬季通勤', '常青款口播', '细节补镜', '达人混剪', '活动福利', '质地展示', '新人群测试', '品牌日常', '短漫剧试制'];
  for (let index = 0; index < 10; index++) {
    const clientId = clientIds[index % clientIds.length];
    const producer = clientId === clientIds[0] ? 'demo-chen' : 'demo-xu';
    const project = collabNewCampaign(clientId, `${state.clients[clientId].name.split(' · ')[0]} · ${titles[index]}`, { demo: true, target: 20 + index, dueDate: collabDate(index % 5), leadId: 'demo-qiao', memberIds: ['member-lin', 'demo-qiao', producer, 'demo-xu', 'demo-review'], assignments: { director: 'demo-qiao', producer, editor: 'demo-xu', reviewer: 'demo-review' }, priority: index === 0 ? '加急' : '普通', brief: '示例需求：口播、商品细节与使用场景；按实际方案核对后交付', budgetLimit: 2000 });
    for (let offset = 0; offset < 24; offset++) {
      const productItem = productCatalog.find(item => item.category === (index % 2 ? '美妆个护' : '服饰鞋包')) || productCatalog[0];
      const phase = collabPhases[offset % collabPhases.length];
      const config = { ...defaultConfig(), productId: productItem.id, category: productItem.category, claims: '', factsConfirmed: false, draftId: '' };
      const work = { id: uniqueId('demo-work'), name: `${productItem.sku}_${['口播', '细节', '场景'][offset % 3]}_${String(offset + 1).padStart(2, '0')}`, sku: productItem.sku, format: ['真人口播', '细节演示', '场景穿搭'][offset % 3], campaignId: project.id, assignments: collabCopy(project.assignments), dueDate: project.dueDate, effort: offset % 4 + 1, collabPhase: phase, status: phase, config, shots: [], editVersion: 1, demo: true, blockReason: phase === '待资源补齐' ? '等待商品操作参考' : phase === '需修改' ? '00:03商品外观需核对，保留口播' : '', history: [] };
      state.clients[clientId].projects.push(work);
      if (offset < 4) state.clients[clientId].jobs.push({ id: uniqueId('demo-run'), campaignId: project.id, projectId: work.id, name: `${work.name}_任务1`, sku: work.sku, format: work.format, batch: project.name, reviewer: '沈言', status: '未提交', collabQueueStatus: offset === 0 && index === 0 ? '生成中' : offset === 1 && index === 1 ? '状态未知' : '排队', cost: null, version: 1, config: collabCopy(config), demo: true, comments: [] });
    }
  }
  store.demoLoaded = true;
  collabLog('载入十项目示例', '', '新增10个示例项目、240条作品与40个队列示例；未创建真实生成调用');
  persist(); navigate('projects'); toast('示例已载入，真实素材与记录没有覆盖');
}
function collabDate(days) { return new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }); }
function collabDenied() { return emptyState('当前身份没有此范围的访问权限', '这是本地演示权限；真实产品必须由服务端鉴权', button('返回我的待办', 'nav', '', 'data-view="tasks"')); }
function collabReject() { toast('当前演示身份无此操作权限；数据未修改'); return false; }
function collabGuest() {
  const shared = collabState().campaigns.filter(project=>collabClientAllowed(project.clientId)).flatMap(project=>collabWorks(project).flatMap(work=>(work.deliveries||[]).filter(delivery=>delivery.sharedWith?.includes(collabActor().id)).map(delivery=>({project,delivery}))));
  return `${headline('客户交付查看', '仅显示明确分享给当前客户的固定版本；不展示内部草稿、模型参数或费用')}<div class="collab-local-note">外部身份演示，无真实分享链接与登录</div>${shared.length ? `<section class="card">${shared.map(({ project, delivery }) => `<div class="draft-row"><div class="grow"><strong>${escapeText(delivery.fileName)}</strong><p class="meta">${escapeText(project.name)} · V${delivery.version}</p><video data-file="${escapeText(delivery.fileId)}" controls preload="metadata" playsinline style="width:240px;max-height:320px"></video></div></div>`).join('')}</section>` : emptyState('暂时没有分享的交付版本', '内部“已交付”不会自动公开给客户')}`;
}
function collabPreflight(work) {
  const project = collabCampaign(work.campaignId);
  if (!collabCan('edit', project)) return collabReject();
  if (work.remoteUpdate) { collabConflictDialog(work); return false; }
  return true;
}
function collabConflictDialog(work) {
  const remote = work.remoteUpdate;
  openModal('发现另一份修改（流程演示）', `<p class="small">当前草稿V${work.editVersion}，另一份为V${remote.version}。不会静默覆盖。</p><div class="collab-conflict-columns"><div><h3>你的未保存内容</h3><p>${escapeText(state.config.note || work.shots?.[0]?.speech || '当前草稿')}</p></div><div><h3>${escapeText(collabName(remote.by))}的修改</h3><p>${escapeText(remote.config.note)}</p></div></div><p class="meta mt">这是本地注入的冲突演示，不是实时多人同步。请选择保留副本或读取另一版。</p><div class="row wrap gap8 mt">${button('保存我的副本', 'collab-conflict-copy', 'primary', `data-id="${work.id}"`)}${button('读取另一版', 'collab-conflict-load', '', `data-id="${work.id}"`)}</div>`, true);
}
function collabRouteAllowed(view) {
  const actor = collabActor();
  if (actor.role === 'guest') return ['login', 'projects', 'home', 'deliveries'].includes(view);
  if (['projects', 'tasks', 'project', 'login'].includes(view)) return true;
  if (view === 'runs') return collabCan('edit') || collabCan('manage');
  if (view === 'settings') return collabCan('team') || collabCan('manage');
  if (view === 'data') return collabCan('finance') && collabClientAllowed(state.activeClient);
  if (view === 'batch')return collabCan('edit')&&collabClientAllowed(state.activeClient);
  if (!collabClientAllowed(state.activeClient)) return false;
  const project = collabCampaign(client().projects.find(work => work.id === state.config.draftId)?.campaignId);
  if (['studio', 'quick', 'brief', 'drama'].includes(view)) return collabCan('edit', project);
  if (view === 'result') return collabVisible(project) && (collabCan('edit', project) || collabCan('review', project));
  if (['review'].includes(view)&&!collabCan('review'))return false;
  if (actor.role === 'reviewer' && !['home', 'queue'].includes(view)) return false;
  return true;
}
function collabHeaderMarkup() {
  const store = collabState(); const actor = collabActor();
  const unread = store.notifications.filter(notice => notice.memberId === actor.id && !notice.read && collabNoticeVisible(notice)).length;
  return `${store.demoLoaded ? `<label class="collab-persona">演示身份<select id="collabPersona" class="input" aria-label="切换演示身份">${store.members.filter(member => member.active).map(member => `<option value="${member.id}" ${member.id === actor.id ? 'selected' : ''}>${escapeText(member.name)} · ${collabRoles[member.role].name}</option>`).join('')}</select></label>` : ''}<button class="btn ghost sm" data-action="collab-notifications">我的通知${unread ? ` ${unread}` : ''}</button>`;
}
function collabAfterRender() {
  const actor = collabActor();
  document.querySelector('.topbar>.row:last-child')?.insertAdjacentHTML('afterbegin', collabHeaderMarkup());
  const avatar = document.querySelector('.side-foot .avatar');
  if (avatar) avatar.textContent = actor.name.slice(0, 1);
  const name = document.querySelector('.side-foot h4'); if (name) name.textContent = actor.name;
  const label = document.querySelector('.side-foot .meta'); if (label) label.textContent = collabRoles[actor.role].name;
  if (['home', 'queue'].includes(viewState.view)) {
    document.querySelector('.flow-subnav')?.replaceWith(collabHtmlElement(collabTabs()));
    document.querySelector('.page-head')?.insertAdjacentHTML('afterend', '<div class="collab-local-note">协作数据仅保存在本地；真实团队需要服务端身份、并发控制与共享存储</div>');
  }
  if (['studio', 'quick', 'brief', 'result', 'drama'].includes(viewState.view)) {
    const work = client().projects.find(item => item.id === state.config.draftId);
    const project = collabCampaign(work?.campaignId);
    if (work && project) document.querySelector('.flow-stepbar,.studio-top')?.insertAdjacentHTML('beforebegin', `<div class="collab-editor-context">${button(escapeText(project.name), 'collab-open-project', 'ghost sm', `data-id="${project.id}"`)}<span>当前接力：${collabStages[collabStage(work)]} · ${escapeText(collabName(collabWorkOwner(work)))}</span>${collabCan('manage', project) ? button('分工', 'collab-work-info', 'ghost sm', `data-id="${work.id}"`) : ''}${collabState().demoLoaded && collabCan('edit', project) ? button('保存冲突演示', 'collab-demo-conflict', 'ghost sm', `data-id="${work.id}"`) : ''}</div>`);
    if(work?.deliveries?.length&&collabCan('review',project))document.querySelector('.guard-review-panel')?.insertAdjacentHTML('beforeend',button('分享给演示客户','collab-share-delivery','sm',`data-id="${work.id}"`));
    if(work?.accepted&&!work.demo&&(collabCan('manage',project)||collabCan('edit',project)&&collabWorkOwner(work)===actor.id))document.querySelector('.collab-editor-context')?.insertAdjacentHTML('beforeend',button('移交下一步','collab-handoff','ghost sm',`data-id="${work.id}"`));
  }
  if (!collabCan('review')) document.querySelectorAll('[data-action="guard-review"],[data-action="guard-deliver"],[data-action="guard-save-review"]').forEach(control => { control.disabled = true; control.title = '当前身份不能审核交付'; });
  if (!collabCan('export')) document.querySelectorAll('[data-action="flow-export"],[data-action="export-assets"],[data-action="export-workspace"]').forEach(control => { control.disabled = true; control.title = '没有源素材导出权限'; });
  if (!collabCan('edit')) {
    document.querySelectorAll('.flow-review-bottom [data-action="flow-revise"],[data-action="flow-save-recipe"],[data-action="flowResultUpload"]').forEach(control => { control.disabled = true; });
    document.querySelectorAll('#flowResultUpload').forEach(control => { control.disabled = true; control.closest('.upload').hidden = true; });
    document.querySelector('[data-action="flow-to-brief"]')?.remove();
  }
  if(!collabCan('edit')&&!['projects','project','tasks','settings','login','deliveries'].includes(viewState.view))document.querySelectorAll('input[type="file"]').forEach(input=>{input.disabled=true;input.closest('.upload')?.setAttribute('hidden','');});
  const topSelect = document.getElementById('activeClient');
  if (topSelect) [...topSelect.options].forEach(option => { if (!collabClientAllowed(option.value)) option.remove(); });
  if (topSelect && ['projects', 'tasks', 'runs'].includes(viewState.view)) {
    topSelect.id = 'collabGlobalClient';
    topSelect.setAttribute('aria-label', '跨项目客户范围');
    topSelect.innerHTML = [{ id: 'all', name: '全部授权客户' }, ...collabAccessibleClients().map(id => ({ id, name: state.clients[id].name }))].map(item => `<option value="${item.id}" ${item.id === collabUi.client ? 'selected' : ''}>${escapeText(item.name)}</option>`).join('');
    const label = topSelect.parentElement.querySelector('.small');
    if (label) label.textContent = '范围';
  }
}
function collabHtmlElement(markup) { const container = document.createElement('div'); container.innerHTML = markup; return container.firstElementChild; }
function collabActionCapability(action) {
  if (['guard-deliver', 'guard-review', 'guard-save-review', 'guard-save-adoption', 'approve-job', 'return-job', 'save-job-comment'].includes(action)) return 'review';
  if (['guard-publish-library', 'guard-retire-library', 'guard-restore-library'].includes(action)) return 'publish';
  if (['flow-export', 'export-assets', 'export-workspace', 'deliver-job', 'export-template', 'flow-export-recipe'].includes(action)) return 'export';
  if (['save-supplier', 'save-budget', 'submit-budget'].includes(action)) return 'finance';
  if (['assign-jobs', 'confirm-assign', 'workspace-due', 'workspace-save-due'].includes(action)) return 'manage';
  if (['guard-direct', 'flow-use-recipe', 'flow-edit-shot', 'flow-submit', 'flow-build-brief', 'flow-revise-go', 'flow-save-recipe', 'save-draft', 'config-choice', 'next-stage', 'rebuild-shots', 'workspace-commit-batch', 'create-job', 'guard-save-facts', 'guard-save-refs', 'workspace-pick-resource', 'flow-import', 'reference-one-shot', 'reference-select-plan', 'reference-apply-plan', 'reference-scene-variants'].includes(action)) return 'edit';
  return null;
}

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const work = client().projects.find(item => item.id === state.config.draftId);
  const currentProject = collabCampaign(work?.campaignId);
  if(action==='workspace-open-job'){
    const job=client().jobs.find(item=>item.id===target.dataset.id);
    if(job?.projectId&&collabFindWork(job.projectId)){event.preventDefault();event.stopImmediatePropagation();collabOpenWork(job.projectId);return;}
  }
  if (!action.startsWith('collab-')) {
    const capability = collabActionCapability(action);
    if (capability && !collabCan(capability, currentProject)) { event.preventDefault(); event.stopImmediatePropagation(); collabReject(); }
    return;
  }
  event.preventDefault(); event.stopImmediatePropagation();
  switch (action) {
    case 'collab-new-project': collabProjectForm(); break;
    case 'collab-edit-project': collabProjectForm(target.dataset.id); break;
    case 'collab-project-lifecycle': {
      const project = collabCampaign(target.dataset.id);
      if (!collabCan('manage', project)) return collabReject();
      const counts = collabCounts(project);
      const unfinished = collabWorks(project).filter(work => collabPhase(work) !== '已交付').length;
      const unresolved = state.clients[project.clientId].jobs.filter(job => job.campaignId === project.id && ['排队', '暂停未提交', '生成中', '结果获取', '状态未知'].includes(job.collabQueueStatus)).length;
      const canArchive = !unfinished && !unresolved && (!project.target || counts.delivered >= project.target);
      openModal(project.status === '已归档' ? '恢复交付项目' : '归档交付项目', `<p class="small">${escapeText(project.name)}：${counts.delivered} / ${project.target ?? '未定'}条交付，${unfinished}条未完成作品，${unresolved}条待处理系统任务。</p><p class="meta mt">归档后保留文件、版本与交付，只读查看；有未完成任务或未达到目标时，先完成或调整交付约定，不直接隐藏。</p>${button(project.status === '已归档' ? '确认恢复项目' : '确认归档项目', 'collab-confirm-lifecycle', 'primary mt', `data-id="${project.id}" ${project.status !== '已归档' && !canArchive ? 'disabled' : ''}`)}`);
      break;
    }
    case 'collab-confirm-lifecycle': {
      const project = collabCampaign(target.dataset.id);
      if (!collabCan('manage', project)) return collabReject();
      const counts = collabCounts(project);
      if (project.status !== '已归档' && (collabWorks(project).some(work => collabPhase(work) !== '已交付') || project.target && counts.delivered < project.target || state.clients[project.clientId].jobs.some(job => job.campaignId === project.id && ['排队', '暂停未提交', '生成中', '结果获取', '状态未知'].includes(job.collabQueueStatus)))) return collabReject();
      project.status = project.status === '已归档' ? '进行中' : '已归档';
      collabLog('更新项目生命周期', project.id, project.status + '；历史记录与文件保留');
      persist(); closeModal(); render(); break;
    }
    case 'collab-load-demo': collabDemoLoad(); break;
    case 'collab-open-project': collabOpenProject(target.dataset.id, target.dataset.filter || '全部'); break;
    case 'collab-project-tab': collabUi.tab = target.dataset.value; collabUi.selected.clear(); render(); break;
    case 'collab-reset': collabUi.client = 'all'; collabUi.query = ''; collabUi.projectStatus = '进行中'; collabUi.projectPage = 1; render(); break;
    case 'collab-page': collabUi[{ project: 'projectPage', work: 'workPage', task: 'taskPage', run: 'runPage' }[target.dataset.kind]] += Number(target.dataset.direction); render(); break;
    case 'collab-run-detail': collabRunDialog(target.dataset.id); break;
    case 'collab-open-scheduling': collabUi.teamTab = '调度计划'; navigate('settings'); break;
    case 'collab-project-create': {
      const project = collabCampaign(target.dataset.id);
      if (!collabCan('edit', project)) return collabReject();
      collabOpenProject(project.id); guardDirectStart(); break;
    }
    case 'collab-open-work': collabOpenWork(target.dataset.id); break;
    case 'collab-work-info': { const found = collabFindWork(target.dataset.id); if (found && collabVisible(found.project)) collabWorkDialog(found); break; }
    case 'collab-handoff': collabHandoffDialog(target.dataset.id); break;
    case 'collab-confirm-handoff': {
      const found = collabFindWork(target.dataset.id);
      if (!found || !found.work.accepted || !(collabCan('manage', found.project) || collabCan('edit', found.project) && collabWorkOwner(found.work) === collabActor().id)) return collabReject();
      const step = document.getElementById('collabHandoffStep').value;
      const note = document.getElementById('collabHandoffNote').value.trim();
      if ((!found.work.result && !note) || (step === '提交审片' && !found.work.result)) { document.getElementById('collabHandoffError').textContent = '未回传成片时补充素材说明；审片必须有实际成片'; break; }
      const stage = step === '提交审片' ? 'reviewer' : 'editor';
      const member = collabState().members.find(item => item.id === found.work.assignments[stage]);
      if (!member || !collabCan(stage === 'reviewer' ? 'review' : 'edit', found.project, member)) { document.getElementById('collabHandoffError').textContent = '接收成员没有对应制作/审核范围，请先调整项目分工或授权'; break; }
      found.work.stageOverride = step === '提交审片' ? '待审片' : '待剪辑';
      found.work.handoffNote = note;
      found.work.blockReason = note;
      collabLog('移交人员接力', found.project.id, `${found.work.name} → ${member.name}；${step}`);
      collabNotify(member.id, found.project.id, `${found.work.name}：${step} ${note}`, found.work.id);
      persist(); closeModal(); render(); toast('已移交下一步，方案、文件和产单数量保持不变'); break;
    }
    case 'collab-clear-selection': collabUi.selected.clear(); render(); break;
    case 'collab-select-filtered':
      collabWorks(collabCampaign(collabUi.projectId)).filter(work => (collabUi.workFilter === '全部' || collabUi.workFilter === '需处理' && ['需修改', '待资源补齐'].includes(collabPhase(work)) || collabPhase(work) === collabUi.workFilter) && `${work.name} ${work.sku}`.toLowerCase().includes(collabUi.workQuery.toLowerCase())).forEach(work => collabUi.selected.add(work.id));
      render(); break;
    case 'collab-bulk': collabBulkDialog(); break;
    case 'collab-commit-bulk': {
      const project = collabCampaign(collabUi.projectId); if (!collabCan('manage', project)) return collabReject();
      const stage = document.getElementById('collabBulkStage').value; const ownerId = document.getElementById('collabBulkOwner').value; const date = document.getElementById('collabBulkDue').value;
      const member = collabState().members.find(item => item.id === ownerId);
      if (!collabVisible(project, member)) return collabReject();
      const selected = collabWorks(project).filter(item => collabUi.selected.has(item.id));
      selected.forEach(item => { item.assignments[stage] = ownerId; if (date) item.dueDate = date; });
      collabLog('批量调整分工与截止', project.id, `${selected.length}条；${collabStages[stage]}交给${member.name}`);
      collabNotify(ownerId, project.id, `${project.name}：${selected.length}条${collabStages[stage]}任务已分配`);
      persist(); closeModal(); render(); toast('分工已更新，未提交模型任务'); break;
    }
    case 'collab-save-work-assignees': {
      const found = collabFindWork(target.dataset.id); if (!found || !collabCan('manage', found.project)) return collabReject();
      found.work.assignments = Object.fromEntries(Object.keys(collabStages).map(stage => [stage, document.getElementById(`collabWork-${stage}`).value]));
      collabLog('调整作品分工', found.project.id, found.work.name); collabNotify(collabWorkOwner(found.work), found.project.id, `${found.work.name}已分配给你`, found.work.id);
      persist(); closeModal(); render(); break;
    }
    case 'collab-save-work-phase': {
      const found = collabFindWork(target.dataset.id);
      if (!found || !found.work.demo || !(collabCan('manage', found.project) || collabWorkOwner(found.work) === collabActor().id && (collabCan('edit', found.project) || collabCan('review', found.project)))) return collabReject();
      if(['等待系统','状态待核对','排队已暂停'].includes(collabPhase(found.work)))return collabReject();
      const phase = document.getElementById('collabNextPhase').value; const note = document.getElementById('collabWorkNote').value.trim();
      if (['需修改', '待资源补齐'].includes(phase) && !note) { toast('请写明时间码、原因和保留内容'); return; }
      if (phase === '已交付' && !collabCan('review', found.project)) { toast('交付需要审核权限，即使是演示也不直接越级'); return; }
      if(collabActor().role==='reviewer'&&!['待审片','需修改','已交付'].includes(phase))return collabReject();
      found.work.collabPhase = phase; found.work.returnStage = document.getElementById('collabReturnStage').value; found.work.blockReason = note;
      collabLog('示例接力状态变化', found.project.id, `${found.work.name} → ${phase}`); collabNotify(collabWorkOwner(found.work), found.project.id, `${found.work.name}：${phase}`, found.work.id);
      persist(); closeModal(); render(); break;
    }
    case 'collab-team-tab': collabUi.teamTab = target.dataset.value; render(); break;
    case 'collab-add-member': collabMemberForm(); break;
    case 'collab-edit-member': collabMemberForm(target.dataset.id); break;
    case 'collab-disable-member': {
      if (!collabCan('team')) return collabReject();
      const member = collabState().members.find(item => item.id === target.dataset.id); if (!member || member.role === 'owner') return collabReject();
      openModal('确认停用并移交',`<p class="small">${escapeText(member.name)}将不能继续使用演示身份；未完成分工移交企业所有者，历史作者与成片保留。</p><p class="meta mt">没有真实会话、API或外部链接可撤销；生产版需服务端执行。</p>${button('确认停用并移交','collab-confirm-disable','primary mt',`data-id="${member.id}"`)}`);break;
    }
    case 'collab-confirm-disable':{
      if(!collabCan('team'))return collabReject();
      const member=collabState().members.find(item=>item.id===target.dataset.id);if(!member||member.role==='owner')return collabReject();
      const owner = collabState().members.find(item => item.role === 'owner' && item.active);
      collabState().campaigns.forEach(project => {
        if (project.leadId === member.id) project.leadId = owner.id;
        project.memberIds = project.memberIds.filter(id => id !== member.id);
        for (const stage of Object.keys(collabStages)) if (project.assignments[stage] === member.id) project.assignments[stage] = owner.id;
        collabWorks(project).forEach(item => { for (const stage of Object.keys(collabStages)) if (item.assignments?.[stage] === member.id) item.assignments[stage] = owner.id; });
      });
      member.active = false;
      for(const project of collabState().campaigns)for(const work of collabWorks(project))for(const delivery of work.deliveries||[])delivery.sharedWith=(delivery.sharedWith||[]).filter(id=>id!==member.id);
      collabLog('停用演示成员并移交', '', `${member.name}任务移交${owner.name}，历史作者保留；没有真实会话可撤销`);
      persist(); closeModal(); render(); break;
    }
    case 'collab-person-work': {
      const rows = collabWorkRows().filter(row => collabWorkOwner(row.work) === target.dataset.id && collabPhase(row.work) !== '已交付');
      openModal('人员分配详情', rows.length ? `<div class="stack">${rows.slice(0, 60).map(({ project, work }) => `<div class="draft-row"><div class="grow"><strong>${escapeText(work.name)}</strong><p class="meta">${escapeText(project.name)} · ${collabPhase(work)}</p></div>${button('查看', 'collab-open-work', 'sm', `data-id="${work.id}"`)}</div>`).join('')}</div>` : '<p class="meta">暂无分配</p>', true); break;
    }
    case 'collab-save-limits':
      if (!collabCan('team')) return collabReject();
      collabState().limits.parallel = Number(document.getElementById('collabParallel').value); collabUi.schedulePreview = null; persist(); render(); toast('并发计划已保存，未改变真实上游'); break;
    case 'collab-plan-slots': collabUi.schedulePreview = collabPlanSlots(); render(); break;
    case 'collab-pause-project': {
      const project = collabCampaign(target.dataset.id); if (!collabCan('manage', project)) return collabReject();
      project.paused = !project.paused;
      for (const job of state.clients[project.clientId].jobs.filter(item => item.campaignId === project.id && item.demo)) {
        if (project.paused && job.collabQueueStatus === '排队') job.collabQueueStatus = '暂停未提交';
        if (!project.paused && job.collabQueueStatus === '暂停未提交') job.collabQueueStatus = '排队';
      }
      collabUi.schedulePreview = null; collabLog('调整调度计划', project.id, project.paused ? '暂停未提交，不取消已运行任务' : '恢复未提交任务');
      persist(); render(); break;
    }
    case 'collab-notifications': {
      const notices = collabState().notifications.filter(notice => notice.memberId === collabActor().id && collabNoticeVisible(notice));
      openModal('我的通知', notices.length ? `<div class="stack">${notices.slice(0, 40).map(notice => `<div class="draft-row"><div class="grow"><strong>${escapeText(notice.message)}</strong><p class="meta">${notice.read ? '已读' : '未读'} · ${escapeText(new Date(notice.at).toLocaleString('zh-CN'))}</p></div>${notice.read ? '' : button('标为已读', 'feature-notice-read', 'ghost sm', `data-id="${notice.id}"`)}${notice.campaignId ? button('查看项目', 'collab-open-project', 'sm', `data-id="${notice.campaignId}"`) : button('查看素材', 'nav', 'sm', 'data-view="labels"')}</div>`).join('')}</div>${button('全部标为已读', 'collab-read-notices', 'mt')}` : '<p class="meta">暂无需要你处理的通知</p>', true); break;
    }
    case 'collab-read-notices': collabState().notifications.filter(notice => notice.memberId === collabActor().id).forEach(notice => { notice.read = true; }); persist(); closeModal(); render(); break;
    case 'collab-demo-conflict': {
      const found = collabFindWork(target.dataset.id); if (!found || !collabCan('edit', found.project)) return collabReject();
      found.work.remoteUpdate = { config: { ...collabCopy(found.work.config), note: '另一位编导：保留近景，删去夸张开场（演示）' }, shots: collabCopy(found.work.shots || []), version: (found.work.editVersion || 1) + 1, by: 'demo-qiao' };
      persist();collabConflictDialog(found.work); break;
    }
    case 'collab-conflict-copy':
    case 'collab-conflict-load': {
      const found = collabFindWork(target.dataset.id); if (!found?.work.remoteUpdate || !collabCan('edit', found.project)) return collabReject();
      const work = found.work; const remote = work.remoteUpdate;
      let copy = null;
      if (action === 'collab-conflict-copy') {
        copy = { ...collabCopy(work), id: uniqueId('work'), name: work.name + ' · 我的副本', config: collabCopy(state.config), remoteUpdate: null, accepted: null, result: null, jobId: null, deliveries: [], editVersion: 1 };
        copy.config.draftId = copy.id; client().projects.unshift(copy);
      }
      work.history ||= []; work.history.unshift({ id: uniqueId('version'), label: '合并冲突前备份（演示）', time: new Date().toISOString(), config: collabCopy(work.config), shots: collabCopy(work.shots || []), accepted: collabCopy(work.accepted || null), drama: collabCopy(work.drama || null), result: collabCopy(work.result || null) });
      work.config = remote.config; work.shots = remote.shots; work.editVersion = remote.version; work.remoteUpdate = null; work.planChanged = true;
      if (work.result) work.result.outdated = true;
      state.config = { ...defaultConfig(), ...collabCopy((copy || work).config), draftId: (copy || work).id };
      collabLog('解决保存冲突（演示）',found.project.id,copy?'另存我的副本，不覆盖另一版':'读取另一版，原稿保留快照');
      persist(); closeModal(); render(); toast(copy ? '你的修改保留为副本，另一版也保留' : '已读取另一版，旧稿仍有备份'); break;
    }
    case 'collab-share-delivery':{
      const found=collabFindWork(target.dataset.id);if(!found||!collabCan('review',found.project))return collabReject();
      const delivery=found.work.deliveries?.[0];if(!delivery)return;
      const guests=collabState().members.filter(member=>member.role==='guest'&&collabClientAllowed(found.clientId,member));
      openModal('分享固定交付版本（演示）',`<p class="small">${escapeText(delivery.fileName)} · V${delivery.version}。只授权该交付版本，不分享内部草稿、Prompt和费用。</p>${guests.length?selectorField('演示客户','collabShareGuest',guests.map(member=>({id:member.id,name:member.name})),guests[0].id)+button('确认分享此版本','collab-confirm-share','primary full mt',`data-id="${found.work.id}"`):'<p class="meta mt">没有该客户范围内的外部成员，先由管理员添加演示身份</p>'}${delivery.sharedWith?.length?button('撤销本版外部分享','collab-revoke-share','full mt',`data-id="${found.work.id}"`):''}`);break;
    }
    case 'collab-confirm-share':{
      const found=collabFindWork(target.dataset.id);if(!found||!collabCan('review',found.project))return collabReject();
      const member=collabState().members.find(item=>item.id===document.getElementById('collabShareGuest').value);
      if(!member||member.role!=='guest'||!collabClientAllowed(found.clientId,member))return collabReject();
      const delivery=found.work.deliveries[0];delivery.sharedWith=[...new Set([...(delivery.sharedWith||[]),member.id])];
      collabLog('分享固定交付版本（演示）',found.project.id,`${delivery.id} → ${member.name}`);persist();closeModal();render();break;
    }
    case 'collab-revoke-share':{
      const found=collabFindWork(target.dataset.id);if(!found||!collabCan('review',found.project))return collabReject();
      found.work.deliveries[0].sharedWith=[];collabLog('撤销交付分享（演示）',found.project.id,found.work.deliveries[0].id);persist();closeModal();render();break;
    }
  }
}, true);
document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'collabPersona') {
    event.stopImmediatePropagation();
    const next = collabState().members.find(member => member.id === target.value && member.active);
    if (!next) return;
    if (collabCan('edit')) saveDraftIfNeeded();
    collabState().actorId = next.id;
    const firstClient = collabAccessibleClients()[0];
    if (firstClient) state.activeClient = firstClient;
    state.config = defaultConfig(); collabUi.selected.clear(); viewState.selectedJobs.clear(); viewState.selectedAssets.clear(); collabUi.taskScope = '我的待办'; workspaceUi.resourceReturn = null; collabUi.client = 'all'; collabUi.stage = '全部阶段'; collabUi.taskQuery = ''; collabUi.runQuery = ''; collabUi.runStatus = '全部状态';
    persist(); navigate(['owner', 'admin', 'lead'].includes(next.role) ? 'projects' : next.role === 'guest' ? 'deliveries' : 'tasks'); return;
  }
  if(target.id==='collabMemberRole')document.querySelectorAll('#collabMemberForm input[name="grants"]').forEach(input=>{input.checked=Boolean(collabRoles[target.value][input.value]);});
  const fields = { collabClientFilter: 'client', collabGlobalClient: 'client', collabProjectStatus: 'projectStatus', collabWorkFilter: 'workFilter', collabTaskScope: 'taskScope', collabTaskStage: 'stage', collabRunStatus: 'runStatus' };
  if (fields[target.id]) { collabUi[fields[target.id]] = target.value; collabUi.projectPage = 1; collabUi.taskPage = 1; collabUi.workPage = 1; collabUi.selected.clear(); render(); return; }
  if (target.dataset.collabSelect) { target.checked ? collabUi.selected.add(target.dataset.collabSelect) : collabUi.selected.delete(target.dataset.collabSelect); render(); }
  if (target.id === 'collabSelectPage') {
    document.querySelectorAll('[data-collab-select]').forEach(input => { target.checked ? collabUi.selected.add(input.dataset.collabSelect) : collabUi.selected.delete(input.dataset.collabSelect); }); render();
  }
}, true);
document.addEventListener('input', event => {
  const fields = { collabProjectQuery: 'query', collabWorkQuery: 'workQuery', collabTaskQuery: 'taskQuery', collabRunQuery: 'runQuery' };
  const target = event.target;
  if (fields[target.id]) {
    const position = target.selectionStart;
    collabUi[fields[target.id]] = target.value; collabUi.workPage = 1; collabUi.taskPage = 1; collabUi.projectPage = 1; collabUi.runPage = 1; collabUi.selected.clear(); render();
    const replacement = document.getElementById(target.id); replacement.focus(); replacement.setSelectionRange(position, position);
  }
});
