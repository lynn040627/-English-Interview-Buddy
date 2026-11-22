/*
 * 语音识别 + TTS
 * 识别：Web Speech API；失败时手动输入兜底由各 View 处理
 * TTS：两种模式 —— 浏览器 SpeechSynthesis（默认免费）/ 模型 TTS
 */
import { state } from '../store/state.js'
import { modelTts } from './llm.js'

// ---------- 能力检测 ----------
export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  return !!SR
}
export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && !!window.speechSynthesis
}

// ---------- 识别 ----------
export function createRecognizer({ lang = 'en-US', interim = true } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) throw new Error('浏览器不支持 Web Speech API，请换 Chrome/Edge')
  const rec = new SR()
  rec.lang = lang
  rec.interimResults = !!interim
  rec.continuous = false
  rec.maxAlternatives = 1
  return rec
}

// ---------- 浏览器 TTS ----------
let _currentUtter = null
let _highlightCb = null
export function speakBrowser(text, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!isSpeechSynthesisSupported()) {
      reject(new Error('浏览器不支持 SpeechSynthesis'))
      return
    }
    stopBrowser()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = opts.lang || 'en-US'
    u.rate = opts.rate ?? 0.95
    u.pitch = opts.pitch ?? 1

    _currentUtter = u
    u.onend = () => { _currentUtter = null; resolve() }
    u.onerror = (e) => { _currentUtter = null; reject(new Error(e.error || 'TTS 失败')) }
    window.speechSynthesis.speak(u)
  })
}
export function stopBrowser() {
  try { window.speechSynthesis?.cancel() } catch {}
  _currentUtter = null
}

// ---------- 统一 TTS 入口 ----------
/**
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.forceModel=false] 强制模型 TTS
 * @returns {{ kind:'browser'|'model', play():Promise<void>, stop():void }}
 */
export function createSpeaker(text, opts = {}) {
  const mode = opts.forceModel ? 'model' : (state.settings.ttsMode || 'browser')
  let audioEl = null
  let stopped = false

  async function play() {
    stopped = false
    if (mode === 'model') {
      const url = await modelTts(text)
      audioEl = new Audio(url)
      audioEl.onended = () => { try { URL.revokeObjectURL(url) } catch {} }
      audioEl.src = url
      await audioEl.play()
      return
    }
    // 浏览器内置
    await speakBrowser(text, { lang: opts.lang })
  }

  function stop() {
    stopped = true
    if (audioEl) { try { audioEl.pause(); audioEl.currentTime = 0 } catch {} }
    audioEl = null
    stopBrowser()
  }

  return { kind: mode, play, stop }
}

// ---------- 逐行高亮跟读 ----------
/**
 * 按句子切分文本，逐句调用浏览器 TTS，并在每句开始/结束时回调
 * @returns {{ play(), stop(), onHighlight(fn), lines: string[] }}
 */
export function createLineReader(text, opts = {}) {
  const lines = (text || '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)

  let highlightIdx = -1
  let stopFlag = false
  let highlightCb = opts.onHighlight || (() => {})

  function setHighlight(i) {
    highlightIdx = i
    highlightCb(i)
  }

  async function play() {
    stopFlag = false
    for (let i = 0; i < lines.length; i++) {
      if (stopFlag) break
      setHighlight(i)
      try {
        await speakBrowser(lines[i], { lang: opts.lang || 'en-US', rate: 0.95 })
      } catch {}
    }
    setHighlight(-1)
  }
  function stop() {
    stopFlag = true
    stopBrowser()
    setHighlight(-1)
  }
  function onHighlight(fn) { highlightCb = fn }

  return { lines, play, stop, getHighlight: () => highlightIdx, onHighlight }
}
