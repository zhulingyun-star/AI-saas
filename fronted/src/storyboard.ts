export interface ReadShot { id: string; start: number; end: number; action: string; camera: string; transition: string; effects: string; text: string; review: string; productText?: string | null }
export interface ReadLine { id: string; start: number; end: number; text: string; source: 'subtitle' | 'audio' | 'manual' }
export interface ReadSuggestion extends Omit<ReadShot, 'id' | 'start' | 'end'> { shotId: string; slow: boolean; contextStart: number; contextEnd: number; targetStart: number; targetEnd: number }
export interface StoryboardReport { duration: number; shots: ReadShot[]; dialogue: ReadLine[]; summary: string; music: string; suggestions: ReadSuggestion[] }
export interface StoryboardState { status: string; revision: number; model: string; enabled: boolean; error: string; report?: StoryboardReport; progress?: { phase: string; elapsedSeconds: number; stageSeconds: number }; calls: { phase: string; seconds: number; http?: number }[] }
const combine = (a: string, b: string) => a === b ? a : [a, b].filter(Boolean).join('\n');
export function mergeReadShots(report: StoryboardReport, index: number): StoryboardReport {
  if (index < 0 || index >= report.shots.length - 1) throw new Error('没有可合并的后一镜');
  const shots = [...report.shots], a = shots[index], b = shots[index + 1];
  shots.splice(index, 2, { ...a, end: b.end, action: combine(a.action, b.action), camera: combine(a.camera, b.camera), effects: combine(a.effects, b.effects), text: combine(a.text, b.text), productText: a.productText == null && b.productText == null ? null : combine(a.productText ?? '', b.productText ?? ''), review: '已手动合并为连续镜头，请核对动作与机位' });
  return { ...report, shots };
}
export function splitReadShot(report: StoryboardReport, index: number, at: number): StoryboardReport {
  const shot = report.shots[index];
  if (!shot || !Number.isFinite(at) || at - shot.start < .05 || shot.end - at < .05) throw new Error('请把播放位置移到当前镜头内部，距两端至少0.05秒');
  if (report.shots.length >= 40) throw new Error('最多40个镜头');
  const shots = [...report.shots];
  shots.splice(index, 1, { ...shot, end: at, review: '已手动拆分，请分别核对两段动作' }, { ...shot, id: crypto.randomUUID(), start: at, transition: '待确认', review: '已手动拆分，请分别核对两段动作' });
  return { ...report, shots };
}
export function applyReadSuggestion(report: StoryboardReport, suggestion: ReadSuggestion): StoryboardReport {
  const target = report.shots.find(s => s.id === suggestion.shotId);
  if (!target || suggestion.targetStart !== target.start || suggestion.targetEnd !== target.end) throw new Error('镜头区间已改变，请重新补读');
  return { ...report, shots: report.shots.map(s => s.id !== target.id ? s : { ...s, action: suggestion.action, camera: suggestion.camera, transition: suggestion.transition, effects: suggestion.effects, text: suggestion.text, productText: suggestion.productText, review: '手动采用补读建议；' + suggestion.review }) };
}
