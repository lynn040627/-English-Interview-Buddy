/*
 * LocalStorage 封装 —— 所有数据的唯一持久化入口
 * 键前缀 'spk.v2.' 用于区分版本
 * 容量阈值 4.5MB，接近上限时抛 StorageQuotaError
 */

const PREFIX = 'spk.v2.'
const QUOTA_WARN_BYTES = 4.5 * 1024 * 1024

function safeParse(raw, fallback) {
  if (raw === null || raw === undefined) return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return safeParse(raw, fallback)
  } catch (e) {
    console.warn('[storage] load failed', key, e)
    return fallback
  }
}

export function save(key, value) {
  const fullKey = PREFIX + key
  const raw = JSON.stringify(value)
  // 容量检查
  try {
    const before = getBytesUsed()
    localStorage.setItem(fullKey, raw)
    const after = getBytesUsed()
    if (after > QUOTA_WARN_BYTES) {
      const err = new Error('StorageQuotaNearLimit')
      err.name = 'StorageQuotaNearLimit'
      throw err
    }
    // 若写入后总量反而变小（删除场景），不提示
    if (after > QUOTA_WARN_BYTES && after > before) {
      // 接近上限，也提示
    }
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.name === 'StorageQuotaNearLimit') {
      throw e
    }
    console.warn('[storage] save failed', key, e)
    throw e
  }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key) } catch {}
}

export function getBytesUsed() {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(PREFIX)) continue
    try { total += (localStorage.getItem(k) || '').length * 2 } catch {}
  }
  return total
}

export function listAllKeys() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length))
  }
  return keys
}

export function clearAll() {
  listAllKeys().forEach(k => remove(k))
}

// 导出整份备份 JSON
export function exportBackup() {
  const out = { version: 2, exportedAt: Date.now(), data: {} }
  listAllKeys().forEach(k => {
    try { out.data[k] = load(k, null) } catch {}
  })
  return out
}

// 从备份恢复（会覆盖）
export function applyBackup(backup) {
  if (!backup || !backup.data || typeof backup.data !== 'object') {
    throw new Error('备份格式不正确')
  }
  // 先清空
  clearAll()
  Object.entries(backup.data).forEach(([k, v]) => {
    if (v === null || v === undefined) return
    save(k, v)
  })
}
