export const metricWindow = {
  from: "2026-11-07",
  to: "2026-11-13",
};
export const metricServices = ["表格清洗", "文件处理", "景点预约"];
export const metricVersions = ["v1.2", "v1.1", "v1.0"];

export interface PreviewMetricFact {
  service: string;
  version: string;
  dailyUses: number[];
  delivered: number;
  achieved: number;
  technical: number;
  unmet: number;
  refunds: number;
  refundAmountMinor: string;
}

export const metricFacts: PreviewMetricFact[] = [
  {
    service: "表格清洗",
    version: "v1.2",
    dailyUses: [4, 5, 6, 6, 8, 6, 5],
    delivered: 38,
    achieved: 33,
    technical: 1,
    unmet: 5,
    refunds: 2,
    refundAmountMinor: "5500",
  },
  {
    service: "表格清洗",
    version: "v1.1",
    dailyUses: [2, 2, 2, 3, 3, 2, 2],
    delivered: 15,
    achieved: 14,
    technical: 1,
    unmet: 1,
    refunds: 0,
    refundAmountMinor: "0",
  },
  {
    service: "表格清洗",
    version: "v1.0",
    dailyUses: [1, 1, 1, 1, 1, 2, 1],
    delivered: 8,
    achieved: 6,
    technical: 0,
    unmet: 2,
    refunds: 0,
    refundAmountMinor: "0",
  },
  {
    service: "文件处理",
    version: "v1.2",
    dailyUses: [1, 2, 2, 2, 3, 4, 2],
    delivered: 16,
    achieved: 14,
    technical: 1,
    unmet: 2,
    refunds: 1,
    refundAmountMinor: "3500",
  },
  {
    service: "文件处理",
    version: "v1.1",
    dailyUses: [1, 2, 2, 3, 3, 3, 2],
    delivered: 16,
    achieved: 14,
    technical: 0,
    unmet: 2,
    refunds: 0,
    refundAmountMinor: "0",
  },
  {
    service: "文件处理",
    version: "v1.0",
    dailyUses: [1, 1, 1, 1, 2, 1, 1],
    delivered: 8,
    achieved: 6,
    technical: 0,
    unmet: 2,
    refunds: 0,
    refundAmountMinor: "0",
  },
  {
    service: "景点预约",
    version: "v1.2",
    dailyUses: [1, 1, 1, 1, 1, 2, 1],
    delivered: 8,
    achieved: 7,
    technical: 0,
    unmet: 1,
    refunds: 0,
    refundAmountMinor: "0",
  },
  {
    service: "景点预约",
    version: "v1.1",
    dailyUses: [1, 1, 1, 1, 2, 1, 1],
    delivered: 7,
    achieved: 4,
    technical: 1,
    unmet: 3,
    refunds: 2,
    refundAmountMinor: "6000",
  },
  {
    service: "景点预约",
    version: "v1.0",
    dailyUses: [0, 1, 2, 2, 1, 1, 1],
    delivered: 8,
    achieved: 7,
    technical: 0,
    unmet: 1,
    refunds: 0,
    refundAmountMinor: "0",
  },
];

export interface PreviewDiagnostic {
  id: string;
  scriptId: string;
  scriptName: string;
  version: string;
  label: string;
  title: string;
  description: string;
  category: string;
  count: number;
  tone: "red" | "orange" | "blue";
  build?: { id: string; script: string };
  logs: { time: string; level: "INFO" | "ERROR"; message: string }[];
}

export const diagnosticFixtures: PreviewDiagnostic[] = [
  {
    id: "dependency",
    scriptId: "files",
    scriptName: "文件处理",
    version: "v0.4",
    label: "依赖缺失",
    title: "文件工具依赖缺失",
    description: "构建或运行时检测到必要的文件处理工具未安装。",
    category: "依赖缺失",
    count: 12,
    tone: "red",
    build: { id: "B032", script: "文件处理" },
    logs: [
      {
        time: "10:14:02",
        level: "INFO",
        message: "开始构建文件处理 v0.4，构建 B032。",
      },
      {
        time: "10:14:05",
        level: "INFO",
        message: "安装依赖，共6项。",
      },
      {
        time: "10:14:37",
        level: "ERROR",
        message: "必要依赖file-utils缺失。",
      },
      {
        time: "10:15:03",
        level: "ERROR",
        message: "构建失败，停止打包。",
      },
      {
        time: "10:15:16",
        level: "ERROR",
        message: "请修复依赖并创建新版本。",
      },
    ],
  },
  {
    id: "timeout",
    scriptId: "table",
    scriptName: "表格清洗",
    version: "v1.2",
    label: "执行超时",
    title: "表格清洗超时",
    description: "表格数据清洗处理耗时过长，触发超时限制。",
    category: "超时",
    count: 8,
    tone: "orange",
    build: { id: "B031", script: "表格清洗" },
    logs: [
      {
        time: "09:00:00",
        level: "INFO",
        message: "开始构建表格清洗 v1.2，构建 B031。",
      },
      {
        time: "09:01:20",
        level: "INFO",
        message: "固定制品构建成功。",
      },
      {
        time: "09:01:21",
        level: "INFO",
        message: "执行超时分类可用于排查运行阶段的限制与耗时。",
      },
    ],
  },
  {
    id: "verification",
    scriptId: "booking",
    scriptName: "景点预约",
    version: "v1.0",
    label: "预约结果待核验",
    title: "",
    description: "渠道响应超时，原预约结果未知，保留原请求进行核验。",
    category: "待核验",
    count: 5,
    tone: "blue",
    logs: [],
  },
];
