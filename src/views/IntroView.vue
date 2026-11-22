<!--
  Tab1 · 自我介绍打磨
  - 多份自我介绍管理（考研版/求职版/雅思版/自定义）
  - 每份支持多轮迭代历史，可回退
  - 用户粘贴原始稿 → AI 批改 → 固定结构卡片 + 整合范文
  - 范文 TTS 逐行高亮跟读（浏览器内置）
-->
<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { state, uid, isPro, checkFeature } from '../store/state.js'
import { chat } from '../lib/llm.js'
import { parseJson, normalizeIntro } from '../lib/parse.js'
import { buildIntroPrompt } from '../lib/prompts.js'
import { toast } from '../composables/useUi.js'
import { createLineReader } from '../lib/speech.js'
import UpgradeModal from '../components/UpgradeModal.vue'
import RawFallback from '../components/RawFallback.vue'
import SpeakPlayer from '../components/SpeakPlayer.vue'
import DeepDivePanel from '../components/DeepDivePanel.vue'

// 子功能：打磨自我介绍 / 深挖我的自我介绍
const activeSub = ref('polish')

// ---------- 多份自我介绍管理 ----------
const SCENE_PRESETS = ['考研版', '求职版', '雅思版', '其他']
const showNewForm = ref(false)
const newTitle = ref('')
const newScene = ref('求职版')

function createIntro() {
  if (!newTitle.value.trim()) { toast.warn('请填写名称'); return }
  state.intros.push({
    id: uid(),
    title: newTitle.value.trim(),
    scene: newScene.value,
    drafts: [{ id: uid(), content: '', createdAt: Date.now() }],
    currentDraftId: '',
    history: [],              // [{ content, createdAt, result }]
    lastResult: null
  })
  // 设置当前选中
  const last = state.intros[state.intros.length - 1]
  last.currentDraftId = last.drafts[0].id
  activeIntroId.value = last.id
  newTitle.value = ''
  showNewForm.value = false
  toast.ok('已创建')
}

function removeIntro(id) {
  if (!confirm('确定删除这份自我介绍？历史版本将一并清除。')) return
  const i = state.intros.findIndex(x => x.id === id)
  if (i >= 0) state.intros.splice(i, 1)
  if (activeIntroId.value === id) activeIntroId.value = state.intros[0]?.id || ''
}

const activeIntroId = ref('')
const activeIntro = computed(() => state.intros.find(x => x.id === activeIntroId.value))

onMounted(() => {
  if (state.intros.length > 0 && !activeIntroId.value) {
    activeIntroId.value = state.intros[0].id
  }
})

const currentDraft = computed(() => {
  const a = activeIntro.value
  if (!a) return null
  return a.drafts.find(d => d.id === a.currentDraftId) || a.drafts[0]
})

// v-model 绑定的带 getter/setter 计算属性（可选链不能直接赋值）
const currentContent = computed({
  get: () => currentDraft.value?.content || '',
  set: (v) => { if (currentDraft.value) currentDraft.value.content = v }
})

// ---------- 新建草稿 / 迭代 ----------
const loadingIterate = ref(false)
const iterateRaw = ref('')
const lastError = ref(null)

async function iterate() {
  if (!checkFeature('introMultiIter')) {
    upgradeOpen.value = true
    return
  }
  const d = currentDraft.value
  if (!d || !d.content.trim()) { toast.warn('请先粘贴或输入原文'); return }
  loadingIterate.value = true
  iterateRaw.value = ''
  lastError.value = null

  try {
    const prompt = buildIntroPrompt({
      title: activeIntro.value.title,
      scene: activeIntro.value.scene,
      content: d.content
    })
    const raw = await chat(prompt, { system: '你是一名英语口语专家，严格按 JSON 输出。' })
    iterateRaw.value = raw
    const p = parseJson(raw)
    if (!p.ok) { lastError.value = { raw, error: p.error }; return }
    const intro = normalizeIntro(p.data)
    activeIntro.value.lastResult = intro
    // 生成新版本
    if (intro.polished && intro.polished !== d.content) {
      const newDraft = { id: uid(), content: intro.polished, createdAt: Date.now() }
      activeIntro.value.drafts.push(newDraft)
      activeIntro.value.currentDraftId = newDraft.id
    }
    // 写入历史
    activeIntro.value.history.unshift({
      id: uid(), content: d.content, createdAt: Date.now(), result: intro
    })
    toast.ok('批改完成 ✨')
  } catch (e) {
    toast.err('请求失败：' + e.message)
  } finally {
    loadingIterate.value = false
  }
}

