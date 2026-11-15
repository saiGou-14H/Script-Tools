export const previewTasks = [
  {
    key: "clean",
    title: "数据清洗：游客数据整理",
    category: "数据 / 文件工具",
    icon: "database",
    order: "SO-20261113-001",
    plan: "执行时间：2026-11-13",
    status: "已完成",
    progress: 100,
    summary: "执行完成，已生成结果",
    used: "已用 1 次",
  },
  {
    key: "booking",
    orderId: "OD202611130002",
    title: "景点预约：博物馆参观预约",
    category: "景点预约",
    icon: "calendar",
    order: "SO-20261113-002",
    plan: "预约日期：2026-11-15",
    status: "本次进行中",
    progress: 60,
    summary: "正在执行预约流程…",
    used: "服务窗口：10:00 - 12:00",
  },
  {
    key: "data",
    title: "公开数据整理：城市基本信息",
    category: "数据 / 文件工具",
    icon: "file",
    order: "SO-20261113-003",
    plan: "执行时间：待补充",
    status: "等待用户补充",
    progress: 0,
    summary: "待补充数据后开始执行",
    used: "",
  },
];

export const notificationFixtures = [
  {
    id: "result",
    category: "运行",
    icon: "table",
    color: "blue",
    title: "表格清洗结果已可领取",
    description:
      "您提交的表格清洗任务已经处理完成，结果文件可前往运行记录中领取。",
    action: "查看结果",
    to: "/me/outputs?kind=file&output=csv",
  },
  {
    id: "payment",
    category: "交易",
    icon: "payment",
    color: "green",
    title: "订单付款已确认",
    description: "您的订单付款已确认，服务将按订单内容执行。",
    action: "查看订单",
    to: "/me/orders/OD202611130001",
  },
  {
    id: "refund",
    category: "退款",
    icon: "money",
    color: "orange",
    title: "退款¥8.00渠道处理中",
    description: "您的退款申请已受理，目前正在通过支付渠道处理中，请耐心等待。",
    action: "查看退款",
    to: "/me/refunds/REF018",
  },
  {
    id: "booking",
    category: "系统",
    icon: "ticket-stub",
    color: "purple",
    title: "预约结果待核验",
    description: "预约请求已提交，结果仍待核验，请查看原预约进度。",
    action: "查看结果",
    to: "/me/pending?category=待核验&dialog=verify&item=booking",
  },
];

export const purchaseFixtures = [
  {
    id: "clean",
    orderId: "OD202611130001",
    schemaDigest: "schema-table",
    scriptVersion: "1.2",
    title: "表格清洗",
    icon: "table",
    status: "待使用",
    category: "待使用",
    tone: "blue" as const,
    description: "对表格数据进行清洗与规范，输出可用结果文件",
    columns: [
      ["剩余次数", "1 次"],
      ["有效至", "11月20日"],
      ["版本", "1.2"],
    ],
    action: "配置使用",
  },
  {
    id: "booking",
    orderId: "OD202611130002",
    taskId: "booking",
    title: "免费景点预约",
    icon: "travel",
    status: "使用中",
    category: "使用中",
    tone: "green" as const,
    description: "协助完成指定景点的预约操作",
    columns: [
      ["状态", "进行中"],
      ["权益占用", "已占用本次权益"],
      ["预约日期", "2026-11-20"],
    ],
    action: "查看任务",
  },
  {
    id: "files",
    title: "文件处理",
    icon: "file",
    status: "已使用",
    category: "已使用",
    tone: "gray" as const,
    description: "对提交的文件进行处理并输出目标结果",
    columns: [
      ["执行状态", "已使用"],
      ["结果", "已完成并生成产物"],
      ["执行时间", "2026-11-12"],
    ],
    action: "再次购买",
  },
  {
    id: "data",
    title: "公开数据整理",
    icon: "database",
    status: "服务暂不可用",
    category: "待使用",
    tone: "red" as const,
    description: "本次服务暂不可用，可等待恢复或取消退款",
    columns: [
      ["当前状态", "暂不可用"],
      ["说明", "本次服务暂不可用，可等待恢复或取消退款"],
    ],
    action: "",
  },
];

