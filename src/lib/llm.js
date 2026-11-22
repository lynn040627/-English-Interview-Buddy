/*
 * LLM 统一调用层 —— OpenAI 兼容接口
 * 超时 30s；错误包含网络/CORS/401/429 友好提示
 */
import { state, PROVIDER_DEFAULTS } from '../store/state.js'

const TIMEOUT_MS = 30_000

function resolveEndpoint() {
  const s = state.settings
  const def = PROVIDER_DEFAULTS[s.provider] || PROVIDER_DEFAULTS.custom
  const baseUrl = (s.baseUrl || def.baseUrl || '').replace(/\/$/, '')
  const model = s.model || def.model
  return { baseUrl, model, def }
}

export function isConfigured() {
  const { baseUrl, model } = resolveEndpoint()
  return !!(state.settings.apiKey && baseUrl && model)
}

// 连通性测试（不发完整请求，只做一次极小请求）
export async function testConnectivity() {
  const { baseUrl, model } = resolveEndpoint()
  if (!state.settings.apiKey) throw new Error('请先填写 API Key')
  if (!baseUrl) throw new Error('请先填写 base_url')
  if (!model) throw new Error('请先选择模型')

  const res = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.settings.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 4,
      temperature: 0
    }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return true
}

/**
 * 发送聊天请求
 * @param {string} userPrompt
 * @param {object} [opts]
 * @param {number} [opts.temperature=0.3]
 * @param {number} [opts.maxTokens=1200]
 * @param {string} [opts.system='你是一名专业的英语口语教练，严格按 JSON 输出。']
 */
export async function chat(userPrompt, opts = {}) {
  const { baseUrl, model } = resolveEndpoint()
  if (!state.settings.apiKey) throw new Error('未配置 API Key')
  if (!baseUrl) throw new Error('未配置 base_url')
  if (!model) throw new Error('未配置模型')

  const {
    temperature = 0.3,
    maxTokens = 1200,
    system = '你是一名专业的英语口语教练，严格按 JSON 输出。'
  } = opts

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.settings.apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: ctrl.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let msg = `请求失败（HTTP ${res.status}）`
      if (res.status === 401) msg = 'API Key 无效或已过期（401）'
      else if (res.status === 429) msg = '请求过于频繁（429），请稍后再试'
      else if (res.status >= 500) msg = `服务商临时故障（${res.status}）`
      const err = new Error(msg)
      err.raw = text.slice(0, 500)
      throw err
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content || ''
    return content
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('请求超时（30s），请检查网络或稍后重试')
    }
    if (e.message && e.message.includes('fetch') && e.message.includes('Failed')) {
      throw new Error('网络连接失败：可能是 CORS 或 base_url 填写有误。部分服务商浏览器直接调用需开通 CORS。')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// 模型 TTS（仅 OpenAI / 兼容接口支持）
export async function modelTts(text) {
  const { baseUrl, def } = resolveEndpoint()
  const ttsModel = state.settings.ttsModel || def.ttsModel
  if (!ttsModel) throw new Error('当前模型不支持 TTS，请切换 OpenAI 或填写自定义 ttsModel')

  const res = await fetch(baseUrl + '/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.settings.apiKey}`
    },
    body: JSON.stringify({
      model: ttsModel,
      input: text,
      voice: 'alloy',
      response_format: 'mp3'
    }),
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`TTS 失败（HTTP ${res.status}）`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
