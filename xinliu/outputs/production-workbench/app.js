'use strict';

const STORE_KEY = 'commerce-production-v3';
const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const viewState = { stage: 0, assetType: '全部', assetQuery: '', modelGender: '全部', modelStyle: '全部', modelQuery: '', wardrobeSlot: '全部', queueFilter: '全部', selectedJobs: new Set(), selectedAssets: new Set(), tablePage: 1, referenceFrame: 0, referenceTab: '镜头', activeShot: 0, isPlaying: false, picker: false, modal: null, renderBusy: false };
const symbols = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  rows: '<path d="M4 5h16M4 12h16M4 19h16M7 4v2M7 11v2M7 18v2"/>',
  folder: '<path d="M3 7V5h7l2 2h9v13H3z"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
  shirt: '<path d="m8 4 4 3 4-3 6 5-4 4-2-2v10H8V11l-2 2-4-4z"/>',
  sound: '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1zm0 0v15"/>',
  chart: '<path d="M4 3v18h17M8 17v-5M13 17V8M18 17V4"/>',
  shield: '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 15v6h16v-6"/>',
  play: '<path d="m8 5 11 7-11 7V5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  arrow: '<path d="M4 12h16m-5-5 5 5-5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  settings: '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="10" cy="18" r="2" fill="white"/>',
  download: '<path d="M12 3v13m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 14h8M8 17h6"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${symbols[name] || symbols.film}</svg>`;
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const uniqueId = prefix => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const button = (label, action, style = '', attributes = '') => `<button class="btn ${style}" data-action="${action}" ${attributes}>${label}</button>`;
const badge = (label, style = '') => `<span class="badge ${style}">${escapeText(label)}</span>`;
const headline = (title, subtitle, controls = '') => `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="row wrap gap8">${controls}</div></div>`;
const emptyState = (title, description, controls = '') => `<div class="card empty">${icon('folder')}<h2>${title}</h2><p>${description}</p><div class="row wrap gap8">${controls}</div></div>`;
const titleMarkup = () => `<a href="#home" class="brandmark">${icon('film')}<span>心流<small>电商内容生产</small></span></a>`;

const categories = {
  '服饰鞋包': { formats: ['真人口播', '上身试穿', '场景穿搭', '细节演示', '多款混剪', '直播切片', '参考片改编', '剧情种草', '商品转台'], claims: ['版型', '上身效果', '面料细节', '搭配场景', '尺码与体型'], evidence: ['正侧背展示', '面料近景', '活动动作', '真实试穿素材'], style: '上身试穿', model: 'lin', product: 'coat' },
  '美妆个护': { formats: ['真人口播', '手部试用', '质地特写', '日常种草', '使用教程', '开箱测评', '成分讲解', '直播切片', '参考片改编'], claims: ['质地', '使用步骤', '适用肤质', '规格', '经确认功效'], evidence: ['质地特写', '涂抹动作', '真实使用记录', '品牌检测资料'], style: '手部试用', model: 'lin', product: 'cream' },
  '食品饮料': { formats: ['开袋试吃', '制作过程', '场景种草', '真人口播', '口感近景', '组合陈列', '囤货推荐', '直播切片', '参考片改编'], claims: ['口感', '规格', '食用方法', '配料信息', '分享场景'], evidence: ['实拍食用素材', '包装配料', '真实制作步骤'], style: '开袋试吃', model: 'zhou', product: 'food' },
  '家居百货': { formats: ['痛点演示', '前后场景', '安装教程', '真人口播', '收纳整理', '细节测评', '开箱测评', '直播切片', '参考片改编'], claims: ['具体用法', '尺寸', '空间适配', '材质', '结构细节'], evidence: ['实际操作视频', '尺寸标尺', '收纳过程', '商品状态图'], style: '痛点演示', model: 'zhou', product: 'home' },
  '3C数码': { formats: ['使用教程', '功能实测', '开箱测评', '操作特写', '真人口播', '场景体验', '参数讲解', '直播切片', '参考片改编'], claims: ['参数', '接口', '操作步骤', '开关状态', '使用场景'], evidence: ['真实屏幕录制', '开关状态图', '功能实拍', '品牌参数表'], style: '使用教程', model: 'zhou', product: 'digital' },
  '宠物用品': { formats: ['养宠日常', '使用演示', '真人口播', '开袋试吃', '商品陈列', '规格讲解', '促销福利', '直播切片', '参考片改编'], claims: ['规格', '配方信息', '适用宠物', '用法', '加赠活动'], evidence: ['真实宠物素材', '品牌配料表', '包装细节', '活动资料'], style: '养宠日常', model: 'lin', product: 'pet' },
  '信息流漫剧': { formats: ['对话冲突', '生活反转', '轻喜剧', '家庭场景', '悬念开场', '情绪故事', '连载卡点', '产品植入', '参考片改编'], claims: ['人物关系', '商品植入时点', '冲突', '反转', '行动落点'], evidence: ['角色设定', '故事简述', '场景参考', '商品事实'], style: '对话冲突', model: 'lin', product: 'coat' }
};
const hooks = ['痛点直给', '利益点先说', '反问开场', '实物先展示', '结果先看', '生活小冲突', '使用步骤', '原片节奏'];
const scenes = ['居家窗边', '办公室', '地铁通勤', '门店货架', '桌面操作', '户外日常', '厨房餐桌', '纯色背景'];
const cameraStyles = ['手机实拍感', '固定机位', '手持近景', '商品特写', '自然跟拍', '棚拍展示'];
const contentStyles = ['日常聊天', '直接卖点', '轻松种草', '促销播报', '教程讲解', '品牌克制'];
const productCatalog = [
  { id: 'coat', name: '轻羽通勤外套', sku: 'QY-032', category: '服饰鞋包', image: 'media/fashion.jpg', price: '', claims: '版型与上身展示；性能以客户确认资料为准' },
  { id: 'tee', name: '轻羽基础白T', sku: 'QY-118', category: '服饰鞋包', image: 'media/shirt.jpg', price: '', claims: '领口、版型、颜色；面料成分待确认' },
  { id: 'shoes', name: '城市轻跑鞋', sku: 'QY-205', category: '服饰鞋包', image: 'media/shoe.jpg', price: '', claims: '鞋型与搭配场景；缓震参数待确认' },
  { id: 'cream', name: '露米护肤系列', sku: 'LM-101', category: '美妆个护', image: 'media/beauty.jpg', price: '', claims: '包装、质地、使用步骤；品牌功效待确认' },
  { id: 'food', name: '食品包装示例', sku: 'DEMO-FD', category: '食品饮料', image: 'media/food-preview.svg', illustration: true, claims: '原创示意，仅用于页面体验', authority: '原创示意，不作为商品事实' },
  { id: 'home', name: '家居收纳示例', sku: 'DEMO-HM', category: '家居百货', image: 'media/home-preview.svg', illustration: true, claims: '原创示意，仅用于页面体验', authority: '原创示意，不作为商品事实' },
  { id: 'digital', name: '数码设备示例', sku: 'DEMO-3C', category: '3C数码', image: 'media/digital-preview.svg', illustration: true, claims: '原创示意，仅用于页面体验', authority: '原创示意，不作为商品事实' },
  { id: 'pet', name: '宠物食品示例', sku: 'DEMO-PT', category: '宠物用品', image: 'media/pet-preview.svg', illustration: true, claims: '原创示意，仅用于页面体验', authority: '原创示意，不作为商品事实' }
];
const modelsCatalog = [
  { id: 'lin', name: '林予 · 日常口播', gender: '女', age: '未标注', style: '自然亲和', scenes: ['服饰', '美妆', '种草'], image: 'media/model-lin-neutral.jpg', source: '演示图片', authority: '仅用于界面示例', scope: 'demo' },
  { id: 'zhou', name: '周言 · 生活讲解', gender: '男', age: '25–35', style: '干净利落', scenes: ['家居', '数码', '教程'], image: 'media/model-zhou.jpg', source: '演示图片', authority: '仅用于界面示例', scope: 'demo' },
  { id: 'daily', name: '日常穿搭 · 全身', gender: '女', age: '未标注', style: '日常穿搭', scenes: ['服饰', '场景'], image: 'media/fashion.jpg', source: '演示图片', authority: '仅用于界面示例', scope: 'demo' }
];
const garmentsCatalog = [
  { id: 'outfit-demo', name: '通勤搭配参考', slot: '搭配参考', image: 'media/outfit.jpg', authority: '演示素材' },
  { id: 'tee-demo', name: '白色基础T', slot: '上衣', image: 'media/shirt.jpg', authority: '演示素材' },
  { id: 'shoe-demo', name: '运动鞋参考', slot: '鞋履', image: 'media/shoe.jpg', authority: '演示素材' },
  { id: 'fashion-demo', name: '外套造型参考', slot: '外套', image: 'media/fashion.jpg', authority: '演示素材' }
];
const voicesCatalog = [
  { id: 'friendly', name: '亲和日常女声', gender: '女', style: '日常聊天', locale: '普通话', demoText: '这件外套我平时上班也会穿，先看一下上身的样子。' },
  { id: 'direct', name: '直接卖点女声', gender: '女', style: '促销播报', locale: '普通话', demoText: '先看商品细节，再看这个版型，活动信息以店铺页面为准。' },
  { id: 'explain', name: '清晰讲解男声', gender: '男', style: '教程讲解', locale: '普通话', demoText: '先把商品拿出来，按照说明完成这个操作，使用步骤要看清。' },
  { id: 'own', name: '上传真人口播', gender: '自定义', style: '原声保留', locale: '原音频', demoText: '' }
];

function freshClient(name) {
  return { name, assets: [], models: [], garments: [], looks: [], voices: [], projects: [], jobs: [], templates: [], preferences: [], facts: {}, metrics: [], reference: null, budget: 500, ledger: [], connected: false, demo: false };
}
function defaultConfig() {
  return { category: '服饰鞋包', format: '上身试穿', productId: 'coat', modelId: 'lin', lookId: '', voiceId: 'friendly', mode: '共同编导', hook: '痛点直给', scene: '居家窗边', camera: '手机实拍感', style: '日常聊天', cta: '查看商品详情', subtitle: '白字黑描边', flower: '卖点黄字', music: '无配乐', speed: 1.1, shotsCount: 5, duration: 15, platform: '抖音', intent: '信息流测试', pipeline: 'AI补镜头 + 后期组装', claimFocus: '版型', evidence: '正侧背展示', assets: [], claims: '展示版型、穿搭与日常使用场景；未确认的性能不作承诺', factsConfirmed: false, price: '', note: '', draftId: '', naming: '{SKU}_{拍法}_{开场}_V{版本}' };
}
let state;
try { state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { state = null; }
if (!state || !state.clients) state = { activeClient: 'qingyu', clients: { qingyu: freshClient('轻羽 · 服饰内容组'), lumi: freshClient('露米 · 美妆内容组') }, signedIn: false, dense: false, config: defaultConfig() };
const client = () => state.clients[state.activeClient];
const getModels = () => [...modelsCatalog, ...client().models];
const getGarments = () => [...garmentsCatalog, ...client().garments];
const getVoices = () => [...voicesCatalog.filter(item => item.id !== 'own'), ...client().voices];
const product = () => productCatalog.find(item => item.id === state.config.productId) || client().assets.find(item => item.id === state.config.productId) || { name: state.config.category + '商品', sku: '未填SKU', image: '', category: state.config.category };
const selectedModel = () => getModels().find(item => item.id === state.config.modelId);
const selectedLook = () => client().looks.find(item => item.id === state.config.lookId);
const selectedVoice = () => getVoices().find(item => item.id === state.config.voiceId);
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { toast('浏览器存储空间不足，请导出工作空间后减少数据'); }
}
function toast(message) {
  const target = document.getElementById('toast');
  target.textContent = message;
  target.className = 'toast visible';
  clearTimeout(viewState.toastTimer);
  viewState.toastTimer = setTimeout(() => target.classList.remove('visible'), 2800);
}

