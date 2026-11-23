import { test, expect } from '@playwright/test';
import pathModule from 'node:path';
import { remakeShots, validateRemake } from '../src/remake';
import { workDestination } from '../src/pages/Campaigns';

test('remake rejects duplicate cuts and preserves total target duration', () => {
  const source = { assetId: 'ref', name: 'ref', duration: 10, marks: [
    { time: 0, visual: '原片1', audio: '不复制的台词', adaptation: '商品画面1' },
    { time: 4, visual: '原片2', audio: '', adaptation: '商品画面2' },
  ] };
  expect(remakeShots(source, 15, ['product']).map(s => s.duration)).toEqual([6, 9]);
  expect(remakeShots(source, 5, ['product']).reduce((sum, s) => sum + s.duration, 0)).toBe(5);
  expect(validateRemake({ ...source, marks: [source.marks[0], { ...source.marks[1], time: 0 }] })).toContain('重复');
});

test('video remake works reopen the reference workflow while regular works stay in Studio', () => {
  const work: any = { id: 'work-1', campaignId: 'campaign-1' };
  expect(workDestination(work, [{ id: 'work-1', config: { creationMode: 'VIDEO_REMAKE', campaignId: 'campaign-1', referenceLinks: [{ assetId: 'ref-1' }] } } as any]))
    .toBe('/projects/campaign-1/remake?reference=ref-1');
  expect(workDestination(work, [{ id: 'work-1', config: {} } as any])).toBe('/studio/work-1');
});

test('mode cards open framework and one-click setup as separate production modes', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path=new URL(route.request().url()).pathname;
    const json=(value: unknown)=>route.fulfill({json:value});
    if(path==='/api/auth/me')return json({username:'admin'});
    if(path.endsWith('/auth/csrf'))return json({token:'test',headerName:'X-CSRF-TOKEN'});
    if(path==='/api/clients')return json([{id:'c',name:'客户',category:'服饰鞋包'}]);
    if(path.endsWith('/campaigns'))return json([{id:'campaign-1',name:'鞋类项目',ownerName:'admin',brief:'',archived:false,workCount:0,deliveredCount:0,targetCount:1,revision:0}]);
    if(path.endsWith('/campaigns/campaign-1/products'))return json({revision:0,products:[{anchorId:'a',assets:[{id:'a',name:'鞋子.png',mime:'image/png',metadata:{productName:'测试鞋'}}],analysis:{}}]});
    return json([]);
  });
  await page.goto('/projects/campaign-1');
  await page.getByRole('button',{name:'在此项目做视频',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('link',{name:/框架模式/})).toHaveAttribute('href','/projects/campaign-1/ecommerce?mode=framework');
  await expect(dialog.getByRole('link',{name:/一键成片/})).toHaveAttribute('href','/projects/campaign-1/ecommerce?mode=one-click');
  await expect(dialog.getByRole('link',{name:/视频二创模式/})).toBeVisible();
});

test('choosing a production mode proceeds to setup without showing both mode choices again', async ({ page }) => {
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const json=(value:unknown)=>route.fulfill({json:value});
    if(path==='/api/auth/me')return json({username:'admin'});
    if(path.endsWith('/auth/csrf'))return json({token:'test',headerName:'X-CSRF-TOKEN'});
    if(path==='/api/clients')return json([{id:'c',name:'客户',category:'服饰鞋包'}]);
    if(path==='/api/system')return json({aiMode:'openai',videoProviderConnected:true});
    if(path.endsWith('/campaigns'))return json([{id:'campaign-1',name:'鞋类项目',ownerName:'admin',brief:'',archived:false,workCount:0,deliveredCount:0,targetCount:1,revision:0}]);
    if(path.endsWith('/campaigns/campaign-1/products'))return json({revision:0,products:[{anchorId:'shoe',assets:[{id:'shoe',name:'鞋.png',mime:'image/png',metadata:{productName:'灰白运动鞋',productGroupId:'shoe'}}],analysis:{}}]});
    if(path.endsWith('/assets'))return json([{id:'shoe',name:'鞋.png',kind:'PRODUCT',mime:'image/png',metadata:{productName:'灰白运动鞋',productGroupId:'shoe'}}]);
    return json([]);
  });
  await page.goto('/projects/campaign-1');
  await page.getByRole('button',{name:'在此项目做视频',exact:true}).click();
  await page.getByRole('link',{name:/框架模式/}).click();
  await expect(page).toHaveURL('/projects/campaign-1/ecommerce?mode=framework');
  await expect(page.getByText('鞋类项目 · 框架模式')).toBeVisible();
  await expect(page.getByRole('navigation',{name:'电商视频制作模式'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'框架模式 · 选择商品'})).toBeVisible();
});

