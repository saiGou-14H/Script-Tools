import { Button, Empty, Progress, Select, Table } from "antd";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeading, Panel, Status, TileIcon, More } from "../components/ui";
import { Icon } from "../components/Icon";
import { useWorkspace } from "../context";

const chartDates = [
  "11-07",
  "11-08",
  "11-09",
  "11-10",
  "11-11",
  "11-12",
  "11-13",
];
const chartMetrics = {
  交易额: [600, 680, 590, 640, 850, 630, 860],
  退款额: [60, 85, 50, 115, 90, 100, 80],
  净收益: [540, 595, 540, 525, 760, 530, 780],
};

export function AdminHomePage() {
  const { bootstrap } = useWorkspace();
  const [search, setSearch] = useSearchParams();
  const requestedMetric = search.get("metric") || "交易额";
  const metric = Object.hasOwn(chartMetrics, requestedMetric)
    ? (requestedMetric as keyof typeof chartMetrics)
    : "交易额";
  const prototype = bootstrap.data_mode === "prototype";
  const orders = prototype
    ? [
        {
          id: "OD202611130081",
          name: "表格清洗",
          scene: "数据处理",
          amount: "6.00",
          status: "已完成",
          time: "2026-11-13 14:26",
          uses: "56",
          availability: "99.8%",
        },
        {
          id: "OD202611130080",
          name: "文件批量处理",
          scene: "文件工具",
          amount: "3.00",
          status: "已完成",
          time: "2026-11-13 13:40",
          uses: "38",
          availability: "99.6%",
        },
        {
          id: "OD202611130079",
          name: "公开数据整理",
          scene: "信息整理",
          amount: "5.00",
          status: "已退款",
          time: "2026-11-13 11:22",
          uses: "24",
          availability: "99.5%",
        },
        {
          id: "OD202611130078",
          name: "免费景点预约",
          scene: "旅行预约",
          amount: "8.00",
          status: "已完成",
          time: "2026-11-13 10:05",
          uses: "10",
          availability: "98.9%",
        },
      ]
    : [];
  const values = chartMetrics[metric];
  const points = values
    .map((value, index) => `${20 + index * 100},${190 - (value / 1200) * 176}`)
    .join(" ");
  const latestValue = values[values.length - 1];
  const latestY = 190 - (latestValue / 1200) * 176;
  return (
    <div className="admin-dashboard">
      <PageHeading
        title="运营总览"
        description={
          <>
            平台整体运营、交易与服务运行情况{" "}
            {prototype && <Status>示例数据</Status>}
          </>
        }
        extra={
          <div className="row-actions">
            快捷入口{" "}
            <Link to="/admin/reconciliation">
              <Button type="primary" icon={<Icon name="chart" />}>
                对账
              </Button>
            </Link>
            <Link to="/admin/settlements">
              <Button icon={<Icon name="wallet" />}>结算</Button>
            </Link>
            <Link to="/admin/runs">
              <Button icon={<Icon name="tool" />}>运行排障</Button>
            </Link>
          </div>
        }
      />
      <div className="admin-head-stats">
        {[
          ["cart", "今日服务成交", "¥860", "+12.3%"],
          ["refund", "退款", "¥80", "+33.3%"],
          ["check", "有效使用", "128 次", "+20.8%"],
          ["server", "运行节点", "8 个", "—"],
        ].map(([icon, title, value, change]) => (
          <div key={title}>
            <TileIcon name={icon} />
            <span>
              <b>{title}</b>
              <strong>
                {prototype ? value : "—"}{" "}
                <small className={title === "退款" ? "negative" : "positive"}>
                  {prototype ? `${change === "—" ? "" : "▲ "}${change}` : ""}
                </small>
              </strong>
            </span>
          </div>
        ))}
      </div>
      <div className="admin-upper-grid">
        <Panel
          title="交易趋势"
          extra={
            <Select
              aria-label="交易趋势时间范围"
              defaultValue="7"
              options={[{ value: "7", label: "近7天" }]}
            />
          }
        >
          <div className="chart-tabs">
            {["交易额", "退款额", "净收益"].map((item) => (
              <Button
                size="small"
                key={item}
                type={item === metric ? "primary" : "default"}
                aria-pressed={item === metric}
                onClick={() => {
                  const next = new URLSearchParams(search);
                  next.set("metric", item);
                  setSearch(next);
                }}
              >
                {item}
              </Button>
            ))}
          </div>
          <div className="line-chart">
            <div className="chart-axis">
              {["¥1,200", "¥1,000", "¥800", "¥600", "¥400", "¥200", "¥0"].map(
                (value) => (
                  <small key={value}>{value}</small>
                ),
              )}
            </div>
            <svg
              viewBox="0 0 640 205"
              preserveAspectRatio="none"
              role="img"
              aria-label={
                prototype
                  ? `最近七天${metric}，11月13日 ¥${latestValue}`
                  : "交易趋势接口待接入"
              }
            >
              <defs>
                <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2d69ff" stopOpacity=".22" />
                  <stop offset="100%" stopColor="#2d69ff" stopOpacity=".02" />
                </linearGradient>
              </defs>
              {[14, 43.33, 72.67, 102, 131.33, 160.67, 190].map((y) => (
                <line key={y} x1="0" x2="640" y1={y} y2={y} stroke="#eef1f7" />
              ))}
              {prototype && (
                <>
                  <polygon
                    points={`20,200 ${points} 620,200`}
                    fill="url(#chart-area)"
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="#2260ff"
                    strokeWidth="3"
                  />
                  {points.split(" ").map((point, index) => {
                    const [x, y] = point.split(",");
                    return (
                      <circle
                        key={point}
                        cx={x}
                        cy={y}
                        r="4"
                        fill="#2260ff"
                        stroke="#fff"
                        strokeWidth="2"
                      >
                        <title>
                          {chartDates[index]} {metric} ¥{values[index]}
                        </title>
                      </circle>
                    );
                  })}
                  <g
                    className="dashboard-chart-value"
                    transform={`translate(620,${latestY})`}
                  >
                    <rect x="-52" y="-39" width="64" height="28" rx="5" />
                    <path d="M-5,-11 L0,-5 L5,-11" />
                    <text x="-20" y="-20" textAnchor="middle">
                      ¥{latestValue}
                    </text>
                  </g>
                </>
              )}
            </svg>
          </div>
          <div className="chart-dates">
            {chartDates.map((date) => (
              <small key={date}>{date}</small>
            ))}
          </div>
          {!prototype && (
            <p className="dashboard-pending">交易趋势接口待接入</p>
          )}
        </Panel>
        <Panel title="服务可用性">
          <div className="availability">
            <div
              className={`availability-ring${prototype ? "" : " is-unavailable"}`}
            >
              <b>{prototype ? "98.8%" : "—"}</b>
              <small>可用率</small>
            </div>
            <div>
              {[
                ["正常运行", "247", "green"],
                ["部分异常", "2", "orange"],
                ["不可用", "1", "red"],
                ["总服务数", "250", "gray"],
              ].map(([name, value, tone]) => (
                <p key={name}>
                  <i className={`dot ${tone}`} />
                  {name}
                  <b>{prototype ? value : "—"}</b>
                </p>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="待处理异常">
          <div className="admin-anomalies">
            {(prototype
              ? [
                  [
                    "history",
                    "支付待核对",
                    "存在来自自动跳转的支付记录，需要人工核对",
                    "2",
                  ],
                  ["warning", "退款未知", "存在未明确结果的退款申请", "1"],
                  [
                    "tool",
                    "部署故障",
                    "服务部署或更新失败，影响服务可用性",
                    "1",
                  ],
                ]
              : []
            ).map(([icon, name, summary, count]) => (
              <Link
                to={
                  name === "部署故障"
                    ? "/admin/services"
                    : "/admin/reconciliation"
                }
                key={name}
              >
                <TileIcon
                  name={icon}
                  color={name === "支付待核对" ? "orange" : "red"}
                />
                <div>
                  <b>{name}</b>
                  <small>{summary}</small>
                </div>
                <Status tone="orange">{prototype ? count : "0"}</Status>
                <span>›</span>
              </Link>
            ))}
            {!prototype && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="待处理异常接口待接入"
              />
            )}
          </div>
        </Panel>
      </div>
      <div className="admin-middle-grid">
        <Panel title="商业指标">
          <div className="metric-grid">
            {[
              ["payment", "交易额", "¥6,820", "blue"],
              ["sync", "退款额", "¥320", "red"],
              ["database", "净交易额", "¥6,500", "green"],
              ["shield", "已结算平台服务费", "¥260", "purple"],
            ].map(([icon, label, value, color]) => (
              <div className={`metric-block stat-${color}`} key={label}>
                <TileIcon name={icon} color={color} />
                <span>
                  <b>{label}</b>
                  <strong>{prototype ? value : "—"}</strong>
                </span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="技术指标">
          <div className="metric-grid technical-metrics">
            {[
              ["server", "执行容量", "2,400 次/日", "blue"],
              ["check", "任务成功率", "99.2%", "green"],
              ["clock", "平均执行时长", "1.8 秒", "purple"],
            ].map(([icon, label, value, color]) => (
              <div className="metric-block" key={label}>
                <TileIcon name={icon} color={color} />
                <span>
                  <b>{label}</b>
                  <strong>{prototype ? value : "—"}</strong>
                  {label === "执行容量" ? (
                    <>
                      <small>
                        {prototype
                          ? "使用 1,280 次（53.3%）"
                          : "执行容量接口待接入"}
                      </small>
                      {prototype && (
                        <Progress
                          percent={53.3}
                          showInfo={false}
                          strokeColor={{ "0%": "#4773ff", "100%": "#a78bff" }}
                          size="small"
                          aria-label="执行容量使用率 53.3%"
                        />
                      )}
                    </>
                  ) : (
                    <small className={prototype ? "positive" : "muted"}>
                      {prototype
                        ? label === "任务成功率"
                          ? "▲ +0.3%"
                          : "▼ -5.3%"
                        : "指标接口待接入"}
                    </small>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="admin-bottom-grid">
        <Panel
          title={<>最近服务交易 {prototype && <Status>示例数据</Status>}</>}
          extra={<More to="/admin/orders">查看更多订单</More>}
        >
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ x: 790 }}
            dataSource={orders}
            locale={{ emptyText: "服务交易接口待接入" }}
            columns={[
              { title: "订单号", dataIndex: "id" },
              { title: "服务名称", dataIndex: "name" },
              { title: "业务场景", dataIndex: "scene" },
              {
                title: "成交金额",
                dataIndex: "amount",
                render: (value) => `¥${value}`,
              },
              { title: "使用次数（PER_USE）", render: () => "1 次" },
              {
                title: "状态",
                dataIndex: "status",
                render: (value) => (
                  <Status tone={value === "已退款" ? "orange" : "green"}>
                    {value}
                  </Status>
                ),
              },
              { title: "下单时间", dataIndex: "time" },
            ]}
          />
        </Panel>
        <Panel
          title="服务运行概览"
          extra={<More to="/admin/services">查看更多服务</More>}
        >
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ x: 650 }}
            dataSource={orders}
            locale={{ emptyText: "服务运行概览接口待接入" }}
            columns={[
              { title: "服务名称", dataIndex: "name" },
              { title: "业务场景", dataIndex: "scene" },
              {
                title: "状态",
                render: (_, row) => (
                  <Status tone={row.scene === "旅行预约" ? "orange" : "green"}>
                    <i className="dashboard-status-dot" aria-hidden="true" />
                    {row.scene === "旅行预约" ? "部分异常" : "运行中"}
                  </Status>
                ),
              },
              {
                title: "今日使用",
                render: (_, row) => `${row.uses} 次`,
              },
              { title: "可用率", dataIndex: "availability" },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
