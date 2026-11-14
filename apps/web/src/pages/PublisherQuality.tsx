import { Button, Empty, Select, Table } from "antd";
import { CodeOutlined } from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { formatMinorUnits } from "../lib/money";
import {
  diagnosticFixtures,
  metricFacts,
  metricServices,
  metricVersions,
  metricWindow,
} from "../lib/publisher-quality-preview";

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
          >
            <title>{`第${index + 1}天 ${value}次有效使用`}</title>
          </circle>
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
            <title>{`${row.service}，业务目标未达${row.unmet}次，技术故障${row.technical}次`}</title>
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
  const [params, setParams] = useSearchParams();
  const service = params.get("service") || "";
  const version = params.get("version") || "";
  const period = params.get("period") || "7";
  const prototype = bootstrap.data_mode === "prototype";
  const available = prototype && period === "7";
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  const facts =
    available
      ? metricFacts.filter(
          (row) =>
            (!service || row.service === service) &&
            (!version || row.version === version),
        ).map((row) => ({
          ...row,
          uses: row.dailyUses.reduce((sum, count) => sum + count, 0),
        }))
      : [];
  const uses = facts.reduce((sum, row) => sum + row.uses, 0);
  const failures = facts.reduce((sum, row) => sum + row.technical, 0);
  const targets = facts.reduce((sum, row) => sum + row.achieved, 0);
  const delivered = facts.reduce((sum, row) => sum + row.delivered, 0);
  const rate = (value: number, total: number) =>
    total ? `${((value / total) * 100).toFixed(1)}%` : "—";
  const trend = Array.from({ length: 7 }, (_, day) =>
    facts.reduce((sum, row) => sum + row.dailyUses[day], 0),
  );
  const qualityRows = metricVersions
    .filter((value) => !version || version === value)
    .map((value) => {
      const selected = facts.filter((row) => row.version === value);
      const count = selected.reduce((sum, row) => sum + row.uses, 0);
      const technicalCount = selected.reduce(
        (sum, row) => sum + row.technical,
        0,
      );
      return {
        version: value,
        count,
        delivered: rate(
          selected.reduce((sum, row) => sum + row.delivered, 0),
          count,
        ).replace(".0%", "%"),
        goal: rate(
          selected.reduce((sum, row) => sum + row.achieved, 0),
          count,
        ).replace(".0%", "%"),
        technical: technicalCount,
        refunds: selected.reduce((sum, row) => sum + row.refunds, 0),
        refundAmountMinor: selected
          .reduce((sum, row) => sum + BigInt(row.refundAmountMinor), 0n)
          .toString(),
      };
    })
    .filter((row) => row.count);
  const failureRows = metricServices
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
        extra={
          <Status tone="gray">
            {prototype ? "本地示例" : "统计服务待接入"}
          </Status>
        }
      />
      {!prototype && (
        <Notice>使用、交付、业务目标和退款统计服务待接入，当前数值暂不可用。</Notice>
      )}
      {prototype && period !== "7" && (
        <Notice>该时间范围的统计数据暂不可用，请选择7天示例。</Notice>
      )}
      <Panel className="publisher-metric-filters">
        <span>时间</span>
        <Select
          aria-label="统计周期"
          title={`${metricWindow.from} 至 ${metricWindow.to}`}
          value={period}
          onChange={(value) => filter("period", value)}
          disabled={!prototype}
          options={[{ value: "7", label: "7天" }]}
        />
        <span>服务</span>
        <Select
          aria-label="统计服务"
          value={service}
          onChange={(value) => filter("service", value)}
          disabled={!prototype}
          options={[
            { value: "", label: "全部服务" },
            ...metricServices.map((value) => ({ value })),
          ]}
        />
        <span>版本</span>
        <Select
          aria-label="统计版本"
          value={version}
          onChange={(value) => filter("version", value)}
          disabled={!prototype}
          options={[
            { value: "", label: "全部版本" },
            ...metricVersions.map((value) => ({ value })),
          ]}
        />
      </Panel>
      <Panel className="publisher-metric-stats">
        <div>
          {[
            ["layers", "有效使用", String(uses), "次", "blue"],
            [
              "check",
              "执行交付率",
              rate(delivered, uses),
              `(${delivered}/${uses})`,
              "green",
            ],
            [
              "target",
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
                <strong>{available ? value : "—"}</strong>{" "}
                <span>{available ? unit : "待载入"}</span>
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <div className="publisher-metric-charts">
        <Panel title="使用趋势">
          {available && facts.length ? (
            <LineTrend values={trend} />
          ) : (
            <Empty description={available ? "当前筛选无记录" : "使用趋势待载入"} />
          )}
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
          {available && facts.length ? (
            <FailureBars rows={failureRows} />
          ) : (
            <Empty description={available ? "当前筛选无记录" : "失败分类待载入"} />
          )}
        </Panel>
      </div>
      <div className="publisher-metric-tables">
        <Panel title="版本质量">
          <Table
            rowKey="version"
            size="small"
            pagination={false}
            dataSource={qualityRows}
            scroll={{ x: 650 }}
            columns={[
              {
                title: "版本",
                dataIndex: "version",
                render: (value) => (
                  <>
                    {value}{" "}
                    {value === "v1.2" && (!service || service === "表格清洗") && (
                      <Status tone="green">当前</Status>
                    )}
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
            scroll={{ x: 520 }}
            columns={[
              { title: "关联版本", dataIndex: "version" },
              { title: "退款次数", dataIndex: "refunds", align: "center" },
              {
                title: "退款金额（元）",
                render: (_, row) => formatMinorUnits(row.refundAmountMinor),
                align: "center",
              },
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center">
                  {available
                    ? qualityRows.reduce((sum, row) => sum + row.refunds, 0)
                    : "—"}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="center">
                  {available
                    ? formatMinorUnits(
                        qualityRows
                          .reduce((sum, row) => sum + BigInt(row.refundAmountMinor), 0n)
                          .toString(),
                      )
                    : "—"}
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Panel>
      </div>
    </div>
  );
}

export function PublisherDiagnosticsPage() {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const prototype = bootstrap.data_mode === "prototype";
  const rows = prototype ? diagnosticFixtures : [];
  const selectedId = params.get("issue") || "dependency";
  const selected = rows.find((row) => row.id === selectedId);
  return (
    <div className="publisher-diagnostics-page">
      <PageHeading
        title="故障诊断"
        extra={
          <Status tone="gray">
            {prototype ? "本地累计示例" : "诊断服务待接入"}
          </Status>
        }
      />
      {!prototype && (
        <Notice>本人构建日志和消费者侧分类汇总服务待接入，当前诊断记录暂不可用。</Notice>
      )}
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
          scroll={{ x: 1450 }}
          columns={[
            {
              title: "问题",
              width: "25%",
              render: (_, row) => (
                <>
                  <Button
                    type="link"
                    className="diagnostic-issue-select"
                    aria-label={`查看${row.label}诊断`}
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.set("issue", row.id);
                      setParams(next);
                    }}
                  >
                    <Status tone={row.tone}>{row.label}</Status>
                  </Button>{" "}
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
                    <Button icon={<CodeOutlined aria-hidden />}>打开源码</Button>
                  </Link>
                  <Link
                    to={`/publisher/scripts/${row.scriptId}/edit?repair=true`}
                  >
                    <Button type="primary">创建修复版本</Button>
                  </Link>
                  {row.build ? (
                    <Link
                      to={`/publisher/builds?${new URLSearchParams({
                        script: row.build.script,
                        version: row.version,
                        record: row.build.id,
                      })}`}
                    >
                      <Button>查看构建</Button>
                    </Link>
                  ) : (
                    <Button disabled title="该版本构建记录待载入">
                      查看构建
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <div className="diagnostic-bottom-grid">
        <Panel
          className="diagnostic-owner-logs"
          title={
            <>
              <TileIcon name="file" />
              本人构建部署日志
            </>
          }
          extra={selected && (
            <small>{selected.scriptName} {selected.version}</small>
          )}
        >
          <p>
            展示本人在构建与部署过程中的日志，包含构建输出、依赖安装、打包部署结果等。
          </p>
          {selected?.logs.length ? (
            <pre className="diagnostic-log">
              {selected.logs.map((log) => (
                <span key={log.time}>
                  [{log.time}]　
                  {log.level === "ERROR" && <em>ERROR </em>}
                  {log.message}
                </span>
              ))}
            </pre>
          ) : (
            <div className="diagnostic-log diagnostic-log-empty">
              <Empty
                description={
                  !prototype
                    ? "本人构建日志待接入"
                    : selected
                      ? "该版本构建日志待载入"
                      : `诊断 ${selectedId} 不存在或已失效`
                }
              />
            </div>
          )}
        </Panel>
        <Panel
          title={
            <>
              <TileIcon name="shield" />
              消费者侧错误分类
            </>
          }
        >
          <p>按本人服务的脱敏错误分类与发生次数汇总展示。</p>
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
