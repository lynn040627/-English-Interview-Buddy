/*
 * JSON 容错解析 —— 模型输出可能包含 markdown 代码块、解释文字、缺字段
 * 解析失败时返回 { ok:false, raw } 供 UI 折叠展示
 */

export function parseJson(text) {
  if (!text) return { ok: false, raw: '', error: '空响应' }
  let s = String(text).trim()

  // 1. 先尝试直接 JSON.parse
  try {
    const v = JSON.parse(s)
    return { ok: true, data: v }
  } catch {}

  // 2. 去除 markdown 代码块 ```json ... ``` / ``` ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try {
      const v = JSON.parse(fence[1].trim())
      return { ok: true, data: v }
    } catch { s = fence[1].trim() }
  }

  // 3. 从第一个 { 到最后一个 } 切片（或 [ ... ]）
  const objStart = s.indexOf('{')
  const arrStart = s.indexOf('[')
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    const objEnd = s.lastIndexOf('}')
    if (objEnd > objStart) {
      try {
        const v = JSON.parse(s.slice(objStart, objEnd + 1))
        return { ok: true, data: v }
      } catch {}
    }
  } else if (arrStart >= 0) {
    const arrEnd = s.lastIndexOf(']')
    if (arrEnd > arrStart) {
      try {
        const v = JSON.parse(s.slice(arrStart, arrEnd + 1))
        return { ok: true, data: v }
      } catch {}
    }
  }

  return { ok: false, raw: text, error: '无法解析为 JSON' }
}

// ---------- 各 schema 校验/填充 ----------

export function normalizeReview(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  // scores
  const scores = parsed.scores && typeof parsed.scores === 'object' ? parsed.scores : {}
  const normalizedScores = {
    business:      clampScore(scores.business),
    fluency:       clampScore(scores.fluency),
    logic:         clampScore(scores.logic),
    vocabulary:    clampScore(scores.vocabulary),
    pronunciation: clampScore(scores.pronunciation),
    grammar:       clampScore(scores.grammar)
  }
  const cards = parsed.cards && typeof parsed.cards === 'object' ? parsed.cards : {}
  return {
    scores: normalizedScores,
    weak_tags: Array.isArray(parsed.weak_tags) ? parsed.weak_tags.filter(Boolean) : [],
    cards: {
      natural: Array.isArray(cards.natural) ? cards.natural.filter(Boolean) : [],
      grammar: Array.isArray(cards.grammar) ? cards.grammar.filter(Boolean) : [],
      logic:   Array.isArray(cards.logic)   ? cards.logic.filter(Boolean)   : []
    },
    // 深挖场景额外要点（细节具体性 / STAR / 是否偏离原文），普通批改无此字段
    focus: Array.isArray(parsed.focus) ? parsed.focus.filter(Boolean).map(String) : [],
    sample_answer: String(parsed.sample_answer || '').trim()
  }
}

export function normalizeEval(parsed) {
  if (!parsed) return null
  return {
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean) : [],
    difficulty: clampInt(parsed.difficulty, 1, 5, 3),
    fit_score:  clampInt(parsed.fit_score, 1, 5, 3),
    reason: String(parsed.reason || '').trim()
  }
}

export function normalizeRead(parsed) {
  if (!parsed) return null
  const sentences = Array.isArray(parsed.sentences) ? parsed.sentences : []
  return {
    sentences: sentences
      .filter(s => s && s.original)
      .map(s => ({
        original: String(s.original || '').trim(),
        vocab: Array.isArray(s.vocab) ? s.vocab.filter(v => v && v.word).map(v => ({ word: String(v.word), meaning: String(v.meaning || '') })) : [],
        structure: String(s.structure || '').trim(),
        polished: String(s.polished || '').trim()
      }))
  }
}

export function normalizeIntro(parsed) {
  if (!parsed) return null
  return {
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter(Boolean) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.filter(Boolean) : [],
    tips: Array.isArray(parsed.tips) ? parsed.tips.filter(Boolean) : [],
    polished: String(parsed.polished || '').trim(),
    sections: Array.isArray(parsed.sections) ? parsed.sections.filter(s => s && s.title).map(s => ({
      title: String(s.title), polished: String(s.polished || '')
    })) : []
  }
}

function clampScore(v) {
  const n = Number(v)
  if (!isFinite(n)) return 5
  return Math.round(Math.max(0, Math.min(10, n)) * 10) / 10
}
function clampInt(v, min, max, def) {
  const n = parseInt(v, 10)
  if (isNaN(n)) return def
  return Math.max(min, Math.min(max, n))
}