function rollback(draftId) {
  activeIntro.value.currentDraftId = draftId
  toast.ok('已切换到该版本')
}

// ---------- TTS 逐行高亮跟读 ----------
const readIdx = ref(-1)
let reader = null
function startRead() {
  const text = activeIntro.value?.lastResult?.polished
  if (!text) return
  if (reader) reader.stop()
  reader = createLineReader(text, {
    onHighlight: (i) => { readIdx.value = i }
  })
  reader.play().finally(() => { readIdx.value = -1 })
}
function stopRead() { reader?.stop(); readIdx.value = -1 }

const upgradeOpen = ref(false)
const emit = defineEmits([])
// 跨 Tab 跳转设置
function goSettings() {
  upgradeOpen.value = false
  window.dispatchEvent(new CustomEvent('spk:navigate', { detail: 'settings' }))
}
</script>

<template>
  <div>
    <header class="page-head">
      <div class="h1-hand">自我介绍打磨</div>
      <div class="page-head-en">Self-Introduction Polishing</div>
      <p>打磨自我介绍、深挖自我介绍<span class="page-desc-en">Polish &amp; deep-dive your self-introduction</span></p>
    </header>

    <!-- 子功能切换 -->
    <div class="row" style="margin-bottom: 14px; flex-wrap: wrap">
      <button class="btn" :class="activeSub === 'polish' ? 'btn-primary' : 'btn-ghost'" @click="activeSub = 'polish'">
        ✨ 打磨自我介绍<span class="btn-en">Polish</span>
      </button>
      <button class="btn" :class="activeSub === 'dive' ? 'btn-primary' : 'btn-ghost'" @click="activeSub = 'dive'">
        🔎 深挖我的自我介绍<span class="btn-en">Deep Dive</span>
      </button>
    </div>

    <DeepDivePanel v-if="activeSub === 'dive'" mode="intro" />

    <div v-show="activeSub === 'polish'">
    <!-- 列表 -->
    <div v-if="!state.intros.length" class="empty-state">
      <div style="font-size: 64px">👋</div>
      <div class="h2-hand">还没有自我介绍<span class="sub-en">No Intro Yet</span></div>
      <p>点下面的按钮创建第一份吧～</p>
      <button class="btn btn-primary" @click="showNewForm = true">+ 新建自我介绍<span class="btn-en">New</span></button>
    </div>

    <div v-else>
      <div class="row" style="flex-wrap: wrap; margin-bottom: 14px">
        <div
          v-for="it in state.intros"
          :key="it.id"
          class="card"
          :style="{ padding: '10px 14px', cursor: 'pointer', background: it.id === activeIntroId ? 'var(--primary-soft)' : '' }"
          @click="activeIntroId = it.id"
        >
          <div style="font-weight: 600">{{ it.title }}</div>
          <div class="faint">{{ it.scene }} · {{ it.drafts.length }} 个版本</div>
        </div>
        <button class="btn btn-ghost" @click="showNewForm = true">+ 新建<span class="btn-en">New</span></button>
      </div>

      <!-- 编辑区 -->
      <div v-if="activeIntro" class="stack">
        <div class="card">
          <div class="row-spaced" style="margin-bottom: 8px">
            <div>
              <span class="h3-hand" style="margin: 0">{{ activeIntro.title }}</span>
              <span class="tag" style="margin-left: 8px">{{ activeIntro.scene }}</span>
            </div>
            <button class="btn-link" style="color: var(--danger)" @click="removeIntro(activeIntro.id)">删除<span class="btn-en">Delete</span></button>
          </div>

          <div class="muted" style="margin-bottom: 6px">粘贴你的英文原文草稿：</div>
          <textarea
            v-model="currentContent"
            class="textarea"
            placeholder="例如：Good morning professors, my name is..."
          ></textarea>

          <div class="row" style="margin-top: 10px">
            <button class="btn btn-primary" :disabled="loadingIterate" @click="iterate">
              <span v-if="loadingIterate"><span class="spinner"></span> 批改中…<span class="btn-en">Grading</span></span>
              <span v-else>✨ AI 批改（生成新版本）<span class="btn-en">Grade</span></span>
            </button>
            <button
              v-if="iterateRaw"
              class="btn btn-ghost"
              @click="iterateRaw = ''; activeIntro.lastResult = null"
            >清空批改结果<span class="btn-en">Clear</span></button>
          </div>
        </div>

        <!-- 历史版本 -->
        <div class="card">
          <div class="h3-hand" style="margin-top: 0">📚 历史版本（{{ activeIntro.drafts.length }}）<span class="sub-en">History</span></div>
          <div class="row" style="flex-wrap: wrap; gap: 8px">
            <div
              v-for="(d, i) in activeIntro.drafts"
              :key="d.id"
              class="tag tag-ghost"
              :style="{ background: d.id === activeIntro.currentDraftId ? 'var(--primary-soft)' : '' }"
            >
              v{{ i + 1 }} · {{ new Date(d.createdAt).toLocaleDateString() }}
              <button class="btn-link" @click="rollback(d.id)" style="padding: 0 4px">切换<span class="btn-en">Switch</span></button>
            </div>
          </div>
        </div>

        <!-- 批改结果 -->
        <div v-if="activeIntro.lastResult" class="stack">
          <div class="card">
            <div class="h3-hand">✨ 新版范文<span class="sub-en">Polished Version</span></div>
            <div class="row" style="margin-top: 8px">
              <SpeakPlayer :text="activeIntro.lastResult.polished" label="播放" />
              <button class="btn btn-ghost" v-if="reader" @click="readIdx >= 0 ? stopRead() : startRead()">
                {{ readIdx >= 0 ? '⏹ 停止跟读' : '▶️ 逐行高亮跟读' }}
              </button>
            </div>
            <div
              v-if="activeIntro.lastResult.polished"
              style="margin-top: 12px; line-height: 1.8; white-space: pre-wrap"
            >
              <div
                v-for="(ln, i) in (activeIntro.lastResult.polished.split(/(?<=[.!?])\s+/).filter(Boolean))"
                :key="i"
                class="hl-line"
                :class="{ active: readIdx === i }"
              >{{ ln }}</div>
            </div>
          </div>

          <div v-if="activeIntro.lastResult.strengths?.length" class="card">
            <div class="h3-hand">👍 优点<span class="sub-en">Strengths</span></div>
            <ul style="padding-left: 20px; line-height: 1.9">
              <li v-for="(s, i) in activeIntro.lastResult.strengths" :key="i">{{ s }}</li>
            </ul>
          </div>
          <div v-if="activeIntro.lastResult.weaknesses?.length" class="card">
            <div class="h3-hand">⚠️ 待改进<span class="sub-en">Areas to Improve</span></div>
            <ul style="padding-left: 20px; line-height: 1.9">
              <li v-for="(s, i) in activeIntro.lastResult.weaknesses" :key="i">{{ s }}</li>
            </ul>
          </div>
          <div v-if="activeIntro.lastResult.tips?.length" class="card">
            <div class="h3-hand">💡 具体建议<span class="sub-en">Suggestions</span></div>
            <ul style="padding-left: 20px; line-height: 1.9">
              <li v-for="(s, i) in activeIntro.lastResult.tips" :key="i">{{ s }}</li>
            </ul>
          </div>
        </div>

        <RawFallback v-if="lastError" :raw="lastError.raw" @retry="iterate()" />
      </div>
    </div>
    </div>

    <!-- 新建弹窗 -->
    <div v-if="showNewForm" class="modal-mask" @click.self="showNewForm = false">
      <div class="modal">
        <h3>新建自我介绍</h3>
        <label class="muted">名称</label>
        <input v-model="newTitle" class="input" placeholder="例如：考研复试版" />
        <label class="muted" style="margin-top: 10px">适用场景</label>
        <select v-model="newScene" class="select">
          <option v-for="s in SCENE_PRESETS" :key="s">{{ s }}</option>
        </select>
        <div style="display: flex; gap: 10px; margin-top: 16px">
          <button class="btn btn-ghost" @click="showNewForm = false">取消<span class="btn-en">Cancel</span></button>
          <button class="btn btn-primary" style="flex: 1" @click="createIntro">创建<span class="btn-en">Create</span></button>
        </div>
      </div>
    </div>

    <UpgradeModal v-model="upgradeOpen" :open="upgradeOpen" @close="upgradeOpen = false" @go-settings="goSettings" />
  </div>
</template>
