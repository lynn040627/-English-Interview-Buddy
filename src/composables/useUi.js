/*
 * UI 相关组合式函数：toast、confirm 等
 */
import { reactive } from 'vue'

const state = reactive({
  toasts: []
})

function push(kind, msg, ttl = 2400) {
  const id = Date.now() + Math.random()
  state.toasts.push({ id, msg, kind })
  if (ttl > 0) setTimeout(() => remove(id), ttl)
  return id
}
function remove(id) {
  const i = state.toasts.findIndex(t => t.id === id)
  if (i >= 0) state.toasts.splice(i, 1)
}

export const toast = {
  get list() { return state.toasts },
  ok:   (m, ttl) => push('ok',   m, ttl),
  err:  (m, ttl) => push('err',  m, ttl),
  warn: (m, ttl) => push('warn', m, ttl),
  info: (m, ttl) => push('info', m, ttl)
}

// 简单确认弹窗：组件自己渲染，这里只是开关
const confirmState = reactive({ open: false, title: '', msg: '', onOk: null })
export function confirmDialog(title, msg) {
  return new Promise(resolve => {
    confirmState.title = title
    confirmState.msg = msg
    confirmState.open = true
    confirmState.onOk = () => { confirmState.open = false; resolve(true) }
    confirmState.onCancel = () => { confirmState.open = false; resolve(false) }
  })
}
export const confirmStore = confirmState