const mediaDatabase = new Promise(resolve => {
  try {
    const request = indexedDB.open('commerce-production-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  } catch { resolve(null); }
});
const fileUrls = {};
async function keepFile(file, scope = state.activeClient) {
  const database = await mediaDatabase;
  if (!database) throw new Error('当前浏览器不支持文件保存');
  const fileId = scope + ':' + uniqueId('file');
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('files', 'readwrite');
    transaction.objectStore('files').put(file, fileId);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  fileUrls[fileId] = URL.createObjectURL(file);
  return fileId;
}
async function readFile(fileId) {
  const database = await mediaDatabase;
  if (!database || !fileId) return null;
  return new Promise(resolve => {
    const request = database.transaction('files').objectStore('files').get(fileId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}
async function fileUrl(fileId) {
  if (fileUrls[fileId]) return fileUrls[fileId];
  const file = await readFile(fileId);
  if (file) fileUrls[fileId] = URL.createObjectURL(file);
  return fileUrls[fileId] || '';
}
function imageMarkup(item, className = '', alt = '') {
  if (item?.kind === '视频' && item?.fileId) return `<video class="${className}" data-file="${item.fileId}" muted preload="metadata" playsinline aria-label="${escapeText(alt || item.name || '视频素材')}"></video>`;
  if (item?.kind === '音频') return `<div class="placeholder-media ${className}">${icon('sound')}<span>${escapeText(item.name || '音频素材')}</span></div>`;
  if (item?.image || item?.fileId) return `<img class="${className}" ${item.fileId ? `data-file="${item.fileId}"` : `src="${escapeText(item.image)}"`} alt="${escapeText(alt || item.name || '示例素材')}" loading="lazy">`;
  return `<div class="placeholder-media ${className}">${icon('folder')}<span>上传素材后预览</span></div>`;
}
async function hydrateFiles() {
  await Promise.all([...document.querySelectorAll('[data-file]')].map(async element => {
    const src = await fileUrl(element.dataset.file);
    if (src && element.isConnected) element.src = src;
  }));
}
function uploadZone(id, accept, title, description, multiple = true) {
  return `<label class="upload" data-drop="${id}">${icon('upload')}<strong>${title}</strong><small>${description}</small><input id="${id}" type="file" accept="${accept}" ${multiple ? 'multiple' : ''}></label>`;
}
function downloadText(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function loadDemo() {
  if (client().demo || client().projects.length) { toast('当前客户已有工作记录，示例不会覆盖'); return; }
  const current = client();
  current.demo = true;
  current.assets = productCatalog.filter(item => item.category === (state.activeClient === 'lumi' ? '美妆个护' : '服饰鞋包')).map(item => ({ ...item, kind: '图片', tag: '商品图', source: 'Unsplash 界面示例', authority: '仅用于界面示例', uploaded: '2026-11-09', size: '示例', scope: state.activeClient }));
  current.projects = [{ id: 'demo-a', name: '轻羽11月 · 试穿素材', sku: 'QY-032', format: '上身试穿', batch: '秋冬上新第一批', owner: '林川', status: '脚本待确认', day: '11-09', config: { ...defaultConfig(), factsConfirmed: true } }, { id: 'demo-b', name: '基础白T · 口播+细节', sku: 'QY-118', format: '真人口播', batch: '常青款日常测试', owner: '周乔', status: '待制作', day: '11-09', config: { ...defaultConfig(), productId: 'tee', format: '真人口播' } }, { id: 'demo-c', name: '轻跑鞋 · 场景种草', sku: 'QY-205', format: '场景穿搭', batch: '秋冬上新第一批', owner: '林川', status: '已归档', day: '11-08', config: { ...defaultConfig(), productId: 'shoes', factsConfirmed: true } }];
  current.jobs = Array.from({ length: 36 }, (_, index) => ({ id: 'demo-j-' + index, name: `QY-${index % 3 === 0 ? '032' : index % 3 === 1 ? '118' : '205'}_${['试穿', '口播', '细节'][index % 3]}_${['痛点', '利益点', '场景'][index % 3]}_V${Math.floor(index / 9) + 1}`, sku: ['QY-032', 'QY-118', 'QY-205'][index % 3], batch: index < 18 ? '秋冬上新第一批' : '常青款日常测试', format: ['上身试穿', '真人口播', '细节演示'][index % 3], model: index % 2 ? '林予' : '周言', voice: index % 2 ? '亲和女声' : '讲解男声', status: ['待脚本确认', '待资源确认', '未提交', '待审片', '已归档', '需重做'][index % 6], cost: 90, version: Math.floor(index / 9) + 1, demo: true, config: { ...defaultConfig(), productId: ['coat', 'tee', 'shoes'][index % 3], factsConfirmed: true }, reviewer: ['林川', '周乔'][index % 2], comments: [] }));
  current.preferences = [{ id: 'pref-demo', name: '固定机位口播 + 商品近景', detail: '示例客户确认的常用拍法，适用于常青款测试', config: { ...defaultConfig(), format: '真人口播', camera: '固定机位', factsConfirmed: true }, enabled: true }];
  current.templates = [{ id: 'template-a', name: '服饰试穿 · 15秒日常', category: '服饰鞋包', config: { ...defaultConfig(), factsConfirmed: true } }];
  current.metrics = [{ name: 'QY-032_试穿_痛点_V1', sku: 'QY-032', spend: 1350, impressions: 55000, clicks: 1760, orders: 36, revenue: 8964 }, { name: 'QY-118_口播_利益点_V1', sku: 'QY-118', spend: 850, impressions: 42000, clicks: 1150, orders: 25, revenue: 3975 }, { name: 'QY-205_细节_场景_V1', sku: 'QY-205', spend: 1020, impressions: 37000, clicks: 962, orders: 17, revenue: 5593 }];
  current.dataSource = '界面示例报表';
  state.config = { ...defaultConfig(), draftId: 'demo-a' };
  viewState.stage = 2;
  persist();
  render();
  toast('已载入演示客户；任务、图片和数据均有示例标记');
}

const navigation = [['home', 'home', '内容组工作台'], ['studio', 'film', '做一条素材'], ['batch', 'rows', '批量排产'], ['queue', 'clock', '产单与队列'], ['review', 'shield', '审片与交付'], ['assets', 'folder', '商品与素材'], ['models', 'people', '模特库'], ['wardrobe', 'shirt', '服装与搭配'], ['voices', 'sound', '音色与口播'], ['reference', 'film', '参考片拆解'], ['preferences', 'book', '客户预设'], ['data', 'chart', '素材投放数据'], ['settings', 'settings', '接口与费用']];
function shell(view, body) {
  return `<aside class="sidebar">${titleMarkup()}<div class="workspace"><span class="meta">曜石电商 / 内容组</span><br><strong>编导 · 拍摄 · 剪辑</strong></div>${navigation.map((nav, index) => `${index === 0 ? '<div class="navlabel">生产</div>' : index === 5 ? '<div class="navlabel">素材与拍摄资源</div>' : index === 10 ? '<div class="navlabel">客户与管理</div>' : ''}<button class="navbutton ${view === nav[0] ? 'active' : ''}" data-action="nav" data-view="${nav[0]}" title="${nav[2]}">${icon(nav[1])}<span>${nav[2]}</span>${nav[0] === 'queue' && client().jobs.length ? `<span class="navnum">${client().jobs.length}</span>` : ''}</button>`).join('')}<div class="side-foot"><div class="row"><span class="avatar">林</span><div class="user-copy grow"><h4>林川</h4><span class="meta">内容负责人</span></div>${button(icon('arrow'), 'logout', 'ghost', 'aria-label="退出"')}</div></div></aside><div class="shell ${state.dense ? 'dense' : ''}"><header class="topbar"><div class="row gap8"><span class="small">客户</span><select id="activeClient" class="input" aria-label="当前客户">${Object.entries(state.clients).map(([id, item]) => `<option value="${id}" ${id === state.activeClient ? 'selected' : ''}>${escapeText(item.name)}</option>`).join('')}</select><span class="meta">独立资源与预设</span></div><div class="row gap8">${badge('本地功能版', 'outline')}${button('能力状态', 'capability-report', 'ghost')}${button('创建产单 ' + icon('plus'), 'new-project', 'primary')}</div></header><main class="page">${body}</main></div>`;
}
function statsMarkup(items) {
  return `<div class="stats">${items.map(item => `<div class="stat"><span>${item[0]}</span><strong>${item[1]}</strong><p>${item[2]}</p></div>`).join('')}</div>`;
}
function loginPage() {
  return `<div class="login-page"><section class="login-story">${titleMarkup()}<div><h1>口播、试穿、混剪。<br>把一天的素材，排清楚。</h1><p>商品、模特、穿搭和镜头配置能复用。批量先排产，生成按需确认。</p><div class="story-preview"><img src="media/fashion.jpg" alt="穿搭示例素材"><strong>通勤这样穿<br>先看上身效果</strong><span>一条素材 / 拍法与后期可选</span></div></div><span class="small-print">示例人像仅用于界面；本地视频预览不是模型生成结果</span></section><section class="login-content"><form id="loginForm"><span class="meta">电商内容生产</span><h1 class="mt">进入工作空间</h1><p class="meta mt">当前支持本地体验；不发送登录信息</p><label class="field mt"><span>工作邮箱</span><input class="input" name="email" type="email" required placeholder="name@company.com"></label><label class="field"><span>演示密码</span><input class="input" type="password" name="password" minlength="6" required placeholder="不用填写真实密码"></label><button class="btn primary full" type="submit">登录工作台</button><div class="divider"></div>${button('直接体验', 'enter', 'full')}<p class="small-print mt">上传素材仅保存在浏览器，刷新后继续使用</p></form></section></div>`;
}
function homePage() {
  const current = client();
  if (!current.projects.length) return `${headline('开始今天的素材任务', '先建立客户素材与拍摄配置；之后从预设开始，减少重复填写', button('载入示例客户', 'load-demo'))}<div class="production-example"><div><h2>一条做清楚，一批排得开。</h2><p>商品图、参考片、模特、声音和字幕都可以选择。先确认第一条配方，再复制为批次。</p><div class="row wrap gap8">${button('做第一条素材', 'new-project', 'primary')}${button('准备客户资源', 'nav', '', 'data-view="assets"')}</div></div><img src="media/fashion.jpg" alt="服饰示例"></div><div class="grid three mt"><div class="card pad"><h3>商品资料</h3><p class="meta mt">主图、SKU、规格、确认卖点和使用素材</p>${button('上传商品素材', 'upload-assets', 'sm mt')}</div><div class="card pad"><h3>出镜与声音</h3><p class="meta mt">客户模特、服装搭配、真人口播和音色选择</p>${button('配置模特', 'nav', 'sm mt', 'data-view="models"')}</div><div class="card pad"><h3>选项变成客户预设</h3><p class="meta mt">常用拍法、字幕、声音和镜头结构保存复用</p>${button('查看预设', 'nav', 'sm mt', 'data-view="preferences"')}</div></div>`;
  const pending = current.jobs.filter(job => job.status === '待审片').length;
  return `${headline('内容组工作台', '生产按客户与批次组织；单条方案和队列里的任务相互关联', button('批量排产', 'nav', '', 'data-view="batch"'))}${statsMarkup([['当前产单', current.jobs.length, current.demo ? '含明确标记的示例任务' : '只统计当前客户'], ['待脚本 / 资源确认', current.jobs.filter(job => ['待脚本确认', '待资源确认', '未提交'].includes(job.status)).length, '确认后才提交生成'], ['待审片', pending, '区分画面、声音、字幕问题'], ['可复用资源', current.assets.length + current.looks.length + current.templates.length, '商品、搭配与客户配方']])}<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(260px,1fr)"><section class="card"><div class="card-header"><h3>继续单条制作</h3>${button('全部产单', 'nav', 'ghost sm', 'data-view="queue"')}</div>${current.projects.slice(0,4).map(project => `<div class="guide-row">${imageMarkup(productCatalog.find(item=>item.sku === project.sku) || productCatalog[0], 'file-thumb')}<div class="grow"><strong>${escapeText(project.name)}</strong><p>${escapeText(project.batch)} · ${escapeText(project.owner)} · ${project.status}</p></div>${button('继续', 'open-project', 'sm', `data-id="${project.id}"`)}</div>`).join('')}</section><section class="card"><div class="card-header"><h3>内容组下一步</h3><span class="meta">当前客户</span></div><div class="pad stack"><div><h4>把拍摄配置先配齐</h4><p class="meta mt" style="margin-top:6px">${current.looks.length} 套客户搭配，${current.voices.length} 条口播，${current.templates.length} 个制作预设</p></div><div class="chips">${button('选模特', 'nav', 'sm', 'data-view="models"')}${button('配衣服', 'nav', 'sm', 'data-view="wardrobe"')}${button('选声音', 'nav', 'sm', 'data-view="voices"')}</div><div class="director-card"><b>今日制作顺序</b><br>先确认一个可用脚本，再安排拍法、钩子和SKU变体；相同镜头复用，确认过的画面不反复整片重做。</div></div></section></div><section class="card mt"><div class="card-header"><h3>最近批次</h3>${button('打开队列', 'nav', 'ghost sm', 'data-view="queue"')}</div><div class="table-wrap"><table><thead><tr><th>批次</th><th>产单</th><th>待确认</th><th>待审片</th><th>责任人</th></tr></thead><tbody>${[...new Set(current.jobs.map(job => job.batch))].slice(0,4).map(batch => { const rows=current.jobs.filter(job=>job.batch===batch);return `<tr><td><strong>${escapeText(batch)}</strong></td><td>${rows.length}</td><td>${rows.filter(job=>job.status.includes('确认')||job.status==='未提交').length}</td><td>${rows.filter(job=>job.status==='待审片').length}</td><td>林川 / 周乔</td></tr>`; }).join('')}</tbody></table></div></section>`;
}

const chooseChips = (field, values, selected = state.config[field]) => `<div class="chips">${values.map(value => `<button class="chip ${selected === value ? 'selected' : ''}" data-action="config-choice" data-field="${field}" data-value="${escapeText(value)}" aria-pressed="${selected === value}">${escapeText(value)}</button>`).join('')}</div>`;
function selectorField(label, id, values, selected, attributes = '') {
  if (!values.some(item => String(typeof item==='string'?item:item.id) === String(selected)) && selected !== undefined && selected !== '') values = [...values, {id:selected,name:String(selected)}];
  return `<label class="field"><span>${label}</span><select id="${id}" class="input" ${attributes}>${values.map(item=>{ const value = typeof item==='string'?item:item.id;const title = typeof item==='string'?item:item.name;return `<option value="${escapeText(value)}" ${String(selected)===String(value)?'selected':''}>${escapeText(title)}</option>`; }).join('')}</select></label>`;
}
function previewPanel() {
  const config = state.config;
  const shots = getShots();
  const shot = shots[viewState.activeShot] || shots[0];
  const item = product();
  const model = selectedModel();
  const look = selectedLook();
  const assigned = client().assets.find(asset => asset.id === shot.assetId);
  const image = assigned || (config.format.includes('口播') || config.format.includes('试穿') || config.category==='信息流漫剧' ? model || item : item);
  return `<aside class="preview-column"><div class="card"><div class="preview-title"><strong>这一条看起来怎样</strong>${badge('本地编排预览')}</div><div id="previewScreen" class="preview-screen">${image.kind==='视频' && image.fileId ? `<video class="scene-img" id="shotPreviewVideo" data-file="${image.fileId}" muted playsinline preload="auto"></video>` : imageMarkup(image,'scene-img')}<div class="overlay-tone"></div>${config.productId && model?.image ? imageMarkup(item,'show-product') : ''}${look?.parts?.length ? imageMarkup(getGarments().find(garment=>garment.id===look.parts[0]),'show-outfit') : ''}<span class="screen-info">${config.format} / ${config.camera}</span><div class="hook-line" id="hookLine" ${config.flower==='无花字'?'hidden':''}>${escapeText(shot.hook || hookText(config))}</div><div class="subtitle-line" id="subtitleLine" ${config.subtitle==='无字幕'?'hidden':''}>${escapeText(shot.speech)}</div><div class="cta-line" id="ctaLine">${escapeText(config.cta)}</div></div><div class="preview-controls"><div class="timebar"><button class="btn ghost sm" data-action="play-preview" aria-label="播放逐镜预览">${icon(viewState.isPlaying?'pause':'play')}</button><span id="previewTime" class="mono">00:00 / 00:${String(config.duration).padStart(2,'0')}</span>${button(icon('sound'),'speak-script','ghost sm','aria-label="系统声音试听"')}</div><div class="preview-progress"><i id="previewProgress"></i></div></div><div class="preview-frames">${shots.map((entry,index)=>`<button data-action="preview-shot" data-index="${index}" class="${index===viewState.activeShot?'active':''}" aria-label="第 ${index+1} 镜预览">${imageMarkup(item)}<span>${entry.start.toFixed(1)}s</span></button>`).join('')}</div></div><p class="preview-note">显示素材、字幕和镜头顺序；不是新生成的人物动作。搭配缩略图表示引用，换装需模型另行生成。</p><div class="production-config"><div class="row between"><h3>当前拍摄配置</h3>${button('保存为预设','save-template','ghost sm')}</div><div class="divider"></div><div class="row between"><span class="meta">商品</span><span class="small">${escapeText(item.sku||'未填SKU')}</span></div><div class="row between"><span class="meta">出镜</span><button class="link" data-action="nav" data-view="models">${escapeText(model?.name||'商品画面')}</button></div><div class="row between"><span class="meta">穿搭</span><button class="link" data-action="nav" data-view="wardrobe">${escapeText(look?.name||'未指定 / 原图')}</button></div><div class="row between"><span class="meta">口播</span><button class="link" data-action="nav" data-view="voices">${escapeText(selectedVoice()?.name||'无口播')}</button></div><div class="row between"><span class="meta">时长 / 镜头</span><span class="small">${config.duration}s / ${config.shotsCount} 镜</span></div><div class="row between"><span class="meta">后期</span><span class="small">${config.subtitle}</span></div></div></aside>`;
}
function hookText(config = state.config) {
  const names = { '服饰鞋包': '通勤怎么穿？先看上身', '美妆个护': '这次先看质地和用法', '食品饮料': '打开这一袋，先看实物', '家居百货': '这个日常麻烦怎么解决？', '3C数码': '这一步操作，你用对了吗？', '宠物用品': '养宠日常，先看怎么用', '信息流漫剧': '一句对话，事情变了' };
  if (config.hook==='利益点先说') return '先说你关心的这一点';
  if (config.hook==='实物先展示') return '商品就摆在这里，先看细节';
  if (config.hook==='反问开场') return '你是不是也遇到过这个问题？';
  if (config.hook==='结果先看') return '先看上身，再说怎么选';
  return names[config.category] || '先看商品怎么用';
}
function generateScript(config = state.config) {
  const count = Number(config.shotsCount) || 5;
  const duration = Number(config.duration) || 15;
  const item = productCatalog.find(entry=>entry.id===config.productId) || {name:config.category+'商品'};
  let base = config.category === '信息流漫剧' ? [
    { role: '对话冲突', visual: `${config.scene}里，两位角色因一个具体日常困扰出现分歧，保持机位与人物身份连续`, speech: '这件事，真的有那么麻烦吗？' },
    { role: '提出办法', visual: '一位角色拿出当前商品，展示已确认的用法，不凭空增加功效', speech: '先试着这样做。' },
    { role: '商品介入', visual: `商品近景，展示${config.claimFocus}。实际操作由提供的参考素材约束`, speech: config.claims },
    { role: '情节回收', visual: '人物回应前面的困扰，只有一处轻反转，商品继续露出', speech: '原来这一步要这样。' },
    { role: '卡点 / 收尾', visual: '回到商品与可确认的购买理由，明确行动，连载时可留简短悬念', speech: config.cta }
  ] : [
    { role:'开场钩子',visual:`${config.scene}，${config.camera}。${config.format}开场，先展示${config.claimFocus}对应的场景或实物`,speech:hookText(config) },
    { role:'商品进入',visual:`${item.name}完整出现，包装、版型或使用状态按当前商品图，动作简单清晰`,speech:config.format==='真人口播'?'我把商品拿近一点，先看这里。':'先看这个商品的实际样子。' },
    { role:'卖点与证据',visual:`${config.evidence}，聚焦${config.claimFocus}；未经确认的性能不设计假测试`,speech:config.claims },
    { role:'日常使用',visual:`回到${config.scene}，保留自然动作。镜头与商品状态一致，用生活场景回收卖点`,speech:config.style==='直接卖点'?'这就是它适合的使用场景。':'日常这样用就可以。' },
    { role:'行动落点',visual:'商品定格清晰露出，价格仅使用客户确认值，花字由后期叠加',speech:config.price?`当前活动价${config.price}，以店铺活动为准。${config.cta}`:config.cta }
  ];
  if (config.category !== '信息流漫剧') {
    const variations = {
      '上身试穿': ['正面全身展示商品版型，保持自然姿态，先让观众看清上身', '侧面与背面切换，真人轻转身，展示腰线与衣长', '近景看领口、袖口或面料，不混淆款式与颜色', '在日常场景中走动，真实使用动作，保留商品细节', '全身或商品定格，给出选择尺码或查看详情的行动'],
      '真人口播': ['出镜人靠近镜头，直接提出当前商品对应的日常问题', '人物手持或指向商品，口播与商品露脸同步', '插入一个能证明卖点的近景，口播继续但画面不只拍脸', '回到人物口播，用简短生活场景解释怎么用', '商品与人物同框，明确一个行动，不堆多个利益点'],
      '手部试用': ['桌面或洗手台，手部拿起商品，先看包装与质地', '开盖或取量动作，状态与真实用法素材保持对应', '近景展示涂抹质地，光线自然，不虚构皮肤改变', '完整演示一个使用步骤，动作结束留出看清时间', '商品定格与用法提示，避免未经确认的功效承诺'],
      '使用教程': ['展示完整商品与当前状态，一句话说明这次教什么', '使用真实操作素材，确认开关或安装的第一步', '近景或真实录屏展示关键按钮和操作结果', '回到完整操作，保留状态连续和必要等待', '收尾给出操作注意事项和保存教程的行动'],
      '细节演示': ['商品全貌先出现，交代这次聚焦的一个细节', '近景拉近位置，让观众知道细节在哪里', '特写展示真实材质或结构，停留足够看清', '用真实使用动作回应细节，避免假测试', '回到商品全貌，总结一个确定的选择理由'],
      '多款混剪': ['第一款完整出场，字幕只标款式，不并行介绍所有卖点', '第二款用同景别出现，减少观众比较成本', '细节镜头对应具体SKU，颜色材质不串款', '各款式在同一场景快速轮转，节奏统一', '汇总款式与选择方式，价格规格用客户确认值'],
      '直播切片': ['从已上传直播片段选取明确利益点的开场，保留同期口播', '切到主播指向商品的动作，避免丢失商品上下文', '商品近景或陈列插入，关键规格用后期标注', '保留必要口播与赠品事实，去掉重复赘述', '回到行动落点，活动期限仅用当前确认信息'],
      '开袋试吃': ['包装与食物实物先入镜，拍清规格', '开袋动作使用实拍素材，保持包装与食物一致', '食物近景展示真实质地，不生成虚假消费者评价', '食用或分享场景优先使用客户实拍', '包装与商品定格，只讲确认的配料和规格']
    };
    const selectedVisuals = variations[config.format];
    if (selectedVisuals) base = base.map((shot, index) => ({ ...shot, visual: `${config.scene} / ${config.camera}。${selectedVisuals[index]}` }));
  }
  const selected = count===3 ? [base[0],base[2],base[4]] : count===4 ? [base[0],base[1],base[2],base[4]] : base;
  const raw = selected.map((shot,index)=>({id:uniqueId('shot'),assetId:config.assets[index % Math.max(1, config.assets.length)] || '', clipStart:0,start:Math.round(index*duration/count*10)/10,end:Math.round((index+1)*duration/count*10)/10,...shot,scale:index===0?'中景':index===count-1?'商品定格':index===2?'细节特写':'近景',hook:index===0?hookText(config):index===2?config.claimFocus:'',locked:false,source:'规则编排草稿'}));
  const old = client().projects.find(project=>project.id===config.draftId)?.shots;
  return raw.map((shot,index)=>old?.[index]?.locked?old[index]:shot);
}
function getShots() {
  const project = client().projects.find(item=>item.id===state.config.draftId);
  return project?.shots || generateScript();
}
function ensureDraft() {
  let project = client().projects.find(item=>item.id===state.config.draftId);
  if (!project) {
    project={id:uniqueId('project'),name:`${product().name} · ${state.config.format}`,originJobId:state.config.originJobId||null,sku:product().sku,format:state.config.format,status:'配置中',owner:'林川',batch:'单条制作',config:JSON.parse(JSON.stringify(state.config)),day:new Date().toLocaleDateString('zh-CN')};
    state.config.draftId=project.id;
    project.config.draftId=project.id;
    client().projects.unshift(project);
    collabRegisterWork(project);
  }
  if(!project.campaignId)collabRegisterWork(project);
  return project;
}
function saveDraft() {
  const project=ensureDraft();
  if(!collabPreflight(project))return false;
  if(project.flow){project.shots ||= generateScript();guardContext(project);}
  if (typeof flowTrackChanges === 'function') flowTrackChanges(project);
  project.config=JSON.parse(JSON.stringify(state.config));
  project.format=state.config.format;
  project.sku=product().sku;
  project.editVersion=(project.editVersion||1)+1;
  const campaign=collabCampaign(project.campaignId);
  if(campaign)campaign.updated=new Date().toISOString();
  if (viewState.stage>=2&&!project.shots) project.shots=generateScript();
  const origin=client().jobs.find(job=>job.id===project.originJobId);
  if(origin){origin.config=JSON.parse(JSON.stringify(state.config));origin.shots=JSON.parse(JSON.stringify(project.shots||generateScript()));if(viewState.stage>=3&&state.config.factsConfirmed)origin.status=readiness(state.config).length?'待资源确认':'未提交';}
  persist();
}

function studioPage() {
  const config=state.config;
  const cat=categories[config.category];
  const stage=viewState.stage;
  let body='';
  if (stage===0) body=`<section class="card"><div class="card-header"><h3>商品与内容任务</h3>${button('从客户预设开始','nav','ghost sm','data-view="preferences"')}</div><div class="section-block"><div class="setting-grid">${selectorField('商品品类','category',Object.keys(categories),config.category)}${selectorField('已有商品 / SKU','productId',[...productCatalog.filter(item=>item.category===config.category),...client().assets.filter(item=>item.tag==='商品图')].length?[...productCatalog.filter(item=>item.category===config.category),...client().assets.filter(item=>item.tag==='商品图')]:[{id:'custom',name:'上传当前品类商品'}],config.productId)}${selectorField('投放平台','platform',['抖音','TikTok','小红书','快手'],config.platform)}${selectorField('内容目标','intent',['信息流测试','商品转化','直播引流','日常种草','品牌介绍'],config.intent)}</div><div class="section-label"><strong>商品图与实拍素材</strong><span>客户已有素材可以复用</span></div>${uploadZone('draftMedia','image/*,video/*','上传主图 / 细节 / 使用视频','图片与实拍视频只上传一次，保留引用')}<div class="strip mt">${config.assets.map(id=>client().assets.find(asset=>asset.id===id)).filter(Boolean).map(asset=>`<div class="media-item">${imageMarkup(asset)}<span>${escapeText(asset.tag)}</span><button aria-label="移除此引用" data-action="remove-draft-asset" data-id="${asset.id}">×</button></div>`).join('')}</div><div class="row wrap mt">${button('从素材库选择','pick-draft-assets')}${button('选一条参考片','nav','ghost','data-view="reference"')}</div></div><div class="section-block"><div class="section-label"><strong>商品事实与约束</strong><span>外观识别与功效资料分开</span></div><div class="fact-list"><label class="field"><span>这次主要讲什么</span><select class="input" id="claimFocus">${cat.claims.map(value=>`<option ${value===config.claimFocus?'selected':''}>${value}</option>`).join('')}</select></label><label class="field"><span>真实证据来自哪里</span><select id="evidence" class="input">${cat.evidence.map(value=>`<option ${value===config.evidence?'selected':''}>${value}</option>`).join('')}</select></label></div><label class="field mt"><span>已确认卖点 <span class="helper">少量补充即可，后续记住</span></span><textarea id="claims" class="input" placeholder="价格、规格、材质等事实由客户确认">${escapeText(config.claims)}</textarea></label><div class="setting-grid"><label class="field"><span>活动价格 <span class="helper">选填，留空不报价格</span></span><input id="price" class="input" value="${escapeText(config.price)}" placeholder="例如：199元"></label><label class="field"><span>额外要求 <span class="helper">选填</span></span><input id="note" class="input" value="${escapeText(config.note)}" placeholder="例如：别拍成棚拍感"></label></div><label class="row small"><input type="checkbox" class="checkbox" id="factsConfirmed" ${config.factsConfirmed?'checked':''}> 上述卖点与活动信息已确认</label></div></section>`;
  if (stage===1) body=`<section class="card"><div class="card-header"><h3>拍法先选，编导再补齐</h3><span class="meta">${config.category} · ${cat.formats.length} 种内容结构</span></div><div class="section-block"><div class="section-label"><strong>内容类型</strong><span>选项只调整配置，不发起生成</span></div><div class="choice-grid">${cat.formats.map((format,index)=>`<button class="choice ${config.format===format?'selected':''}" data-action="config-choice" data-field="format" data-value="${format}" aria-pressed="${format===config.format}">${formatThumbnail(format,index)}<span class="label">${format}</span><p>${formatDescription(format)}</p></button>`).join('')}</div></div><div class="section-block"><div class="setting-grid">${selectorField('编导介入','mode',['按我的想法','共同编导','全案托管'],config.mode)}${selectorField('制作方式','pipeline',['AI补镜头 + 后期组装','已有实拍素材混剪','整片生成','剧情分段 + 合成'],config.pipeline)}</div><div class="option-group"><label>前三秒怎么开</label>${chooseChips('hook',hooks)}</div><div class="option-group"><label>在哪拍</label>${chooseChips('scene',scenes)}</div><div class="option-group"><label>画面质感</label>${chooseChips('camera',cameraStyles)}</div><div class="option-group"><label>表达语气</label>${chooseChips('style',contentStyles)}</div><div class="director-card"><b>编导提示</b><br>${directorTip()}。把一个卖点讲清，真实证据留够时间；手机感不等于商品看不清。</div></div><div class="section-block"><div class="section-label"><strong>出镜配置</strong><span>可以不选真人，用商品画面 + 口播</span></div><div class="setting-grid">${selectorField('模特 / 出镜人','modelId',[{id:'none',name:'不出镜 / 商品画面'},...getModels()],config.modelId)}${selectorField('模特穿搭','lookId',[{id:'',name:'原图服装 / 暂不指定'},...client().looks],config.lookId)}</div><div class="row wrap gap8">${button('查看模特库','nav','','data-view="models"')}${button('上传衣服并搭配','nav','','data-view="wardrobe"')}</div>${selectedLook()?`<div class="notice mt">搭配：${escapeText(selectedLook().name)}，共 ${selectedLook().parts.length} 件。此处记录参考图职责，穿上身效果须模型生成后检查。</div>`:''}</div></section>`;
  if (stage===2) body=`<section class="card"><div class="card-header"><div><h3>镜头与口播脚本</h3><span class="meta">先用可编辑规则草稿，真实文本模型暂未接入</span></div>${button('重排草稿','rebuild-shots','sm')}</div><div class="section-block"><div class="setting-grid">${selectorField('时长','duration',['10','15','20','30'],String(config.duration),'data-number="true"')}${selectorField('镜头密度','shotsCount',[{id:3,name:'3 镜 · 单卖点'}, {id:4,name:'4 镜 · 口播+证据'}, {id:5,name:'5 镜 · 节奏混剪'}],config.shotsCount,'data-number="true"')}</div><div class="notice">镜头描述是具体动作、商品职责和声音；避免 15 秒塞入十几次复杂动作。改局部前先锁定满意镜头。</div></div>${getShots().map((shot,index)=>`<div class="shot-row"><div>${imageMarkup(product(),'shot-image')}<span class="mono">${String(index+1).padStart(2,'0')} / ${shot.start.toFixed(1)}s</span></div><div class="shot-edit"><div class="row between wrap"><h3>${shot.role}</h3><label class="meta"><input type="checkbox" class="checkbox" data-lock-shot="${index}" ${shot.locked?'checked':''}> 锁定</label></div><div class="grid two mt" style="margin-top:10px"><label class="field"><span>画面与动作</span><textarea class="input" data-shot="${index}" data-shot-field="visual">${escapeText(shot.visual)}</textarea></label><label class="field"><span>台词 / 旁白</span><textarea class="input" data-shot="${index}" data-shot-field="speech">${escapeText(shot.speech)}</textarea></label></div><div class="setting-grid"><label class="field"><span>本镜真实素材</span><select class="input" data-shot="${index}" data-shot-field="assetId"><option value="">按出镜配置</option>${client().assets.filter(asset=>['图片','视频'].includes(asset.kind)).map(asset=>`<option value="${asset.id}" ${shot.assetId===asset.id?'selected':''}>${escapeText(asset.name)}</option>`).join('')}</select></label><label class="field"><span>视频片段起点（秒）</span><input type="number" min="0" step="0.1" class="input" value="${shot.clipStart||0}" data-shot="${index}" data-shot-field="clipStart"></label></div><div class="row between gap8"><span class="meta">${shot.start.toFixed(1)}–${shot.end.toFixed(1)}s · ${shot.scale}</span>${button('看这一镜','preview-shot','ghost sm',`data-index="${index}"`)}</div></div></div>`).join('')}<div class="timeline-board"><div class="timeline-track"><label>画面</label><div class="segments">${getShots().map(shot=>`<span class="segment">${shot.role}</span>`).join('')}</div></div><div class="timeline-track"><label>口播</label><div class="segments">${getShots().map(shot=>`<span class="segment audio">${escapeText(shot.speech.slice(0,9))}</span>`).join('')}</div></div><div class="timeline-track"><label>字幕</label><div class="segments"><span class="segment text">${config.subtitle} / 后期叠加，文字与口播可分开</span></div></div></div></section>`;
  if (stage===3) body=`<section class="card"><div class="card-header"><h3>后期声音与字幕</h3><span class="meta">出镜口播、旁白和字幕分别配置</span></div><div class="section-block"><div class="setting-grid">${selectorField('音色 / 真人口播','voiceId',[{id:'none',name:'无口播，仅画面'},...getVoices()],config.voiceId)}${selectorField('背景音乐','music',['无配乐','用户上传配乐','只留同期声'],config.music)}</div><div class="row gap8">${button('试听当前声音','speak-script')}${button('去音色库上传口播','nav','ghost','data-view="voices"')}</div><label class="field mt"><span>语速 <b id="speedValue">${config.speed.toFixed(1)}×</b></span><input id="speed" class="voice-slider" type="range" min="0.8" max="1.4" step="0.1" value="${config.speed}"></label><div class="notice">内置音色标签是制作要求；当前试听使用系统可用语音，不能冒充真实克隆音色。上传口播可以真实播放。</div></div><div class="section-block"><div class="option-group"><label>字幕</label>${chooseChips('subtitle',['白字黑描边','黄字重点','干净下方字幕','无字幕'])}</div><div class="option-group"><label>卖点花字</label>${chooseChips('flower',['卖点黄字','规格信息条','促销贴片','无花字'])}</div><div class="option-group"><label>结尾动作</label>${chooseChips('cta',['查看商品详情','进直播间看看','按需选择规格','收藏使用方法','无行动文案'])}</div><div class="director-card"><b>电商后期判断</b><br>重点词少而准，保留可读空间；未经确认的折扣、赠品和功效不写到字幕里。让字幕帮用户看懂，而非遮住商品。</div></div></section>`;
  if (stage===4) body=`<section class="card"><div class="card-header"><h3>制作与交付确认</h3>${badge('默认只做 1 条')}</div><div class="section-block"><div class="summary-fields"><div><label>商品 / SKU</label>${escapeText(product().name)} / ${escapeText(product().sku)}</div><div><label>拍法 / 平台</label>${config.format} / ${config.platform}</div><div><label>出镜 / 搭配</label>${escapeText(selectedModel()?.name||'商品画面')} / ${escapeText(selectedLook()?.name||'原图')}</div><div><label>声音 / 字幕</label>${escapeText(selectedVoice()?.name||'无口播')} / ${config.subtitle}</div><div><label>时长 / 镜头</label>${config.duration}s / ${getShots().length} 镜</div><div><label>商品事实</label>${config.factsConfirmed?'客户已确认':'尚未确认'}</div></div><details class="disclosure"><summary>展开完整生成提示词与素材职责</summary><textarea class="input" style="height:270px" readonly>${escapeText(compilePrompt())}</textarea></details></div><div class="section-block"><div class="grid two"><div class="choice"><h3>导出本地粗剪预览</h3><p>真实组合现有图片、字幕、台词与已上传音频，导出 WebM；不生成新人物动作</p>${button('导出本地预览视频','export-preview','primary mt',viewState.renderBusy?'disabled':'')}<div class="small-print mt">浏览器渲染约 ${Math.ceil(config.duration)} 秒；本地粗剪不扣模型积分</div></div><div class="choice"><h3>Seedance 2.5 生成任务</h3><p>生成动作与新画面，需要真实供应商接口；提交前核对素材和真实报价</p><div class="row between mt"><span class="meta">连接状态</span>${badge(client().connected?'已配置':'未连接','orange')}</div>${button('创建待提交产单','create-job','mt')}${button('查看接口配置','nav','ghost sm mt','data-view="settings"')}</div></div><div class="row wrap mt">${button('导出脚本与 SRT','export-script')}${button('用这一条建立批次','nav','','data-view="batch"')}${button('保存客户配方','save-template')}</div></div></section>`;
  return `<div class="session-path"><a href="#home">内容组</a><span>/</span><span>${escapeText(product().sku)}</span><span>/</span><span>单条制作</span></div><div class="studio-top"><div><h1>${escapeText(product().name)} · ${config.format}</h1><div class="meta">${config.platform} / ${config.intent} · ${config.pipeline}</div></div><div class="row gap8">${button('保存草稿','save-draft')}${button('创建批次','nav','','data-view="batch"')}</div></div><div class="studio-steps">${['商品资料','拍法与出镜','镜头脚本','后期声音','制作交付'].map((label,index)=>`<button class="${stage===index?'current':''}" data-action="studio-stage" data-stage="${index}"><b>${index+1}</b>${label}</button>`).join('')}</div><div class="studio-layout"><div class="studio-editor">${body}<div class="step-footer">${button(icon('back')+' 上一步','previous-stage',stage===0?'ghost':'',stage===0?'disabled':'')}${stage<4?button('确认，进入'+['拍法与出镜','镜头脚本','后期声音','制作交付'][stage]+' '+icon('arrow'),'next-stage','primary'):button('去产单队列','nav','','data-view="queue"')}</div></div>${previewPanel()}</div>`;
}
function formatDescription(format) {
  if (format.includes('口播')) return '先说利益点，留商品近景作证据';
  if (format.includes('试穿')||format.includes('穿搭')) return '看上身、版型和场景，不强行拍电影';
  if (format.includes('切片')||format.includes('混剪')) return '复用实拍片段，重排开头与字幕';
  if (format.includes('改编')) return '先拆切点、声音和花字，再换当前商品';
  if (format.includes('教程')||format.includes('演示')) return '操作看得清，具体用法用实拍约束';
  return '一个结构讲一个卖点，节奏由编导补齐';
}
function formatThumbnail(format, index) {
  const person = selectedModel() || product();
  const item = product();
  const isPerson = format.includes('口播') || format.includes('剧情') || format.includes('试穿');
  const primary = isPerson ? person : item;
  const visual = format.includes('混剪') || format.includes('切片') || format.includes('改编') ? [item, person, item] : format.includes('试穿') || format.includes('穿搭') ? [item, person] : [primary];
  return `<div class="format-preview format-${index % 3}">${visual.map((entry, position) => `<div>${imageMarkup(entry)}<span>${position === 0 ? (isPerson ? '开场' : '全貌') : position === visual.length - 1 ? '证据' : '近景'}</span></div>`).join('')}<b>${format.includes('口播') ? '口播 + 商品插镜' : format.includes('混剪') || format.includes('切片') ? '实拍片段重组' : format.includes('教程') ? '一步一个动作' : '先看商品，再看细节'}</b></div>`;
}
function directorTip() {
  const config=state.config;
  if (config.category==='服饰鞋包') return '试穿先给完整上身，再给领口、腰线、面料或活动细节';
  if (config.category==='美妆个护') return '用法与质地看得清，功效以品牌资料为准，避免假前后对比';
  if (config.category==='3C数码') return '接口、按钮与开关状态优先用真实录屏或使用视频';
  if (config.category==='宠物用品') return '规格与用法直接讲，宠物反应尽量使用真实实拍';
  return '前三秒有明确问题，中间给真实证据，最后留一个动作';
}

function modelsPage() {
  const list=getModels().filter(item=>(viewState.modelGender==='全部'||item.gender===viewState.modelGender)&&(viewState.modelStyle==='全部'||item.style===viewState.modelStyle)&&item.name.includes(viewState.modelQuery));
  return `${headline('模特库','出镜人不仅是一张脸；地区、气质、适用品类与授权归属一起管理',button('上传客户模特 '+icon('upload'),'upload-model','primary'))}<div class="toolbar"><input id="modelQuery" class="input search" placeholder="搜索名字" value="${escapeText(viewState.modelQuery)}" aria-label="搜索模特"><select id="modelGender" class="input" aria-label="模特性别">${['全部','女','男','未标注'].map(value=>`<option ${viewState.modelGender===value?'selected':''}>${value}</option>`).join('')}</select><select id="modelStyle" class="input" aria-label="模特气质">${['全部',...new Set(getModels().map(item=>item.style))].map(value=>`<option ${viewState.modelStyle===value?'selected':''}>${value}</option>`).join('')}</select><span class="meta grow">${list.length} 位 · 示例与客户素材分别标注</span>${button('不使用真人','no-model','sm')}</div><div class="talent-grid">${list.map(item=>`<article class="talent-card ${state.config.modelId===item.id?'selected':''}"><div class="talent-image">${imageMarkup(item)}${badge(item.scope==='demo'?'演示形象':'客户上传',item.scope==='demo'?'':'green')}</div><div class="talent-body"><h3>${escapeText(item.name)}</h3><p class="meta">${escapeText(item.gender)} · ${escapeText(item.age)} · ${escapeText(item.style)}</p><div class="chips mb">${(item.scenes||[]).map(tag=>badge(tag)).join('')}</div><div class="row">${button('查看','model-detail','sm',`data-id="${item.id}"`)}${button('选用','choose-model',state.config.modelId===item.id?'sm primary':'sm',`data-id="${item.id}"`)}${button('搭配','choose-outfit','sm',`data-id="${item.id}"`)}</div></div></article>`).join('')}</div>${!list.length?emptyState('暂无匹配模特','更换筛选或上传客户自己的出镜形象'):''}<div class="notice mt">示例人像来自公开图库，只用于界面与本地预览；不能视为已有商业出镜授权。客户素材会记录授权状态和适用范围。</div>`;
}
function wardrobePage() {
  const model=selectedModel();
  const parts=viewState.lookParts||selectedLook()?.parts||[];
  const list=getGarments().filter(item=>viewState.wardrobeSlot==='全部'||item.slot===viewState.wardrobeSlot);
  return `${headline('服装与搭配','先把人物、衣服和配饰配清楚；保存免费搭配单，生成上身图另行确认',button('上传服装 '+icon('upload'),'upload-garment','primary'))}<div class="outfit-layout"><aside class="card pad"><h3>本次搭配</h3><div class="look-collage mt"><div>${imageMarkup(model,'look-person')}</div><div class="look-parts">${parts.length?parts.slice(0,3).map(id=>imageMarkup(getGarments().find(item=>item.id===id))).join(''):'<div class="look-part-placeholder">选择服装</div><div class="look-part-placeholder">选择配饰</div>'}</div></div><div class="outfit-tags">${badge('参考拼图，非换装结果')}</div><div class="field">${selectorField('出镜人','outfitModel',getModels(),state.config.modelId)}</div><label class="field"><span>搭配名称</span><input id="lookName" class="input" value="${escapeText(selectedLook()?.name||'日常通勤 · 搭配01')}" placeholder="客户使用时好找到"></label><div class="row wrap gap8">${button('保存搭配单','save-look','primary')}${button('清空选择','clear-look','ghost')}</div><p class="small-print mt">保存的是引用关系；真实换装需要模型。整身装与上衣+下装互斥，同一部位只保留一件。</p></aside><section><div class="toolbar"><select id="wardrobeSlot" class="input" aria-label="服装分类">${['全部','外套','上衣','下装','整身装','鞋履','配饰','搭配参考'].map(slot=>`<option ${slot===viewState.wardrobeSlot?'selected':''}>${slot}</option>`).join('')}</select><span class="meta grow">${list.length} 件 · ${parts.length} 件已选</span>${button('返回制作','nav','','data-view="studio"')}</div><div class="wardrobe-grid">${list.map(item=>`<button class="garment ${parts.includes(item.id)?'selected':''}" data-action="toggle-garment" data-id="${item.id}" aria-pressed="${parts.includes(item.id)}">${imageMarkup(item)}<span>${escapeText(item.name)}</span><small>${escapeText(item.slot)} · ${escapeText(item.authority||'客户上传')}</small></button>`).join('')}</div><div class="card mt"><div class="card-header"><h3>客户已保存搭配</h3><span class="meta">${client().looks.length} 套</span></div>${client().looks.length?client().looks.map(look=>`<div class="guide-row"><div class="grow"><strong>${escapeText(look.name)}</strong><p>${look.parts.length} 件 / ${escapeText(getModels().find(item=>item.id===look.modelId)?.name||'出镜人')}</p></div>${button('使用这套','use-look','sm',`data-id="${look.id}"`)}</div>`).join(''):'<div class="pad meta">还没有搭配单，先选人物和衣服再保存</div>'}</div></section></div>`;
}
function voicesPage() {
  return `${headline('音色与口播','录好的真人声音与合成要求分开；声音会影响语速、脚本和后期',button('上传真人口播 '+icon('upload'),'upload-voice','primary'))}<div class="notice mb">内置试听使用浏览器系统声音，具体音色仅表示制作方向。客户上传的音频真实播放；没有执行声音克隆。</div><div class="grid two">${getVoices().map((voice,index)=>`<article class="sound-card"><div class="wave">${Array.from({length:14},(_,wave)=>`<i style="height:${8+(wave*7+index*3)%26}px"></i>`).join('')}</div><div class="grow"><div class="voice-label">${escapeText(voice.name)}</div><div class="voice-meta">${escapeText(voice.style)} · ${escapeText(voice.locale||'用户音频')} · ${voice.fileId?'真人口播':'系统试听'}</div></div><div class="row gap8">${button('试听','preview-voice','sm',`data-id="${voice.id}"`)}${button(state.config.voiceId===voice.id?'已选择':'使用','choose-voice',state.config.voiceId===voice.id?'sm primary':'sm',`data-id="${voice.id}"`)}</div>${voice.fileId?`<audio data-file="${voice.fileId}" controls preload="metadata" style="width:100%"></audio>`:''}</article>`).join('')}</div><section class="card mt"><div class="card-header"><h3>当前口播稿</h3>${button('读取系统声音','refresh-voices','ghost sm')}</div><div class="pad"><textarea id="voiceText" class="input" style="height:110px">${escapeText(getShots().map(shot=>shot.speech).join('\n'))}</textarea><div class="row wrap mt">${button('系统朗读此稿','speak-voice-text')}${button('停止试听','stop-voice')}${button('回到后期设置','go-audio','primary')}</div><p class="small-print mt" id="voiceSystemInfo">系统声音可用性取决于浏览器与设备</p></div></section>`;
}

function assetsPage() {
  const list=client().assets.filter(item=>(viewState.assetType==='全部'||item.kind===viewState.assetType)&&`${item.name} ${item.sku||''} ${item.tag||''}`.toLowerCase().includes(viewState.assetQuery.toLowerCase()));
  return `${headline('商品与素材','商品图、实拍片段、参考片、声音和品牌资料集中管理，创作只引用',button('上传素材 '+icon('upload'),'upload-assets','primary'))}<div class="toolbar"><input class="input search" id="assetQuery" aria-label="搜索素材" placeholder="搜索名称、SKU、标签" value="${escapeText(viewState.assetQuery)}"><select id="assetType" class="input" aria-label="素材类型">${['全部','图片','视频','音频','文档'].map(type=>`<option ${type===viewState.assetType?'selected':''}>${type}</option>`).join('')}</select><span class="meta grow">${list.length} 项 · 当前客户</span>${button('导出清单','export-assets')}</div>${list.length?`<div class="asset-grid">${list.map(asset=>`<article class="asset-card"><div class="asset-image"><input type="checkbox" class="checkbox" data-select-asset="${asset.id}" aria-label="选择 ${escapeText(asset.name)}" ${viewState.selectedAssets.has(asset.id)?'checked':''}>${asset.kind==='视频'?`<video ${asset.fileId?`data-file="${asset.fileId}"`:''} preload="metadata"></video>`:asset.kind==='音频'?`<div class="placeholder-media">${icon('sound')}<span>真人口播 / 音频</span></div>`:imageMarkup(asset)}</div><div class="asset-body"><h3 title="${escapeText(asset.name)}">${escapeText(asset.name)}</h3><p class="meta">${escapeText(asset.sku||'客户资源')} · ${escapeText(asset.tag||asset.kind)}</p><div class="row between gap8">${badge(asset.authority==='仅用于界面示例'?'示例':'客户上传',asset.authority==='仅用于界面示例'?'':'green')}${button('查看 / 编辑','asset-detail','ghost sm',`data-id="${asset.id}"`)}</div></div></article>`).join('')}</div>`:emptyState('还没有匹配素材','上传素材或调整筛选；客户资源可在多项目中引用',button('上传素材','upload-assets','primary'))}${viewState.selectedAssets.size?`<div class="bulk-bar"><span class="small">已选择 ${viewState.selectedAssets.size} 项</span><div class="row gap8">${button('加入当前素材','add-selected-assets')}${button('批量加标签','tag-assets')}${button('取消','clear-assets','ghost')}</div></div>`:''}`;
}
function batchPage() {
  const formats=categories[state.config.category].formats;
  const batch=viewState.batch||{products:[state.config.productId],formats:[state.config.format],hooks:[state.config.hook],limit:6,name:'本周日常素材测试',reviewer:'林川'};
  viewState.batch=batch;
  const combinations=makeCombinations(batch);
  return `${headline('批量排产','可以有很多产单，但每一条必须有明确商品、拍法和审核状态；选择本身不扣费',button('查看产单队列','nav','','data-view="queue"'))}<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(245px,1fr)"><section class="card"><div class="card-header"><h3>用已确认配置建立批次</h3>${badge('先排产，后提交')}</div><div class="pad"><div class="grid two"><label class="field"><span>批次名称</span><input id="batchName" class="input" value="${escapeText(batch.name)}"></label>${selectorField('责任人','batchReviewer',['林川','周乔','剪辑组'],batch.reviewer)}</div><div class="option-group"><label>商品 / SKU，可多选</label><div class="chips">${batchProducts().map(item=>`<button class="chip ${batch.products.includes(item.id)?'selected':''}" data-action="batch-toggle" data-dimension="products" data-value="${item.id}" aria-pressed="${batch.products.includes(item.id)}">${escapeText(item.name)} · ${item.sku}</button>`).join('')}</div></div><div class="option-group"><label>拍法，可多选</label><div class="chips">${formats.map(format=>`<button class="chip ${batch.formats.includes(format)?'selected':''}" data-action="batch-toggle" data-dimension="formats" data-value="${format}" aria-pressed="${batch.formats.includes(format)}">${format}</button>`).join('')}</div></div><div class="option-group"><label>开场，可多选</label><div class="chips">${hooks.slice(0,6).map(hook=>`<button class="chip ${batch.hooks.includes(hook)?'selected':''}" data-action="batch-toggle" data-dimension="hooks" data-value="${hook}" aria-pressed="${batch.hooks.includes(hook)}">${hook}</button>`).join('')}</div></div><label class="field"><span>本批次最多创建产单数 <span class="helper">限制组合扩张，不自动生成视频</span></span><input class="input" id="batchLimit" type="number" min="1" max="100" value="${batch.limit}" style="max-width:130px"></label><div class="notice">模特、穿搭、音色、字幕与已确认事实从当前配方继承；SKU 变化后商品事实需要逐项重新确认。</div></div></section><aside class="card pad"><h3>这批会产生什么</h3><div class="estimate mt"><span class="meta">潜在组合</span><div class="value">${batch.products.length} × ${batch.formats.length} × ${batch.hooks.length} = ${batch.products.length*batch.formats.length*batch.hooks.length}</div><span class="meta">实际只建立前 ${combinations.length} 条产单</span></div><div class="divider"></div><div class="row between small"><span>视频已生成</span><strong>0 条</strong></div><div class="row between small mt" style="margin-top:10px"><span>排产费用</span><strong>0 积分</strong></div><div class="row between small mt" style="margin-top:10px"><span>示例视频上限预算</span><strong>${combinations.length*90} 积分</strong></div><p class="small-print mt">90 是示例报价，正式版按供应商报价结算。未连接模型时只能创建待提交产单。</p><div class="divider"></div>${button('创建这批产单','commit-batch','primary full',!combinations.length?'disabled':'')}<p class="meta mt">默认最多 6 条可检查组合。高产量通过批次、筛选和状态管理承接，而非一键铺满生成。</p></aside></div><section class="card mt"><div class="card-header"><h3>产单预览</h3><span class="meta">${combinations.length} 条，不提交模型</span></div><div class="table-wrap"><table><thead><tr><th>素材编号</th><th>SKU</th><th>拍法</th><th>开场</th><th>出镜</th><th>状态</th></tr></thead><tbody>${combinations.map((item,index)=>`<tr><td class="mono">${item.sku}_${item.format}_${index+1}</td><td>${item.sku}</td><td>${item.format}</td><td>${item.hook}</td><td>${escapeText(selectedModel()?.name||'无真人')}</td><td>${badge('待逐条确认')}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function makeCombinations(batch) {
  const rows=[];
  for (const productId of batch.products) for (const format of batch.formats) for (const hook of batch.hooks) {
    if (rows.length>=Math.min(100,Number(batch.limit)||1)) return rows;
    const item=productCatalog.find(entry=>entry.id===productId)||product();
    rows.push({productId,sku:item.sku,format,hook});
  }
  return rows;
}
function queuePage() {
  const list=client().jobs.filter(job=>viewState.queueFilter==='全部'||job.status===viewState.queueFilter);
  const pageCount=Math.max(1,Math.ceil(list.length/12));
  viewState.tablePage=Math.min(viewState.tablePage,pageCount);
  const rows=list.slice((viewState.tablePage-1)*12,viewState.tablePage*12);
  const filters=['全部','待脚本确认','待资源确认','未提交','待审片','需重做','已归档'];
  return `${headline('产单与队列','一条素材一个版本，一批任务一个批次；筛选、选中与费用确认之后再操作',button('批量排产','nav','primary','data-view="batch"'))}${statsMarkup([['总产单',client().jobs.length,'按当前客户统计'],['未提交',client().jobs.filter(job=>job.status==='未提交').length,'没有发出模型请求'],['待审核',client().jobs.filter(job=>job.status==='待审片').length,'含示例任务'],['已归档',client().jobs.filter(job=>job.status==='已归档').length,'版本记录保留']])}<div class="quick-view">${filters.map(filter=>`<button class="${viewState.queueFilter===filter?'selected':''}" data-action="queue-filter" data-value="${filter}">${filter} ${filter==='全部'?list.length:client().jobs.filter(job=>job.status===filter).length}</button>`).join('')}</div><div class="toolbar"><span class="meta grow">列表每页 12 条 · 可承接多批次产单</span>${button(state.dense?'标准行高':'紧凑行高','dense')}${button('导出产单清单','export-jobs')}</div>${rows.length?`<div class="card table-wrap"><table><thead><tr><th>选择</th><th>素材 / 版本</th><th>拍法</th><th>批次</th><th>出镜 / 声音</th><th>责任人</th><th>状态</th><th class="num">预算</th><th>操作</th></tr></thead><tbody>${rows.map(job=>`<tr><td><input type="checkbox" class="checkbox" data-select-job="${job.id}" aria-label="选择 ${escapeText(job.name)}" ${viewState.selectedJobs.has(job.id)?'checked':''}></td><td><div class="row">${imageMarkup(productCatalog.find(item=>item.sku===job.sku)||product(),'file-thumb')}<div><div class="file-name">${escapeText(job.name)}</div><div class="job-card-meta">${job.demo?'示例 / ':''}${job.sku} · V${job.version||1}</div></div></div></td><td>${escapeText(job.format)}</td><td>${escapeText(job.batch)}</td><td><div>${escapeText(job.model)}</div><div class="job-card-meta">${escapeText(job.voice)}</div></td><td>${escapeText(job.reviewer||'林川')}</td><td><span class="row-status"><i class="dot ${job.status==='已归档'?'green':job.status==='待审片'?'blue':''}"></i>${escapeText(job.status)}</span></td><td class="num">${job.cost}积分<br><span class="small-print">示例报价</span></td><td>${button('打开','job-detail','ghost sm',`data-id="${job.id}"`)}</td></tr>`).join('')}</tbody></table><div class="pagination"><span class="meta">共 ${list.length} 条 / 第 ${viewState.tablePage} 页</span><div class="row gap8">${button('上一页','queue-page','sm',`data-direction="-1" ${viewState.tablePage===1?'disabled':''}`)}${button('下一页','queue-page','sm',`data-direction="1" ${viewState.tablePage===pageCount?'disabled':''}`)}</div></div></div>`:emptyState('暂无这个状态的产单','先从单条素材建立配置，再批量排产',button('开始排产','nav','primary','data-view="batch"'))}${viewState.selectedJobs.size?`<div class="bulk-bar"><span class="small">选中 ${viewState.selectedJobs.size} 条</span><div class="row wrap gap8">${button('批量分配','assign-jobs')}${button('检查提交预算','submit-budget')}${button('导出选中','export-jobs')}${button('取消','clear-jobs','ghost')}</div></div>`:''}`;
}
function reviewPage() {
  const jobs=client().jobs.filter(job=>['待审片','需重做','已归档'].includes(job.status));
  return `${headline('审片与交付','按镜头、画面、声音、字幕记录问题；同一个素材 ID 保留所有版本',button('查看产单','nav','','data-view="queue"'))}${jobs.length?`<div class="review-list">${jobs.slice(0,12).map(job=>`<article class="card"><div class="review-screen">${imageMarkup(productCatalog.find(item=>item.sku===job.sku)||product())}<span class="review-caption">${escapeText(job.config?.hook||'先看商品细节')}</span></div><div class="review-body"><div class="row between"><h3>${escapeText(job.name)}</h3>${badge(job.status,job.status==='已归档'?'green':'orange')}</div><p>${job.demo?'示例任务，非真实成片':job.fileId?'本地编排 WebM':'待接入真实模型'} · ${escapeText(job.reviewer||'林川')}</p><div class="row gap8">${button('逐镜审片','review-job','primary sm',`data-id="${job.id}"`)}${button('交付包','deliver-job','sm',`data-id="${job.id}"`)}</div></div></article>`).join('')}</div>`:emptyState('还没有可审素材','导出一条本地粗剪预览或接入模型后，按版本审片',button('做一条素材','nav','primary','data-view="studio"'))}`;
}

function referencePage() {
  const reference=client().reference;
  const shots=reference?.shots||[];
  const shot=shots[viewState.referenceFrame]||shots[0];
  return `${headline('参考片拆解','真实播放与抽帧，人工或模型拆解要有来源；镜头、声音、花字和商品职责分开',button('上传参考视频','upload-reference','primary'))}<div class="reference-layout"><div class="card pad"><h3>原片与时间码</h3>${reference?`<video class="reference-video mt" id="referenceVideo" data-file="${reference.fileId}" controls preload="metadata"></video><div class="row between mt"><strong>${escapeText(reference.name)}</strong>${badge(reference.duration?reference.duration.toFixed(1)+'s':'读取中')}</div><div class="reference-frames">${shots.map((item,index)=>`<button class="${index===viewState.referenceFrame?'selected':''}" data-action="reference-frame" data-index="${index}">${item.frameId?`<img data-file="${item.frameId}" alt="${item.start.toFixed(1)}秒真实抽帧">`:'<div class="placeholder-media">待抽帧</div>'}<small>${item.start.toFixed(1)}–${item.end.toFixed(1)}s</small></button>`).join('')}</div><div class="row wrap gap8 mt">${button('按时段抽帧','extract-reference-frames')}${button('添加切点','add-cut')}${button('拆解接口状态','capability-report','ghost')}</div><div class="notice mt">初始时段是均分参考，不是自动切镜识别。你可修改切点并重新抽帧；真实 ASR/OCR/切镜模型尚未连接。</div>`:uploadZone('referenceVideoUpload','video/*','上传实际参考片','读取真实时长并抽取画面；不生成视频',false)}<div class="divider"></div><div class="small-print">参考片来源与客户授权保留；可借鉴叙事与节奏，品牌、商品、人物和台词需要按当前客户改编</div></div><section class="card"><div class="card-header"><h3>这一镜怎么做</h3>${badge(reference?'人工待确认':'尚无参考片','orange')}</div>${shot?`<div class="pad"><div class="tabs">${['镜头','台词与声音','花字与改编'].map(tab=>`<button class="${viewState.referenceTab===tab?'active':''}" data-action="reference-tab" data-value="${tab}">${tab}</button>`).join('')}</div><div class="setting-grid"><label class="field"><span>开始时间（秒）</span><input class="input" type="number" min="0" step="0.1" id="referenceStart" value="${shot.start}"></label><label class="field"><span>结束时间（秒）</span><input class="input" type="number" min="0.1" step="0.1" id="referenceEnd" value="${shot.end}"></label></div>${viewState.referenceTab==='镜头'?`<label class="field"><span>原片画面 / 动作</span><textarea id="referenceVisual" class="input" placeholder="例如：固定机位，人物指向商品陈列">${escapeText(shot.visual||'')}</textarea></label><div class="setting-grid">${selectorField('景别','referenceScale',['中景','近景','细节特写','全景','商品定格'],shot.scale||'中景')}${selectorField('叙事职责','referenceRole',['钩子','商品介入','证据','利益点','使用结果','行动落点'],shot.role||'钩子')}</div>`:viewState.referenceTab==='台词与声音'?`<label class="field"><span>原片台词</span><textarea id="referenceSpeech" class="input" placeholder="人工填写，或后续 ASR 返回">${escapeText(shot.speech||'')}</textarea></label><label class="field"><span>背景音乐 / 音效与切点</span><textarea id="referenceAudio" class="input" placeholder="记录声音在什么时间出现，怎样配合动作">${escapeText(shot.audio||'')}</textarea></label>`:`<label class="field"><span>花字 / 商品露出</span><textarea id="referenceText" class="input" placeholder="位置、停留时间、原字词与商品职责">${escapeText(shot.text||'')}</textarea></label><label class="field"><span>替换成当前商品的改编</span><textarea id="referenceAdapt" class="input" placeholder="只借结构，重写商品、台词和当前事实">${escapeText(shot.adapt||'')}</textarea></label>`}<div class="row wrap mt">${button('保存本镜','save-reference','primary')}${button('带入当前脚本','apply-reference')}${button('导出拆解单','export-reference')}</div><p class="small-print mt">来源：真实抽帧 + 人工拆解；不会把未识别的内容假写成模型分析</p></div>`:emptyState('先上传参考片','拆解后逐镜改编。原片画面与声音都可查看') }</section></div>`;
}
function preferencesPage() {
  const presets=[...client().templates.map(item=>({...item,type:'制作配方'})),...client().preferences.map(item=>({...item,type:'客户偏好'}))];
  return `${headline('客户预设','确认过的拍法与人员配置保存复用；每个客户有自己的配方和适用场景',button('保存当前配方','save-template','primary'))}<div class="grid three">${presets.map(item=>`<article class="card pad"><div class="row between"><h3>${escapeText(item.name)}</h3>${badge(item.type)}</div><p class="meta mt">${escapeText(item.config.category)} / ${escapeText(item.config.format)}</p><div class="summary-fields mt"><div><label>开场</label>${item.config.hook}</div><div><label>画面</label>${item.config.camera}</div><div><label>后期</label>${item.config.subtitle}</div><div><label>模特</label>${escapeText(getModels().find(model=>model.id===item.config.modelId)?.name||'不出镜')}</div></div><div class="row wrap mt">${button('用此配方制作','use-template','primary sm',`data-id="${item.id}"`)}${button('导出配方','export-template','sm',`data-id="${item.id}"`)}</div></article>`).join('')}</div>${!presets.length?emptyState('把常用选择留下来','在单条制作里选好拍法、模特和后期，保存为客户预设，下次直接使用'):''}<div class="card mt"><div class="card-header"><h3>从工作记录沉淀经验</h3><span class="meta">由客户确认，随时可改</span></div><div class="pad"><p class="small muted">采纳的开场、改过的词、通过的穿搭和反复重做的镜头可以成为偏好。当前版本保存具体配置，真实统计学习需要后端行为事件和模型检索。</p><div class="director-card mt"><b>预设不是越多越好</b><br>按品类、平台与任务组织。例如“服饰常青款15秒口播”与“大促福利直播引流”分开，避免用一套规则覆盖所有客户。</div></div></div>`;
}
function metricTotals() {
  return client().metrics.reduce((total,item)=>{['spend','impressions','clicks','orders','revenue'].forEach(key=>total[key]+=Number(item[key])||0);return total;},{spend:0,impressions:0,clicks:0,orders:0,revenue:0});
}
function dataPage() {
  const records=client().metrics;
  const totals=metricTotals();
  const ratio=(value,base)=>base?(value/base).toFixed(2):'—';
  return `${headline('素材投放数据','生产记录和投放记录用素材 ID 关联，按拍法与版本复盘，避免只看生成数量',button('导入素材报表','import-data','primary'))}${!records.length?emptyState('没有报表，就不展示增长数字','导入消耗、曝光、点击、订单和成交金额；真实千川授权尚未连接',button('下载CSV模板','csv-template')):`<div class="notice mb">来源：${escapeText(client().dataSource||'导入数据')}。示例记录明确标记；统计只描述已有表现，不直接证明创意造成增长。</div>${statsMarkup([['消耗','¥'+totals.spend.toLocaleString(),'当前客户报表合计'],['点击率',ratio(totals.clicks*100,totals.impressions)+'%','总点击 / 总曝光'],['订单成本',totals.orders?'¥'+ratio(totals.spend,totals.orders):'—','消耗 / 订单'],['成交ROAS',ratio(totals.revenue,totals.spend),'成交金额 / 消耗']])}<div class="data-layout"><div class="card"><div class="card-header"><h3>各素材的消耗</h3><span class="meta">单位：元</span></div><div class="pad" style="padding-bottom:42px"><div class="bars">${records.slice(0,8).map((item,index)=>`<div class="bar-column"><span class="mono">${item.spend}</span><div class="bar" style="height:${Math.max(3,item.spend/Math.max(...records.map(record=>record.spend),1)*140)}px"></div><small>素材${index+1}</small></div>`).join('')}</div></div></div><div class="card pad"><h3>下一次怎样迭代</h3><p class="meta mt">先看有效素材的拍法和钩子，再控制单个变量测试；不要把所有维度同时换掉。</p><div class="divider"></div><div class="rate-grid"><div class="rate-box"><span class="meta">导入素材数</span><strong>${records.length}</strong></div><div class="rate-box"><span class="meta">生产产单数</span><strong>${client().jobs.length}</strong></div></div>${button('导出素材报表','export-data','mt')}</div></div><div class="card table-wrap mt"><table><thead><tr><th>素材名 / SKU</th><th>关联产单</th><th class="num">消耗</th><th class="num">点击率</th><th class="num">订单</th><th class="num">订单成本</th><th class="num">ROAS</th></tr></thead><tbody>${records.map((item,index)=>`<tr><td><strong>${escapeText(item.name)}</strong><div class="meta">${escapeText(item.sku||'未填SKU')}</div></td><td><select class="input" data-metric-job="${index}" aria-label="关联 ${escapeText(item.name)}"><option value="">未关联</option>${client().jobs.slice(0,100).map(job=>`<option value="${job.id}" ${item.jobId===job.id?'selected':''}>${escapeText(job.name)}</option>`).join('')}</select></td><td class="num">${item.spend}</td><td class="num">${ratio(item.clicks*100,item.impressions)}%</td><td class="num">${item.orders}</td><td class="num">${ratio(item.spend,item.orders)}</td><td class="num">${ratio(item.revenue,item.spend)}</td></tr>`).join('')}</tbody></table></div>`}<div class="card mt"><div class="card-header"><h3>数据连接状态</h3>${button('说明','capability-report','ghost sm')}</div><div class="pad grid three"><div><h4>千川素材报表</h4><p class="meta">CSV 已可用 / 正式 API 未连接</p></div><div><h4>蝉妈妈等参考来源</h4><p class="meta">授权素材或客户导出 / 未自动抓取</p></div><div><h4>生产事件</h4><p class="meta">本地选择、版本与审片记录</p></div></div></div>`;
}
function settingsPage() {
  return `${headline('接口与费用','报价与能力必须真实可查；未连接的模型不会显示虚假“成功”')}<div class="grid two"><section class="card pad"><h3>供应商配置</h3><div class="notice warn mt">当前尚未接入你的官方供应商。需要实际服务地址、鉴权方式、模型参数与任务回调协议。</div><label class="field mt"><span>供应商名称</span><input class="input" id="supplierName" value="${escapeText(client().supplierName||'')}" placeholder="你的签约模型供应商"></label><label class="field"><span>服务地址</span><input class="input" id="supplierUrl" value="${escapeText(client().supplierUrl||'')}" placeholder="https://api.example.com"></label><label class="field"><span>接口密钥</span><input class="input" type="password" id="supplierKey" placeholder="此功能版不保存密钥"></label><div class="row wrap">${button('保存非敏感配置','save-supplier')}${button('查看接入要求','capability-report')}</div><p class="small-print mt">没有从浏览器直接代调用生产接口；正式版需要服务器鉴权、任务回调和费用账本。</p></section><section class="card pad"><h3>成本控制</h3><div class="summary-fields mt"><div><label>默认生成数量</label>1 条</div><div><label>批量排产</label>只建任务，不发起生成</div><div><label>单条示例报价</label>90 积分，非真实价格</div><div><label>客户预算</label>${client().budget} 积分 / 演示额度</div></div><label class="field mt"><span>本批次预算上限</span><input type="number" min="0" id="clientBudget" class="input" value="${client().budget}"></label>${button('保存预算上限','save-budget')}<div class="divider"></div>${button('导出客户工作空间','export-workspace')}<div class="notice mt">真实费用包含重试、识别、音频、后期与存储。不能用单次模型折扣代替最终素材成本。</div></section></div>`;
}

function compilePrompt(config=state.config,shots=getShots()) {
  const model=getModels().find(item=>item.id===config.modelId);
  const look=client().looks.find(item=>item.id===config.lookId);
  const garmentNames=look?.parts.map(id=>getGarments().find(item=>item.id===id)?.name).filter(Boolean).join('、')||'原图服装';
  const voice=getVoices().find(item=>item.id===config.voiceId);
  return XinliuStrategies.compile({ config, shots, product: productCatalog.find(item=>item.id===config.productId)||client().assets.find(item=>item.id===config.productId), model, look:look?{...look,name:look.name+' / '+garmentNames}:null, voice }).videoPrompt;
}
function render() {
  stopPreview();
  collabState();
  for(const [clientId,current] of Object.entries(state.clients)){
    if(collabClientAllowed(clientId))current.projects.filter(work=>!work.campaignId).forEach(work=>collabRegisterWork(work,clientId));
  }
  const defaultView=state.startView==='队列优先'?'queue':state.startView==='制作优先'?'home':['owner','admin','lead'].includes(collabActor().role)?'projects':'tasks';
  const view=(location.hash|| '#'+defaultView).slice(1).split('?')[0];
  viewState.view=view;
  const routes={home:flowHome,projects:collabPortfolio,tasks:collabTasks,runs:collabRuns,project:collabProjectDetail,deliveries:collabGuest,gallery:flowGallery,quick:flowQuick,brief:flowBrief,result:flowResult,drama:flowDrama,studio:workspaceStudio,batch:workspaceBatch,queue:workspaceQueue,review:reviewPage,resources:workspaceResources,assets:workspaceResources,models:workspaceResources,wardrobe:workspaceResources,voices:workspaceResources,reference:workspaceResources,preferences:flowKnowledge,data:dataPage,settings:collabTeam};
  const allowed=collabRouteAllowed(view);
  const route=view==='home'&&['maker','reviewer'].includes(collabActor().role)?collabTasks:routes[view]||workspaceQueue;
  app.innerHTML=view==='login'?loginPage():workspaceShell(view,collabActor().role==='guest'?collabGuest():allowed?route():collabDenied());
  bindForms();
  hydrateFiles();
  applySubtitleStyle();
  if(allowed&&collabActor().role!=='guest'){
    flowAfterRender();
    guardAfterRender();
  }
  collabAfterRender();
  if (allowed && collabActor().role !== 'guest') referenceAfterRender();
  if (allowed && collabActor().role !== 'guest') generationAfterRender();
}
function navigate(view) { closeModal(); if(location.hash==='#'+view)render();else location.hash=view; }
function openModal(title,body,large=false) {
  if (!viewState.modal) viewState.returnFocus = document.activeElement;
  viewState.modal=title;
  overlay.innerHTML=`<div class="modal-backdrop"><section class="modal ${large?'large':''}" role="dialog" aria-modal="true" aria-label="${escapeText(title)}"><div class="modal-head"><h2>${title}</h2><button class="close" data-action="close-modal" aria-label="关闭">×</button></div><div class="modal-body">${body}</div></section></div>`;
  bindForms();
  hydrateFiles();
  setTimeout(()=>overlay.querySelector('input,select,button')?.focus(),20);
}
function closeModal() {
  overlay.innerHTML='';
  viewState.modal=null;
  const trigger=viewState.returnFocus;
  viewState.returnFocus=null;
  if(trigger?.isConnected)trigger.focus();
}
function applySubtitleStyle() {
  const line=document.getElementById('subtitleLine');
  if(!line)return;
  line.style.color=state.config.subtitle==='黄字重点'?'#fff2a0':'#fff';
  line.style.background=state.config.subtitle==='干净下方字幕'?'#0007':'transparent';
  const hook=document.getElementById('hookLine');
  if(hook){hook.style.fontSize=state.config.flower==='规格信息条'?'17px':'22px';hook.style.color=state.config.flower==='促销贴片'?'#ffe293':'#fff9ac';}
}
function stopPreview() { if(viewState.previewTimer)clearInterval(viewState.previewTimer);viewState.isPlaying=false; }
function playPreview() {
  if(viewState.isPlaying){stopPreview();return;}
  viewState.isPlaying=true;
  const shots=getShots();
  const started=performance.now();
  viewState.previewTimer=setInterval(()=>{
    const seconds=(performance.now()-started)/1000;
    const index=shots.findIndex(shot=>seconds>=shot.start&&seconds<shot.end);
    if(seconds>=state.config.duration){stopPreview();return;}
    updatePreview(index<0?0:index,seconds);
  },100);
}
function updatePreview(index,seconds) {
  const shot=getShots()[index];
  if(!shot)return;
  viewState.activeShot=index;
  const hook=document.getElementById('hookLine');
  const speech=document.getElementById('subtitleLine');
  if(hook)hook.textContent=shot.hook||state.config.claimFocus;
  if(speech)speech.textContent=shot.speech;
  const time=document.getElementById('previewTime');
  if(time)time.textContent=`00:${String(Math.floor(seconds)).padStart(2,'0')} / 00:${state.config.duration}`;
  const progress=document.getElementById('previewProgress');
  if(progress)progress.style.width=(seconds/state.config.duration*100)+'%';
  const asset = client().assets.find(item=>item.id===shot.assetId);
  const fallback = state.config.format.includes('口播')||state.config.format.includes('试穿')||state.config.category==='信息流漫剧'?selectedModel()||product():product();
  const media=asset||fallback;
  const old=document.querySelector('#previewScreen .scene-img');
  const identity=media?.fileId||media?.image||'';
  if(old&&identity&&old.dataset.identity!==identity){
    if(media.kind==='视频'&&media.fileId){
      const video=document.createElement('video');video.className='scene-img';video.id='shotPreviewVideo';video.muted=true;video.playsInline=true;video.preload='auto';video.dataset.identity=identity;old.replaceWith(video);
      fileUrl(media.fileId).then(url=>{if(video.isConnected){video.src=url;video.onloadeddata=()=>{video.currentTime=shot.clipStart||0;if(viewState.isPlaying)video.play().catch(()=>{});};}});
    }else{
      const image=document.createElement('img');image.className='scene-img';image.alt=media.name||'本镜素材';image.dataset.identity=identity;old.replaceWith(image);if(media.fileId)fileUrl(media.fileId).then(url=>image.src=url);else image.src=media.image;
    }
  }
  document.querySelectorAll('.preview-frames button').forEach((item,itemIndex)=>item.classList.toggle('active',index===itemIndex));
  const video = document.getElementById('shotPreviewVideo');
  if (video && video.readyState >= 2) {
    if (!viewState.isPlaying) video.currentTime = Math.min(video.duration-.02, Math.max(0, (shot.clipStart||0)+seconds-shot.start));
    else if (video.paused) { video.currentTime = shot.clipStart||0;video.play().catch(()=>{}); }
  }
}

function bindForms() {
  document.querySelectorAll('input[type=file]').forEach(input=>input.onchange=event=>uploadFiles(event.target.id,[...event.target.files]));
  document.querySelectorAll('[data-drop]').forEach(zone=>{
    zone.ondragover=event=>{event.preventDefault();zone.classList.add('dragover');};
    zone.ondragleave=()=>zone.classList.remove('dragover');
    zone.ondrop=event=>{event.preventDefault();zone.classList.remove('dragover');uploadFiles(zone.dataset.drop,[...event.dataTransfer.files]);};
  });
  const login=document.getElementById('loginForm');
  if(login)login.onsubmit=event=>{event.preventDefault();state.signedIn=true;persist();navigate('home');};
}

async function uploadFiles(target,files) {
  if(!files.length)return;
  try {
    if(target==='dataCsv'){await importData(files[0]);return;}
    const current=client();
    const ownerScope=state.activeClient;
    if(target==='referenceVideoUpload'){
      const file=files[0];if(!file.type.startsWith('video/'))throw new Error('请选择视频文件');
      const fileId=await keepFile(file,ownerScope);
      const video=document.createElement('video');video.preload='metadata';video.src=await fileUrl(fileId);
      const duration=await new Promise((resolve,reject)=>{video.onloadedmetadata=()=>resolve(video.duration);video.onerror=()=>reject(new Error('无法读取此视频格式'));setTimeout(()=>reject(new Error('读取时长超时，请换 MP4 或 WebM')),10000);});
      if(!Number.isFinite(duration)||duration<=0)throw new Error('视频时长无法读取');
      current.reference={name:file.name,fileId,duration,shots:Array.from({length:5},(_,index)=>({start:Math.round(index*duration/5*1000)/1000,end:Math.round((index+1)*duration/5*1000)/1000,visual:'',speech:'',audio:'',text:'',adapt:'',role:index===0?'钩子':index===4?'行动落点':'商品介入',scale:'中景',frameId:null})),source:'用户上传',status:'人工待拆解'};
      current.assets.unshift({id:uniqueId('asset'),name:file.name,fileId,kind:'视频',tag:'参考片',authority:'客户上传待确认',scope:state.activeClient});
      viewState.referenceFrame=0;persist();closeModal();render();toast('参考片已保存，正在抽取真实画面');await extractReferenceFrames();return;
    }
    for(const file of files){
      if(file.size>120*1024*1024)throw new Error('请将单个文件控制在120MB以内');
      const fileId=await keepFile(file,ownerScope);
      const id=uniqueId('asset');
      const kind=file.type.startsWith('image/')?'图片':file.type.startsWith('video/')?'视频':file.type.startsWith('audio/')?'音频':'文档';
      const base={id,name:file.name,fileId,kind,tag:target==='draftMedia'?'商品图':'上传素材',sku:'',scope:ownerScope,source:'客户上传',authority:'待确认授权',size:file.size,uploaded:new Date().toISOString()};
      if(target==='modelImage'){
        if(kind!=='图片')throw new Error('模特需要上传图片');
        current.models.push({...base,gender:document.getElementById('modelUploadGender')?.value||'未标注',style:document.getElementById('modelUploadStyle')?.value||'客户出镜',age:'客户设置',scenes:[state.config.category],scope:state.activeClient});
      }else if(target==='garmentImage'){
        if(kind!=='图片')throw new Error('服装需要上传图片');
        current.garments.push({...base,slot:document.getElementById('garmentUploadSlot')?.value||'上衣'});
      }else if(target==='voiceAudio'){
        if(kind!=='音频')throw new Error('请选择音频文件');
        current.voices.push({...base,style:'真人口播',locale:'原音频',gender:'客户原声'});
      }else current.assets.unshift(base);
      if(target==='draftMedia'){state.config.assets.push(id);if(kind==='图片'){base.sku=state.config.productId==='custom'?'自定义SKU':product().sku;state.config.productId=id;state.config.factsConfirmed=false;}}
    }
    persist();closeModal();render();toast(`已保存 ${files.length} 个文件到当前客户资源`);
  } catch(error) { toast(error.message); }
}

async function extractReferenceFrames() {
  const reference=client().reference;
  const ownerScope=state.activeClient;
  if(!reference)return;
  const source=await fileUrl(reference.fileId);
  const video=document.createElement('video');
  video.preload='auto';video.muted=true;video.src=source;
  await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('视频读取失败'));});
  const canvas=document.createElement('canvas');canvas.width=240;canvas.height=Math.max(120,Math.round(240*video.videoHeight/video.videoWidth));
  const context=canvas.getContext('2d');
  for(const shot of reference.shots){
    const time=Math.min(reference.duration-.06,shot.start+.05);
    await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});
    context.drawImage(video,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.78));
    if(blob)shot.frameId=await keepFile(blob,ownerScope);
  }
  persist();if(viewState.view==='reference'||viewState.view==='resources'&&workspaceUi.resourceTab==='reference')render();toast('真实抽帧已保存，切点与内容请人工校对');
}

function batchProducts() {
  const uploaded=client().assets.filter(item=>item.kind==='图片'&&item.tag==='商品图');
  return [...new Map([...productCatalog.filter(item=>item.category===state.config.category),...uploaded].map(item=>[item.id,item])).values()];
}

function readiness(config=state.config) {
  const image=productCatalog.find(item=>item.id===config.productId)||client().assets.find(item=>item.id===config.productId);
  const model=getModels().find(item=>item.id===config.modelId);
  const issues=[];
  if(!config.factsConfirmed)issues.push('商品事实未确认');
  if(!image?.image&&!image?.fileId)issues.push('商品主图未准备');
  if(!['none',''].includes(config.modelId)&&!model)issues.push('模特引用不可用');
  if(config.lookId&&!client().looks.some(item=>item.id===config.lookId))issues.push('搭配引用不可用');
  return issues;
}

function selectConfig(field,value) {
  const previousConfig=JSON.parse(JSON.stringify(state.config));
  state.config[field]=value;
  if(field==='category'){
    const data=categories[value];
    state.config.format=data.style;state.config.claimFocus=data.claims[0];state.config.evidence=data.evidence[0];state.config.modelId=data.model;
    state.config.productId=productCatalog.find(item=>item.category===value)?.id||'custom';state.config.factsConfirmed=false;state.config.assets=[];viewState.batch=null;
  }
  if(['category','productId'].includes(field))state.config.factsConfirmed=false;
  if(['format','hook','scene','camera','style','category','claimFocus','duration','shotsCount'].includes(field)){
    const project=client().projects.find(item=>item.id===state.config.draftId);
    if(project?.shots){
      if(project.flow&&['duration','shotsCount'].includes(field))flowRestructureShots(project,state.config.shotsCount,state.config.duration);
      else if(project.flow&&!['format','category'].includes(field)){
        project.shots.forEach(shot=>{if(['scene','camera','style'].includes(field))shot.visual=shot.visual.split(previousConfig[field]).join(String(value));});
        flowRefreshShots(project);
      }else project.shots=generateScript();
    }
  }
  saveDraft();render();
}
function voicePreview(voice,text) {
  if(voice?.fileId){fileUrl(voice.fileId).then(url=>{if(viewState.audio)viewState.audio.pause();viewState.audio=new Audio(url);viewState.audio.playbackRate=state.config.speed;viewState.audio.play().catch(()=>toast('请用音频控件播放'));});return;}
  if(!('speechSynthesis' in window)){toast('此浏览器没有系统语音，上传真实口播可试听');return;}
  speechSynthesis.cancel();
  const utterance=new SpeechSynthesisUtterance(text||voice?.demoText||getShots().map(shot=>shot.speech).join('。'));
  const choices=speechSynthesis.getVoices().filter(item=>item.lang.toLowerCase().includes('zh'));
  if(choices.length)utterance.voice=choices[0];
  utterance.lang='zh-CN';utterance.rate=state.config.speed;
  utterance.onerror=()=>toast('系统语音不可用，可上传真人口播');
  speechSynthesis.speak(utterance);
  toast('正在用系统声音试听；不是克隆音色');
}

function openProjectForm() {
  openModal('创建单条素材',`<form id="newProjectForm"><label class="field"><span>素材任务名</span><input name="name" class="input" required placeholder="例如：白T / 口播痛点 / 第一版"></label>${selectorField('商品品类','newCategory',Object.keys(categories),state.config.category)}<div class="notice">创建任务不调用模型；后续选择商品、拍法、模特和后期。</div><button class="btn primary full mt" type="submit">创建并配置</button></form>`);
  document.getElementById('newProjectForm').onsubmit=event=>{
    event.preventDefault();const name=new FormData(event.target).get('name').trim();
    state.config={...defaultConfig(),category:document.getElementById('newCategory').value};
    const data=categories[state.config.category];state.config.format=data.style;state.config.claimFocus=data.claims[0];state.config.evidence=data.evidence[0];state.config.productId=productCatalog.find(item=>item.category===state.config.category)?.id||'custom';
    const project=ensureDraft();project.name=name;viewState.stage=0;persist();navigate('studio');
  };
}
function editAsset(id) {
  const asset=client().assets.find(item=>item.id===id);
  if(!asset)return;
  openModal('素材详情与引用',`<div class="grid two"><div>${asset.kind==='视频'?`<video data-file="${asset.fileId}" controls style="width:100%;max-height:350px;background:#24272c"></video>`:asset.kind==='音频'?`<audio data-file="${asset.fileId}" controls style="width:100%"></audio>`:imageMarkup(asset,'reference-video')}</div><form id="assetEdit"><label class="field"><span>素材名称</span><input class="input" name="name" value="${escapeText(asset.name)}" required></label><label class="field"><span>SKU</span><input class="input" name="sku" value="${escapeText(asset.sku||'')}"></label><label class="field"><span>素材职责</span><select class="input" name="tag">${['商品图','细节图','使用视频','口播','参考片','品牌资料','客户素材'].map(tag=>`<option ${tag===asset.tag?'selected':''}>${tag}</option>`).join('')}</select></label><label class="field"><span>授权记录</span><input class="input" name="authority" value="${escapeText(asset.authority||'待确认')}"></label><button class="btn primary" type="submit">保存资料</button></form></div>`,true);
  guardAssetFields(asset);
  document.getElementById('assetEdit').onsubmit=event=>{event.preventDefault();const data=new FormData(event.target);asset.name=data.get('name').trim();asset.sku=data.get('sku').trim();asset.tag=data.get('tag');asset.authority=data.get('authority');asset.rightsUntil=data.get('rightsUntil')||'';asset.useStatus=data.get('useStatus')||'可用';persist();closeModal();render();toast('素材资料已保存');};
}
function openJob(id,review=false) {
  const job=client().jobs.find(item=>item.id===id);if(!job)return;
  openModal(review?'逐镜审片':'产单详情',`<div class="grid two"><div>${job.fileId?`<video data-file="${job.fileId}" controls style="width:100%;max-height:340px;background:#24272a"></video>`:`${imageMarkup(productCatalog.find(item=>item.sku===job.sku)||product(),'reference-video')}<p class="small-print mt">${job.demo?'此任务为示例，图片不是它的成片':'未提交视频模型；当前只有配置和脚本'}</p>`}<div class="summary-fields mt"><div><label>版本</label>V${job.version||1}</div><div><label>状态</label>${job.status}</div><div><label>模特</label>${escapeText(job.model)}</div><div><label>声音</label>${escapeText(job.voice)}</div></div></div><div><h3>${escapeText(job.name)}</h3><p class="meta">${escapeText(job.batch)} / ${job.sku}</p><div class="divider"></div><div class="grid two">${selectorField('意见归属','reviewKind',['画面','商品','人物与穿搭','口播','字幕花字','节奏','整体'],job.lastKind||'画面')}<label class="field"><span>具体时间码</span><input id="reviewTime" class="input" placeholder="例如 00:03" value="00:00"></label></div><label class="field"><span>修改意见</span><textarea id="reviewComment" class="input" placeholder="例如：前三秒商品没有看清，保留口播只改近景"></textarea></label><div class="row wrap gap8">${button('保存意见','save-job-comment','',`data-id="${id}"`)}${button('退回重做','return-job','',`data-id="${id}"`)}${button('确认归档','approve-job','primary',`data-id="${id}"`)}</div><div class="mt">${(job.comments||[]).map(comment=>`<div class="comment"><small>${escapeText(comment.time)} / ${escapeText(comment.kind)} / ${escapeText(comment.by)}</small><p>${escapeText(comment.text)}</p></div>`).join('')}</div><div class="row wrap gap8 mt">${button('载入此制作配置','use-job','',`data-id="${id}"`)}${button('交付包','deliver-job','',`data-id="${id}"`)}</div></div></div>`,true);
}
function createJob() {
  const issues=readiness();if(issues.length){toast(issues.join('；'));return;}
  saveDraft();
  const config=JSON.parse(JSON.stringify(state.config));
  const version = client().jobs.filter(job => job.sku === product().sku && job.format === config.format && job.config?.hook === config.hook).length + 1;
  const job={id:uniqueId('job'),name:`${product().sku}_${config.format}_${config.hook}_V${version}`,sku:product().sku,format:config.format,batch:'单条制作',model:selectedModel()?.name||'无真人',voice:selectedVoice()?.name||'无口播',reviewer:'林川',status:'未提交',cost:90,version,config,shots:JSON.parse(JSON.stringify(getShots())),comments:[],demo:false};
  client().jobs.unshift(job);persist();toast('产单已建立，尚未调用模型或扣费');navigate('queue');
}

function parseCsv(text) {
  const rows=[];let row=[],field='',quoted=false;
  for(let index=0;index<text.length;index++){
    const char=text[index];
    if(char==='"'){if(quoted&&text[index+1]==='"'){field+='"';index++;}else quoted=!quoted;}
    else if(char===','&&!quoted){row.push(field);field='';}
    else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[index+1]==='\n')index++;row.push(field);if(row.some(value=>value.trim()))rows.push(row);row=[];field='';}
    else field+=char;
  }
  if(field||row.length){row.push(field);rows.push(row);}return rows;
}
async function importData(file) {
  const rows=parseCsv((await file.text()).replace(/^\uFEFF/,''));const header=rows.shift()?.map(value=>value.trim())||[];
  const required=['素材名','消耗','曝光','点击','订单','成交金额'];
  if(!required.every(value=>header.includes(value)))throw new Error('报表缺少必要列，请先下载模板');
  const get=(row,name)=>row[header.indexOf(name)]||'';
  const numeric=value=>Number(String(value).replace(/[¥￥,\s]/g,''));
  const records=rows.map(row=>({name:get(row,'素材名'),sku:get(row,'SKU'),spend:numeric(get(row,'消耗')),impressions:numeric(get(row,'曝光')),clicks:numeric(get(row,'点击')),orders:numeric(get(row,'订单')),revenue:numeric(get(row,'成交金额'))}));
  if(!records.length||records.some(record=>!record.name||['spend','impressions','clicks','orders','revenue'].some(key=>!Number.isFinite(record[key])||record[key]<0)))throw new Error('有无效数值或空素材名，请校对报表');
  client().metrics=records;client().dataSource=file.name;persist();closeModal();render();toast(`导入 ${records.length} 条数据并完成真实计算`);
}

