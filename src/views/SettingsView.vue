<!--
  Tab6 · 设置
  - 模型选择 / base_url / API Key / 连通性测试
  - Key 安全提示 + 图文教程（DeepSeek / 豆包各一套）
  - 费用测算文案
  - TTS 模式切换
  - 数据操作：导出备份 / 导入备份 / 一键清空
  - 解锁码输入
-->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { state, PROVIDER_DEFAULTS, upgradeToPro, isPro, resetAllData, exportAllBackup, importBackup } from '../store/state.js'
import { testConnectivity } from '../lib/llm.js'
import { toast } from '../composables/useUi.js'
import { normalizeCode } from '../lib/license.js'
import { confirmDialog } from '../composables/useUi.js'

const s = state.settings

// provider 切换 → 自动填充 baseUrl / model
function onProviderChange() {
  const def = PROVIDER_DEFAULTS[s.provider]
  // 仅当用户未手改过才覆盖
  if (!s.baseUrl || s.baseUrl === '') s.baseUrl = def.baseUrl
  if (!s.model || s.model === '') s.model = def.model
  if (!s.ttsModel || s.ttsModel === '') s.ttsModel = def.ttsModel || ''
}

// 连通性测试
const testing = ref(false)
async function test() {
  if (!s.apiKey) { toast.warn('请先填 API Key'); return }
  testing.value = true
  try { await testConnectivity(); toast.ok('✅ 连通成功！') }
  catch (e) { toast.err('❌ ' + e.message) }
  finally { testing.value = false }
}

// TTS 切换
function onTtsModeChange() {
  if (s.ttsMode === 'model') {
    // 简单提示，用户已理解 token 消耗
  }
}

// 解锁码
const codeInput = ref('')
const codeMsg = ref('')
function tryUnlock() {
  const clean = normalizeCode(codeInput.value)
  if (!clean) { codeMsg.value = '请输入解锁码'; return }
  const ok = upgradeToPro(clean)
  if (ok) { codeMsg.value = '✅ 解锁成功！'; toast.ok('已解锁买断版 ✨') }
  else codeMsg.value = '❌ 解锁码无效'
}

