import {
  inlineOutputFixtures,
  outputFixtures,
  type PreviewOutput,
} from "./consumer-preview";

export interface PreviewRun {
  id: string;
  taskId: string;
  service: string;
  icon: string;
  started: string;
  state: "SUCCEEDED" | "RUNNING" | "WAITING_INPUT";
  goal: "SUCCEEDED" | "PENDING";
  mode: "finite" | "continuous";
  amountMinor: string;
  version: string;
  validUntil: string;
  launchUntil: string;
  maxServiceSeconds: string | null;
  stages: ("finish" | "process" | "wait")[];
  notifications: {
    key: string;
    channel: string;
    state: "SENT" | "NOT_TRIGGERED";
  }[];
  orderId?: string;
  billingOrderId?: string;
  goalDescription: string;
  refundRule: string;
  refundDescription: string;
  input: Record<string, unknown>;
  logs: { time: string; message: string }[];
  statistics?: { rows: string; duplicatesRemoved: string };
}

export const previewRuns: PreviewRun[] = [
  {
    id: "RUN081",
    taskId: "clean",
    service: "表格清洗",
    icon: "table",
    started: "2026-11-13 09:00",
    state: "SUCCEEDED",
    goal: "SUCCEEDED",
    mode: "finite",
    amountMinor: "600",
    version: "v1.2",
    validUntil: "2026-11-30",
    launchUntil: "2026-11-20",
    maxServiceSeconds: "300",
    stages: ["finish", "finish", "finish", "finish"],
    notifications: [
      { key: "inbox", channel: "站内消息", state: "SENT" },
      { key: "email", channel: "邮件", state: "SENT" },
    ],
    billingOrderId: "TT202611130018",
    goalDescription: "清洗输入表格并生成符合约定的结果文件。",
    refundRule: "目标未达全退服务费",
    refundDescription: "目标未达成时，按本单固定规则退还6.00元服务费。",
    input: {
      source_file: "sample.csv",
      deduplicate_by: "邮箱",
      output_format: "CSV",
    },
    statistics: { rows: "1200", duplicatesRemoved: "86" },
    logs: [
      { time: "2026-11-13 09:00:12", message: "运行环境准备完成。" },
      {
        time: "2026-11-13 09:00:28",
        message: "输入文件读取成功，行数为1200。",
      },
      { time: "2026-11-13 09:01:05", message: "去重处理完成，共去重86条。" },
      {
        time: "2026-11-13 09:01:36",
        message: "清洗与校验通过，开始生成产物。",
      },
      { time: "2026-11-13 09:02:10", message: "产物生成完成，文件已就绪。" },
      { time: "2026-11-13 09:02:18", message: "本次执行已结束，目标已达成。" },
    ],
  },
  {
    id: "RUN082",
    taskId: "booking",
    service: "免费景点预约",
    icon: "calendar",
    started: "2026-11-13 10:00",
    state: "RUNNING",
    goal: "PENDING",
    mode: "continuous",
    amountMinor: "800",
    version: "v1.0",
    validUntil: "2026-11-30",
    launchUntil: "2026-11-14",
    maxServiceSeconds: "7200",
    stages: ["finish", "process", "process", "wait"],
    notifications: [
      { key: "progress", channel: "进度批次通知", state: "NOT_TRIGGERED" },
    ],
    orderId: "OD202611130002",
    goalDescription: "在服务窗口内完成指定景点的预约。",
    refundRule: "目标未达全退服务费",
    refundDescription:
      "若未达成目标，将全额退还8.00元服务费。该规则由发布者选择，购买前已展示，成交后固定。",
    input: { visit_date: "2026-11-15", time_slot: "上午场" },
    logs: [
      {
        time: "2026-11-13 10:00:00",
        message: "持续运行已启动，本次权益已占用。",
      },
      {
        time: "2026-11-13 10:01:00",
        message: "进度产物批次01已提交，继续本次运行。",
      },
      {
        time: "2026-11-13 10:02:00",
        message: "进度产物批次02已提交，继续本次运行。",
      },
      {
        time: "2026-11-13 10:03:00",
        message: "预约目标待确认，后续状态以业务核验结果为准。",
      },
    ],
  },
  {
    id: "RUN083",
    taskId: "data",
    service: "公开数据整理",
    icon: "database",
    started: "2026-11-13 10:45",
    state: "WAITING_INPUT",
    goal: "PENDING",
    mode: "finite",
    amountMinor: "500",
    version: "v1.0",
    validUntil: "2026-11-30",
    launchUntil: "2026-11-20",
    maxServiceSeconds: "300",
    stages: ["process", "wait", "wait", "wait"],
    notifications: [
      { key: "pending", channel: "结果通知", state: "NOT_TRIGGERED" },
    ],
    goalDescription: "按本次配置整理城市基本信息。",
    refundRule: "按成交规则核对已交付量",
    refundDescription: "按成交规则核对已交付量与可退金额。",
    input: { source: "城市基本信息", status: "待补充数据" },
    logs: [
      {
        time: "2026-11-13 10:45:00",
        message: "等待补充数据与访问授权，本次运行尚未完成。",
      },
    ],
  },
];

export const runStateLabels = {
  SUCCEEDED: "执行已结束",
  RUNNING: "执行中",
  WAITING_INPUT: "待补充",
};
export const runTones = {
  SUCCEEDED: "green",
  RUNNING: "blue",
  WAITING_INPUT: "orange",
} as const;

export function findPreviewRun(id: string) {
  const key = id === "demo" ? "clean" : id;
  return previewRuns.find((run) => run.id === key || run.taskId === key);
}

export function outputsForRun(run: PreviewRun): PreviewOutput[] {
  return [...outputFixtures, ...inlineOutputFixtures].filter(
    (output) => output.runId === run.taskId,
  );
}

export function outputPath(output: PreviewOutput) {
  const kind =
    output.kind === "file" ? "files" : output.kind === "json" ? "json" : "text";
  return `/me/outputs?kind=${kind}&output=${encodeURIComponent(output.key)}`;
}
