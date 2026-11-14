import { Alert, Button, Empty, Skeleton, Table } from "antd";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircleFilled,
  InfoCircleFilled,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { More, Panel, Status, TileIcon } from "../components/ui";
import { Icon } from "../components/Icon";
import { api } from "../api";
import { useWorkspace } from "../context";
import { usePrototype } from "../prototype";
import { currency, useServices } from "./Market";
import { serviceDate, servicePath } from "../lib/service-display";
import {
  downloadPreviewOutput,
  outputFixtures,
  pendingFixtures,
  purchaseFixtures,
  type PreviewOutput,
} from "../lib/consumer-preview";
import type { PersonalOverview } from "../types";

const entitlementLabels: Record<string, string> = {
  PENDING: "待生效",
  ACTIVE: "待使用",
  RESERVED: "使用中",
  CONSUMED: "已使用",
  EXPIRED: "已过期",
  REVOKED: "已撤销",
};
const runLabels: Record<string, string> = {
  QUEUED: "排队中",
  PREPARING: "准备中",
  READY: "就绪",
  RUNNING: "执行中",
  STOPPING: "停止中",
  WAITING_INPUT: "等待补充",
  RECONCILING: "核验中",
  SUCCEEDED: "已完成",
  FAILED: "失败",
  TIMED_OUT: "已超时",
  CANCELLED: "已取消",
  EXPIRED: "已过期",
  CLOSED_UNRESOLVED: "未决关闭",
};
const orderLabels: Record<string, string> = {
  AWAITING_PAYMENT: "待支付",
  ACTIVE: "已支付",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  EXPIRED: "已过期",
};

interface HomeService {
  key: string;
  name: string;
  goal: string;
  status: string;
  icon: string;
  action: string;
  to: string;
}
interface HomeResult {
  key: string;
  task: string;
  goal: string;
  time: string;
  file: string;
  output?: PreviewOutput;
}

