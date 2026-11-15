import {
  Alert,
  Button,
  Empty,
  Input,
  Select,
  Skeleton,
  Table,
  Tabs,
} from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import { formatMinorUnits } from "../lib/money";
import { usePublisherOverview } from "../lib/publisher-overview";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { More, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { Icon } from "../components/Icon";

const serviceTabs = ["全部服务", "在售", "待上架", "已下架"];

interface DashboardService {
  id: string;
  name: string;
  script: string;
  runtime: string;
  sales: string;
  refund: string;
  price: string;
  quantity: string | number;
  income: string;
  icon: string;
  deploymentId?: string | null;
}

const serviceFixtures: DashboardService[] = [
  {
    id: "ticket",
    name: "车票信息查询工具",
    script: "ticket_query.py",
    runtime: "运行正常",
    sales: "在售",
    refund: "无结果全额退款",
    price: "3.00",
    quantity: 86,
    income: "258.00",
    icon: "train",
  },
  {
    id: "flight",
    name: "航班信息整理工具",
    script: "flight_tool.py",
    runtime: "运行正常",
    sales: "在售",
    refund: "无结果全额退款",
    price: "5.00",
    quantity: 42,
    income: "210.00",
    icon: "airplane",
  },
  {
    id: "file",
    name: "文件数据清洗工具",
    script: "data_clean.py",
    runtime: "运行正常",
    sales: "在售",
    refund: "无结果不退款",
    price: "2.00",
    quantity: 57,
    income: "114.00",
    icon: "file",
  },
  {
    id: "info",
    name: "信息提取与整理工具",
    script: "info_extract.py",
    runtime: "运行告警",
    sales: "在售",
    refund: "无结果全额退款",
    price: "4.00",
    quantity: 24,
    income: "96.00",
    icon: "info",
  },
  {
    id: "trip",
    name: "出行计划生成工具",
    script: "trip_plan.py",
    runtime: "未部署",
    sales: "待上架",
    refund: "无结果全额退款",
    price: "6.00",
    quantity: 0,
    income: "0.00",
    icon: "calendar",
  },
  {
    id: "general",
    name: "通用信息查询工具",
    script: "general_query.py",
    runtime: "运行正常",
    sales: "已下架",
    refund: "无结果不退款",
    price: "3.00",
    quantity: 15,
    income: "45.00",
    icon: "cube",
  },
];

export function PublisherHomePage() {
  const { bootstrap } = useWorkspace();
  const [search, setSearch] = useSearchParams();
  const requestedTab = search.get("status") || "全部服务";
  const tab = serviceTabs.includes(requestedTab) ? requestedTab : "全部服务";
  const query = search.get("q") || "";
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(search);
    if (value && value !== "全部服务") next.set(key, value);
    else next.delete(key);
    setSearch(next, { replace: key === "q" });
  }
  const prototype = bootstrap.data_mode === "prototype";
  const overviewParams = new URLSearchParams();
  for (const key of ["from", "to", "service_id", "version"]) {
    const value = search.get(key);
    if (value !== null) overviewParams.set(key, value);
  }
  if (query.trim()) overviewParams.set("q", query.trim());
  const groups: Record<string, string> = {
    在售: "ACTIVE",
    待上架: "DRAFT",
    已下架: "OFF_SALE",
  };
  if (groups[tab]) overviewParams.set("status", groups[tab]);
  const overview = usePublisherOverview(overviewParams.toString(), !prototype);
  const summary = overview.data;
  const [selectedCurrency, setSelectedCurrency] = useState("CNY");
  const finance =
    summary?.finances.find((item) => item.currency === selectedCurrency) ??
    summary?.finances[0];
  function money(amount: string | undefined, code = finance?.currency) {
    return amount === undefined || !code
      ? "—"
      : `${code === "CNY" ? "¥" : `${code} `}${formatMinorUnits(amount)}`;
  }
  const deploymentLabels: Record<string, string> = {
    PENDING: "等待部署",
    DEPLOYING: "部署中",
    READY: "部署就绪",
    FAILED: "部署失败",
    DEGRADED: "部署降级",
    STOPPED: "已停止",
  };
  const refundLabels: Record<string, string> = {
    REQUESTED: "已申请",
    PROCESSING: "处理中",
    UNKNOWN: "待核验",
    SUCCEEDED: "已退款",
    FAILED: "退款失败",
  };
  const liveServices = (summary?.services || []).map((item) => ({
    id: item.id,
    name: item.title,
    script: item.script_name || "未关联脚本",
    runtime: item.deployment_status
      ? deploymentLabels[item.deployment_status] || item.deployment_status
      : "未部署",
    sales:
      item.sale_group === "ACTIVE"
        ? "在售"
        : item.sale_group === "DRAFT"
          ? "待上架"
          : "已下架",
    refund: item.refund_summary || "未配置",
    price: money(item.amount_minor ?? undefined, item.currency ?? undefined),
    quantity: item.sold_count,
    income:
      item.sales
        .map((sale) => money(sale.funded_minor, sale.currency))
        .join(" / ") || money("0", item.currency ?? undefined),
    icon: item.icon || "cube",
    deploymentId: item.deployment_id,
  }));
  const data: DashboardService[] = prototype
    ? serviceFixtures.filter(
        (service) =>
          (tab === "全部服务" || tab === service.sales) &&
          service.name.includes(query.trim()),
      )
    : liveServices;
  const tabCounts = summary && [
    summary.counts.services,
    summary.counts.active_services,
    summary.counts.draft_services,
    summary.counts.off_sale_services,
  ];
  const alerts = prototype
    ? [
        {
          id: "info",
          name: "信息提取与整理工具",
          state: "部署运行异常",
          time: "今天 10:24",
          color: "red",
          to: "/publisher/deployments",
        },
        {
          id: "ticket",
          name: "车票信息查询工具",
          state: "已恢复正常",
          time: "今天 09:47",
          color: "green",
          to: "/publisher/deployments",
        },
      ]
    : (summary?.alerts || []).map((item) => ({
        id: item.id,
        name: item.script_name,
        state: deploymentLabels[item.status] || item.status,
        time: new Date(item.updated_at).toLocaleString(),
        color: "red",
        to: `/publisher/deployments?deployment=${item.id}`,
      }));
  const refunds = prototype
    ? [
        {
          id: "T202501200036",
          name: "车票信息查询工具",
          price: "¥3.00",
          time: "今天 14:05",
          state: "无结果退款",
        },
        {
          id: "T202501200028",
          name: "信息提取与整理工具",
          price: "¥4.00",
          time: "今天 11:32",
          state: "无结果退款",
        },
      ]
    : (summary?.refunds || []).map((item) => ({
        id: item.order_id,
        name: item.title,
        price: money(item.amount_minor, item.currency),
        time: new Date(item.created_at).toLocaleString(),
        state: refundLabels[item.status] || item.status,
      }));
  return (
    <div className="publisher-dashboard">
      <PageHeading
        title="发布者工作台"
        extra={
          prototype ? (
            <Status>本地开发示例</Status>
          ) : summary && summary.finances.length > 1 ? (
            <Select
              aria-label="收益币种"
              value={finance?.currency}
              onChange={setSelectedCurrency}
              options={summary.finances.map((item) => ({
                value: item.currency,
                label: item.currency,
              }))}
            />
          ) : undefined
        }
      />
      {!prototype && overview.isPending && (
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      )}
      {!prototype && overview.isError && (
        <Alert
          type="error"
          showIcon
          title="经营概况加载失败"
          description={`${overview.error.message}${summary ? "。当前显示上次成功加载的统计快照。" : ""}`}
          action={<Button onClick={() => void overview.refetch()}>重试</Button>}
        />
      )}
      {!prototype && summary && (
        <div className="publisher-overview-context">
          <span>
            统计窗口 {summary.window.from} 至 {summary.window.to}
            （UTC，左闭右开）
          </span>
          <span>
            登记就绪 {summary.counts.ready_deployments} /{" "}
            {summary.counts.deployments} · 更新于{" "}
            {new Date(summary.as_of).toLocaleString()}
          </span>
        </div>
      )}
      <div className="publisher-columns">
        <div>
          <div className="publisher-banner">
            <h1>管理你的脚本服务</h1>
            <p>
              上传脚本、部署运行并上架为可售服务，设置价格与无结果退款政策，进行销售与收益管理。
            </p>
            <Link to="/publisher/scripts">
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                aria-label="上传脚本"
              >
                上传脚本
              </Button>
            </Link>
            <Link to="/publisher/services/new/edit">
              <Button icon={<PlusOutlined />} aria-label="创建服务">
                创建服务
              </Button>
            </Link>
            <div className="publisher-hero-art" aria-hidden="true">
              <div className="publisher-hero-screen">
                <Icon name="code-brackets" />
              </div>
              <div className="publisher-hero-keyboard" />
              <Icon name="upload-tray" />
            </div>
          </div>
          <div className="publisher-stats">
            {[
              ["stack", "在售服务", "4", "blue", "↑ 1"],
              [
                "cart",
                prototype ? "今日成交" : "今日成交（UTC）",
                "12",
                "purple",
                "↑ +3",
              ],
              ["coins", "待结算", "¥68.00", "orange", ""],
              ["warning", "部署异常", "1", "red", ""],
            ].map(([icon, title, value, color, change], index) => (
              <div key={title}>
                <TileIcon name={icon} color={color} />
                <span>
                  <small>{title}</small>
                  <strong className={color === "red" ? "negative" : undefined}>
                    {prototype
                      ? value
                      : ([
                          summary?.counts.active_services,
                          summary?.counts.today_sales,
                          money(finance?.pending_minor),
                          summary?.counts.abnormal_deployments,
                        ][index] ?? "—")}
                    {prototype && change && <em>{change}</em>}
                  </strong>
                </span>
              </div>
            ))}
          </div>
          <Panel title="脚本到服务流程" className="publisher-workflow-panel">
            <div className="publisher-workflow">
              {[
                [
                  "upload",
                  "上传脚本",
                  "选择脚本文件并完善基本信息",
                  "/publisher/scripts",
                ],
                [
                  "experiment",
                  "校验测试",
                  "在线运行测试，验证功能与结果",
                  "/publisher/builds",
                ],
                [
                  "cube",
                  "部署运行",
                  "一键部署到平台运行环境",
                  "/publisher/deployments",
                ],
                [
                  "store",
                  "本人上架",
                  "设置价格与无结果退款政策并上架",
                  "/publisher/services",
                ],
              ].map(([icon, title, description, to], index) => (
                <Link key={title} to={to}>
                  <TileIcon
                    name={icon}
                    color={index === 3 ? "green" : "blue"}
                  />
                  <div>
                    <b>
                      {index + 1}. {title}
                    </b>
                    <small>{description}</small>
                  </div>
                  {index < 3 && <span className="workflow-arrow">→</span>}
                </Link>
              ))}
            </div>
          </Panel>
          <Panel title="本人脚本服务" className="publisher-services">
            <div className="publisher-service-controls">
              <Tabs
                activeKey={tab}
                onChange={(value) => updateFilter("status", value)}
                items={serviceTabs.map((item, index) => ({
                  key: item,
                  label: prototype
                    ? `${item}(${serviceFixtures.filter((service) => item === "全部服务" || item === service.sales).length})`
                    : `${item}(${tabCounts?.[index] ?? "—"})`,
                }))}
              />
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索服务名称"
                aria-label="搜索工作台服务"
                allowClear
                value={query}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
              <Link to="/publisher/services/new/edit">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  aria-label="创建服务"
                >
                  创建服务
                </Button>
              </Link>
            </div>
            <Table
              size="small"
              tableLayout="fixed"
              rowKey="id"
              dataSource={data}
              locale={
                !prototype
                  ? {
                      emptyText: overview.isPending
                        ? "正在加载服务"
                        : overview.isError
                          ? "服务加载失败"
                          : "暂无符合条件的服务",
                    }
                  : undefined
              }
              loading={!prototype && overview.isFetching}
              pagination={false}
              scroll={{ x: 1080 }}
              columns={[
                {
                  title: "服务名称",
                  width: "22.5%",
                  dataIndex: "name",
                  render: (value, row) => (
                    <span className="publisher-service-name">
                      <TileIcon name={row.icon} />
                      <b title={value}>{value}</b>
                      {prototype && <Status>示例数据</Status>}
                    </span>
                  ),
                },
                { title: "所属脚本", dataIndex: "script", width: "11.8%" },
                {
                  title: "运行状态",
                  dataIndex: "runtime",
                  width: "9.4%",
                  render: (value) => (
                    <Status
                      tone={
                        ["运行正常", "部署就绪"].includes(value)
                          ? "green"
                          : value === "未部署"
                            ? "gray"
                            : "orange"
                      }
                    >
                      <i className="dashboard-status-dot" aria-hidden="true" />
                      {value}
                    </Status>
                  ),
                },
                {
                  title: "销售状态",
                  dataIndex: "sales",
                  width: "8.3%",
                  render: (value) => (
                    <Status
                      tone={
                        value === "在售"
                          ? "green"
                          : value === "待上架"
                            ? "blue"
                            : "gray"
                      }
                    >
                      {value}
                    </Status>
                  ),
                },
                {
                  title: "无结果退款政策",
                  dataIndex: "refund",
                  width: "12.3%",
                },
                {
                  title: "单次价格",
                  dataIndex: "price",
                  width: "7.4%",
                  render: (value) => (prototype ? `¥${value}` : value),
                },
                {
                  title: prototype ? "累计销量" : "统计期销量",
                  dataIndex: "quantity",
                  width: "7.2%",
                },
                {
                  title: prototype ? "累计收入" : "统计期销售额",
                  dataIndex: "income",
                  width: "8.5%",
                  render: (value) => (prototype ? `¥${value}` : value),
                },
                {
                  title: "操作",
                  width: "12.6%",
                  render: (_, row) =>
                    prototype ? (
                      <div className="row-actions">
                        <Link to="/publisher/services">管理</Link>
                        <Link to="/publisher/deployments">
                          {row.runtime === "未部署" ? "部署" : "运行"}
                        </Link>
                        <Link to="/publisher/services">
                          {row.sales === "在售" ? "下架" : "上架"}
                        </Link>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <Link to="/publisher/services">服务列表</Link>
                        {row.deploymentId && (
                          <Link
                            to={`/publisher/deployments?deployment=${row.deploymentId}`}
                          >
                            部署详情
                          </Link>
                        )}
                      </div>
                    ),
                },
              ]}
            />
            {!prototype && summary && (
              <Link
                className="publisher-overview-more"
                to="/publisher/services"
              >
                当前显示 {data.length} / {summary.counts.matching_services}{" "}
                项服务 · 查看服务列表
              </Link>
            )}
          </Panel>
        </div>
        <aside>
          <Panel
            title="部署告警"
            className="publisher-alerts-panel"
            extra={<More to="/publisher/deployments" />}
          >
            {alerts.map((item) => (
              <div className="publisher-alert" key={item.id}>
                <i className={`dot ${item.color}`} />
                <div>
                  <b>
                    {item.name}　{item.state}
                  </b>
                  <small>最近一次部署　{item.time}</small>
                </div>
                <Link to={item.to}>
                  <Button size="small">查看</Button>
                </Link>
              </div>
            ))}
            {!prototype && !alerts.length && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  overview.isPending
                    ? "正在加载部署状态"
                    : overview.isError
                      ? "部署状态加载失败"
                      : "暂无登记异常部署"
                }
              />
            )}
          </Panel>
          <Panel
            title="销售退款"
            className="publisher-refunds-panel"
            extra={<More to="/publisher/orders" />}
          >
            {refunds.map((item) => (
              <Link
                to="/publisher/orders"
                className="publisher-refund"
                key={item.id}
              >
                <TileIcon name="refund" color="red" />
                <div>
                  <b>订单退款（#{item.id}）</b>
                  <small>
                    {item.name} · {item.state}
                    <br />
                    {item.time}
                  </small>
                </div>
                <b>
                  {prototype ? "- " : ""}
                  {item.price}
                </b>
              </Link>
            ))}
            {!prototype && !refunds.length && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  overview.isPending
                    ? "正在加载退款"
                    : overview.isError
                      ? "退款加载失败"
                      : "统计期内暂无退款记录"
                }
              />
            )}
          </Panel>
          <Panel
            title="收益摘要"
            className="publisher-income-panel"
            extra={<More to="/publisher/earnings">查看结算明细</More>}
          >
            <div className="publisher-income">
              <div>
                <small>
                  {prototype ? "累计收入（已结算）" : "累计已结算批次"}
                </small>
                <strong>
                  {prototype ? "¥723.00" : money(finance?.settled_minor)}
                </strong>
              </div>
              <div>
                <small>
                  待结算收益 <Icon name="info" />
                </small>
                <strong>
                  {prototype ? "¥68.00" : money(finance?.pending_minor)}
                </strong>
              </div>
            </div>
            {(prototype
              ? [
                  ["bars", "近期收入趋势（近7天）", "¥136.00", "+18%"],
                  ["calendar", "今日收入", "¥48.00", ""],
                  ["calendar", "昨日收入", "¥48.00", ""],
                  ["bars", "近7日收入", "¥136.00", ""],
                ]
              : [
                  [
                    "bars",
                    "统计期分配收益",
                    money(finance?.allocated_minor),
                    "",
                  ],
                  [
                    "calendar",
                    "今日分配收益（UTC）",
                    money(finance?.today_allocated_minor),
                    "",
                  ],
                  [
                    "calendar",
                    "昨日分配收益（UTC）",
                    money(finance?.yesterday_allocated_minor),
                    "",
                  ],
                  [
                    "bars",
                    "近7日分配收益（UTC）",
                    money(finance?.week_allocated_minor),
                    "",
                  ],
                ]
            ).map(([icon, name, value, change]) => (
              <div className="publisher-income-row" key={name}>
                <TileIcon name={icon} />
                <span>{name}</span>
                <b>{value}</b>
                {prototype && change && <em>↑ {change}</em>}
              </div>
            ))}
            {!prototype && summary && (
              <p className="publisher-overview-basis">
                统计期销售额 {money(finance?.funded_minor)} · 已退款{" "}
                {money(finance?.refunded_minor)}。
                余额、累计结算与今日、昨日、近7日收益为本人全量已入账汇总，按UTC划日。
              </p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
