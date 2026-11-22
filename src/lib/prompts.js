/*
 * AI 提示词模板 —— 统一由前端控制输出 JSON 格式
 * 模型必须按 JSON schema 返回，前端做容错解析
 */

// ---------- 面试作答批改 ----------
export function buildReviewPrompt({ question, transcript, scene = '职场面试', difficulty = 3 }) {
  const weights = [
    'business(0.25 业务能力)',
    'fluency(0.20 流利度)',
    'logic(0.18 逻辑)',
    'vocabulary(0.15 词汇)',
    'pronunciation(0.12 发音)',
    'grammar(0.10 语法)'
  ].join(', ')

  return `你是一名资深英语口语面试官。请对以下回答进行专业评估并严格按 JSON 输出，不要输出除 JSON 以外的任何文字。

【场景】${scene}  【难度】${difficulty}/5
【题目】
${question}

【用户作答转录】
${transcript}

请给出 6 个维度的分数（每个 0-10 分，允许一位小数），并给出固定 3 类批改卡片（每类 1-4 条短句，字符串数组），以及整合范文 sample_answer（英文）。注意：total_score 由我端按权重自动计算，你填 null 即可。分数权重：${weights}。

输出格式（严格）：
{
  "scores": { "business": 0, "fluency": 0, "logic": 0, "vocabulary": 0, "pronunciation": 0, "grammar": 0 },
  "weak_tags": ["比如", "业务能力"],
  "cards": {
    "natural": ["地道表达建议1", "建议2"],
    "grammar":  ["语法修正1", "修正2"],
    "logic":    ["逻辑优化1", "优化2"]
  },
  "sample_answer": "英文整合范文，长度约 150-250 词",
  "total_score": null
}`
}

// ---------- 自我介绍批改 ----------
export function buildIntroPrompt({ title, content, scene = '求职版' }) {
  return `你是一名英语口语专家。用户需要打磨一份${title || ''}自我介绍（${scene}），请批改并输出 JSON。

【原文】
${content}

输出：
{
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["缺点1", "缺点2"],
  "tips": ["具体建议1", "建议2", "建议3"],
  "polished": "地道改写后的英文范文，200~300 词",
  "sections": [
    { "title": "开场问候", "polished": "..." },
    { "title": "教育背景", "polished": "..." },
    { "title": "核心经历", "polished": "..." },
    { "title": "结尾", "polished": "..." }
  ]
}

只输出 JSON，不要多余文字。`
}

// ---------- 题目自动评估（手动新增 / PDF 导入） ----------
export function buildQuestionEvalPrompt({ text, existingTags = [] }) {
  return `你是一名面试题库编辑。请对以下英文问题进行分类并输出 JSON。

【题目】
${text}

【可选题型标签（优先从这里挑）】${JSON.stringify(existingTags)}，如果都不合适可以自定义新标签。

输出格式（严格）：
{
  "tags": ["1-2 个最贴切的标签"],
  "difficulty": 1,
  "fit_score": 1,
  "reason": "一句评语，解释是否适合作为口语练习题目"
}

fit_score ≥3 表示适合入库。只输出 JSON。`
}

// ---------- 文本精读 ----------
export function buildReadPrompt({ text }) {
  return `你是一名英语教师。请对用户提供的英文文本逐句分析，输出 JSON。

【原文】
${text}

输出格式（严格，按句号/问号/感叹号拆句）：
{
  "sentences": [
    {
      "original": "完整原句",
      "vocab": [{"word":"...","meaning":"中文释义"}],
      "structure": "一句话解释该句的语法/结构要点",
      "polished": "更地道或更简洁的改写，保留原意"
    }
  ]
}

要求：句子拆分合理；每句 vocab 1-5 个重点词；polished 以英文输出。只输出 JSON。`
}

// ---------- 智能出题（让模型给出一道新题） ----------
export function buildSmartPickPrompt({ scene, difficulty, lowDims, lowTags }) {
  return `你是面试官。请基于以下约束，给一道英文题目用于用户练习，输出 JSON。

【场景】${scene}
【难度】${difficulty}/5
【需要针对性加强的能力维度】${JSON.stringify(lowDims)}
【需要针对性加强的题型标签】${JSON.stringify(lowTags)}

输出：
{
  "question": "英文题目",
  "suggested_tags": ["建议的题型标签"]
}

只输出 JSON。`
}

// ---------- 追问 ----------
export function buildFollowUpPrompt({ mode = 'gentle', question, transcript, review }) {
  const system = mode === 'pressure'
    ? '你现在是压力面面试官。'
    : '你现在是温和的引导型面试官。'

  return `${system} 请基于上一轮面试，继续追问一条新的英文问题。只输出英文问题本身，不要 JSON，不要多余文字。

【上一轮题目】${question}
【用户作答摘要】${(transcript || '').slice(0, 300)}
【批改薄弱点】${JSON.stringify((review || {}).weak_tags || [])}`
}

// ---------- 背诵版范文（旁路能力：不占配额、不打分、不算答题记录） ----------
export function buildRecitePrompt(questionText) {
  return `你是外企英文面试助手，根据下面这道英文面试题，生成一篇2分钟左右适合直接背诵的英文面试范文。
要求：口语自然，适合口头表达，模板化但不死板，长度适配2分钟口述，不要中文，只输出英文范文文本，不要额外解释。
题目：${questionText}`
}

