# 英语口语面试陪练 · Oral Coach

> 纯前端 Vue 3 + Vite SPA，面向考研复试 / 求职面试 / 雅思口语用户。所有数据仅保存在你的浏览器 LocalStorage，不联网同步、不做后端。

## ✨ 功能模块

| # | Tab | 说明 |
|---|-----|------|
| 1 | 自我介绍打磨 | 多份管理 + 历史版本回退 + AI 批改 + TTS 逐行跟读 |
| 2 | 面试模拟（核心） | 场景 / 难度 / 限时 / 背诵模式 · 智能抽题 · 六维评分 · 连环追问 |
| 3 | 英文文本精读 | 粘贴文本 → 逐句词汇注解 + 句式分析 + 地道改写 |
| 4 | 题库与收藏 | 手动新增 / AI 自动评估入库 / 文档批量导入 / 收藏手册 / PDF 导出 |
| 5 | 数据仪表盘 | 六维雷达图 · 题型均分柱图 · 累计练习统计 |
| 6 | 设置 | 模型 / API Key · TTS 模式 · 解锁码 · 备份导入导出 |

## 🚀 本地启动

```bash
# 安装 Node 20+（已装则跳过）：便携版解压到 D:\tools\nodejs，把它加进用户 PATH
npm install        # 仅首次 / 依赖变更时
npm run dev        # 开发模式 → http://localhost:5173
npm run build      # 生产构建 → dist/
npm run preview    # 预览构建产物 → http://localhost:4173
```

打开浏览器访问 `http://localhost:5173`，首次会弹出新手引导，之后到「设置」填一个 API Key 就可以开始练了。

## ☁️ Cloudflare Pages 部署

### 方式 A：直接上传 dist（最快）

```bash
npm run build
# 打开 Cloudflare Dashboard → Workers & Pages → Create application → Pages → Direct Upload
# 选择 d:\英语口语练习vibecoding\dist 目录
```

### 方式 B：连接 Git（自动部署）

1. 把项目推到 GitHub
2. Cloudflare → Pages → Connect to Git → 选择仓库
3. Framework preset 选 **Vite**，构建命令 `npm run build`，输出目录 `dist`
4. Environment Variables 可选填 `NODE_VERSION=20`

注意 `vite.config.js` 里 `base: './'` 已配置为相对路径，部署到任意子路径都能正常加载资源。

## 🔑 解锁码

买断版解锁全部高级功能：六维雷达图、智能出题、文本精读、背诵模式、连环追问、PDF 导入导出、自我介绍多轮迭代、无限制练题。

输入示例：`SPK-2026-ORAL-ZYNS`

## 📁 项目结构

```
src/
├── main.js                 入口
├── App.vue                 6 Tab SPA 根组件
├── components/             通用组件（10 个）
├── composables/useUi.js    toast / confirm
├── lib/                    工具库（9 个：storage / llm / parse / prompts / speech / pdf / license / text）
├── store/state.js          全局 reactive store + LocalStorage 自动持久化
├── styles/global.css       全局样式
└── views/                  6 个 Tab 视图
```

## 🎨 技术栈

- Vue 3.5 `<script setup>` + Vite 6
- 零重型 UI 库（原生 CSS + 手写 SVG 雷达图 / 柱图）
- jsPDF（PDF 导出，嵌入 NotoSansSC 中文字体避免乱码）
- Web Speech API 录音识别 + 浏览器 SpeechSynthesis TTS（免费）
- 模型 TTS 支持（OpenAI / 兼容接口 `/audio/speech`）
- 纯前端 LocalStorage（前缀 `spk.v2.`，容量阈值 4.5MB）

## 🔒 隐私与安全

- API Key **仅保存在本机 LocalStorage**，请求直连模型服务商，不会上传到任何中间服务器
- 建议为本站单独申请一把低额度密钥
- 清浏览器缓存会重置免费版每日配额和新手引导，但解锁码保留（如需恢复免费体验先点「一键清空全部数据」）

## 💸 费用提示（仅供参考）

一次完整问答估算：DeepSeek Chat ≈ ¥0.0001 / 豆包 Lite ≈ ¥0.0002。每天练 5 题，一个月通常不到 1 元。

## 📋 硬性约束（已遵守）

- ✅ 纯前端 · 无后端 · 无数据库
- ✅ 不做账号 / 登录 / 云端同步 / 服务端埋点
- ✅ API Key 用户自填 · 只存 LocalStorage · 直连服务商
- ✅ 语音识别用 Web Speech API · 识别失败手动输入兜底
- ✅ TTS 双模式（浏览器内置免费 / 模型 TTS 消耗 token）
- ✅ 一期不做公共题库 · 投稿 · 排行榜 · 发音精细评测
- ✅ 不引入重型 UI 库
- ✅ 移动端自适应 · 触控按钮 ≥ 44px
