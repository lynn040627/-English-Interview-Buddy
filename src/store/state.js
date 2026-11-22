/*
 * 全局 reactive store —— 所有模块共享的数据中心
 * 所有持久化都走 src/lib/storage.js
 * 分片 watcher 自动落盘，避免集中写性能问题
 */
import { reactive, watch } from 'vue'
import * as store from '../lib/storage.js'
import { verifyCode } from '../lib/license.js'
import { toast } from '../composables/useUi.js'

// ---------- 免费配额 ----------
const FREE_LIMITS = {
  dailyBankQuestions: 1,   // 每天仅 1 道题库题练习
  featuresLocked: [
    'radarChart', 'smartPick', 'textRead', 'reciteMode',
    'pdfImport', 'followUp', 'introMultiIter', 'pdfExport'
  ]
}

// ---------- 设置（固定 Keys） ----------
const SETTINGS = {
  provider: 'deepseek',    // deepseek | doubao | openai | custom
  baseUrl:  '',
  apiKey:   '',
  model:    '',
  ttsMode:  'browser',     // browser | model
  ttsModel: '',
  customName: ''
}

// 各 provider 默认 baseUrl 与 model
export const PROVIDER_DEFAULTS = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',  ttsModel: '' },
  doubao:   { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1.5-lite-32k-250115', ttsModel: '' },
  openai:   { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', ttsModel: 'gpt-4o-mini-tts' },
  custom:   { baseUrl: '', model: '', ttsModel: '' }
}

// 六维维度定义与权重（前端按此公式算总分，不信任模型 total_score）
export const DIMENSIONS = [
  { key: 'business',      label: '业务能力', weight: 0.25 },
  { key: 'fluency',       label: '流利度',   weight: 0.20 },
  { key: 'logic',         label: '逻辑',     weight: 0.18 },
  { key: 'vocabulary',    label: '词汇',     weight: 0.15 },
  { key: 'pronunciation', label: '发音',     weight: 0.12 },
  { key: 'grammar',       label: '语法',     weight: 0.10 }
]

export const DIM_KEYS = DIMENSIONS.map(d => d.key)

// 固定题型标签（可自定义新增）
export const FIXED_TAGS = [
  '逻辑思考型', '业务型', '常规结构面试型', '压力型'
]

// 场景
export const SCENES = ['考研复试', '职场面试', '雅思']

// ---------- Store 实例 ----------
export const state = reactive({
  // 设置
  settings: { ...SETTINGS },

  // 解锁
  unlocked: false,
  unlockCode: '',

  // 新手引导
  onboardingDone: false,

  // 配额（免费版）
  dailyUsedDate: '',       // YYYY-MM-DD
  dailyUsedBankQuestions: 0,

  // 自我介绍多份 + 多版本
  intros: [],              // [{ id, title, scene, drafts:[{ id, content, createdAt }], currentDraftId, history:[{ content, createdAt, comment }] }]

  // 面试会话（当前）
  session: {
    scene: '职场面试',
    difficulty: 3,
    enableTimer: false,
    timerSec: 90,
    reciteMode: false,
    questions: [],          // 同一会话不重复
    history: []             // [{ question, transcript, review, sample, followUps:[...] }]
  },

  // 面试历史（全部）
  allSessions: [],         // [{ id, scene, difficulty, startedAt, turns:[...] }]

  // 题库（空状态）
  questionBank: [],         // [{ id, content, tags[], difficulty, createdAt, lastAskedAt }]

  // 自定义标签（除固定的外）
  customTags: [],

  // 收藏手册
  favorites: [],            // [{ id, type:'expression'|'sentence'|'sample', text, source, createdAt }]

  // 文本精读历史
  readHistory: [],          // [{ id, original, sentences:[...], createdAt }]

  // 简历（支持多份：校招版 / 社招版等）
  resumes: [],              // [{ id, title, text, createdAt }]

  // 深挖会话（简历深挖 / 自我介绍深挖共用）
  deepDive: {
    type: 'resume',         // resume | intro
    style: 'gentle',        // gentle 温和 | pressure 压力面
    resumeId: '',
    introId: '',
    crossRef: true,         // 两份材料交叉引用
    autoChain: true,        // 自动连环深挖
    enableTimer: false,
    timerSec: 90,
    turns: [],              // [{ id, question, difficulty, transcript, review, total, createdAt }]
    recites: []             // [{ id, source:'resume'|'intro', question, text, createdAt }]
  },

  // 深挖历史（全局，供历史页按来源分类）
  deepDiveHistory: [],      // [{ id, source, style, question, transcript, review, total, createdAt }]

  // 仪表盘：累计数据
  totalStats: {
    practiceDays: 0,         // 累计练习天数
    totalAnswers: 0,        // 累计答题次数
    totalMinutes: 0,        // 累计学习时长（分钟）
    lastPracticeDate: ''    // 最后一次练习日期
  }
})

// ---------- 初始化 ----------
export function initStore() {
  // 设置
  const savedSettings = store.load('settings')
  if (savedSettings && typeof savedSettings === 'object') {
    state.settings = { ...SETTINGS, ...savedSettings }
  }
  // 解锁
  const savedUnlock = store.load('unlock')
  if (savedUnlock && savedUnlock.code) {
    state.unlockCode = savedUnlock.code
    state.unlocked = !!savedUnlock.verified
    if (!state.unlocked && verifyCode(savedUnlock.code)) {
      state.unlocked = true
      store.save('unlock', { code: savedUnlock.code, verified: true, at: Date.now() })
    }
  }
  state.onboardingDone = !!store.load('onboardingDone', false)

  // 配额
  const today = new Date().toISOString().slice(0, 10)
  const quota = store.load('dailyQuota', { date: '', bankUsed: 0 })
  if (quota.date === today) {
    state.dailyUsedDate = today
    state.dailyUsedBankQuestions = quota.bankUsed || 0
  } else {
    state.dailyUsedDate = today
    state.dailyUsedBankQuestions = 0
    store.save('dailyQuota', { date: today, bankUsed: 0 })
  }

  state.intros       = store.load('intros', [])
  state.session      = { ...state.session, ...(store.load('currentSession', {}) || {}) }
  state.allSessions  = store.load('allSessions', [])
  state.questionBank = store.load('questionBank', [])
  state.customTags   = store.load('customTags', [])
  state.favorites    = store.load('favorites', [])
  state.readHistory  = store.load('readHistory', [])
  state.resumes      = store.load('resumes', [])
  state.deepDive     = { ...state.deepDive, ...(store.load('deepDive', {}) || {}) }
  state.deepDiveHistory = store.load('deepDiveHistory', [])
  state.totalStats   = store.load('totalStats', state.totalStats)

  // 确保每天的练习天数统计自动增长
  maybeIncPracticeDays()
}

function maybeIncPracticeDays() {
  const today = new Date().toISOString().slice(0, 10)
  if (state.totalStats.lastPracticeDate !== today) {
    // 如果最后一次是昨天或更早，不主动加天数；等有真实练习发生时再加
  }
}

// ---------- 免费版 / 买断版判断 ----------
export function isPro() { return !!state.unlocked }

export function checkDailyBankLimit() {
  if (isPro()) return { ok: true, reason: '' }
  const today = new Date().toISOString().slice(0, 10)
  if (state.dailyUsedDate !== today) {
    state.dailyUsedDate = today
    state.dailyUsedBankQuestions = 0
    store.save('dailyQuota', { date: today, bankUsed: 0 })
  }
  if (state.dailyUsedBankQuestions >= FREE_LIMITS.dailyBankQuestions) {
    return { ok: false, reason: `免费版每天仅限 ${FREE_LIMITS.dailyBankQuestions} 道题库题，明天自动重置` }
  }
  return { ok: true, reason: '' }
}

export function incDailyBankUsed() {
  state.dailyUsedBankQuestions += 1
  store.save('dailyQuota', { date: state.dailyUsedDate, bankUsed: state.dailyUsedBankQuestions })
}

export function checkFeature(name) {
  if (isPro()) return true
  return !FREE_LIMITS.featuresLocked.includes(name)
}

export function upgradeToPro(code) {
  const ok = verifyCode(code)
  if (ok) {
    state.unlockCode = code
    state.unlocked = true
    store.save('unlock', { code, verified: true, at: Date.now() })
    return true
  }
  return false
}

// ---------- 持久化 watcher（分片，避免每次都 save 全部） ----------
watch(() => state.settings, (v) => {
  try { store.save('settings', v) } catch (e) { toast.err('保存设置失败：本地存储空间可能不足') }
}, { deep: true })

watch(() => state.intros, (v) => {
  try { store.save('intros', v) } catch (e) { toast.err('保存自我介绍失败') }
}, { deep: true })

watch(() => state.session, (v) => {
  try { store.save('currentSession', v) } catch {}
}, { deep: true })

watch(() => state.allSessions, (v) => {
  try { store.save('allSessions', v) } catch {}
}, { deep: true })

watch(() => state.questionBank, (v) => {
  try { store.save('questionBank', v) } catch (e) { toast.err('保存题库失败：本地存储空间可能不足') }
}, { deep: true })

watch(() => state.customTags, (v) => store.save('customTags', v), { deep: true })
watch(() => state.favorites, (v) => store.save('favorites', v), { deep: true })
watch(() => state.readHistory, (v) => store.save('readHistory', v), { deep: true })
watch(() => state.totalStats, (v) => store.save('totalStats', v), { deep: true })
watch(() => state.resumes, (v) => {
  try { store.save('resumes', v) } catch (e) { toast.err('保存简历失败：本地存储空间可能不足') }
}, { deep: true })
watch(() => state.deepDive, (v) => store.save('deepDive', v), { deep: true })
watch(() => state.deepDiveHistory, (v) => store.save('deepDiveHistory', v), { deep: true })

// ---------- 总数据操作 ----------
export function exportAllBackup() {
  return store.exportBackup()
}
export function importBackup(json) {
  store.applyBackup(json)
  // 重载
  initStore()
}
export function resetAllData() {
  store.clearAll()
  // 只保留 unlock 信息
  const unlock = state.unlocked ? store.load('unlock', null) : null
  initStore()
  if (unlock) store.save('unlock', unlock)
}

// ---------- 工具：ID ----------
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ---------- 总分计算 ----------
export function computeTotal(scores) {
  if (!scores) return 0
  let t = 0
  for (const d of DIMENSIONS) {
    const v = Number(scores[d.key]) || 0
    t += Math.max(0, Math.min(10, v)) * d.weight
  }
  return Math.round(t * 10) / 10
}

// ---------- 仪表盘累计更新（每次完成一道题后调用） ----------
export function bumpPractice(stats = { minutes: 0 }) {
  const today = new Date().toISOString().slice(0, 10)
  const s = state.totalStats
  if (s.lastPracticeDate !== today) {
    // 如果上一次不是今天，且也不是昨天（跨天了），天数 +1
    if (s.lastPracticeDate) {
      const prev = new Date(s.lastPracticeDate)
      const now = new Date(today)
      // 简单按日期差算
      const daysDiff = Math.round((now - prev) / 86400000)
      if (daysDiff >= 1) s.practiceDays += 1
    } else {
      s.practiceDays += 1
    }
    s.lastPracticeDate = today
  }
  s.totalAnswers += 1
  s.totalMinutes += Math.max(0, Math.round(stats.minutes || 0))
}
