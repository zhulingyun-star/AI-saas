import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers3 } from 'lucide-react';
import { Header, Field, useData, useWorkspace, useAction, ErrorState } from '../components/UI';
import { formats, type Project, type ProjectInput } from '../types';
import { post } from '../api';
export default function Batch() {
  const { client } = useWorkspace();
  const projects = useData<Project[]>('projects');
  const action = useAction();
  const navigate = useNavigate();
  const [ids, setIds] = useState<string[]>([]);
  const [selectedFormats, setFormats] = useState<string[]>(['细节演示']);
  const [hooks, setHooks] = useState('实物先展示\n痛点直给');
  const [limit, setLimit] = useState(10);
  const hookList = [
    ...new Set(
      hooks
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
  const potential = ids.length * selectedFormats.length * hookList.length;
  const count = Math.min(potential, limit);
  return (
    <>
      <Header
        title="批量排产"
        description="沿用已确认的商品资料，用拍法与开场做组合。先建产单，再逐条确认制作。"
      />
      <div className="batch-grid">
        <section className="panel padded">
          <h2>01 / 选择已有商品作品</h2>
          <p className="muted">从项目继承商品事实、素材引用和内容配置。</p>
          <div className="check-list">
            {projects.data?.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(p.id)}
                  onChange={(e) =>
                    setIds(e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))
                  }
                />
                <div>
                  {p.name}
                  <small>
                    {p.sku || '未填 SKU'} · {p.shots.length} 镜
                  </small>
                </div>
              </label>
            ))}
            {!projects.data?.length && (
              <p className="hint">请先在“做一条素材”中创建一个商品作品。</p>
            )}
          </div>
          <h2>02 / 选择内容拍法</h2>
          <div className="choice-grid">
            {formats.map((f) => (
              <label key={f} className={selectedFormats.includes(f) ? 'selected' : ''}>
                <input
                  type="checkbox"
                  checked={selectedFormats.includes(f)}
                  onChange={(e) =>
                    setFormats(
                      e.target.checked
                        ? [...selectedFormats, f]
                        : selectedFormats.filter((x) => x !== f),
                    )
                  }
                />
                {f}
              </label>
            ))}
          </div>
          <h2>03 / 开场与数量</h2>
          <Field label="每行一个开场方向">
            <textarea value={hooks} onChange={(e) => setHooks(e.target.value)} maxLength={1000} />
          </Field>
          <Field label="本批次上限（最多 20 条）">
            <input
              type="number"
              min={1}
              max={20}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(20, Number(e.target.value))))}
            />
          </Field>
        </section>
        <aside>
          <section className="panel padded">
            <Layers3 size={28} />
            <h2>这一批，先做 {count} 条</h2>
            <div className="combination">
              <span>
                {ids.length}
                <small>商品作品</small>
              </span>
              <b>×</b>
              <span>
                {selectedFormats.length}
                <small>拍法</small>
              </span>
              <b>×</b>
              <span>
                {hookList.length}
                <small>开场</small>
              </span>
            </div>
            <dl className="summary">
              <div>
                <dt>潜在组合</dt>
                <dd>{potential} 条</dd>
              </div>
              <div>
                <dt>实际创建</dt>
                <dd>{count} 条草稿</dd>
              </div>
              <div>
                <dt>模型费用</dt>
                <dd>0 / 仅创建草稿</dd>
              </div>
            </dl>
            <div className="hint">
              只创建草稿项目，不自动提交生成。商品事实需重新确认；已有镜头素材会保留，开场建议写入制作配置。
            </div>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <button
              className="primary full"
              disabled={!count || action.busy}
              onClick={() =>
                action.run(async () => {
                  const batch: ProjectInput[] = [];
                  for (const id of ids)
                    for (const format of selectedFormats)
                      for (const hook of hookList) {
                        if (batch.length >= limit) break;
                        const p = projects.data!.find((x) => x.id === id)!;
                        batch.push({
                          ...p,
                          name: `${p.name} · ${format} · ${hook}`.slice(0, 150),
                          format,
                          factsConfirmed: false,
                          revision: 0,
                          config: { ...p.config, hook },
                        });
                      }
                  await post(`/clients/${client.id}/batch`, { projects: batch });
                  navigate('/content');
                }, '批量草稿已创建')
              }
            >
              创建 {count} 条内容草稿
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
