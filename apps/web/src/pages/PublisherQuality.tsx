import { useState } from "react";
import { Button, Select, Table } from "antd";
import { CodeOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context";
import { PageHeading, Panel, Status, TileIcon } from "../components/ui";

const weeklyUses = [12, 16, 18, 20, 24, 22, 16];
const serviceNames = ["表格清洗", "文件处理", "景点预约"];
const versions = ["v1.2", "v1.1", "v1.0"];
const counts = [
  [40, 16, 8],
  [16, 16, 8],
  [8, 8, 8],
];
const technical = [
  [1, 1, 0],
  [1, 0, 0],
  [0, 1, 0],
];
const unmet = [
  [5, 1, 2],
  [2, 2, 2],
  [1, 3, 1],
];
const metricFacts = serviceNames.flatMap((service, serviceIndex) =>
  versions.map((version, versionIndex) => ({
    service,
    version,
    uses: counts[serviceIndex][versionIndex],
    technical: technical[serviceIndex][versionIndex],
    unmet: unmet[serviceIndex][versionIndex],
    refunds:
      serviceIndex === 0 && versionIndex === 0
        ? 2
        : serviceIndex === 1 && versionIndex === 0
          ? 1
          : serviceIndex === 2 && versionIndex === 1
            ? 2
            : 0,
  })),
);

function LineTrend({ values }: { values: number[] }) {
  const points = values
    .map((value, index) => `${45 + index * 100},${174 - value * 3.7}`)
    .join(" ");
  return (
    <svg
      className="publisher-trend-chart"
      viewBox="0 0 700 220"
      role="img"
      aria-label="七天有效使用趋势"
    >
      <defs>
        <linearGradient id="publisher-trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#d9e7ff" />
          <stop offset="1" stopColor="#f6f9ff" />
        </linearGradient>
      </defs>
      {[0, 8, 16, 24, 32, 40].map((value) => (
        <g key={value}>
          <line
            x1="36"
            x2="674"
            y1={174 - value * 3.7}
            y2={174 - value * 3.7}
            stroke="#e8edf6"
          />
          <text x="24" y={179 - value * 3.7} textAnchor="end">
            {value}
          </text>
        </g>
      ))}
      <polygon
        points={`45,174 ${points} 645,174`}
        fill="url(#publisher-trend-fill)"
      />
      <polyline points={points} fill="none" stroke="#2371ff" strokeWidth="2" />
      {values.map((value, index) => (
        <g key={index}>
          <circle
            cx={45 + index * 100}
            cy={174 - value * 3.7}
            r="3.5"
            fill="white"
            stroke="#2371ff"
            strokeWidth="2"
          />
          <text
            x={45 + index * 100}
            y={160 - value * 3.7}
            textAnchor="middle"
            className="chart-point-label"
          >
            {value}
          </text>
          <text x={45 + index * 100} y="197" textAnchor="middle">
            第{index + 1}天
          </text>
        </g>
      ))}
    </svg>
  );
}

function FailureBars({
  rows,
}: {
  rows: { service: string; unmet: number; technical: number }[];
}) {
  return (
    <svg
      className="publisher-failure-chart"
      viewBox="0 0 700 220"
      role="img"
      aria-label="业务目标未达与技术故障分类"
    >
      <defs>
        <linearGradient id="publisher-business-bar" x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#2979ff" />
          <stop offset="1" stopColor="#3d7eff" />
        </linearGradient>
        <linearGradient
          id="publisher-technical-bar"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop stopColor="#b181ff" />
          <stop offset="1" stopColor="#c79fff" />
        </linearGradient>
      </defs>
      {[0, 2, 4, 6, 8, 10].map((value) => (
        <g key={value}>
          <line
            x1="36"
            x2="674"
            y1={174 - value * 14.8}
            y2={174 - value * 14.8}
            stroke="#e8edf6"
          />
          <text x="24" y={179 - value * 14.8} textAnchor="end">
            {value}
          </text>
        </g>
      ))}
      {rows.map((row, index) => {
        const x = 75 + index * (600 / Math.max(rows.length, 1));
        return (
          <g key={row.service}>
            <rect
              x={x}
              y={174 - row.unmet * 14.8}
              width="70"
              height={row.unmet * 14.8}
              rx="3"
              fill="url(#publisher-business-bar)"
            />
            <text
              x={x + 35}
              y={163 - row.unmet * 14.8}
              textAnchor="middle"
              className="bar-point-label"
            >
              {row.unmet}
            </text>
            <rect
              x={x + 70}
              y={174 - row.technical * 14.8}
              width="70"
              height={row.technical * 14.8}
              rx="3"
              fill="url(#publisher-technical-bar)"
            />
            <text
              x={x + 105}
              y={163 - row.technical * 14.8}
              textAnchor="middle"
              className="bar-point-label"
            >
              {row.technical}
            </text>
            <text x={x + 70} y="197" textAnchor="middle">
              {row.service}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PublisherMetricsPage() {
  const { bootstrap } = useWorkspace();
  const [service, setService] = useState("");
  const [version, setVersion] = useState("");
  const facts =
    bootstrap.data_mode === "prototype"
      ? metricFacts.filter(
          (row) =>
            (!service || row.service === service) &&
            (!version || row.version === version),
        )
      : [];
  const uses = facts.reduce((sum, row) => sum + row.uses, 0);
  const failures = facts.reduce((sum, row) => sum + row.technical, 0);
  const targets =
    uses - failures - facts.reduce((sum, row) => sum + row.unmet, 0);
  const delivered = uses - failures;
  const rate = (value: number, total: number) =>
    total ? `${((value / total) * 100).toFixed(1)}%` : "—";
  const trend = weeklyUses.map((value) => Math.round((value * uses) / 128));
  trend[6] += uses - trend.reduce((sum, value) => sum + value, 0);
  const qualityRows = versions
    .filter((value) => !version || version === value)
    .map((value) => {
      const selected = facts.filter((row) => row.version === value);
      const count = selected.reduce((sum, row) => sum + row.uses, 0);
      const technicalCount = selected.reduce(
        (sum, row) => sum + row.technical,
        0,
      );
      const unmetCount = selected.reduce((sum, row) => sum + row.unmet, 0);
      return {
        version: value,
        count,
        delivered: rate(count - technicalCount, count).replace(".0%", "%"),
        goal: rate(count - technicalCount - unmetCount, count).replace(
          ".0%",
          "%",
        ),
        technical: technicalCount,
        refunds: selected.reduce((sum, row) => sum + row.refunds, 0),
      };
    })
    .filter((row) => row.count);
  const failureRows = serviceNames
    .filter((value) => !service || service === value)
    .map((value) => ({
      service: value,
      unmet: facts
        .filter((row) => row.service === value)
        .reduce((sum, row) => sum + row.unmet, 0),
      technical: facts
        .filter((row) => row.service === value)
        .reduce((sum, row) => sum + row.technical, 0),
    }));
  return (
    <div className="publisher-metrics-page">
      <PageHeading
        title="使用统计"
        description="查看脚本服务的使用情况、执行结果与版本质量，评估服务表现与退款影响。"
      />
      <Panel className="publisher-metric-filters">
        <span>时间</span>
        <Select value="7" options={[{ value: "7", label: "7天" }]} />
        <span>服务</span>
        <Select
          aria-label="统计服务"
          value={service}
          onChange={setService}
          options={[
            { value: "", label: "全部服务" },
            ...serviceNames.map((value) => ({ value })),
          ]}
        />
        <span>版本</span>
        <Select
          aria-label="统计版本"
          value={version}
          onChange={setVersion}
          options={[
            { value: "", label: "全部版本" },
            ...versions.map((value) => ({ value })),
          ]}
        />
      </Panel>
      <Panel className="publisher-metric-stats">
        <div>
          {[
            ["box", "有效使用", String(uses), "次", "blue"],
            [
              "shield",
              "执行交付率",
              rate(delivered, uses),
              `(${delivered}/${uses})`,
              "green",
            ],
            [
              "flag",
              "目标达成率",
              rate(targets, uses),
              `(${targets}/${uses})`,
              "purple",
            ],
            ["warning", "技术故障", String(failures), "次", "orange"],
          ].map(([icon, title, value, unit, color]) => (
            <article key={title} className={`metric-${color}`}>
              <TileIcon name={icon} color={color} />
              <div>
                <h3>{title}</h3>
                <strong>{value}</strong> <span>{unit}</span>
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <div className="publisher-metric-charts">
        <Panel title="使用趋势">
          <LineTrend values={trend} />
        </Panel>
        <Panel
          title="失败分类（次数）"
          extra={
            <div className="metric-legend">
              <span>
                <i />
                业务目标未达
              </span>
              <span>
                <i />
                技术故障
              </span>
            </div>
          }
        >
          <FailureBars rows={failureRows} />
        </Panel>
      </div>
      <div className="publisher-metric-tables">
        <Panel title="版本质量">
          <Table
            rowKey="version"
            size="small"
            pagination={false}
            dataSource={qualityRows}
            columns={[
              {
                title: "版本",
                dataIndex: "version",
                render: (value) => (
                  <>
                    {value}{" "}
                    {value === "v1.2" && <Status tone="green">当前</Status>}
                  </>
                ),
              },
              { title: "有效使用（次）", dataIndex: "count" },
              { title: "执行交付率", dataIndex: "delivered" },
              { title: "目标达成率", dataIndex: "goal" },
              { title: "技术故障（次）", dataIndex: "technical" },
            ]}
          />
        </Panel>
        <Panel title="退款影响">
          <Table
            rowKey="version"
            size="small"
            pagination={false}
            dataSource={qualityRows}
            columns={[
              { title: "关联版本", dataIndex: "version" },
              { title: "退款次数", dataIndex: "refunds", align: "center" },
              {
                title: "退款金额（元）",
                render: (_, row) => (row.refunds * 30).toFixed(2),
                align: "center",
              },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center">
                  {qualityRows.reduce((sum, row) => sum + row.refunds, 0)}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="center">
                  {(
                    qualityRows.reduce((sum, row) => sum + row.refunds, 0) * 30
                  ).toFixed(2)}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Panel>
      </div>
    </div>
  );
}

const diagnostics = [
  {
    id: "dependency",
    scriptId: "files",
    label: "依赖缺失",
    title: "文件工具依赖缺失",
    description: "构建或运行时检测到必要的文件处理工具未安装。",
    category: "依赖缺失",
    count: 12,
    tone: "red" as const,
  },
  {
    id: "timeout",
    scriptId: "table",
    label: "执行超时",
    title: "表格清洗超时",
    description: "表格数据清洗处理耗时过长，触发超时限制。",
    category: "超时",
    count: 8,
    tone: "orange" as const,
  },
  {
    id: "verification",
    scriptId: "booking",
    label: "预约结果待核验",
    title: "",
    description: "渠道响应超时，原预约结果未知，保留原请求进行核验。",
    category: "待核验",
    count: 5,
    tone: "blue" as const,
  },
];

export function PublisherDiagnosticsPage() {
  const { bootstrap } = useWorkspace();
  const rows = bootstrap.data_mode === "prototype" ? diagnostics : [];
  return (
    <div className="publisher-diagnostics-page">
      <PageHeading title="故障诊断" />
      <div className="publisher-diagnostic-banner">
        <h2>定位脚本问题，快速修复发布</h2>
        <p>
          查看本人构建与部署日志，结合消费者侧的脱敏错误分类，定位问题并发布修复版本。
        </p>
        <div className="diagnostic-stack" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
      <Panel title="问题列表" className="diagnostic-issues">
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          columns={[
            {
              title: "问题",
              width: "25%",
              render: (_, row) => (
                <>
                  <Status tone={row.tone}>{row.label}</Status>{" "}
                  <b>{row.title}</b>
                </>
              ),
            },
            { title: "说明", dataIndex: "description", width: "28%" },
            {
              title: "消费者侧错误分类（脱敏）",
              render: (_, row) => (
                <>
                  <Status>{row.category}</Status>　· {row.count} 次
                </>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <div className="row-actions">
                  <Link to={`/publisher/scripts/${row.scriptId}/edit`}>
                    <Button icon={<CodeOutlined />}>打开源码</Button>
                  </Link>
                  <Link
                    to={`/publisher/scripts/${row.scriptId}/edit?repair=true`}
                  >
                    <Button type="primary">创建修复版本</Button>
                  </Link>
                  <Link to={`/publisher/builds?script=${row.scriptId}`}>
                    <Button>查看构建</Button>
                  </Link>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <div className="diagnostic-bottom-grid">
        <Panel
          title={
            <>
              <TileIcon name="file" />
              本人构建部署日志
            </>
          }
        >
          <p>
            展示本人在构建与部署过程中的日志，包含构建输出、依赖安装、打包部署结果等。
          </p>
          <pre className="diagnostic-log">
            {rows.length ? (
              <>
                {
                  "[10:14:02]　开始构建脚本：v1.2.0\n[10:14:05]　安装依赖：共6项\n[10:14:37]　"
                }
                <em>ERROR</em>
                {" 必要依赖file-utils缺失\n[10:15:03]　"}
                <em>ERROR</em>
                {" 构建失败，停止打包\n[10:15:16]　"}
                <em>ERROR</em>
                {" 未生成可部署镜像，请修复并创建新版本。"}
              </>
            ) : (
              "暂无构建部署日志"
            )}
          </pre>
        </Panel>
        <Panel
          title={
            <>
              <TileIcon name="shield" />
              消费者侧错误分类
            </>
          }
        >
          <p>展示消费者使用时的脱敏错误分类与发生次数。</p>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={rows}
            columns={[
              {
                title: "错误分类（脱敏）",
                dataIndex: "category",
                render: (value) => <Status>{value}</Status>,
              },
              {
                title: "次数",
                dataIndex: "count",
                render: (value) => `${value} 次`,
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