function timecode(seconds) {
  const whole=Math.floor(seconds);const milliseconds=Math.round((seconds-whole)*1000);
  return `00:${String(Math.floor(whole/60)).padStart(2,'0')}:${String(whole%60).padStart(2,'0')},${String(milliseconds).padStart(3,'0')}`;
}
function subtitleSrt(shots=getShots()) { return shots.map((shot,index)=>`${index+1}\n${timecode(shot.start)} --> ${timecode(shot.end)}\n${shot.speech}`).join('\n\n'); }

document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;const id=target.dataset.id;const current=client();
  switch(action){
    case 'nav': navigate(target.dataset.view); break;
    case 'close-modal': closeModal(); break;
    case 'enter': state.signedIn=true;persist();navigate('home');break;
    case 'logout': navigate('login');break;
    case 'load-demo': loadDemo();break;
    case 'new-project': openProjectForm();break;
    case 'open-project': {const project=current.projects.find(item=>item.id===id);state.config={...defaultConfig(),...project.config,draftId:project.id};viewState.stage=2;persist();navigate('studio');break;}
    case 'save-draft': saveDraft();toast('配置与草稿已保存在当前客户');break;
    case 'studio-stage': viewState.stage=Number(target.dataset.stage);saveDraft();render();break;
    case 'previous-stage': viewState.stage=Math.max(0,viewState.stage-1);render();break;
    case 'next-stage': if(viewState.stage===0&&!state.config.factsConfirmed){workspaceUi.screenIssues=['请先确认商品卖点与活动信息'];render();break;}workspaceUi.screenIssues=[];viewState.stage=Math.min(4,viewState.stage+1);saveDraft();render();break;
    case 'config-choice': selectConfig(target.dataset.field,target.dataset.value);break;
    case 'rebuild-shots': {const project=ensureDraft();project.shots=generateScript();persist();render();toast('规则草稿已重排，锁定镜头已保留');break;}
    case 'preview-shot': stopPreview();viewState.activeShot=Number(target.dataset.index);updatePreview(viewState.activeShot,getShots()[viewState.activeShot].start);if(viewState.view==='studio'){workspaceRefreshShot();}break;
    case 'play-preview': playPreview();break;
    case 'speak-script': voicePreview(selectedVoice());break;
    case 'choose-model': state.config.modelId=id;saveDraft();toast('出镜人已应用到当前素材');render();break;
    case 'no-model': state.config.modelId='none';saveDraft();render();toast('改为商品画面，无真人出镜');break;
    case 'choose-outfit': state.config.modelId=id;viewState.lookParts=[];persist();navigate('wardrobe');break;
    case 'model-detail': {const model=getModels().find(item=>item.id===id);openModal('出镜资料',`<div class="grid two">${imageMarkup(model,'reference-video')}<div><h3>${escapeText(model.name)}</h3><p class="meta mt">${escapeText(model.gender)} / ${escapeText(model.age)} / ${escapeText(model.style)}</p><div class="notice mt">授权：${escapeText(model.authority)}<br>来源：${escapeText(model.source)}</div><div class="chips mt">${(model.scenes||[]).map(tag=>badge(tag)).join('')}</div><div class="row wrap mt">${button('用于当前素材','choose-model','primary',`data-id="${id}"`)}${button('配置穿搭','choose-outfit','',`data-id="${id}"`)}</div></div></div>`,true);break;}
    case 'upload-model': openModal('上传客户模特',`${selectorField('性别','modelUploadGender',['女','男','未标注'],'未标注')}<label class="field"><span>气质 / 适用场景</span><input class="input" id="modelUploadStyle" placeholder="例如：亲和口播，日常种草" value="客户出镜"></label>${uploadZone('modelImage','image/*','上传模特照片','保存到此客户，不自动生成新人物')}`);break;
    case 'upload-garment': openModal('上传模特服装',`${selectorField('服装部位','garmentUploadSlot',['外套','上衣','下装','整身装','鞋履','配饰'],'上衣')}${uploadZone('garmentImage','image/*','上传服装商品图','后续选择搭配，保留每件图的职责')}`);break;
    case 'toggle-garment': {const garment=getGarments().find(item=>item.id===id);const parts=[...(viewState.lookParts||selectedLook()?.parts||[])];if(parts.includes(id))viewState.lookParts=parts.filter(value=>value!==id);else{viewState.lookParts=parts.filter(value=>{const existing=getGarments().find(item=>item.id===value);return existing.slot!==garment.slot&&!(garment.slot==='整身装'&&['上衣','下装'].includes(existing.slot))&&!(['上衣','下装'].includes(garment.slot)&&existing.slot==='整身装');});viewState.lookParts.push(id);}render();break;}
    case 'clear-look': viewState.lookParts=[];state.config.lookId='';persist();render();break;
    case 'save-look': {const parts=viewState.lookParts||selectedLook()?.parts||[];if(!parts.length){toast('先选择至少一件服装');break;}const name=document.getElementById('lookName').value.trim();if(!name){toast('填一个好识别的搭配名');break;}const look={id:uniqueId('look'),name,modelId:state.config.modelId,parts:[...parts],scope:state.activeClient};current.looks.push(look);state.config.lookId=look.id;saveDraft();render();toast('搭配参考单已保存，没有调用换装模型');break;}
    case 'use-look': {const look=current.looks.find(item=>item.id===id);state.config.lookId=id;state.config.modelId=look.modelId;viewState.lookParts=[...look.parts];saveDraft();navigate('studio');break;}
    case 'choose-voice': state.config.voiceId=id;saveDraft();render();toast('音色要求已应用，上传口播优先保留原音');break;
    case 'preview-voice': voicePreview(getVoices().find(item=>item.id===id));break;
    case 'speak-voice-text': voicePreview(selectedVoice(),document.getElementById('voiceText').value);break;
    case 'stop-voice': if('speechSynthesis' in window)speechSynthesis.cancel();if(viewState.audio)viewState.audio.pause();break;
    case 'upload-voice': openModal('上传真人口播',uploadZone('voiceAudio','audio/*','上传口播或旁白录音','真实播放与本地混音，不执行克隆'));break;
    case 'refresh-voices': {const count='speechSynthesis' in window?speechSynthesis.getVoices().length:0;document.getElementById('voiceSystemInfo').textContent=`当前系统可用 ${count} 个声音；内置标签不是克隆音色`;break;}
    case 'go-audio': viewState.stage=3;navigate('studio');break;
    case 'upload-assets': openModal('上传客户素材',uploadZone('assetFiles','image/*,video/*,audio/*,.pdf,.txt,.csv','上传商品图、实拍与资料','客户资源保留来源与授权记录'));break;
    case 'asset-detail': editAsset(id);break;
    case 'export-assets': downloadText('客户素材清单.json',JSON.stringify(current.assets.filter(item=>!viewState.selectedAssets.size||viewState.selectedAssets.has(item.id)),null,2));break;
    case 'clear-assets': viewState.selectedAssets.clear();render();break;
    case 'add-selected-assets': state.config.assets=[...new Set([...state.config.assets,...viewState.selectedAssets])];saveDraft();viewState.selectedAssets.clear();navigate('studio');toast('素材已引用，不重复上传');break;
    case 'remove-draft-asset': state.config.assets=state.config.assets.filter(value=>value!==id);saveDraft();render();break;
    case 'pick-draft-assets': openModal('选择客户素材',current.assets.length?`<div class="stack">${current.assets.map(item=>button(escapeText(item.name),'pick-asset','',`data-id="${item.id}"`)).join('')}</div>`:emptyState('素材库为空','先上传商品图片或实拍素材'));break;
    case 'pick-asset': state.config.assets=[...new Set([...state.config.assets,id])];saveDraft();closeModal();render();break;
    case 'tag-assets': openModal('批量标注素材',`<form id="tagForm"><label class="field"><span>标签</span><input class="input" name="tag" required placeholder="例如：可用近景 / 第一批"></label><button type="submit" class="btn primary">保存到选中素材</button></form>`);document.getElementById('tagForm').onsubmit=event=>{event.preventDefault();const tag=new FormData(event.target).get('tag');current.assets.filter(item=>viewState.selectedAssets.has(item.id)).forEach(item=>item.tag=tag);persist();closeModal();render();};break;
    case 'batch-toggle': {const batch=viewState.batch;const field=target.dataset.dimension,value=target.dataset.value;batch[field]=batch[field].includes(value)?batch[field].filter(item=>item!==value):[...batch[field],value];render();break;}
    case 'commit-batch': {const batch=viewState.batch;const rows=makeCombinations(batch);if(!rows.length){toast('先选择SKU、拍法和开场');break;}rows.forEach((row,index)=>{const config={...JSON.parse(JSON.stringify(state.config)),...row,draftId:'',factsConfirmed:row.productId===state.config.productId&&state.config.factsConfirmed,claims:row.productId===state.config.productId?state.config.claims:(productCatalog.find(item=>item.id===row.productId)?.claims||'当前SKU的事实待确认'),assets:row.productId===state.config.productId?[...state.config.assets]:[]};const version=current.jobs.filter(job=>job.sku===row.sku&&job.format===row.format&&job.config?.hook===row.hook).length+1;current.jobs.unshift({id:uniqueId('job'),name:`${row.sku}_${row.format}_${row.hook}_V${version}`,sku:row.sku,format:row.format,batch:batch.name,model:selectedModel()?.name||'无真人',voice:selectedVoice()?.name||'无口播',reviewer:batch.reviewer,status:config.factsConfirmed?'待脚本确认':'待资源确认',cost:90,version,config,shots:generateScript(config),comments:[],demo:false});});persist();navigate('queue');toast(`已排 ${rows.length} 条产单，没有提交生成或扣费`);break;}
    case 'queue-filter': viewState.queueFilter=target.dataset.value;viewState.tablePage=1;viewState.selectedJobs.clear();render();break;
    case 'queue-page': viewState.tablePage+=Number(target.dataset.direction);render();break;
    case 'dense': state.dense=!state.dense;persist();render();break;
    case 'clear-jobs': viewState.selectedJobs.clear();render();break;
    case 'job-detail': openJob(id);break;
    case 'review-job': openJob(id,true);break;
    case 'export-jobs': downloadText('生产产单.json',JSON.stringify(current.jobs.filter(item=>!viewState.selectedJobs.size||viewState.selectedJobs.has(item.id)),null,2));break;
    case 'assign-jobs': openModal('分配产单',`${selectorField('责任人','assignOwner',['林川','周乔','剪辑组'],'林川')}${button('确认分配','confirm-assign','primary full')}`);break;
    case 'confirm-assign': {const owner=document.getElementById('assignOwner').value;current.jobs.filter(item=>viewState.selectedJobs.has(item.id)).forEach(item=>item.reviewer=owner);persist();closeModal();render();toast('产单责任人已更新');break;}
    case 'submit-budget': {const jobs=current.jobs.filter(item=>viewState.selectedJobs.has(item.id));if(jobs.some(item=>!Number.isFinite(item.cost))){openModal('提交前预算检查',`<p class="small">${jobs.length}条任务中含未报价产单；总视频费用未知，不能认定为零费用或预算范围内。</p><p class="meta mt">模型接口未连接，本次检查不提交、不扣费。</p>${button('配置供应商','nav','mt','data-view="settings"')}`);break;}const amount=jobs.reduce((total,item)=>total+item.cost,0);openModal('提交前预算检查',`<div class="estimate"><span class="meta">${jobs.length} 条 / ${amount} 积分示例预算</span><div class="value ${amount>current.budget?'failure':''}">${amount>current.budget?'超过客户预算':'预算范围内'}</div><span class="small">客户上限 ${current.budget} 积分</span></div><div class="notice warn mt">${jobs.filter(item=>item.status.includes('确认')).length} 条尚待确认；未连接供应商，所以不会提交、扣费或伪造成功。</div><div class="row wrap mt">${button('导出待提交任务','export-jobs')}${button('配置供应商','nav','','data-view="settings"')}</div>`);break;}
    case 'create-job': createJob();break;
    case 'use-job': {const job=current.jobs.find(item=>item.id===id);state.config={...defaultConfig(),...job.config,draftId:'',originJobId:id};const project=ensureDraft();project.originJobId=id;project.shots=JSON.parse(JSON.stringify(job.shots||generateScript()));viewState.stage=2;persist();navigate('studio');break;}
    case 'save-job-comment': {const job=current.jobs.find(item=>item.id===id);const text=document.getElementById('reviewComment').value.trim();if(!text){toast('写下具体修改意见');break;}job.comments=job.comments||[];job.comments.push({kind:document.getElementById('reviewKind').value,time:document.getElementById('reviewTime').value,text,by:job.reviewer||'林川'});persist();openJob(id,true);toast('时间码和修改意见已保存');break;}
    case 'return-job': {const job=current.jobs.find(item=>item.id===id);job.status='需重做';job.version=(job.version||1)+1;persist();closeModal();render();toast('已退回，保留上版意见并建立新版编号');break;}
    case 'approve-job': {const job=current.jobs.find(item=>item.id===id);if(!job.fileId&&!job.demo){toast('没有成片文件，不能将未提交产单当成已交付');break;}job.status='已归档';persist();closeModal();render();toast(job.demo?'示例任务已归档，状态仅作演示':'本地成片已归档');break;}
    case 'deliver-job': {const job=current.jobs.find(item=>item.id===id);if(job.demo){toast('这是示例任务，只导出示例配置与审片记录');}downloadText('交付记录.json',JSON.stringify(job,null,2));if(job.fileId)fileUrl(job.fileId).then(url=>{const anchor=document.createElement('a');anchor.href=url;anchor.download=job.name+'.webm';anchor.click();});break;}
    case 'save-template': openModal('保存客户制作配方',`<form id="presetForm"><label class="field"><span>配方名</span><input name="name" class="input" required value="${escapeText(state.config.category+' · '+state.config.format+' · '+state.config.duration+'秒')}"></label><div class="notice">会记录SKU、模特、穿搭、音色、机位、字幕和后期。只在此客户复用。</div><button type="submit" class="btn primary full mt">保存当前配方</button></form>`);document.getElementById('presetForm').onsubmit=event=>{event.preventDefault();const name=new FormData(event.target).get('name').trim();current.templates.push({id:uniqueId('preset'),name,category:state.config.category,config:{...JSON.parse(JSON.stringify(state.config)),draftId:''}});persist();closeModal();render();toast('客户配方已保存');};break;
    case 'use-template': {const preset=[...current.templates,...current.preferences].find(item=>item.id===id);state.config={...defaultConfig(),...JSON.parse(JSON.stringify(preset.config)),draftId:''};viewState.stage=1;persist();navigate('studio');toast('拍法与资源配置已复用');break;}
    case 'export-template': downloadText('客户制作配方.json',JSON.stringify([...current.templates,...current.preferences].find(item=>item.id===id),null,2));break;
    case 'upload-reference': openModal('上传真实参考片',uploadZone('referenceVideoUpload','video/*','选择参考视频','实际读取、播放和抽帧；不伪造识别内容',false));break;
    case 'reference-frame': viewState.referenceFrame=Number(target.dataset.index);render();setTimeout(()=>{const video=document.getElementById('referenceVideo');if(video)video.currentTime=current.reference.shots[viewState.referenceFrame].start;},250);break;
    case 'reference-tab': viewState.referenceTab=target.dataset.value;render();break;
    case 'extract-reference-frames': extractReferenceFrames().catch(error=>toast(error.message));break;
    case 'save-reference': saveReferenceShot();break;
    case 'add-cut': openModal('添加实际切点',`<label class="field"><span>切点秒数</span><input class="input" id="newCut" type="number" min="0.1" step="0.1" max="${current.reference.duration}" placeholder="例如：4.1"></label>${button('插入切点','insert-cut','primary')}`);break;
    case 'insert-cut': {const value=Number(document.getElementById('newCut').value);const reference=current.reference;const index=reference.shots.findIndex(shot=>value>shot.start&&value<shot.end);if(index<0){toast('切点必须在现有时段中间');break;}const shot=reference.shots[index];reference.shots.splice(index,1,{...shot,end:value,frameId:null},{...shot,start:value,frameId:null,visual:'',speech:'',adapt:''});persist();closeModal();render();toast('切点已插入，请重新抽帧');break;}
    case 'export-reference': downloadText('参考片逐镜拆解.json',JSON.stringify(current.reference,null,2));break;
    case 'apply-reference': {if(!saveReferenceShot(false))break;const reference=current.reference;const project=ensureDraft();project.shots=reference.shots.map((shot,index)=>({id:uniqueId('shot'),start:shot.start,end:shot.end,role:shot.role,scale:shot.scale,visual:shot.adapt||shot.visual||'此镜头需补充当前商品改编',speech:'此处填写当前商品台词，不默认复制原片',hook:index===0?hookText():'',locked:false,source:'真实抽帧 + 人工改编'}));state.config.duration=reference.duration;state.config.shotsCount=reference.shots.length;project.config=JSON.parse(JSON.stringify(state.config));viewState.stage=2;persist();navigate('studio');toast('真实时间码和改编已带入当前脚本，原片台词需要另行改写');break;}
    case 'import-data': openModal('导入素材投放报表',`${uploadZone('dataCsv','.csv','选择CSV','必要列：素材名、消耗、曝光、点击、订单、成交金额',false)}${button('下载模板','csv-template','mt')}`);break;
    case 'csv-template': downloadText('素材报表模板.csv','\uFEFF素材名,SKU,消耗,曝光,点击,订单,成交金额\nQY-032_口播_痛点_V1,QY-032,100,5000,150,3,747\n','text/csv;charset=utf-8');break;
    case 'export-data': downloadText('素材投放报表.json',JSON.stringify(current.metrics,null,2));break;
    case 'save-supplier': current.supplierName=document.getElementById('supplierName').value;current.supplierUrl=document.getElementById('supplierUrl').value;persist();toast('服务名与地址已保存；密钥未保存，尚未连通');break;
    case 'save-budget': {const value=Number(document.getElementById('clientBudget').value);if(!Number.isFinite(value)||value<0){toast('预算必须是非负数');break;}current.budget=value;persist();render();toast('预算上限已保存');break;}
    case 'export-workspace': downloadText('客户生产工作空间.json',JSON.stringify(current,null,2));break;
    case 'export-script': downloadText('镜头脚本.json',JSON.stringify({config:state.config,shots:getShots(),prompt:compilePrompt()},null,2));downloadText('字幕.srt',subtitleSrt(),'text/plain;charset=utf-8');toast('已导出镜头、提示词和可剪辑字幕');break;
    case 'capability-report': openModal('哪些已经真实可用',`<div class="stack"><div class="notice"><strong>本地真实功能</strong><br>上传、持久化、商品资源引用、拍法配置、模特穿搭单、音频播放、视频抽帧、手工切点、脚本编辑、SRT、规则预设、批量产单、审片意见与CSV计算</div><div class="notice"><strong>本地粗剪</strong><br>现有图片与后期字幕可真实编排并导出WebM；不生成新模特动作，不等同于Seedance画面</div><div class="notice warn"><strong>尚未接入</strong><br>图片理解、ASR/OCR与切镜模型、Seedance 2.5、换装、克隆音色、千川授权、生产权限与正式计费。未接入时不展示成功、不扣真实积分。</div><p class="small muted">工作流已按 StudioBinder 镜头规划、Frame.io 审片、Airtable 批量工作流及 TikTok 广告结构查证；不同品类仍须用客户真实样片验证。</p></div>`,true);break;
    case 'export-preview': exportLocalPreview().catch(error=>{viewState.renderBusy=false;closeModal();toast(error.message);});break;
  }
});