export const pendingFixtures = [
  {
    id: "credential",
    title: "数据整理凭据已过期",
    category: "待补充",
    service: "数据整理与文件处理",
    description: "需要更新访问凭据后，继续完成本次服务。",
    deadlineLabel: "补充截止时间",
    deadlineAt: "2026-11-13 18:00",
    icon: "database",
    action: "更新凭据",
  },
  {
    id: "booking",
    title: "景点预约外部结果待核验",
    category: "待核验",
    service: "景点预约",
    description:
      "检测到外部平台已有预约结果，请核验原预约信息，不能重新下单或重抢。",
    deadlineLabel: "核验截止时间",
    deadlineAt: "2026-11-14 21:00",
    visitDate: "2026-11-15",
    icon: "gift",
    action: "核验原预约",
  },
];

export interface PreviewOutput {
  key: string;
  task: string;
  goal: string;
  name: string;
  size: string;
  run: string;
  runId: string;
  batch: string;
  created: string;
  expires: string;
  ready: boolean;
  content: string;
  kind: "file" | "text" | "json" | "message";
  mediaType: string;
  deliveryStatus: "SENT" | "NOT_TRIGGERED";
}
export const outputFixtures: PreviewOutput[] = [
  {
    key: "csv",
    kind: "file",
    mediaType: "text/csv;charset=utf-8",
    deliveryStatus: "SENT",
    runId: "clean",
    task: "表格清洗",
    goal: "清洗并整理表格数据",
    name: "cleaned.csv",
    size: "142 KB",
    run: "运行-20261113-001",
    batch: "批次 02",
    created: "2026-11-13 10:00",
    expires: "2026-11-30",
    ready: true,
    content:
      "name,email\n张三,zhang@example.invalid\n李四,li@example.invalid\n",
  },
  {
    key: "json",
    kind: "file",
    mediaType: "application/json;charset=utf-8",
    deliveryStatus: "SENT",
    runId: "clean",
    task: "表格清洗",
    goal: "清洗并整理表格数据",
    name: "summary.json",
    size: "28 KB",
    run: "运行-20261113-001",
    batch: "批次 02",
    created: "2026-11-13 10:45",
    expires: "2026-11-30",
    ready: true,
    content: JSON.stringify(
      { rows: 1200, duplicates_removed: 86, status: "completed" },
      null,
      2,
    ),
  },
  {
    key: "pending",
    kind: "file",
    mediaType: "text/csv;charset=utf-8",
    deliveryStatus: "NOT_TRIGGERED",
    runId: "booking",
    task: "免费景点预约",
    goal: "提交景点预约申请",
    name: "batch02.csv",
    size: "—",
    run: "运行-20261113-002",
    batch: "批次 01",
    created: "2026-11-13 13:30",
    expires: "2026-11-30",
    ready: false,
    content: "",
  },
];
export const inlineOutputFixtures: PreviewOutput[] = [
  {
    ...outputFixtures[1],
    key: "summary-data",
    kind: "json",
    name: "清洗统计.json",
  },
  {
    ...outputFixtures[0],
    key: "summary-text",
    kind: "text",
    name: "结果说明.txt",
    mediaType: "text/plain;charset=utf-8",
    content: "表格清洗完成，已生成 cleaned.csv 与 summary.json。",
  },
  {
    ...outputFixtures[1],
    key: "result-message",
    kind: "message",
    name: "清洗结果通知",
    size: "—",
    deliveryStatus: "NOT_TRIGGERED",
    content: JSON.stringify(
      { title: "表格清洗完成", body: "已生成 cleaned.csv 与 summary.json。" },
      null,
      2,
    ),
  },
  ...[1, 2].map((batch): PreviewOutput => ({
    key: `booking-progress-${batch}`,
    kind: "json",
    mediaType: "application/json;charset=utf-8",
    deliveryStatus: "NOT_TRIGGERED",
    runId: "booking",
    task: "免费景点预约",
    goal: "提交景点预约申请",
    name: `预约进度-${batch}.json`,
    size: "1 KB",
    run: "运行-20261113-002",
    batch: `进度批次 0${batch}`,
    created: `2026-11-13 10:0${batch}`,
    expires: "2026-11-30",
    ready: true,
    content: JSON.stringify(
      { batch, execution_status: "RUNNING", goal_status: "PENDING" },
      null,
      2,
    ),
  })),
];

export function downloadPreviewOutput(output: PreviewOutput) {
  const objectURL = URL.createObjectURL(
    new Blob([output.content], {
      type: output.mediaType,
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = objectURL;
  anchor.download = output.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
}
