<!--
  Tab3 · 英文文本精读
  - 用户粘贴任意英文文本，长度建议 50-800 词，超过 1500 词前端提示会截断
  - LLM 返回逐句切分：每句 original / vocab / structure / polished
  - 每句卡片可折叠，单句旁 TTS 播放按钮
  - 文本只存 LocalStorage，不写入题库，不自动收藏
  - 免费版限制：整个模块对免费用户锁定
-->
<script setup>
import { ref, computed } from 'vue'
import { state, uid, checkFeature } from '../store/state.js'
import { chat, isConfigured } from '../lib/llm.js'
import { parseJson, normalizeRead } from '../lib/parse.js'
import { buildReadPrompt } from '../lib/prompts.js'
import { toast } from '../composables/useUi.js'
import { countWords } from '../lib/text.js'
import SpeakPlayer from '../components/SpeakPlayer.vue'
import RawFallback from '../components/RawFallback.vue'
import UpgradeModal from '../components/UpgradeModal.vue'
import Recorder from '../components/Recorder.vue'

const inputText = ref('')
const truncatedText = ref('')
const loading = ref(false)
const result = ref(null)
const lastError = ref(null)
const expandedIdx = ref(new Set())

const wordCount = computed(() => countWords(inputText.value))

// ---------- 语音输入 ----------
const showVoiceInput = ref(false)
function onVoiceFinal(text) {
  const t = (text || '').trim()
  if (!t) return
  // 已有内容则追加，支持分段录入长文本
  inputText.value = inputText.value.trim() ? inputText.value.trim() + ' ' + t : t
  showVoiceInput.value = false
  toast.ok('已识别并填入文本，可继续编辑')
}

function truncateIfNeeded() {
  // 粗略按 1500 词截断，每词按 5 字符算约 7500 字符
  if (inputText.value.length > 7500) {
    toast.warn('文本过长，将按前 1500 词处理')
    truncatedText.value = inputText.value.slice(0, 7500)
    return truncatedText.value
  }
  return inputText.value
}

async function analyze() {
  if (!checkFeature('textRead')) { upgradeOpen.value = true; return }
  if (!isConfigured()) { toast.warn('请先到设置页填 API Key'); return }
  if (!inputText.value.trim()) { toast.warn('请粘贴要精读的英文文本'); return }
  loading.value = true
  lastError.value = null
  result.value = null

  const toAnalyze = truncateIfNeeded()
  try {
    const raw = await chat(buildReadPrompt({ text: toAnalyze }), {
      system: '你是英语教师，严格按 JSON 输出。', maxTokens: 2500
    })
    const p = parseJson(raw)
    if (!p.ok) { lastError.value = { raw }; return }
    result.value = normalizeRead(p.data)
    toast.ok(`解析完成，共 ${result.value.sentences.length} 句`)
    // 存历史
    state.readHistory.unshift({
      id: uid(), original: toAnalyze, sentences: result.value.sentences, createdAt: Date.now()
    })
    if (state.readHistory.length > 50) state.readHistory.length = 50
  } catch (e) {
    toast.err('请求失败：' + e.message)
  } finally {
    loading.value = false
  }
}

function toggleExpand(i) {
  if (expandedIdx.value.has(i)) expandedIdx.value.delete(i)
  else expandedIdx.value.add(i)
}

// 历史
const showHistory = ref(false)
function restoreHistory(h) {
  inputText.value = h.original
  result.value = h
  showHistory.value = false
}

const upgradeOpen = ref(false)
function goSettings() {
  upgradeOpen.value = false
  window.dispatchEvent(new CustomEvent('spk:navigate', { detail: 'settings' }))
}
</script>