function saveReferenceShot(showToast=true) {
  const reference=client().reference;const shot=reference?.shots[viewState.referenceFrame];if(!shot)return false;
  const start=Number(document.getElementById('referenceStart')?.value ?? shot.start);const end=Number(document.getElementById('referenceEnd')?.value ?? shot.end);
  if(start<0||end<=start||end>reference.duration+.01){toast('检查切点：开始小于结束，且不超过视频时长');return false;}
  shot.start=start;shot.end=end;
  const fields={referenceVisual:'visual',referenceSpeech:'speech',referenceAudio:'audio',referenceText:'text',referenceAdapt:'adapt',referenceScale:'scale',referenceRole:'role'};
  Object.entries(fields).forEach(([id,field])=>{const input=document.getElementById(id);if(input)shot[field]=input.value;});
  reference.revision=(reference.revision||1)+1;
  persist();if(showToast)toast('本镜时间码、声画与改编记录已保存');return true;
}
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.id==='activeClient'){saveDraftIfNeeded();state.activeClient=target.value;state.config=defaultConfig();if(state.activeClient==='lumi'){state.config.category='美妆个护';state.config.format='手部试用';state.config.productId='cream';state.config.claimFocus='质地';state.config.evidence='质地特写';}viewState.selectedJobs.clear();viewState.selectedAssets.clear();viewState.batch=null;viewState.lookParts=[];viewState.stage=0;persist();render();return;}
  const configFields=['category','productId','platform','intent','mode','pipeline','claimFocus','evidence','claims','price','note','modelId','lookId','voiceId','music','duration','shotsCount','speed','factsConfirmed','hook','scene','camera','style','flower','cta'];
  if(configFields.includes(target.id)){
    const value=target.type==='checkbox'?target.checked:target.dataset.number==='true'||['duration','shotsCount','speed'].includes(target.id)?Number(target.value):target.value;
    if (['claims','price','note'].includes(target.id)) {
      state.config[target.id]=value;
      if (target.id!=='note') {
        state.config.factsConfirmed=false;
        const confirmed=document.getElementById('factsConfirmed');
        if(confirmed)confirmed.checked=false;
      }
      saveDraft();
    } else selectConfig(target.id,value);
  }
  if(target.id==='outfitModel'){state.config.modelId=target.value;persist();render();}
  if(target.id==='wardrobeSlot'){viewState.wardrobeSlot=target.value;render();}
  if(target.id==='modelGender'){viewState.modelGender=target.value;render();}
  if(target.id==='modelStyle'){viewState.modelStyle=target.value;render();}
  if(target.id==='assetType'){viewState.assetType=target.value;render();}
  if(target.dataset.selectAsset){target.checked?viewState.selectedAssets.add(target.dataset.selectAsset):viewState.selectedAssets.delete(target.dataset.selectAsset);render();}
  if(target.dataset.selectJob){target.checked?viewState.selectedJobs.add(target.dataset.selectJob):viewState.selectedJobs.delete(target.dataset.selectJob);render();}
  if(target.dataset.shot!==undefined){const project=ensureDraft();project.shots=project.shots||generateScript();project.shots[Number(target.dataset.shot)][target.dataset.shotField]=target.dataset.shotField==='clipStart'?Math.max(0,Number(target.value)||0):target.value;persist();if(target.dataset.shotField==='assetId')render();else updatePreview(viewState.activeShot,getShots()[viewState.activeShot].start);applySubtitleStyle();}
  if(target.dataset.lockShot!==undefined){const project=ensureDraft();project.shots=project.shots||generateScript();project.shots[Number(target.dataset.lockShot)].locked=target.checked;persist();}
  if(['batchName','batchReviewer','batchLimit'].includes(target.id)){const field={batchName:'name',batchReviewer:'reviewer',batchLimit:'limit'}[target.id];viewState.batch[field]=target.id==='batchLimit'?Math.max(1,Math.min(100,Number(target.value)||1)):target.value;render();}
  if(target.dataset.metricJob!==undefined){client().metrics[Number(target.dataset.metricJob)].jobId=target.value;persist();toast('投放素材与生产产单已关联');}
});
document.addEventListener('input',event=>{
  const target=event.target;
  const fields={assetQuery:'assetQuery',modelQuery:'modelQuery'};
  if(fields[target.id]){const position=target.selectionStart;viewState[fields[target.id]]=target.value;render();const replacement=document.getElementById(target.id);replacement.focus();replacement.setSelectionRange(position,position);}
  if(target.id==='speed'){state.config.speed=Number(target.value);const display=document.getElementById('speedValue');if(display)display.textContent=state.config.speed.toFixed(1)+'×';persist();}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeModal();return;}
  if(event.key==='Tab'&&viewState.modal){const elements=[...overlay.querySelectorAll('button,input,select,textarea,a')].filter(item=>!item.disabled);const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
});
function saveDraftIfNeeded(){if(['studio','quick','brief','drama','result'].includes(viewState.view)&&collabCan('edit'))saveDraft();}

