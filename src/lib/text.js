/*
 * 通用小工具
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function formatDate(ts, withTime = true) {
  const d = new Date(ts)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (!withTime) return date
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function pad(n) { return String(n).padStart(2, '0') }

export function today() { return new Date().toISOString().slice(0, 10) }

// 从文本粗略提取英文句子（用于 PDF 导入纯文本解析）
export function splitEnglishQuestions(text) {
  const list = []
  const lines = String(text || '')
    .split(/\r?\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 10)
  let buf = ''
  for (const line of lines) {
    // 跳过明显的标题行（全大写、中文为主）
    if (/^[\u4e00-\u9fa5A-Z\s\-·—]+$/.test(line) && line.length < 40) continue
    buf += (buf ? ' ' : '') + line
    // 以问号结尾视为一题
    if (/[?？]$/.test(line) || line.endsWith('.')) {
      const q = buf.trim().replace(/\s+/g, ' ')
      if (q.length > 15) list.push(q)
      buf = ''
    }
  }
  if (buf.trim().length > 15) list.push(buf.trim())
  return list
}

// 粗略统计字数
export function countWords(text) {
  if (!text) return 0
  const en = (text.match(/[A-Za-z]+/g) || []).length
  const zh = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  return en + zh
}
