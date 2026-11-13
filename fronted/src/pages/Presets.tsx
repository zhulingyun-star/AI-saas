import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, SlidersHorizontal, ArrowUpRight } from 'lucide-react';
import {
  Header,
  Modal,
  Field,
  Empty,
  useData,
  useWorkspace,
  useAction,
  ErrorState,
} from '../components/UI';
import { post, put } from '../api';
import type { Preset, Project, ProjectInput } from '../types';
export default function Presets() {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const data = useData<Preset[]>('presets');
  const action = useAction();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Partial<Preset> | null>(null);
  const names: Record<string, string> = { RULE: '客户规则', RECIPE: '内容配方', LOOK: '服装搭配' };
  return (
    <>
      <Header
        title="客户预设"
        description="保存经客户确认的规则、配方与搭配。每次创作有据可循，经验也可以撤回。"
      >
        <button
          className="primary"
          onClick={() => setEditing({ name: '', kind: 'RULE', content: '', enabled: true })}
        >
          <Plus size={16} />
          新增客户规则
        </button>
      </Header>
      {action.error && <ErrorState error={new Error(action.error)} />}
      <div className="preset-columns">
        {['RULE', 'RECIPE', 'LOOK'].map((kind) => (
          <section className="panel" key={kind}>
            <div className="panel-heading">
              <h2>{names[kind]}</h2>
              <SlidersHorizontal size={17} />
            </div>
            {data.data?.some((p) => p.kind === kind) ? (
              data.data
                .filter((p) => p.kind === kind)
                .map((p) => (
                  <article className="preset" key={p.id}>
                    <div className="row between">
                      <h3>{p.name}</h3>
                      <label className="toggle">
                        <input
                          aria-label={'启用 ' + p.name}
                          disabled={action.busy}
                          type="checkbox"
                          checked={p.enabled}
                          onChange={() =>
                            action.run(async () => {
                              await put(`/clients/${client.id}/presets/${p.id}`, {
                                ...p,
                                enabled: !p.enabled,
                              });
                              await cache.invalidateQueries({ queryKey: [client.id, 'presets'] });
                            })
                          }
                        />
                        <span />
                      </label>
                    </div>
                    {kind === 'RULE' ? (
                      <p>{p.content}</p>
                    ) : (
                      <p className="muted">
                        {kind === 'LOOK'
                          ? '已保存的服装引用单；不代表生成上身图。'
                          : '继承商品资料与镜头的已保存制作配方。'}
                      </p>
                    )}
                    <div className="row between">
                      <button className="text-link" onClick={() => setEditing(p)}>
                        查看 / 编辑
                      </button>
                      {kind === 'RECIPE' && (
                        <button
                          disabled={action.busy || !p.enabled}
                          onClick={() =>
                            action.run(async () => {
                              const input = JSON.parse(p.content) as ProjectInput;
                              const result = await post<Project>(`/clients/${client.id}/projects`, {
                                ...input,
                                name: (input.name + ' · 新内容').slice(0, 150),
                                revision: 0,
                                factsConfirmed: false,
                              });
                              navigate('/studio/' + result.id);
                            })
                          }
                        >
                          用于新内容
                          <ArrowUpRight size={15} />
                        </button>
                      )}
                    </div>
                  </article>
                ))
            ) : (
              <Empty
                title="还没有保存的预设"
                description={
                  kind === 'RECIPE'
                    ? '在制作确认页保存内容配方。'
                    : kind === 'LOOK'
                      ? '在服装搭配页组合并保存。'
                      : '新增并确认客户规则。'
                }
              />
            )}
          </section>
        ))}
      </div>
      {editing && (
        <Modal
          title={editing.id ? '编辑客户预设' : '新增客户规则'}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async () => {
                if (editing.id) await put(`/clients/${client.id}/presets/${editing.id}`, editing);
                else await post(`/clients/${client.id}/presets`, editing);
                await cache.invalidateQueries({ queryKey: [client.id, 'presets'] });
                setEditing(null);
              }, '客户预设已保存');
            }}
          >
            <Field label="预设名称">
              <input
                required
                maxLength={100}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label={editing.kind === 'RULE' ? '明确的客户规则' : '预设内容 / JSON'}>
              <textarea
                required
                rows={8}
                maxLength={10000}
                value={editing.content}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              />
            </Field>
            <div className="hint">
              规则只作用于当前客户。配方与搭配中的素材引用也应来自此客户空间。
            </div>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <button className="primary" disabled={action.busy}>
              保存预设
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
