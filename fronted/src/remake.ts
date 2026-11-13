import type { Shot } from './types';

export interface ReferenceMark {
  time: number;
  visual: string;
  audio: string;
  adaptation: string;
}
export interface RemakeSource {
  assetId: string;
  name: string;
  duration: number;
  marks: ReferenceMark[];
}

export function validateRemake(source: RemakeSource): string {
  if (!Number.isFinite(source.duration) || source.duration <= 0) return '请等待视频时长读取完成';
  if (!source.marks.length) return '请至少标记一个镜头';
  if (source.marks.length > 20) return '最多 20 个镜头';
  if (source.marks[0].time !== 0) return '第一个镜头必须从 0 秒开始';
  for (let i = 0; i < source.marks.length; i++) {
    const mark = source.marks[i];
    if (!Number.isFinite(mark.time) || mark.time < 0 || mark.time >= source.duration) return `第 ${i + 1} 镜的切点超出视频范围`;
    if (i > 0 && mark.time <= source.marks[i - 1].time) return '切点时间必须按顺序递增，不能重复';
    if (!mark.visual.trim() || !mark.adaptation.trim()) return `请补全第 ${i + 1} 镜的原片画面和商品改编方向`;
  }
  return '';
}

export function remakeShots(source: RemakeSource, seconds: number, assetIds: string[]): Shot[] {
  const error = validateRemake(source);
  if (error) throw new Error(error);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60 || seconds < source.marks.length) throw new Error('目标时长须为 5–60 秒，且每个镜头至少分配 1 秒');
  const lengths = source.marks.map((mark, index) => (source.marks[index + 1]?.time ?? source.duration) - mark.time);
  const extra = seconds - source.marks.length;
  const weighted = lengths.map(length => extra * length / source.duration);
  const durations = weighted.map(value => 1 + Math.floor(value));
  const remaining = seconds - durations.reduce((sum, value) => sum + value, 0);
  const order = weighted.map((value, index) => ({ index, remainder: value % 1 })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < remaining; i++) durations[order[i].index]++;
  return source.marks.map((mark, index) => ({
    duration: durations[index], visual: mark.adaptation.trim(), narration: '',
    assetId: assetIds.length ? assetIds[index % assetIds.length] : null, startAt: 0, locked: false,
  }));
}
