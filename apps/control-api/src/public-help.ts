export const publicHelp = {
  content_version: "1.0",
  groups: [
    { id: "purchase", title: "购买与付费", icon: "cart" },
    { id: "execution", title: "运行与结果", icon: "play" },
    { id: "refund", title: "退款售后", icon: "history" },
    { id: "publishing", title: "发布与部署", icon: "layers" },
    { id: "security", title: "账号安全", icon: "shield" },
  ],
  questions: [
    {
      id: "purchase",
      title: "如何按次购买？",
      group: "purchase",
      answer:
        "在脚本市场选择服务，核对价格、输入参数、交付目标和退款规则，支付后获得一次完整服务。",
      keywords: "购买 服务费 价格 支付",
      featured: true,
    },
    {
      id: "ticket",
      title: "门票免费为何收取服务费？",
      group: "purchase",
      answer:
        "门票款由景区官方确定，脚本服务费由发布者设置。免费门票的预约服务仍可按次收费，购买前会分别展示。",
      keywords: "门票 免费 服务费 景点",
      featured: true,
    },
    {
      id: "refund",
      title: "未达成目标怎么退款？",
      group: "refund",
      answer: "以购买前展示并固定的发布者规则为准。",
      keywords: "退款规则 未达 目标 费用",
      featured: true,
    },
    {
      id: "resume",
      title: "一次服务接续会重复收费吗？",
      group: "execution",
      answer:
        "同一次逻辑服务的技术重试和合法接续包含在本单内，不重复收费。再次使用已完成的服务需要购买新订单。",
      keywords: "接续 重复 收费 运行 结果",
      featured: true,
    },
    {
      id: "publish",
      title: "如何发布脚本？",
      group: "publishing",
      answer:
        "进入脚本发布者工作区，上传脚本，定义动作和必填JSON Schema，完成构建与部署检查，再配置价格、交付目标和退款规则后上架。",
      keywords: "发布 脚本 部署 参数 JSON Schema",
      featured: true,
    },
    {
      id: "account",
      title: "如何保护我的账户和凭据？",
      group: "security",
      answer:
        "凭据按本人范围和固定版本绑定任务。可在账户设置管理登录会话，在凭据管理查看凭据掩码和版本。凭据更新、撤销及任务绑定以对应服务的接入状态为准。",
      keywords: "账户 账号 安全 密码 凭据 会话",
      featured: false,
    },
  ],
  support: {
    status: "UNCONFIGURED",
    message: "在线支持渠道尚未配置。服务订单的退款规则以购买时的快照为准。",
  },
};
