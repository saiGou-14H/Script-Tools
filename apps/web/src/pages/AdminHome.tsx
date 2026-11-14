import { useState } from "react";
import { Button, Select, Table } from "antd";
import { Link } from "react-router-dom";
import { PageHeading, Panel, Status, TileIcon, More } from "../components/ui";
import { useWorkspace } from "../context";

export function AdminHomePage() {
  const { bootstrap } = useWorkspace();
  const [metric, setMetric] = useState("交易额");
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
        },
        {
          id: "OD202611130080",
          name: "文件批量处理",
          scene: "文件工具",
          amount: "3.00",
          status: "已完成",
          time: "2026-11-13 13:40",
        },
        {
          id: "OD202611130079",
          name: "公开数据整理",
          scene: "信息整理",
          amount: "5.00",
          status: "已退款",
          time: "2026-11-13 11:22",
        },
        {
          id: "OD202611130078",
          name: "免费景点预约",
          scene: "旅行预约",
          amount: "8.00",
          status: "已完成",
          time: "2026-11-13 10:05",
        },
      ]
    : [];
  const points =
    metric === "交易额"
      ? "20,135 120,125 220,135 320,130 420,100 520,130 620,100"
      : metric === "退款额"
        ? "20,170 120,166 220,172 320,160 420,165 520,155 620,158"
        : "20,145 120,135 220,145 320,140 420,115 520,138 620,114";
  return (
    <div className="admin-dashboard">
      <PageHeading
        title="运营总览"
        description="平台整体运营、交易与服务运行情况"
        extra={
          <div className="row-actions">
            快捷入口{" "}
            <Link to="/admin/reconciliation">
              <Button type="primary">对账</Button>
            </Link>
            <Link to="/admin/settlements">
              <Button>结算</Button>
            </Link>
            <Link to="/admin/runs">
              <Button>运行排障</Button>
            </Link>
          </div>
        }
      />
      <div className="admin-head-stats">
        {[
          ["order", "今日服务成交", "¥860", "+12.3%"],
          ["sync", "退款", "¥80", "+33.3%"],
          ["shield", "有效使用", "128 次", "+20.8%"],
          ["server", "运行节点", "8 个", "—"],
        ].map(([icon, title, value, change]) => (
          <div key={title}>
            <TileIcon name={icon} />
            <span>
              <b>{title}</b>
              <strong>
                {prototype ? value : "—"}{" "}
                <small className={title === "退款" ? "negative" : "positive"}>
                  {prototype ? change : ""}
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
                onClick={() => setMetric(item)}
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
            <svg viewBox="0 0 640 205" role="img" aria-label="最近七天交易趋势">
              <defs>
                <linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2d69ff" stopOpacity=".22" />
                  <stop offset="100%" stopColor="#2d69ff" stopOpacity=".02" />
                </linearGradient>
              </defs>
              {[25, 50, 75, 100, 125, 150, 175].map((y) => (
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
                  {points.split(" ").map((point) => {
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
                      />
                    );
                  })}
                </>
              )}
            </svg>
          </div>
          <div className="chart-dates">
            {[
              "11-07",
              "11-08",
              "11-09",
              "11-10",
              "11-11",
              "11-12",
              "11-13",
            ].map((date) => (
              <small key={date}>{date}</small>
            ))}
          </div>
        </Panel>
        <Panel title="服务可用性">
          <div className="availability">
            <div className="availability-ring">
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
            {[
              [
                "history",
                "支付待核对",
                "存在来自自动跳转的支付记录，需要人工核对",
                "2",
              ],
              ["warning", "退款未知", "存在未明确结果的退款申请", "1"],
              ["tool", "部署故障", "服务部署或更新失败，影响服务可用性", "1"],
            ].map(([icon, name, summary, count]) => (
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
              ["server", "执行容量", "2,400 次/日"],
              ["shield", "任务成功率", "99.2%"],
              ["history", "平均执行时长", "1.8 秒"],
            ].map(([icon, label, value]) => (
              <div className="metric-block" key={label}>
                <TileIcon name={icon} />
                <span>
                  <b>{label}</b>
                  <strong>{prototype ? value : "—"}</strong>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="admin-bottom-grid">
        <Panel
          title={
            <>
              最近服务交易 <Status>示例数据</Status>
            </>
          }
          extra={<More to="/admin/orders">查看更多订单</More>}
        >
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={orders}
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
            dataSource={orders}
            columns={[
              { title: "服务名称", dataIndex: "name" },
              { title: "业务场景", dataIndex: "scene" },
              {
                title: "状态",
                render: (_, row) => (
                  <Status tone={row.scene === "旅行预约" ? "orange" : "green"}>
                    {row.scene === "旅行预约" ? "部分异常" : "运行中"}
                  </Status>
                ),
              },
              {
                title: "今日使用",
                render: (_, row) =>
                  `${row.scene === "数据处理" ? 56 : row.scene === "文件工具" ? 38 : row.scene === "信息整理" ? 24 : 10} 次`,
              },
              { title: "可用率", render: () => "99.8%" },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
