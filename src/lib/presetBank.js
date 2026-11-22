// 内置预置题库：只读静态资源，随前端打包（src/data/presetQuestions.json）
// 与用户个人题库（LocalStorage）完全隔离：内置题不可编辑、不可删除
import raw from '../data/presetQuestions.json'

export const PRESET_QUESTIONS = raw.map((q, i) => ({
  id: `preset_${i + 1}`,
  content: q.question,
  tags: q.tag_list,
  scene: q.scene,
  difficulty: q.difficulty,
  source: q.source,
  readonly: true
}))

// 抽题候选池 = 内置预置题库 + 用户个人题库，支持 scene / tag_list 过滤
// 个人题没有 scene 字段，视为通用题保留；内置题严格按 scene 过滤
export function buildCandidatePool({ scene = '', tags = [] } = {}, personalBank = []) {
  const preset = PRESET_QUESTIONS.filter(q => !scene || q.scene === scene)
  const personal = (personalBank || []).map(q => ({ ...q, source: q.source || '个人题库' }))
  let pool = [...preset, ...personal]
  if (tags.length) {
    pool = pool.filter(q => (q.tags || []).some(t => tags.includes(t)))
  }
  return pool
}

// 难度过滤：优先精确匹配 → 放宽到 ±1 → 仍为空返回原池（由调用方继续兜底）
export function filterByDifficulty(pool, difficulty) {
  if (!difficulty) return pool
  const exact = pool.filter(q => Number(q.difficulty) === Number(difficulty))
  if (exact.length) return exact
  const near = pool.filter(q => Math.abs(Number(q.difficulty) - Number(difficulty)) <= 1)
  return near.length ? near : pool
}