// 备份
function doExport() {
  const backup = exportAllBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `oral-backup-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast.ok('已导出备份 JSON')
}
function handleImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const json = JSON.parse(String(reader.result))
      importBackup(json)
      toast.ok('已导入并恢复')
    } catch (err) {
      toast.err('导入失败：文件格式不正确')
    }
  }
  reader.readAsText(file)
}
async function doReset() {
  const ok = await confirmDialog('一键清空全部数据', '这会删除你的题库、收藏、历史、自我介绍、仪表盘统计等所有本地数据（解锁码除外），清缓存也能重置免费版配额。确定要清空吗？')
  if (ok) { resetAllData(); toast.ok('已清空') }
}

// 教程折叠
const tutOpen = ref(null)
</script>

<template>
  <div>
    <header class="page-head">
      <div class="h1-hand">设置</div>
      <div class="page-head-en">Settings</div>
      <p>API Key 仅保存在你本机，请求直连模型服务商。<span class="page-desc-en">Your API key is stored locally; requests go directly to the model provider.</span></p>
    </header>

    <!-- ============ 模型配置 ============ -->
    <div class="card" style="margin-bottom: 14px">
      <div class="h3-hand" style="margin-top: 0">🔑 模型配置<span class="sub-en">Model Config</span></div>
      <div class="grid-2">
        <div>
          <label class="muted">服务商</label>
          <select v-model="s.provider" class="select" @change="onProviderChange">
            <option value="deepseek">DeepSeek</option>
            <option value="doubao">豆包（火山方舟）</option>
            <option value="openai">OpenAI</option>
            <option value="custom">自定义 OpenAI 兼容接口</option>
          </select>
        </div>
        <div v-if="s.provider === 'custom'">
          <label class="muted">服务商名称（可选）</label>
          <input v-model="s.customName" class="input" placeholder="例如：硅基流动" />
        </div>
      </div>
      <div style="margin-top: 10px">
        <label class="muted">base_url</label>
        <input v-model="s.baseUrl" class="input" placeholder="https://api.deepseek.com/v1" />
      </div>
      <div class="grid-2" style="margin-top: 10px">
        <div>
          <label class="muted">chat 模型</label>
          <input v-model="s.model" class="input" placeholder="deepseek-chat" />
        </div>
        <div>
          <label class="muted">TTS 模型（可选，仅模型 TTS 时需要）</label>
          <input v-model="s.ttsModel" class="input" placeholder="如 gpt-4o-mini-tts" />
        </div>
      </div>
      <div style="margin-top: 10px">
        <label class="muted">API Key</label>
        <input v-model="s.apiKey" class="input" type="password" placeholder="sk-..." />
      </div>

      <div class="row" style="margin-top: 10px">
        <button class="btn btn-ghost" :disabled="testing" @click="test()">
          <span v-if="testing"><span class="spinner"></span></span>
          <span v-else>🔌 测试连通性<span class="btn-en">Test</span></span>
        </button>
      </div>

      <!-- 安全提示 -->
      <div class="card card-soft" style="margin-top: 14px; padding: 10px 14px">
        <div class="faint" style="line-height: 1.7">
          🔒 <b>Key 安全提示：</b>Key 仅保存在你浏览器本地 LocalStorage，请求直连模型服务商，不会上传到任何中间服务器。建议为本站单独申请一把低额度密钥。
        </div>
      </div>
      <div class="faint" style="margin-top: 8px; line-height: 1.6">
        💸 <b>费用估算（仅供参考）：</b>以一次完整面试问答估算（输入约 250 token、输出约 250 token）：DeepSeek Chat 约 ¥0.0001/题，豆包 Lite 约 ¥0.0002/题。一天练 5 题，一个月费用通常不到 1 元。价格随官方调整，以官方为准。
      </div>
    </div>

    <!-- ============ TTS 模式 ============ -->
    <div class="card" style="margin-bottom: 14px">
      <div class="h3-hand" style="margin-top: 0">🔊 TTS 语音合成<span class="sub-en">TTS Speech</span></div>
      <div class="row" style="flex-wrap: wrap; gap: 14px">
        <label style="display: flex; align-items: center; gap: 6px">
          <input type="radio" v-model="s.ttsMode" value="browser" />
          浏览器内置（免费、零 token 消耗）
        </label>
        <label style="display: flex; align-items: center; gap: 6px">
          <input type="radio" v-model="s.ttsMode" value="model" @change="onTtsModeChange" />
          模型 TTS（会消耗你的 token）
        </label>
      </div>
      <div class="faint" style="margin-top: 8px">模型 TTS 只有 OpenAI 及部分兼容服务商支持。切换后系统会自动在播放时使用 `/audio/speech` 接口。</div>
    </div>

    <!-- ============ 解锁 ============ -->
    <div class="card" style="margin-bottom: 14px">
      <div class="h3-hand" style="margin-top: 0">🔓 买断解锁<span class="sub-en">Lifetime License</span></div>
      <div v-if="isPro()" style="color: var(--ok); font-weight: 600; margin-top: 4px">✅ 已解锁买断版 · 全部高级功能可用</div>
      <div v-else>
        <div class="muted" style="margin-top: 4px">解锁码格式：SPK-XXXX-XXXX-XXXX（15 位）</div>
        <div class="row" style="margin-top: 8px">
          <input v-model="codeInput" class="input" style="flex: 1" placeholder="输入解锁码" @keyup.enter="tryUnlock" />
          <button class="btn btn-primary" @click="tryUnlock">解锁<span class="btn-en">Unlock</span></button>
        </div>
        <div class="faint" style="margin-top: 6px">{{ codeMsg }}</div>
      </div>
    </div>

    <!-- ============ 数据操作 ============ -->
    <div class="card">
      <div class="h3-hand" style="margin-top: 0">💾 数据管理<span class="sub-en">Data Management</span></div>
      <div class="row" style="flex-wrap: wrap; gap: 10px">
        <button class="btn btn-ghost" @click="doExport()">⬇️ 导出 JSON 备份<span class="btn-en">Export</span></button>
        <label class="btn btn-ghost" style="display: inline-flex">
          ⬆️ 导入备份<span class="btn-en">Import</span>
          <input type="file" accept=".json" style="display: none" @change="handleImport" />
        </label>
        <button class="btn btn-danger" @click="doReset()">🗑️ 一键清空全部数据<span class="btn-en">Clear All</span></button>
      </div>
      <div class="faint" style="margin-top: 8px; line-height: 1.6">
        📌 所有数据都只存本机浏览器。清缓存会重置免费版配额、解锁标记会保留（如需重新体验免费版请先点击「一键清空全部数据」）。
      </div>
    </div>

    <!-- ============ 获取 API Key 教程 ============ -->
    <div class="card" style="margin-top: 14px">
      <div class="h3-hand" style="margin-top: 0">📚 如何获取 API Key<span class="sub-en">Get API Key</span></div>

      <details style="margin-top: 8px" :open="tutOpen === 'deepseek'">
        <summary style="cursor: pointer; font-weight: 600">DeepSeek（推荐 · 最便宜）</summary>
        <ol style="padding-left: 20px; line-height: 1.9">
          <li>打开 <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener">https://platform.deepseek.com/api_keys</a> 注册 / 登录</li>
          <li>完成实名后，点「创建 API Key」→ 随便填个名字 → 创建</li>
          <li>立即复制好 Key（只显示一次）</li>
          <li>到本站「设置」粘贴 Key，模型选 deepseek-chat，点「🔌 测试连通性」</li>
        </ol>
      </details>

      <details style="margin-top: 8px" :open="tutOpen === 'doubao'">
        <summary style="cursor: pointer; font-weight: 600">豆包 / 火山方舟</summary>
        <ol style="padding-left: 20px; line-height: 1.9">
          <li>打开 <a href="https://console.volcengine.com/ark" target="_blank" rel="noopener">火山方舟控制台</a></li>
          <li>点「API Key 管理」→ 创建 Key</li>
          <li>在「模型推理」→「在线推理」里选一个豆包模型并创建推理接入点（记录 Endpoint ID）</li>
          <li>本站 base_url 填 <code>https://ark.cn-beijing.volces.com/api/v3</code>；model 填 Endpoint ID</li>
        </ol>
      </details>

      <details style="margin-top: 8px" :open="tutOpen === 'openai'">
        <summary style="cursor: pointer; font-weight: 600">OpenAI</summary>
        <ol style="padding-left: 20px; line-height: 1.9">
          <li>打开 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">OpenAI Dashboard</a></li>
          <li>Create new secret key → 复制</li>
          <li>本站选 OpenAI，base_url 和 model 会自动填充</li>
        </ol>
      </details>
    </div>

    <!-- 版本信息 -->
    <div class="faint" style="text-align: center; margin-top: 20px">v2.0 · 纯前端 · 所有数据仅存本机</div>
  </div>
</template>
