'use strict';

function uiMoveDisclosure(elements, label, className = '') {
  const nodes = [...elements].filter(element => element?.isConnected);
  if (!nodes.length) return;
  const details = document.createElement('details');
  details.className = `ui-context-disclosure ${className}`;
  const summary = document.createElement('summary');
  summary.textContent = label;
  const body = document.createElement('div');
  body.className = 'ui-context-body';
  details.append(summary, body);
  nodes[0].before(details);
  nodes.forEach(node => body.append(node));
}
function uiLayoutAfterRender() {
  const main = document.querySelector('main.workspace-page');
  if (!main) return;
  main.classList.add('ui-refined');
  const resources = ['resources', 'assets', 'models', 'wardrobe', 'voices', 'reference'].includes(viewState.view);
  const counts = { assets: client().assets.length, models: getModels().length, wardrobe: getGarments().length, voices: getVoices().length, reference: client().reference ? 1 : 0 };
  if (resources) {
    const tab = ['assets', 'models', 'wardrobe', 'voices', 'reference'].includes(viewState.view) ? viewState.view : workspaceUi.resourceTab;
    document.querySelectorAll('.resource-tabs [data-tab]').forEach(buttonElement => {
      const count = document.createElement('span');
      count.className = 'ui-tab-count';
      count.textContent = counts[buttonElement.dataset.tab] ?? '';
      buttonElement.append(count);
    });
    main.dataset.resourceType = tab;
    const empty = main.querySelector('.resource-content .empty');
    if (tab === 'assets' && empty) {
      const title = empty.querySelector('h2');
      const description = empty.querySelector('p');
      const filtered = viewState.assetQuery || viewState.assetType !== '全部';
      if (title) title.textContent = filtered ? '没有匹配素材' : '素材库为空';
      if (description) description.remove();
      if (filtered) {
        const reset = document.createElement('button');
        reset.className = 'btn';
        reset.dataset.action = 'ui-reset-assets';
        reset.textContent = '重置筛选';
        empty.querySelector('.row')?.prepend(reset);
      }
    }
  }
  uiMoveDisclosure(main.querySelectorAll(':scope > .collab-local-note'), '本地协作范围');
  if (viewState.view === 'home') {
    const preference = main.querySelector('.guard-home-switch');
    if (preference) {
      const children = [...preference.children];
      const text = children.find(child => child.tagName === 'SPAN');
      text?.remove();
      uiMoveDisclosure([preference], '默认工作视图', 'ui-view-preference');
    }
  }
  if (viewState.view === 'projects') {
    const duplicate = main.querySelector('.collab-toolbar > .meta');
    duplicate?.remove();
    const invite = main.querySelector('.collab-demo-start');
    if (invite) {
      const text = invite.querySelector('span');
      if (text) text.textContent = '十项目演示';
    }
  }
  if (viewState.view === 'settings') {
    uiMoveDisclosure(main.querySelectorAll(':scope > .collab-local-note'), '管理与权限测试范围');
  }
  if (viewState.view === 'preferences') {
    const duplicated = main.querySelector('.guard-library-toolbar>.meta');
    if (duplicated) uiMoveDisclosure([duplicated], '发布与版本规则');
  }
  if (viewState.view === 'brief') {
    uiMoveDisclosure(main.querySelectorAll('.flow-workarea>.card>.flow-inline-note'), '方案预览范围');
    const asideButton = main.querySelector('.flow-brief-aside>.flow-bottom-actions [data-action="play-preview"]');
    const previewButton = main.querySelector('.preview-controls [data-action="play-preview"]');
    if (asideButton && previewButton) asideButton.closest('.flow-bottom-actions').remove();
  }
  if (['studio', 'brief', 'result', 'drama'].includes(viewState.view)) {
    main.querySelectorAll('.flow-stepbar').forEach(stepbar => stepbar.classList.add('ui-step-context'));
  }
  main.querySelectorAll('.generation-test-bar').forEach(bar => {
    const heading = bar.querySelector('strong');
    if (heading) heading.textContent = '出片';
    const detail = bar.querySelector('p');
    if (detail) {
      detail.textContent = '供应商未配置时不提交；准备报价不生成';
      uiMoveDisclosure([detail], '调用范围');
    }
    bar.classList.add('ui-generation-actions');
  });
  main.querySelectorAll('.collab-editor-context').forEach(context => {
    context.classList.add('ui-project-context');
    const projectButton = context.querySelector('[data-action="collab-open-project"]');
    if (projectButton) projectButton.setAttribute('aria-label', '返回交付项目 ' + projectButton.textContent);
  });
  main.querySelectorAll('.preview-title').forEach(title => {
    const heading = title.querySelector('strong');
    if (heading) heading.textContent = '编排预览';
    const badge = title.querySelector('.badge');
    if (badge) badge.textContent = '非生成';
  });
}
document.addEventListener('click', event => {
  const control = event.target.closest('[data-action="ui-reset-assets"]');
  if (!control) return;
  event.preventDefault();
  viewState.assetQuery = '';
  viewState.assetType = '全部';
  render();
});