test('framework mode saves the selected framework then opens editable shots', async ({ page }) => {
  let project:any=null;
  const product={id:'shoe',clientId:'c',name:'鞋子.png',kind:'PRODUCT',sku:'NB',tags:'',mime:'image/png',sizeBytes:20,metadata:{productName:'灰白运动鞋',productGroupId:'shoes'},createdAt:'2026-11-15'};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname, method=route.request().method();
    const json=(value:unknown)=>route.fulfill({json:value});
    if(path==='/api/auth/me')return json({username:'admin'});
    if(path.endsWith('/auth/csrf'))return json({token:'test',headerName:'X-CSRF-TOKEN'});
    if(path==='/api/clients')return json([{id:'c',name:'客户',category:'服饰鞋包'}]);
    if(path==='/api/system')return json({aiMode:'openai',videoProviderConnected:false,videoModel:'test'});
    if(path.endsWith('/campaigns'))return json([{id:'campaign-1',name:'鞋类项目',ownerName:'admin',brief:'',archived:false,workCount:0,deliveredCount:0,targetCount:1,revision:0}]);
    if(path.endsWith('/campaigns/campaign-1/products'))return json({revision:0,products:[{anchorId:'shoe',assets:[product],analysis:{}}]});
    if(path.endsWith('/assets'))return json([product]);
    if(path.endsWith('/product-groups/shoe/analysis'))return json({status:'COMPLETED',stale:false,revision:2,report:{appearance:'灰白网眼拼接'}});
    if(path.endsWith('/assets/shoe/file'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>'});
    if(path.endsWith('/projects')&&method==='POST'){project={...route.request().postDataJSON(),id:'ecom-1',clientId:'c',status:'DRAFT',revision:0};return json(project);}
    if(path.endsWith('/projects/ecom-1/frameworks'))return json([{id:'proof',title:'细节证据',hook:'先看鞋面拼接',structure:'整体到局部再上脚',proof:'可见鞋面与鞋底',closing:'查看商品详情'},{id:'scene',title:'通勤场景',hook:'出门选鞋',structure:'通勤穿搭展示',proof:'真实上脚效果',closing:'查看详情'},{id:'style',title:'穿搭变化',hook:'同一条裤子的搭配',structure:'正侧面切换',proof:'鞋型和配色',closing:'查看详情'}]);
    if(path.endsWith('/projects/ecom-1')){if(method==='PUT')project={...project,...route.request().postDataJSON(),revision:project.revision+1};return json(project);}
    if(path.endsWith('/projects/ecom-1/draft'))return json({shots:[{duration:15,visual:'近景展示鞋面网眼和灰白拼接',narration:'灰白配色，日常好搭',assetId:null,startAt:0,locked:false}],notice:'已按所选框架生成'});
    if(path.endsWith('/jobs'))return json([]);
    return json([]);
  });
  await page.goto('/projects/campaign-1/ecommerce?mode=framework');
  await expect(page.getByRole('button',{name:/灰白运动鞋.*已选择/})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('本条视频的商品事实')).toBeVisible();
  await expect(page.getByRole('toolbar',{name:'商品核对与下一步'}).getByRole('button',{name:'下一步：选择创作框架'})).toBeVisible();
  await expect(page.getByRole('button',{name:'下一步：选择创作框架'})).toBeDisabled();
  await page.getByLabel('本条视频的商品事实').fill('灰白拼色，网眼鞋面，信息以实物为准');
  await page.getByLabel('已核对以上事实和素材使用权').check();
  await page.getByRole('button',{name:'下一步：选择创作框架'}).click();
  await expect(page).toHaveURL(/\/studio\/ecom-1\?framework=1$/);
  await page.getByRole('button',{name:'生成创作框架'}).click();
  await expect(page.getByRole('heading',{name:'细节证据',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'选择此框架并生成分镜'}).first().click();
  await expect(page.getByRole('heading',{name:'拍摄方案',exact:true})).toBeVisible();
  expect(project.config.productionMode).toBe('FRAMEWORK');
  expect(project.config.selectedFramework.title).toBe('细节证据');
  expect(project.config.frameworkOptions).toHaveLength(3);
  await page.reload();
  await page.getByRole('button',{name:'商品 / 角色'}).click();
  await expect(page.getByRole('heading',{name:'细节证据',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'使用此框架并生成分镜'})).toBeVisible();
});

test('create campaign → select product → verify facts → remake shots → scoped queue', async ({ page }, testInfo) => {
  let campaigns: Record<string, unknown>[] = [];
  let work: any = null;
  let jobs: any[] = [];
  let binding: any = { revision: 0, products: [] };
  const assets = ['a','b'].map((id, i) => ({ id, clientId:'c', name:`shoe${i}.png`, kind:'PRODUCT', sku:'NB-992', tags:'', mime:'image/png', sizeBytes:5, metadata:{productName:'新百伦鞋子',productGroupId:'shoes'}, createdAt:`2026-11-13T00:00:0${i}` }));
  await page.route('**/api/**', async route => {
    const path=new URL(route.request().url()).pathname;
    const method=route.request().method();
    const json=(value: unknown)=>route.fulfill({json:value});
    if(path.endsWith('/auth/me'))return json({username:'admin'});
    if(path.endsWith('/auth/csrf'))return json({token:'test',headerName:'X-CSRF-TOKEN'});
    if(path==='/api/clients')return json([{id:'c',name:'客户',category:'服饰鞋包'}]);
    if(path==='/api/system')return json({aiMode:'openai',videoProviderConnected:false,videoModel:'test'});
    if(path.endsWith('/campaigns/campaign-1/products')) {
      if(method==='PUT') binding={revision:binding.revision+1,products:route.request().postDataJSON().anchorIds.length?[{anchorId:'a',assets,analysis:{status:'COMPLETED',stale:false,report:{summary:'已保存的商品分析'}}}]:[]};
      return json(binding);
    }
    if(path.endsWith('/campaigns')) {
      if(method==='POST')campaigns=[{...route.request().postDataJSON(),id:'campaign-1',workCount:0,deliveredCount:0,reviewCount:0,blockedCount:0}];
      return json(method==='POST'?campaigns[0]:campaigns);
    }
    if(path.endsWith('/assets'))return json([...assets, {id:'ref',clientId:'c',name:'参考片.mp4',kind:'REFERENCE',sku:'',tags:'',mime:'video/mp4',sizeBytes:100,createdAt:'2026-11-13',metadata:{duration:10,marks:[{time:0,visual:'开场全貌',audio:'原片台词',adaptation:'展示当前商品侧面'},{time:4,visual:'细节',audio:'原片声音',adaptation:'展示当前商品网眼鞋面'}]}}]);
    if(path.endsWith('/assets/ref')&&method==='PUT')return json(route.request().postDataJSON());
    if(path.endsWith('/analysis'))return json({status:'COMPLETED',stale:false,revision:3,report:{appearance:'灰白拼色网眼鞋面',material:'网眼纹理，成分待确认'}});
    if(path.endsWith('/assets/ref/file'))return route.fulfill({contentType:'video/mp4',path:pathModule.resolve('tests/fixtures/remake-test.mp4')});
    if(path.endsWith('/file'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/></svg>'});
    if(path.endsWith('/works'))return json(work?[{...work,campaignId:'campaign-1',phase:'PLAN',assignee:'admin',dueDate:null}]:[]);
    if(path.endsWith('/projects')&&method==='GET')return json(work?[work]:[]);
    if(path.endsWith('/draft'))return json({shots:[{duration:7,visual:'商品侧面',narration:'灰白配色',assetId:null,startAt:0,locked:false},{duration:8,visual:'展示鞋面',narration:'查看详情',assetId:null,startAt:0,locked:false}],notice:'测试分镜'});
    if(path.endsWith('/projects')&&method==='POST'){work={...route.request().postDataJSON(),id:'work-1',clientId:'c',status:'DRAFT',revision:0};return json(work);}
    if(path.endsWith('/projects/work-1')){if(method==='PUT')work={...work,...route.request().postDataJSON(),revision:work.revision+1};return json(work);}
    if(path.endsWith('/jobs')){if(method==='POST')jobs=[{id:'job-1',projectId:'work-1',name:work.name,provider:'LOCAL',status:'QUEUED',progress:0,revision:1,message:'已排队',hasOutput:false}];return json(jobs);}
    return json([]);
  });
  await page.goto('/campaigns');
  await page.getByRole('button',{name:'新建交付项目',exact:true}).first().click();
  await expect(page.getByLabel('目标交付数量')).toHaveValue('1');
  await page.getByLabel('项目名称',{exact:true}).fill('鞋子广告项目');
  await page.getByLabel('项目需求',{exact:true}).fill('展示商品外观，制作15秒短视频');
  await page.getByRole('button',{name:'保存项目',exact:true}).click();
  await expect(page).toHaveURL(/\/projects\/campaign-1$/);
  await expect(page.getByRole('button',{name:'在此项目做视频',exact:true})).toBeDisabled();
  await page.goto('/projects/campaign-1/remake');
  await expect(page.getByRole('link',{name:'④ 生成与审片'})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'请先绑定商品',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'返回项目选择商品'}).click();
  await page.getByRole('button',{name:'选择商品',exact:true}).click();
  await page.getByRole('checkbox',{name:'绑定 新百伦鞋子',exact:true}).check();
  await page.getByRole('button',{name:'保存商品绑定',exact:true}).click();
  await page.reload();
  await expect(page.getByText('已保存的商品分析',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'在此项目做视频',exact:true}).click();
  await expect(page.getByRole('heading',{name:'剧情模式',exact:true})).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mode-choice.png') });
  await page.getByRole('link').filter({has:page.getByRole('heading',{name:'视频二创模式',exact:true})}).click();
  await expect(page).toHaveURL(/\/projects\/campaign-1\/remake(?:\?.*)?$/);
  await page.getByRole('button',{name:'参考片.mp4',exact:true}).click();
  await page.reload();
  await expect(page.getByLabel('原片画面与结构')).toHaveValue('开场全貌');
  await page.getByRole('button',{name:'抽取当前帧',exact:true}).click();
  await page.screenshot({ path: testInfo.outputPath('remake-workbench.png'), fullPage: true });
  await page.getByRole('button',{name:'下一步：选择商品',exact:true}).click();
  await page.locator('.project-product-options button').click();
  await page.getByRole('button',{name:'带入分析供核对'}).click();
  await expect(page.getByLabel('本条视频的商品事实')).toContainText('灰白拼色');
  await expect(page.getByRole('button',{name:'创建二创作品，进入分镜确认'})).toBeDisabled();
  await page.getByLabel('本条视频的商品事实').fill('灰白拼色网眼鞋面');
  await page.getByLabel('已核对以上事实和素材使用权').check();
  await page.screenshot({ path: testInfo.outputPath('project-start.png'), fullPage: true });
  await page.getByRole('button',{name:'创建二创作品，进入分镜确认'}).click();
  await expect(page).toHaveURL(/\/studio\/work-1$/);
  expect(work.config.campaignId).toBe('campaign-1');
  expect(work.config.productAssetIds).toEqual(['a','b']);
  expect(jobs).toHaveLength(0);
  expect(work.config.creationMode).toBe('VIDEO_REMAKE');
  expect(work.config.referenceLinks[0].assetId).toBe('ref');
  expect(work.shots.map((s:any)=>s.duration)).toEqual([6,9]);
  expect(work.shots.every((s:any)=>s.narration==='')).toBe(true);
  await expect(page.getByRole('heading',{name:'拍摄方案',exact:true})).toBeVisible();
  expect(work.shots.map((s:any)=>s.assetId)).toEqual(['a','b']);
  await page.reload();
  await expect(page.locator('.plan-shots article')).toHaveCount(2);
  await page.getByRole('button',{name:'确认方案，进入制作',exact:true}).click();
  await page.getByRole('button',{name:'确认并提交 1 条任务',exact:true}).click();
  await expect(page).toHaveURL(/\/queue\?campaign=campaign-1$/);
  await expect(page.getByRole('link',{name:'返回当前项目',exact:true})).toBeVisible();
  expect(jobs).toHaveLength(1);
  await page.goto('/projects/campaign-1');
  await page.getByRole('link',{name:'打开作品',exact:true}).click();
  await expect(page).toHaveURL(/\/projects\/campaign-1\/remake\?reference=ref$/);
  await expect(page.getByRole('heading',{name:'视频二创模式',exact:true})).toBeVisible();
});