async function canvasImage(item) {
  if (!item || (!item.image && !item.fileId)) return null;
  const image = new Image();
  image.src = item.fileId ? await fileUrl(item.fileId) : item.image;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('图片无法用于预览视频，请检查本地资源'));
  });
  return image;
}
function drawCover(context, image, left, top, width, height, contain = false) {
  if (!image) return;
  const ratio = contain ? Math.min(width / image.width, height / image.height) : Math.max(width / image.width, height / image.height);
  const actualWidth = image.width * ratio;
  const actualHeight = image.height * ratio;
  context.save();
  context.beginPath();
  context.rect(left, top, width, height);
  context.clip();
  context.drawImage(image, left + (width - actualWidth) / 2, top + (height - actualHeight) / 2, actualWidth, actualHeight);
  context.restore();
}
function wrapCanvasText(context, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const character of text) {
    if (context.measureText(line + character).width > maxWidth && line) { lines.push(line); line = character; }
    else line += character;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
async function exportLocalPreview() {
  if (viewState.renderBusy) return;
  const issues=readiness();if(issues.length)throw new Error(issues.join('；'));
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('此浏览器不支持 WebM 导出，请使用新版 Chrome 或 Edge');
  const config = JSON.parse(JSON.stringify(state.config));
  const shots = JSON.parse(JSON.stringify(getShots()));
  if (shots.some(shot => /此处填写|需补充当前商品改编/.test(shot.speech + shot.visual))) throw new Error('请先改写参考片中的待填写台词或画面，再导出成片');
  const owner = client();
  const ownerScope = state.activeClient;
  const currentProduct = product();
  const activeModel = selectedModel();
  const look = selectedLook();
  const voice = selectedVoice();
  const backgroundItem = config.format.includes('口播') || config.format.includes('试穿') || config.category === '信息流漫剧' ? activeModel || currentProduct : currentProduct;
  const picture = await canvasImage(backgroundItem);
  const productPicture = await canvasImage(currentProduct);
  const lookPicture = look?.parts?.length ? await canvasImage(getGarments().find(item => item.id === look.parts[0])) : null;
  const assignedMedia = {};
  for (const shot of shots) {
    const asset = owner.assets.find(item => item.id === shot.assetId);
    if (!asset) continue;
    if (asset.kind === '图片') assignedMedia[shot.id] = { element: await canvasImage(asset), kind: 'image' };
    if (asset.kind === '视频' && asset.fileId) {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = await fileUrl(asset.fileId);
      await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('某一镜实拍视频无法读取')); });
      if ((shot.clipStart || 0) >= video.duration) throw new Error('视频片段起点超过素材时长');
      assignedMedia[shot.id] = { element: video, kind: 'video' };
    }
  }
  if (!picture && !Object.keys(assignedMedia).length) throw new Error('至少选择一张商品图或逐镜实拍素材，才能导出预览');
  const duration = Math.min(60, Math.max(1, Number(config.duration) || 15));
  const canvas = document.createElement('canvas');
  canvas.width = 540;
  canvas.height = 960;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法启动本地画布');
  const stream = canvas.captureStream(24);
  let audioContext;
  let audio;
  if (voice?.fileId) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();
    audio = new Audio(await fileUrl(voice.fileId));
    const source = audioContext.createMediaElementSource(audio);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
  }
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error('浏览器缺少可用的 WebM 编码');
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1400000 });
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = event => reject(event.error || new Error('预览视频导出失败'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  viewState.renderBusy = true;
  openModal('正在导出本地粗剪', `<div class="notice">将现有图片、字幕与上传音频真实组合为 WebM，不生成新人物动作。</div><div class="estimate mt"><div id="exportSeconds" class="value">0 / ${duration.toFixed(1)} 秒</div><span class="meta">浏览器按真实时间写入视频</span></div><p class="small-print mt">${voice?.fileId ? '已加入用户上传口播' : '此预览无合成音轨；系统试听不能录成真实音色'} / 不消耗模型积分</p>`);
  let interval;
  const started = performance.now();
  let previousShotId = null;
  const draw = () => {
    const elapsed = Math.min(duration, (performance.now() - started) / 1000);
    const shot = shots.find(item => elapsed >= item.start && elapsed < item.end) || shots.at(-1);
    context.fillStyle = '#ddd6cc';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const assigned = assignedMedia[shot.id];
    if (previousShotId !== shot.id) {
      Object.values(assignedMedia).filter(item => item.kind === 'video').forEach(item => item.element.pause());
      if (assigned?.kind === 'video') {
        assigned.element.currentTime = shot.clipStart || 0;
        assigned.element.play().catch(() => {});
      }
      previousShotId = shot.id;
    }
    if (assigned) {
      const item = assigned.element;
      const imageWidth = assigned.kind === 'video' ? item.videoWidth : item.width;
      const imageHeight = assigned.kind === 'video' ? item.videoHeight : item.height;
      const ratio = Math.max(540 / imageWidth, 960 / imageHeight);
      context.save();
      context.beginPath();context.rect(0,0,540,960);context.clip();
      context.drawImage(item,(540-imageWidth*ratio)/2,(960-imageHeight*ratio)/2,imageWidth*ratio,imageHeight*ratio);
      context.restore();
    } else drawCover(context, picture, 0, 0, 540, 960);
    context.fillStyle = 'rgba(18,15,13,.16)';
    context.fillRect(0, 0, 540, 960);
    if (productPicture && activeModel && !assigned) {
      context.fillStyle = 'rgba(255,255,255,.95)';
      context.fillRect(378, 180, 140, 190);
      drawCover(context, productPicture, 386, 188, 124, 174, true);
    }
    if (lookPicture) {
      context.fillStyle = '#fff';
      context.fillRect(395, 660, 117, 128);
      drawCover(context, lookPicture, 401, 666, 105, 116, true);
    }
    context.textAlign = 'center';
    if (config.flower !== '无花字') {
      context.font = 'bold 38px Microsoft YaHei, sans-serif';
      context.lineJoin = 'round';
      context.lineWidth = 6;
      context.strokeStyle = '#3c2a20';
      context.fillStyle = '#fff1a4';
      wrapCanvasText(context, shot.hook || config.claimFocus, 475).forEach((line, index) => {
        context.strokeText(line, 270, 94 + index * 53);
        context.fillText(line, 270, 94 + index * 53);
      });
    }
    if (config.subtitle !== '无字幕') {
      context.font = 'bold 27px Microsoft YaHei, sans-serif';
      context.lineWidth = 4;
      context.strokeStyle = '#1e1a16';
      context.fillStyle = config.subtitle === '黄字重点' ? '#fff4a4' : '#fff';
      const lines = wrapCanvasText(context, shot.speech, 466);
      const baseline = 830 - (lines.length - 1) * 36;
      lines.forEach((line, index) => { context.strokeText(line, 270, baseline + index * 36); context.fillText(line, 270, baseline + index * 36); });
    }
    if (config.cta !== '无行动文案') {
      context.fillStyle = '#f0a43c';
      context.fillRect(34, 892, 472, 45);
      context.fillStyle = '#302519';
      context.font = 'bold 23px Microsoft YaHei, sans-serif';
      context.fillText(config.cta, 270, 922);
    }
    context.textAlign = 'left';
    context.font = '13px Microsoft YaHei, sans-serif';
    context.fillStyle = 'rgba(255,255,255,.85)';
    context.fillText('本地编排预览 · 现有图片素材', 18, 30);
    const status = document.getElementById('exportSeconds');
    if (status) status.textContent = elapsed.toFixed(1) + ' / ' + duration.toFixed(1) + ' 秒';
    if (elapsed >= duration && recorder.state === 'recording') recorder.stop();
  };
  try {
    draw();
    recorder.start(200);
    if (audio) await audio.play();
    interval = setInterval(draw, 1000 / 24);
    const blob = await complete;
    if (!blob.size) throw new Error('导出结果为空');
    const fileId = await keepFile(blob, ownerScope);
    const version = owner.jobs.filter(job => job.sku === currentProduct.sku && job.fileId).length + 1;
    const name = `${currentProduct.sku}_${config.format}_${config.hook}_本地粗剪_V${version}`;
    owner.jobs.unshift({ id: uniqueId('job'), name, sku: currentProduct.sku, format: config.format, batch: '本地粗剪预览', model: activeModel?.name || '商品画面', voice: voice?.fileId ? voice.name : '无录制音轨', status: '待审片', reviewer: '林川', cost: 0, version, config, shots, fileId, comments: [], demo: false });
    owner.assets.unshift({ id: uniqueId('asset'), name: name + '.webm', kind: '视频', tag: '本地粗剪', fileId, scope: ownerScope, authority: '遵循源素材授权', source: '浏览器真实渲染', sku: currentProduct.sku, size: blob.size });
    persist();
    const anchor = document.createElement('a');
    anchor.href = await fileUrl(fileId);
    anchor.download = name + '.webm';
    anchor.click();
    closeModal();
    navigate('review');
    toast('WebM 已真实导出并归档，零模型消费');
    return { fileId, bytes: blob.size, duration };
  } finally {
    clearInterval(interval);
    stream.getTracks().forEach(track => track.stop());
    if (audio) audio.pause();
    Object.values(assignedMedia).filter(item => item.kind === 'video').forEach(item => item.element.pause());
    if (audioContext) await audioContext.close();
    viewState.renderBusy = false;
  }
}

window.addEventListener('hashchange',()=>{closeModal();render();window.scrollTo(0,0);});
if('speechSynthesis' in window)speechSynthesis.onvoiceschanged=()=>{const status=document.getElementById('voiceSystemInfo');if(status)status.textContent=`系统可用 ${speechSynthesis.getVoices().length} 个声音；上传客户录音可以保留真实音色`;};
render();