/* ============================================================
 * 深挖模块（简历深挖 / 自我介绍深挖）
 * ============================================================ */

const DIVE_STYLE_RULE = {
  gentle: '温和深挖：顺着候选人已有的经历自然追问，帮助他把故事讲清楚、讲具体，语气友好。',
  pressure: '压力面深挖：质疑数据与结论、挑战假设，必须要求候选人给出数据支撑，并追问“为什么不是别人做”“如果重来你会怎么改”。'
}

/**
 * 自动连环深挖出题
 * @param {object} p
 * @param {'resume'|'intro'} p.mode
 * @param {'gentle'|'pressure'} p.style
 * @param {string} p.material   主要素材（简历原文 / 自我介绍原文）
 * @param {string} p.crossText  交叉引用素材（可空）
 * @param {string} p.lastQuestion 上一轮问题（首轮为空）
 * @param {string} p.lastAnswer   上一轮作答
 * @param {string[]} p.asked      已问过的问题，避免重复
 */
export function buildDeepDiveQuestionPrompt({
  mode = 'resume', style = 'gentle', material = '', crossText = '',
  lastQuestion = '', lastAnswer = '', asked = []
}) {
  const modeRule = mode === 'resume'
    ? `素材是候选人简历。请针对简历中写到的项目经历、职责、数据、跳槽原因、时间线是否矛盾等提问。
铁律：不要问简历里没有写过的内容；所有问题必须能在简历原文里找到依据。`
    : `素材是候选人的英文自我介绍。请针对其中的经历、求职动机、自我认知提问，追问要让候选人为自我介绍里的每一句话提供具体例子支撑。`

  const crossRule = crossText
    ? `下面是候选人另一份材料（${mode === 'resume' ? '自我介绍' : '简历'}），请交叉引用：
若两份材料对同一项目/数据/时间线存在矛盾、重复或表述不一致，请优先就这些点提问。
【交叉材料】
${crossText.slice(0, 2000)}`
    : ''

  const askedRule = asked.length
    ? `已经问过、不要重复：\n${asked.slice(-8).map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : ''

  return `你是外企英文面试官，正在做经历深挖。请基于素材只提出一条新的英文面试问题，并给出难度与出题依据，严格输出 JSON。

${modeRule}
${crossRule}

【风格要求】${DIVE_STYLE_RULE[style] || DIVE_STYLE_RULE.gentle}

【上一轮问题】${lastQuestion || '（首轮，无）'}
【上一轮作答】${lastAnswer ? lastAnswer.slice(0, 600) : '（首轮，无）'}
${askedRule}

【素材原文】
${material.slice(0, 4000)}

输出格式（严格）：
{
  "question": "英文问题，一句话，口语化",
  "difficulty": 1,
  "reason": "一句中文说明为什么问这个点（引用素材中的关键词）"
}

difficulty 取 1-5：背景了解=2，普通职责=3，经历细节=4，压力/矛盾质疑=5。只输出 JSON。`
}

/**
 * 选中段落深挖出题
 */
export function buildSegmentDivePrompt({
  segment = '', mode = 'resume', style = 'gentle', context = ''
}) {
  return `你是外企英文面试官。用户从${mode === 'resume' ? '简历' : '自我介绍'}中选中了一段文字，请只围绕这一段提出一条英文面试问题，输出 JSON。

【选中段落】
${segment}

【原文上下文（仅供理解，不要超出选中段落出题）】
${context.slice(0, 1500)}

【风格要求】${DIVE_STYLE_RULE[style] || DIVE_STYLE_RULE.gentle}

输出格式（严格）：
{
  "question": "英文问题，一句话",
  "difficulty": 1,
  "reason": "一句中文说明为什么问这个点"
}

只输出 JSON。`
}

/**
 * 深挖作答批改：沿用统一评分结构，额外输出 3 条深挖要点
 */
export function buildDeepDiveReviewPrompt({
  question, transcript, mode = 'resume', style = 'gentle', material = ''
}) {
  const modeLabel = mode === 'resume' ? '简历' : '自我介绍'
  return `你是一名资深英语面试官，正在做经历深挖追问。请评估候选人的回答，严格输出 JSON。

【风格】${style === 'pressure' ? '压力面' : '温和深挖'}
【深挖问题】
${question}

【候选人作答转录】
${transcript}

【${modeLabel}原文（用于核对是否偏离）】
${material.slice(0, 2500)}

除常规三张卡片外，必须额外输出 focus 数组（3 条中文短评），分别聚焦：
1. 经历细节是否具体：有没有数据、具体动作、可量化的结果；
2. STAR 结构是否完整：Situation / Task / Action / Result 是否齐全；
3. 回答是否偏离${modeLabel}原文：是否出现原文没有的经历或数据自相矛盾。

输出格式（严格）：
{
  "scores": { "business": 0, "fluency": 0, "logic": 0, "vocabulary": 0, "pronunciation": 0, "grammar": 0 },
  "weak_tags": ["流利度", "逻辑"],
  "focus": ["细节具体性点评", "STAR 结构点评", "是否偏离原文点评"],
  "cards": {
    "natural": ["地道表达建议"],
    "grammar": ["语法修正"],
    "logic": ["逻辑优化建议"]
  },
  "sample_answer": "英文整合范文，150-250 词",
  "total_score": null
}

只输出 JSON。`
}
