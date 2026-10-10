import type { DraftView, InspirationView, RunView } from "./types";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

export const demoInspirations = (): InspirationView[] => [
  {
    id: "insp-1",
    source: "link",
    url: "https://example.com/agent-new-feature",
    title: "某 Agent 产品上线「定时任务」功能",
    content: "官方更新说明：支持 Cron 表达式和自然语言配置定时任务，每次运行保留完整日志……",
    summary: "Agent 新增定时任务，支持 Cron 和自然语言配置，适合写一篇入门教程。",
    tags: ["Agent", "新功能", "教程"],
    freshness: "timely",
    createdAt: hoursAgo(3),
  },
  {
    id: "insp-2",
    source: "text",
    url: null,
    title: "去 AI 味写作清单",
    content: "少用「总而言之」「值得注意的是」；多用短句和具体步骤；每节一个可复制的提示词。",
    summary: "一份去 AI 味的写作规则，可以加进个人风格档案。",
    tags: ["写作", "风格"],
    freshness: "evergreen",
    createdAt: hoursAgo(26),
  },
  {
    id: "insp-3",
    source: "x_bookmark",
    url: "https://x.com/i/status/0000000000",
    title: "高收藏帖：Skill 和工作流大全",
    content: "「一个人顶一个团队」系列，收藏数明显高于点赞数，说明读者当工具书存。",
    summary: null,
    tags: [],
    freshness: null,
    createdAt: hoursAgo(50),
  },
];

export const demoDrafts = (): DraftView[] => [
  {
    id: "draft-1",
    title: "保姆级｜10 分钟给自己搭一个「选题雷达」（附提示词）",
    titleOptions: [
      "保姆级｜10 分钟给自己搭一个「选题雷达」（附提示词）",
      "每天 8 点自动给你选题：我的 AI 编辑部第一步",
      "别再刷信息流了，让 Bot 帮你挑选题",
      "选题雷达大全：关键词、对标账号、RSS 怎么配",
      "一个人顶一个编辑部：选题雷达实操",
    ],
    body: `## 为什么要有选题雷达\n\n新功能一发布，谁先写出能照着做的教程，谁就拿走收藏。\n\n## 第一步：确定关键词\n\n先写 3 个关键词，例如「Agent」「新功能」「提示词」……\n\n## 第二步：加对标账号和 RSS\n\n（待补截图）\n\n## 附：可复制的提示词\n\n\`\`\`\n你是一名 AI 领域的选题编辑……\n\`\`\``,
    coverPrompt: "极简风格的雷达扫描界面，中间是一张张选题卡片，暖色调",
    status: "in_review",
    reviewNote: null,
    botName: "长文写作",
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
  },
  {
    id: "draft-2",
    title: "我用 3 个 Bot 组了一个 AI 编辑部",
    titleOptions: [],
    body: "## 背景\n\n……\n\n## 3 个 Bot 分别做什么\n\n1. 选题雷达\n2. 灵感库整理\n3. 长文写作（必须人工审核）",
    coverPrompt: null,
    status: "in_review",
    reviewNote: null,
    botName: "长文写作",
    createdAt: hoursAgo(20),
    updatedAt: hoursAgo(20),
  },
  {
    id: "draft-3",
    title: "灵感库怎么用：把收藏变成选题",
    titleOptions: [],
    body: "## 收藏 ≠ 素材\n\n……",
    coverPrompt: null,
    status: "approved",
    reviewNote: "可以发，记得补一张截图",
    botName: "长文写作",
    createdAt: hoursAgo(48),
    updatedAt: hoursAgo(30),
  },
];

export const demoRuns = (): RunView[] => [
  {
    id: "run-3",
    botName: "长文写作",
    status: "awaiting_review",
    trigger: "manual",
    createdAt: hoursAgo(2),
    error: null,
  },
  {
    id: "run-2",
    botName: "灵感库整理",
    status: "succeeded",
    trigger: "schedule",
    createdAt: hoursAgo(3),
    error: null,
  },
  {
    id: "run-1",
    botName: "选题雷达",
    status: "failed",
    trigger: "schedule",
    createdAt: hoursAgo(6),
    error: "档位「cheap」还没有映射到任何模型，请到「设置」里配置",
  },
];
