import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productGroups } from '../productGroups';
import { fileUrl, post, request } from '../api';
import { newProject, type Asset, type Campaign, type Project } from '../types';
import { Field, useAction, useData, useWorkspace, ErrorState, Loading } from './UI';
import { remakeShots, type RemakeSource } from '../remake';
import { useCampaignProducts } from './CampaignProductsPanel';

type Analysis = { status: string; stale: boolean; revision: number; report?: Record<string, unknown> };
export default function ProjectVideoStart({ campaign, remake, productionMode = 'FRAMEWORK' }: { campaign: Campaign; remake?: RemakeSource; productionMode?: 'FRAMEWORK' | 'ONE_CLICK' }) {
  const { client } = useWorkspace();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const action = useAction();
  const assets = useData<Asset[]>('assets');
  const system = useQuery<{aiMode:string;videoProviderConnected:boolean}>({queryKey:['system'],queryFn:()=>request('/system')});
  const bound = useCampaignProducts(campaign.id);
  const groups = productGroups(assets.data ?? []).filter(g => bound.data?.products.some(p => g.assets.some(a => a.id === p.anchorId)));
  const [selectedId, setSelectedId] = useState('');
  const [facts, setFacts] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [platform, setPlatform] = useState('抖音');
  const [duration, setDuration] = useState(15);
  const group = groups.find(g => g.assets[0].id === selectedId);
  const productImages = group ? [group.cover, ...group.assets.filter(a => a.id !== group.cover.id)].filter(a => a.mime.startsWith('image/')) : [];
  useEffect(() => {
    if (groups.length !== 1 || groups.some(g => g.assets[0].id === selectedId)) return;
    setSelectedId(groups[0].assets[0].id);
    setFacts('');
    setConfirmed(false);
  }, [groups, selectedId]);
  const oneClickUnavailable = productionMode === 'ONE_CLICK' && (system.data?.aiMode !== 'openai' || !system.data?.videoProviderConnected);
  const analysis = useQuery({ queryKey: [client.id, 'product-analysis', selectedId],
    queryFn: () => request<Analysis>(`/clients/${client.id}/product-groups/${selectedId}/analysis`), enabled: !!selectedId,
  });
  const blockedReason = action.busy ? '正在保存作品…'
    : assets.isPending || bound.isPending ? '正在读取项目商品…'
    : !group ? '请选择本条视频使用的商品'
    : !productImages.length ? '商品需要至少一张图片'
    : !facts.trim() ? '请填写或带入商品事实，再核对资料'
    : !confirmed ? '请勾选已核对商品事实和素材使用权'
    : !Number.isInteger(duration) || duration < 4 || duration > 30 ? '成片时长须为4至30整数秒'
    : remake && duration < remake.marks.length ? '时长不能小于镜头数'
    : !remake && productionMode === 'ONE_CLICK' && (system.isPending || oneClickUnavailable) ? '文字模型与视频生成服务需启用后才能一键成片'
    : '';
  const canContinue = !blockedReason;
  const nextLabel = action.busy ? '正在创建…' : remake ? '创建二创作品，进入分镜确认' : productionMode === 'ONE_CLICK' ? '确认并开始一键成片' : '下一步：选择创作框架';
  async function createVideo() {
    if (!group || !canContinue) return;

    const input = newProject(client.category);
    input.name = `${group.productName} · ${platform}视频`.slice(0,150); input.sku = group.sku; input.platform = platform; input.duration = duration;
    input.facts = facts; input.factsConfirmed = true;
    input.config = { ...input.config, campaignId: campaign.id, campaignBrief: (campaign.brief ?? '').slice(0,2000), productAnchorId: selectedId,
      productName: group.productName, productAssetIds: productImages.map(a => a.id), productCoverId: group.cover.id, productAnalysisRevision: analysis.data?.revision ?? null };
    if (remake) {
      input.name = `${group.productName} · 视频二创`.slice(0,150);
      input.format = '参考片改编';
      input.shots = remakeShots(remake, duration, input.config.productAssetIds as string[]);
      input.config.creationMode = 'VIDEO_REMAKE';
      input.config.referenceLinks = [{ assetId: remake.assetId, name: remake.name, duration: remake.duration, mode: 'structure', source: remake.marks }];
    } else {
      input.name = `${group.productName} · 电商短视频`.slice(0,150);
      input.format = '电商短视频';
      input.config.creationMode = 'ECOMMERCE_VIDEO';
      input.config.productionMode = productionMode;
      input.config.productAnalysisSnapshot = analysis.data?.report ? { appearance: analysis.data.report.appearance ?? '', material: analysis.data.report.material ?? '' } : null;
      input.config.productAnalysisRevision = analysis.data?.revision ?? null;
    }
    if (JSON.stringify(input.config).length > 10000) throw new Error('参考拆解与项目说明过长，请精简后再创建作品（制作配置上限 10000 字符）');
    if (!remake && productionMode === 'ONE_CLICK') {
      const accepted = window.confirm(`一键成片将自动生成创作框架和 ${duration} 秒分镜，然后提交视频生成。可能产生文字模型和视频供应商费用，方案生成失败不会提交视频任务。确认继续？`);
      if (!accepted) return;
      const result = await post<{ project: Project; job: { id: string } }>(`/clients/${client.id}/projects/one-click`, { project: input, confirmed: true });
      await Promise.all([cache.invalidateQueries({ queryKey: [client.id, 'works'] }), cache.invalidateQueries({ queryKey: [client.id, 'campaigns'] }), cache.invalidateQueries({ queryKey: [client.id, 'jobs'] })]);
      navigate(`/queue?campaign=${campaign.id}&job=${result.job.id}`);
      return;
    }
    const saved = await post<Project>(`/clients/${client.id}/projects`, input);
    await Promise.all([cache.invalidateQueries({ queryKey: [client.id, 'works'] }), cache.invalidateQueries({ queryKey: [client.id, 'campaigns'] })]);
    navigate('/studio/' + saved.id + (!remake && productionMode === 'FRAMEWORK' ? '?framework=1' : ''));
  }
  if (campaign.archived) return <p className="hint">此项目已归档。可在项目设置中恢复后继续创建视频。</p>;
  return <section className="panel project-video-start" id="project-video-start">
    {!remake && <div className="remake-top-actions" role="toolbar" aria-label="商品核对与下一步">
      <div><strong>{productionMode === 'ONE_CLICK' ? '一键成片' : '框架模式'}</strong><p className="caption" role="status">{blockedReason || (productionMode === 'ONE_CLICK' ? '资料已核对，可以开始一键成片' : '资料已核对，可以选择创作框架')}</p></div>
      <div className="row">
        <label className="checkbox-line"><input type="checkbox" checked={confirmed} disabled={!group || !facts.trim() || action.busy} onChange={e => setConfirmed(e.target.checked)} />已核对以上事实和素材使用权</label>
        <button className="primary" disabled={!canContinue} onClick={() => void action.run(createVideo)}>{nextLabel}</button>
      </div>
    </div>}
    {!remake && <div className="project-flow"><span>① 建立项目</span><strong>② 选择商品与核对资料</strong><span>③ 视频方案与分镜</span><span>④ 生成视频</span><span>⑤ 审片交付</span></div>}
    <h2>{remake ? '选择二创商品并创建分镜' : productionMode === 'FRAMEWORK' ? '框架模式 · 选择商品' : '一键成片 · 选择商品'}</h2>
    <p className="muted">{remake ? '选择商品并核对事实，随后创建二创分镜。' : productionMode === 'FRAMEWORK' ? '核对商品事实后，生成创作框架、选择方案，再进入分镜制作。' : '核对商品事实并确认费用后，自动生成方案并提交视频任务。'}作品自动归入当前项目。</p>
    {assets.isPending ? <Loading /> : assets.error ? <ErrorState error={assets.error} /> : !groups.length ?
      <div className="hint">还没有商品。<Link className="button" to={`/assets?campaign=${campaign.id}`}>先上传商品素材</Link></div> : <>
      <div className="project-product-options">
        {groups.map(g => <button key={g.key} type="button" className={selectedId === g.assets[0].id ? 'is-selected' : ''} aria-pressed={selectedId === g.assets[0].id} onClick={() => {
          if (selectedId === g.assets[0].id) return;
          setSelectedId(g.assets[0].id); setFacts(''); setConfirmed(false);
        }}>
          {g.cover.mime.startsWith('image/') && <img src={fileUrl(client.id, g.cover.id)} alt="" />}
          <strong>{g.productName}</strong><small>SKU：{g.sku || '未设置'} · {g.assets.length} 份素材{selectedId === g.assets[0].id ? ' · 已选择' : ' · 点击选择'}</small>
        </button>)}
      </div>
      {group && <div className="project-video-setup">
        <div>
          <div className="row between"><h3>核对本条商品资料</h3><Link className="button" to={`/assets?campaign=${campaign.id}&product=${selectedId}`}>查看 / 编辑商品分析</Link></div>
          {analysis.isPending ? <p>读取商品分析…</p> : analysis.error ? <ErrorState error={analysis.error} /> : <p className="caption">
            {analysis.data?.stale ? '商品资料已变化，旧分析需重新核对。' : analysis.data?.report ? '已找到商品分析，可带入外观资料后核对。' : '尚无商品分析，可先分析，也可以手动填写已确认的事实。'}
          </p>}
          {analysis.data?.report && <button type="button" disabled={!!facts.trim()} onClick={() => {
            const report = analysis.data!.report!;
            setFacts(['appearance', 'material'].filter(key => typeof report[key] === 'string' && report[key]).map(key => `${key === 'appearance' ? '外观' : '质感（请核对）'}：${report[key]}`).join('\n').slice(0, 8000));
            setConfirmed(false);
          }}>带入分析供核对</button>}
          <Field label="本条视频的商品事实"><textarea rows={5} value={facts} maxLength={8000} onChange={e => { setFacts(e.target.value); setConfirmed(false); }} placeholder="保留可证明的外观、规格与卖点。删除待验证的性能或功效，不把广告建议当成事实。" /></Field>
          {remake && <label className="checkbox-line"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />已核对以上事实和素材使用权</label>}
        </div>
        <div>
          <Field label="发布平台"><select value={platform} onChange={e => setPlatform(e.target.value)}>{['抖音','小红书','TikTok','视频号'].map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="视频时长（秒）"><input type="number" min={4} max={30} value={duration} onChange={e => setDuration(Number(e.target.value))} /></Field>
          <p className="caption">{remake ? '先创建二创草稿，不会提交视频生成。' : productionMode === 'ONE_CLICK' ? oneClickUnavailable ? system.isPending ? '正在检查文字模型与视频生成服务…' : !system.data?.videoProviderConnected ? '视频生成服务未启用，当前不能使用一键成片。' : '文字模型未启用，当前不能使用一键成片。' : '确认后后台自动生成创作框架和分镜，并提交视频供应商。文字模型和视频生成可能产生费用。' : '先创建草稿并生成创作框架，确认后再生成分镜与视频。'}</p>
          {remake && <button className="primary" disabled={!canContinue} onClick={() => void action.run(createVideo)}>{nextLabel}</button>}
        </div>
      </div>}
    </>}
    {action.error && <ErrorState error={new Error(action.error)} />}
    <div className="row"><Link to={`/queue?campaign=${campaign.id}`}>查看本项目生成任务</Link><Link to={`/review?campaign=${campaign.id}`}>审片与交付</Link></div>
  </section>;
}
