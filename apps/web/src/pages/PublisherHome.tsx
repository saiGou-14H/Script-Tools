import { Button, Empty, Input, Table, Tabs } from "antd";
import {
  PlusOutlined,
  SearchOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { More, PageHeading, Panel, Status, TileIcon } from "../components/ui";

const serviceTabs = ["全部服务", "在售", "待上架", "已下架"];

const services = [
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
    icon: "reconciliation",
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
    icon: "travel",
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
    icon: "container",
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
  const data = prototype
    ? services.filter(
        (service) =>
          (tab === "全部服务" || tab === service.sales) &&
          service.name.includes(query.trim()),
      )
    : [];
  return (
    <div className="publisher-dashboard">
      <PageHeading
        title="发布者工作台"
        extra={prototype ? <Status>本地开发示例</Status> : undefined}
      />
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
              <div className="publisher-hero-screen">&lt;/&gt;</div>
              <div className="publisher-hero-keyboard" />
              <CloudUploadOutlined />
            </div>
          </div>
          <div className="publisher-stats">
            {[
              ["layers", "在售服务", "4", "blue", "↑ 1"],
              ["cart", "今日成交", "12", "purple", "↑ +3"],
              ["database", "待结算", "¥68.00", "orange", ""],
              ["warning", "部署异常", "1", "red", ""],
            ].map(([icon, title, value, color, change]) => (
              <div key={title}>
                <TileIcon name={icon} color={color} />
                <span>
                  <small>{title}</small>
                  <strong className={color === "red" ? "negative" : undefined}>
                    {prototype ? value : "—"}
                    {prototype && change && <em>{change}</em>}
                  </strong>
                </span>
              </div>
            ))}
          </div>
          <Panel title="脚本到服务流程">
            <div className="publisher-workflow">
              {[
                [
                  "upload",
                  "上传脚本",
                  "选择脚本文件并完善基本信息",
                  "/publisher/scripts",
                ],
                [
                  "tool",
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
                  "order",
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
                items={serviceTabs.map((item) => ({
                  key: item,
                  label: prototype
                    ? `${item}(${services.filter((service) => item === "全部服务" || item === service.sales).length})`
                    : item,
                }))}
              />
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索服务名称"
                aria-label="搜索工作台服务"
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
              rowKey="id"
              dataSource={data}
              locale={
                !prototype
                  ? { emptyText: "发布者服务概况接口待接入" }
                  : undefined
              }
              pagination={false}
              scroll={{ x: 1080 }}
              columns={[
                {
                  title: "服务名称",
                  dataIndex: "name",
                  render: (value, row) => (
                    <span className="publisher-service-name">
                      <TileIcon name={row.icon} />
                      <b>{value}</b>
                      <Status>示例数据</Status>
                    </span>
                  ),
                },
                { title: "所属脚本", dataIndex: "script" },
                {
                  title: "运行状态",
                  dataIndex: "runtime",
                  render: (value) => (
                    <Status
                      tone={
                        value === "运行正常"
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
                { title: "无结果退款政策", dataIndex: "refund" },
                {
                  title: "单次价格",
                  dataIndex: "price",
                  render: (value) => `¥${value}`,
                },
                { title: "累计销量", dataIndex: "quantity" },
                {
                  title: "累计收入",
                  dataIndex: "income",
                  render: (value) => `¥${value}`,
                },
                {
                  title: "操作",
                  render: (_, row) => (
                    <div className="row-actions">
                      <Link to="/publisher/services">管理</Link>
                      <Link to="/publisher/deployments">
                        {row.runtime === "未部署" ? "部署" : "运行"}
                      </Link>
                      <Link to="/publisher/services">
                        {row.sales === "在售" ? "下架" : "上架"}
                      </Link>
                    </div>
                  ),
                },
              ]}
            />
          </Panel>
        </div>
        <aside>
          <Panel title="部署告警" extra={<More to="/publisher/deployments" />}>
            {(prototype
              ? [
                  ["信息提取与整理工具", "部署运行异常", "今天 10:24", "red"],
                  ["车票信息查询工具", "已恢复正常", "今天 09:47", "green"],
                ]
              : []
            ).map(([name, state, time, color]) => (
              <div className="publisher-alert" key={name}>
                <i className={`dot ${color}`} />
                <div>
                  <b>
                    {name}　{state}
                  </b>
                  <small>最近一次部署　{time}</small>
                </div>
                <Link to="/publisher/deployments">
                  <Button size="small">查看</Button>
                </Link>
              </div>
            ))}
            {!prototype && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="部署告警接口待接入"
              />
            )}
          </Panel>
          <Panel title="销售退款" extra={<More to="/publisher/orders" />}>
            {(prototype
              ? [
                  ["T202501200036", "车票信息查询工具", "3.00", "今天 14:05"],
                  ["T202501200028", "信息提取与整理工具", "4.00", "今天 11:32"],
                ]
              : []
            ).map(([id, name, price, time]) => (
              <Link
                to="/publisher/orders"
                className="publisher-refund"
                key={id}
              >
                <TileIcon name="sync" color="red" />
                <div>
                  <b>订单退款（#{id}）</b>
                  <small>
                    {name} · 无结果退款
                    <br />
                    {time}
                  </small>
                </div>
                <b>- ¥{price}</b>
              </Link>
            ))}
            {!prototype && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="销售退款接口待接入"
              />
            )}
          </Panel>
          <Panel
            title="收益摘要"
            extra={<More to="/publisher/earnings">查看结算明细</More>}
          >
            <div className="publisher-income">
              <div>
                <small>累计收入（已结算）</small>
                <strong>{prototype ? "¥723.00" : "—"}</strong>
              </div>
              <div>
                <small>待结算收益 ⓘ</small>
                <strong>{prototype ? "¥68.00" : "—"}</strong>
              </div>
            </div>
            {[
              ["chart", "近期收入趋势（近7天）", "¥136.00", "+18%"],
              ["calendar", "今日收入", "¥48.00", ""],
              ["calendar", "昨日收入", "¥48.00", ""],
              ["chart", "近7日收入", "¥136.00", ""],
            ].map(([icon, name, value, change]) => (
              <div className="publisher-income-row" key={name}>
                <TileIcon name={icon} />
                <span>{name}</span>
                <b>{prototype ? value : "—"}</b>
                {prototype && change && <em>↑ {change}</em>}
              </div>
            ))}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