export function ConsumerHomePage() {
  const { bootstrap } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const { orders, refunds } = usePrototype();
  const catalog = useServices();
  const overview = useQuery({
    queryKey: ["personal", bootstrap.user?.id, "overview"],
    queryFn: () => api<PersonalOverview>("/monitoring/overview"),
    enabled: !prototype,
    refetchInterval: 30_000,
  });
  const counts = prototype
    ? {
        unused_entitlements: String(
          purchaseFixtures.filter((item) => item.category === "待使用").length,
        ),
        in_progress: String(
          purchaseFixtures.filter((item) => item.category === "使用中").length,
        ),
        pending_actions: String(pendingFixtures.length),
        processing_refunds: String(
          refunds.filter((item) => item.status !== "SUCCEEDED").length,
        ),
        entitlements: String(
          purchaseFixtures.filter((item) => item.category !== "已使用").length,
        ),
      }
    : overview.data?.counts;
  const services: HomeService[] = prototype
    ? purchaseFixtures
        .filter((item) => item.category !== "已使用")
        .map((item) => ({
          key: item.id,
          name: item.title,
          goal: item.description,
          status: item.status,
          icon: item.icon,
          action: item.action || "查看详情",
          to:
            item.id === "clean"
              ? "/me/services/demo/use"
              : item.id === "booking"
                ? "/me/tasks/booking"
                : "/me/services",
        }))
    : (overview.data?.services || []).map((item) => ({
        key: item.id,
        name: item.title,
        goal: item.description,
        status: entitlementLabels[item.status] || item.status,
        icon: item.icon || "box",
        action: "查看订单",
        to: `/me/orders/${item.order_id}`,
      }));
  const recentOrders = prototype
    ? orders.slice(0, 3).map((order) => ({
        id: order.id,
        name: order.title,
        icon: order.icon,
        price: currency(order.amountMinor),
        time: order.createdAt,
        state:
          order.fulfillment === "CLOSED"
            ? "已关闭"
            : order.payment === "PAID"
              ? "已支付"
              : "待支付",
      }))
    : (overview.data?.orders || []).map((order) => ({
        id: order.id,
        name: order.title,
        icon: order.icon || "order",
        price: currency(order.amount_minor),
        time: serviceDate(order.created_at),
        state: orderLabels[order.status] || order.status,
      }));
  const results: HomeResult[] = prototype
    ? outputFixtures
        .filter((output) => output.ready)
        .slice(0, 2)
        .map((output) => ({
          key: output.key,
          task: output.task,
          goal: output.goal,
          time: output.created,
          file: output.name,
          output,
        }))
    : (overview.data?.results || []).map((output) => ({
        key: output.id,
        task: output.task_name,
        goal:
          output.kind === "file"
            ? "文件产物"
            : output.kind === "message"
              ? "消息产物"
              : output.kind === "json"
                ? "JSON产物"
                : "文本产物",
        time: serviceDate(output.created_at),
        file: output.file_name || output.title || "查看产物",
      }));
  const activity = prototype
    ? [
        {
          id: "data",
          title: "10:42　公开数据整理待补充",
          description: "凭据已过期，更新后继续本次服务",
          success: false,
        },
        {
          id: "booking",
          title: "09:30　预约进行中",
          description: "免费景点预约，已提交申请，等待处理",
          success: true,
        },
      ]
    : (overview.data?.activity || []).map((run) => ({
        id: run.id,
        title: `${run.task_name}　${runLabels[run.status] || run.status}`,
        description: `最近更新　${serviceDate(run.updated_at)}`,
        success: run.status === "SUCCEEDED",
      }));
  const pending = prototype
    ? pendingFixtures.slice(0, 1).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.service,
        action: item.action,
        to: item.id === "credential" ? "/me/credentials" : "/me/pending",
      }))
    : (overview.data?.pending || []).map((item) => ({
        id: item.id,
        title: item.task_name,
        description: item.reason,
        action: "查看事项",
        to: `/me/pending?focus=${item.id}`,
      }));
  const recommendations = (catalog.data || [])
    .filter((service) => service.scene_key !== "travel")
    .slice(0, 3);
  const publisherPath = "/publisher";
  if (!prototype && overview.isPending)
    return <Skeleton active paragraph={{ rows: 12 }} />;
  if (!prototype && overview.error)
    return (
      <Alert
        type="error"
        title="个人概况暂时无法加载"
        description={overview.error.message}
        showIcon
        action={<Button onClick={() => void overview.refetch()}>重试</Button>}
      />
    );
  return (
    <div className="consumer-home" data-mode={prototype ? "prototype" : "live"}>
      <div className="home-main">
        <section className="welcome-banner">
          <h1>欢迎回来！</h1>
          <p>
            当前工作区 · 消费者 · 个人账号 ·
            可购买服务、使用权益、管理本人任务结果与售后，任何有效用户可切换发布者工作区。
          </p>
          <p className="welcome-count">
            当前有 <strong>{counts?.pending_actions || "0"}</strong>{" "}
            项待处理事项。
          </p>
          <Link to="/me/services">
            <Button type="primary">
              继续使用 <Icon name="play" />
            </Button>
          </Link>
          <Link to="/market">
            <Button>浏览脚本</Button>
          </Link>
          <div className="hero-document" aria-hidden="true">
            <span>&lt;/&gt;</span>
          </div>
          {prototype && (
            <span className="home-preview-label">本地开发示例</span>
          )}
        </section>
        <div className="home-stats">
          {[
            {
              icon: "order",
              label: "已购待使用",
              value: counts?.unused_entitlements,
              color: "blue",
              to: "/me/services?status=unused",
            },
            {
              icon: "play",
              label: "进行中",
              value: counts?.in_progress,
              color: "green",
              to: "/me/tasks",
            },
            {
              icon: "warning",
              label: "待处理",
              value: counts?.pending_actions,
              color: "orange",
              to: "/me/pending",
            },
            {
              icon: "sync",
              label: "退款处理中",
              value: counts?.processing_refunds,
              color: "purple",
              to: "/me/refunds",
            },
          ].map((item) => (
            <Link
              to={item.to}
              className={`home-stat stat-${item.color}`}
              key={item.label}
            >
              <TileIcon name={item.icon} color={item.color} />
              <span>
                <b>{item.label}</b>
                <strong>
                  {item.value || "0"}
                  <small>项</small>
                </strong>
              </span>
            </Link>
          ))}
        </div>
        <div className="home-middle">
          <Panel
            className="home-services-panel"
            title={
              <>
                <TileIcon name="database" />
                我的服务
              </>
            }
            extra={<small>共 {counts?.entitlements || "0"} 项</small>}
          >
            <Table
              size="small"
              pagination={false}
              dataSource={services}
              locale={{ emptyText: "暂无已购服务" }}
              columns={[
                {
                  title: "服务名称",
                  dataIndex: "name",
                  render: (value, row) => (
                    <b>
                      <TileIcon name={row.icon} />
                      {value}
                    </b>
                  ),
                },
                { title: "业务目标", dataIndex: "goal", ellipsis: true },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (value) => (
                    <Status
                      tone={
                        value === "使用中"
                          ? "green"
                          : value === "服务暂不可用"
                            ? "red"
                            : "blue"
                      }
                    >
                      {value}
                    </Status>
                  ),
                },
                {
                  title: "操作",
                  render: (_, row) => (
                    <Link to={row.to}>
                      <Button size="small">{row.action}</Button>
                    </Link>
                  ),
                },
              ]}
            />
          </Panel>
          <Panel
            className="home-activity-panel"
            title={
              <>
                <TileIcon name="chart" />
                运行动态
              </>
            }
            extra={<More to="/me/runs" />}
          >
            {activity.length ? (
              activity.map((item) => (
                <div
                  className={`activity-item ${item.success ? "success" : ""}`}
                  key={item.id}
                >
                  {item.success ? <CheckCircleFilled /> : <InfoCircleFilled />}
                  <div>
                    <b>{item.title}</b>
                    <p>{item.description}</p>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无运行动态"
              />
            )}
          </Panel>
          <Panel
            className="home-pending-panel"
            title={
              <>
                <TileIcon name="warning" color="orange" />
                待处理事项
              </>
            }
            extra={<small>共 {counts?.pending_actions || "0"} 项</small>}
          >
            {pending.length ? (
              pending.map((item) => (
                <div className="pending-home" key={item.id}>
                  <i className="dot red" />
                  <div>
                    <b>{item.title}</b>
                    <p>{item.description}</p>
                  </div>
                  <Link to={item.to}>
                    <Button type="primary" size="small">
                      {item.action}
                    </Button>
                  </Link>
                </div>
              ))
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无待处理事项"
              />
            )}
          </Panel>
        </div>
        <div className="home-bottom">
          <Panel
            title={
              <>
                <TileIcon name="database" />
                本次使用说明
              </>
            }
          >
            {[
              "每张订单包含一次完整服务",
              "同一次接续不重复收费",
              "新的使用需要重新购买",
            ].map((item, index) => (
              <div className="numbered-row" key={item}>
                <span>{index + 1}</span>
                <b>{item}</b>
              </div>
            ))}
          </Panel>
          <Panel
            className="home-results-panel"
            title={
              <>
                <TileIcon name="file" />
                最近结果
              </>
            }
            extra={<More to="/me/outputs">查看全部结果</More>}
          >
            <Table
              size="small"
              pagination={false}
              dataSource={results}
              locale={{ emptyText: "暂无可用产物" }}
              columns={[
                {
                  title: "任务名称",
                  dataIndex: "task",
                  render: (value) => <b>{value}</b>,
                },
                { title: "业务目标", dataIndex: "goal", ellipsis: true },
                { title: "完成时间", dataIndex: "time" },
                {
                  title: "结果文件",
                  dataIndex: "file",
                  render: (value, row) => (
                    <Link to={`/me/outputs?output=${row.key}`}>
                      <Icon name="file" /> {value}
                    </Link>
                  ),
                },
                {
                  title: "操作",
                  render: (_, row) =>
                    row.output ? (
                      <Button
                        size="small"
                        onClick={() => downloadPreviewOutput(row.output!)}
                      >
                        下载
                      </Button>
                    ) : (
                      <Link to={`/me/outputs?output=${row.key}`}>
                        <Button size="small">查看</Button>
                      </Link>
                    ),
                },
              ]}
            />
          </Panel>
        </div>
      </div>
      <aside className="home-aside">
        <Panel
          className="home-orders-panel"
          title={
            <>
              <TileIcon name="order" />
              最近订单
            </>
          }
          extra={<More to="/me/orders">查看全部订单</More>}
        >
          {recentOrders.length ? (
            recentOrders.map((order) => (
              <Link
                to={`/me/orders/${order.id}`}
                className="recent-order"
                key={order.id}
              >
                <TileIcon name={order.icon} />
                <div>
                  <b>{order.name}</b>
                  <small>{order.time}</small>
                </div>
                <div>
                  <b>¥{order.price}</b>
                  <Status
                    tone={
                      order.state === "待支付"
                        ? "orange"
                        : order.state === "已关闭"
                          ? "gray"
                          : "green"
                    }
                  >
                    {order.state}
                  </Status>
                </div>
              </Link>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无订单"
            />
          )}
          <div className="soft-note">
            <InfoCircleOutlined />
            未达成目标时是否退款，以购买前展示并固定的发布者规则为准。
          </div>
        </Panel>
        <Panel
          className="home-discovery-panel"
          title={
            <>
              <TileIcon name="shield" />
              发现服务与发布入口
            </>
          }
        >
          <div className="entry-cards">
            <Link to="/market">
              <TileIcon name="market" />
              <div>
                <b>发现服务</b>
                <small>按应用场景，快速找到所需工具</small>
              </div>
            </Link>
            <Link to={publisherPath}>
              <TileIcon name="upload" />
              <div>
                <b>发布入口</b>
                <small>发布自己的脚本服务并上架销售</small>
              </div>
            </Link>
          </div>
          <h3>
            热门服务推荐 <More to="/market">查看更多</More>
          </h3>
          {catalog.error ? (
            <Alert type="error" title="推荐服务暂时无法加载" showIcon />
          ) : catalog.isPending ? (
            <Skeleton active />
          ) : recommendations.length ? (
            recommendations.map((service) => (
              <Link
                to={servicePath(service)}
                className="recommend-item"
                key={service.id}
              >
                <TileIcon name={service.delivery_policy.icon} />
                <div>
                  <b>{service.title}</b>
                  <small>{service.description}</small>
                </div>
                <b>¥{currency(service.amount_minor)}/次</b>
              </Link>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无推荐服务"
            />
          )}
        </Panel>
      </aside>
    </div>
  );
}