<template>
  <div>
    <header class="page-head">
      <div class="h1-hand">英文文本精读</div>
      <div class="page-head-en">Intensive Reading</div>
      <p>粘贴演讲稿 / 字幕 / 文章 —— 逐句词汇 · 句式 · 地道改写。<span class="page-desc-en">Paste speeches, subtitles or articles — vocabulary, sentence patterns &amp; polished rewrites.</span></p>
    </header>

    <!-- 免费版锁定 -->
    <div v-if="!checkFeature('textRead')" class="card" style="border-color: var(--warn); background: var(--warn-soft)">
      <b>🔒 此功能为买断版专属</b>
      <p class="muted" style="margin: 6px 0 10px">免费版每天可以练 1 道题库题。升级买断后解锁：智能出题、六维雷达、文本精读、连环追问、PDF 导入导出等。</p>
      <button class="btn btn-primary" @click="upgradeOpen = true">去解锁<span class="btn-en">Unlock</span></button>
    </div>

    <template v-else>
      <div class="card" style="margin-bottom: 14px">
        <div class="row-spaced">
          <div class="h3-hand" style="margin: 0">📥 粘贴文本<span class="sub-en">Paste Text</span></div>
          <span class="faint">{{ wordCount }} 词（建议 50-800，≥1500 将截断）</span>
        </div>
        <textarea
          v-model="inputText"
          class="textarea"
          rows="8"
          style="margin-top: 6px; font-family: monospace"
          placeholder="Good morning everyone. Today I want to talk about..."
        ></textarea>
        <div class="row" style="margin-top: 10px">
          <button class="btn btn-primary btn-block" :disabled="loading || !inputText.trim()" @click="analyze">
            <span v-if="loading"><span class="spinner"></span> 解析中…<span class="btn-en">Analyzing...</span></span>
            <span v-else>✨ 开始精读<span class="btn-en">Analyze</span></span>
          </button>
          <button class="btn btn-ghost" @click="showHistory = !showHistory">
            {{ showHistory ? '收起历史' : '📚 历史' }}
          </button>
          <button class="btn btn-ghost" @click="showVoiceInput = !showVoiceInput">
            {{ showVoiceInput ? '收起语音' : '🎙️ 语音输入' }}
          </button>
        </div>

        <!-- 语音输入面板 -->
        <div v-if="showVoiceInput" class="card card-soft" style="margin-top: 10px">
          <div class="muted" style="margin-bottom: 6px">🎙️ 朗读英文文本，识别后自动填入上方输入框，可继续编辑（支持分段多次录入）</div>
          <Recorder lang="en-US" @final="onVoiceFinal" />
        </div>
      </div>

      <!-- 历史 -->
      <div v-if="showHistory" class="card" style="margin-bottom: 14px">
        <div class="h3-hand" style="margin-top: 0">历史记录<span class="sub-en">History</span></div>
        <div v-if="!state.readHistory.length" class="muted">暂无历史</div>
        <div v-for="h in state.readHistory" :key="h.id" class="row-spaced card card-soft" style="margin-top: 6px; padding: 8px 12px">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%">{{ h.original?.slice(0, 60) || '(empty)' }}</span>
          <span class="faint">{{ new Date(h.createdAt).toLocaleDateString() }} · {{ h.sentences?.length || 0 }} 句</span>
          <button class="btn-link" @click="restoreHistory(h)">恢复<span class="btn-en">Restore</span></button>
        </div>
      </div>

      <!-- 结果 -->
      <div v-if="result" class="stack">
        <div v-for="(s, i) in result.sentences" :key="i" class="card">
          <div class="row-spaced">
            <div class="row" style="flex: 1">
              <span class="tag" style="margin-right: 6px">#{{ i + 1 }}</span>
              <span class="en-body" style="flex: 1">{{ s.original }}</span>
            </div>
            <div class="row">
              <SpeakPlayer :text="s.original" size="sm" />
              <SpeakPlayer v-if="s.polished" :text="s.polished" label="polished" size="sm" />
              <button class="btn-link" @click="toggleExpand(i)">{{ expandedIdx.has(i) ? '收起' : '展开' }}</button>
            </div>
          </div>
          <template v-if="expandedIdx.has(i)">
            <div v-if="s.vocab?.length" style="margin-top: 10px">
              <div class="muted">词汇注解</div>
              <div style="margin-top: 4px">
                <span v-for="v in s.vocab" :key="v.word" class="tag tag-ghost" style="margin: 2px">{{ v.word }} — {{ v.meaning }}</span>
              </div>
            </div>
            <div v-if="s.structure" style="margin-top: 10px">
              <div class="muted">句式分析</div>
              <div style="margin-top: 4px">{{ s.structure }}</div>
            </div>
            <div v-if="s.polished" style="margin-top: 10px">
              <div class="muted">地道改写</div>
              <div style="margin-top: 4px; font-style: italic; color: var(--primary-deep)">{{ s.polished }}</div>
            </div>
          </template>
        </div>
      </div>

      <RawFallback v-if="lastError" :raw="lastError.raw" @retry="analyze" />
    </template>

    <UpgradeModal :open="upgradeOpen" @close="upgradeOpen = false" @go-settings="goSettings" />
  </div>
</template>
