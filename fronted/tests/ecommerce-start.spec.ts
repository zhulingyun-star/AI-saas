import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

function product(id: string, name: string) {
  return { id, clientId:'c', name:`${name}.png`, kind:'PRODUCT', sku:'', tags:'', mime:'image/png', sizeBytes:20, metadata:{productName:name,productGroupId:id}, createdAt:'2026-11-16' };
}

async function mockWorkspace(page: Page, products = [product('shoe','灰白运动鞋')]) {
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()), p=url.pathname;
    const json=(value:unknown)=>route.fulfill({json:value});
    if(p.endsWith('/auth/me'))return json({username:'admin'});
    if(p.endsWith('/auth/csrf'))return json({token:'test',headerName:'X-CSRF-TOKEN'});
    if(p==='/api/clients')return json([{id:'c',name:'客户',category:'服饰鞋包'}]);
    if(p==='/api/system')return json({aiMode:'openai',videoProviderConnected:true});
    if(p.endsWith('/campaigns'))return json([{id:'campaign',name:'鞋类项目',ownerName:'admin',brief:'',archived:false,workCount:0,deliveredCount:0,targetCount:1,revision:0}]);
    if(p.endsWith('/campaigns/campaign/products'))return json({revision:0,products:products.map(p=>({anchorId:p.id,assets:[p],analysis:{}}))});
    if(p.endsWith('/assets'))return json(products);
    if(p.endsWith('/analysis'))return json({status:'COMPLETED',stale:false,revision:2,report:{appearance:'灰白配色和网眼拼接'}});
    if(p.endsWith('/file'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>'});
    return json([]);
  });
}

test('multiple bound products require an explicit selection with next action always visible',async({page})=>{
  await mockWorkspace(page,[product('shoe','灰白运动鞋'),product('bag','通勤包')]);
  await page.goto('/projects/campaign/ecommerce?mode=framework');
  const toolbar=page.getByRole('toolbar',{name:'商品核对与下一步'});
  await expect(toolbar.getByRole('button',{name:'下一步：选择创作框架'})).toBeVisible();
  await expect(toolbar).toContainText('请选择本条视频使用的商品');
  await expect(page.locator('.project-product-options button[aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button',{name:/通勤包/}).click();
  await page.getByLabel('本条视频的商品事实').fill('黑色通勤包，配色已核实');
  await page.getByLabel('已核对以上事实和素材使用权').check();
  await expect(toolbar.getByRole('button',{name:'下一步：选择创作框架'})).toBeEnabled();
  await page.getByRole('button',{name:/通勤包/}).click();
  await expect(page.getByLabel('本条视频的商品事实')).toHaveValue('黑色通勤包，配色已核实');
  await expect(page.getByLabel('已核对以上事实和素材使用权')).toBeChecked();
  await page.getByRole('button',{name:/灰白运动鞋/}).click();
  await expect(page.getByLabel('已核对以上事实和素材使用权')).not.toBeChecked();
  await expect(toolbar.getByRole('button',{name:'下一步：选择创作框架'})).toBeDisabled();
});

test('one-click needs consent then shows persisted task progress and completed result',async({page})=>{
  await mockWorkspace(page);
  let submitted=0;
  let job:any=null, project:any=null;
  await page.route('**/api/clients/c/projects/one-click',async route=>{
    const body=route.request().postDataJSON();
    expect(body.confirmed).toBe(true);expect(body.project.factsConfirmed).toBe(true);
    expect(body.project.config.productionMode).toBe('ONE_CLICK');expect(body.project.config.productAssetIds).toEqual(['shoe']);
    submitted++;
    project={...body.project,id:'work',clientId:'c',revision:0};
    job={id:'job-oneclick',projectId:'work',name:'灰白运动鞋 · 电商短视频',provider:'VIDEO_API',status:'QUEUED',message:'等待自动生成框架与分镜',revision:1,progress:0,hasOutput:false};
    return route.fulfill({json:{project,job}});
  });
  await page.route('**/api/clients/c/jobs',route=>route.fulfill({json:job?[job]:[]}));
  await page.route('**/api/clients/c/works',route=>route.fulfill({json:project?[{id:'work',campaignId:'campaign',name:project.name}]:[]}));
  await page.route('**/api/clients/c/jobs/job-oneclick/script',route=>route.fulfill({json:{...project,shots:[]}}));
  await page.route('**/api/clients/c/jobs/job-oneclick/reviews',route=>route.fulfill({json:[]}));
  await page.route('**/api/clients/c/jobs/job-oneclick/file?*',route=>route.fulfill({contentType:'video/mp4',path:path.resolve('tests/fixtures/remake-test.mp4')}));
  await page.goto('/projects/campaign/ecommerce?mode=one-click');
  const start=page.getByRole('toolbar',{name:'商品核对与下一步'}).getByRole('button',{name:'确认并开始一键成片'});
  await expect(start).toBeVisible();await expect(start).toBeDisabled();
  await page.getByRole('button',{name:'带入分析供核对'}).click();
  await page.getByLabel('已核对以上事实和素材使用权').check();
  await expect(start).toBeEnabled();
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('文字模型和视频供应商费用');await dialog.dismiss();});
  await start.click();expect(submitted).toBe(0);
  page.once('dialog',dialog=>dialog.accept());await start.click();
  await expect(page).toHaveURL('/queue?campaign=campaign&job=job-oneclick');expect(submitted).toBe(1);
  await expect(page.getByRole('dialog')).toContainText('等待自动生成框架与分镜');
  job={...job,status:'RUNNING',message:'正在生成创作框架与分镜',progress:15};
  await expect(page.getByRole('dialog')).toContainText('正在生成创作框架与分镜',{timeout:10000});
  await page.reload();await expect(page.getByRole('dialog')).toContainText('正在生成创作框架与分镜');
  expect(submitted).toBe(1);
  job={...job,status:'REVIEW',message:'视频已生成，请人工审片',hasOutput:true,progress:100};
  await expect(page.getByRole('dialog').locator('video')).toBeVisible({timeout:10000});
  await expect(page.getByRole('dialog').getByRole('link',{name:'SRT 字幕'})).toBeVisible();expect(submitted).toBe(1);
});
