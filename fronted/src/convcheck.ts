/**
 * 分镜「转化结构」检查：按时长只查这一档骨架里该有的阶段（每组里有一个镜头就算）。
 * 15 秒一般只有 5 个镜头：骨架里打消顾虑、促进决定、推动下单合起来只占最后 4 秒，有其中一个就算收尾到位；
 * 建立需求只占 2 秒，常和开头或给出方案并在一镜里，不单独要求。
 * 30 秒，以及没有骨架的视频二创（照参考视频的结构走），7 个阶段都提示，和原来一样。
 */
export const CONV_TASKS = [
  '抓住注意力',
  '建立需求',
  '给出方案',
  '建立信任',
  '打消顾虑',
  '促进决定',
  '推动下单',
] as const;
export const CHECK_STAGES: Record<number, string[][]> = {
  15: [['抓住注意力'], ['给出方案'], ['建立信任'], ['打消顾虑', '促进决定', '推动下单']],
  30: CONV_TASKS.map((t) => [t]),
};
export function stagesFor(skeleton?: number): string[][] {
  return (skeleton && CHECK_STAGES[skeleton]) || CHECK_STAGES[30];
}
/** 还缺哪些阶段，一组里有几个可选的就写成「打消顾虑 / 促进决定 / 推动下单」 */
export const missingStages = (tasks: string[], stages: string[][]) =>
  stages.filter((g) => !g.some((t) => tasks.includes(t))).map((g) => g.join(' / '));
