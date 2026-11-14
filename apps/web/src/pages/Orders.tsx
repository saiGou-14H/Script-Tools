import { App, Button, Empty, Steps, Table, Typography } from "antd";
import {
  CheckCircleOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  findPreviewOrder,
  usePrototype,
  type PreviewOrder,
} from "../prototype";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useWorkspace } from "../context";
import { formatMinorUnits } from "../lib/money";
import { serviceDuration, serviceVersion } from "../lib/service-display";
import { previewTasks, purchaseFixtures } from "../lib/consumer-preview";
import { Icon } from "../components/Icon";

export const fulfillmentLabels: Record<PreviewOrder["fulfillment"], string> = {
  AVAILABLE: "待使用",
  RUNNING: "执行中",
  WAITING_PAYMENT: "待付款",
  CLOSED: "已关闭",
  COMPLETED: "已完成",
};

export function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const tabs = {
    all: "全部",
    unpaid: "待支付",
    available: "待使用",
    running: "履约中",
    completed: "已完成",
    closed: "已关闭",
  };
  const tab = tabs[params.get("status") as keyof typeof tabs] || "全部";
  const { bootstrap } = useWorkspace();
  const { orders, cancelUnpaidOrder } = usePrototype();
  const { modal } = App.useApp();
  const data = orders.filter(
    (order) =>
      tab === "全部" ||
      (tab === "待支付"
        ? order.fulfillment === "WAITING_PAYMENT"
        : tab === "履约中"
          ? order.fulfillment === "RUNNING"
          : fulfillmentLabels[order.fulfillment] === tab),
  );
  function cancel(order: PreviewOrder) {
    modal.confirm({
      title: "取消未支付订单",
      content: `确认取消${order.name}的未支付订单？`,
      okText: "确认取消",
      cancelText: "保留订单",
      onOk: () => cancelUnpaidOrder(order.id),
    });
  }
  return (
    <div className="orders-page">
      <PageHeading
        title="我的订单"
        extra={
          <Status tone="gray">
            {bootstrap.data_mode === "prototype"
              ? "本地示例"
              : "订单服务待接入"}
          </Status>
        }
      />
      {bootstrap.data_mode !== "prototype" && (
        <Notice>订单服务待接入，支付与履约状态暂不可用。</Notice>
      )}
      <div className="orders-banner">
        <span className="tile-icon orders-code-icon" aria-hidden>
          &lt;/&gt;
        </span>
        <div>
          <h2>脚本与工具的一次性服务</h2>
          <p>
            面向个人的通用脚本上传、部署、按次付费使用平台，提供数据/文件工具与景点预约等服务。每单只有一次完整服务，同次接续不额外收费。
          </p>
        </div>
        <ul>
          <li>门票0元不等于脚本服务免费。</li>
          <li>未达目标的退款规则由发布者选择，购买前展示，成交后固定执行。</li>
        </ul>
      </div>
      <Panel className="orders-list">
        <div className="pill-tabs">
          {Object.entries(tabs).map(([key, item]) => (
            <Button
              key={item}
              type={tab === item ? "primary" : "default"}
              onClick={() => setParams(key === "all" ? {} : { status: key })}
            >
              {item}
            </Button>
          ))}
        </div>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={data}
          scroll={{ x: 1400 }}
          columns={[
            {
              title: "订单编号",
              dataIndex: "id",
              width: "15%",
              render: (value, order) => (
                <>
                  <Link
                    className="dark-link order-number"
                    to={`/me/orders/${order.id}`}
                  >
                    <b>{value}</b>
                  </Link>
                  <small>{order.createdAt}</small>
                </>
              ),
            },
            {
              title: "服务",
              dataIndex: "name",
              width: "22%",
              render: (value, order) => (
                <div className="entity-cell">
                  <TileIcon
                    name={order.icon}
                    color={order.icon === "travel" ? "purple" : "blue"}
                  />
                  <div>
                    <b>{value}</b>
                    <small>{order.summary}</small>
                  </div>
                </div>
              ),
            },
            {
              title: "金额",
              dataIndex: "amountMinor",
              render: (value: string) => `${formatMinorUnits(value)} 元`,
            },
            {
              title: "支付状态",
              render: (_, order) => (
                <Status tone={order.payment === "PAID" ? "green" : "red"}>
                  {order.payment === "PAID" ? "✓ 已支付" : "× 未支付"}
                </Status>
              ),
            },
            {
              title: "履约状态",
              render: (_, order) => (
                <Status
                  tone={
                    order.fulfillment === "AVAILABLE"
                      ? "blue"
                      : order.fulfillment === "RUNNING"
                        ? "orange"
                        : "gray"
                  }
                >
                  {fulfillmentLabels[order.fulfillment]}
                </Status>
              ),
            },
            {
              title: "退款状态",
              render: () => <Status tone="gray">— 无退款申请</Status>,
            },
            {
              title: "操作",
              render: (_, order) =>
                order.fulfillment === "WAITING_PAYMENT" ? (
                  <div className="row-actions">
                    <Link to={`/checkout/${order.id}/pay`}>
                      <Button type="primary">去支付</Button>
                    </Link>
                    <Button onClick={() => cancel(order)}>取消</Button>
                  </div>
                ) : (
                  <Link to={`/me/orders/${order.id}`}>
                    <Button>详情</Button>
                  </Link>
                ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { orders, refunds } = usePrototype();
  const order = findPreviewOrder(orders, id);
  if (!order) return <Empty description="订单不存在或已失效" />;
  const paid = order.payment === "PAID";
  const closed = order.fulfillment === "CLOSED";
  const entitlement = purchaseFixtures.find(
    (item) => item.orderId === order.id,
  );
  const canConfigure = paid && order.fulfillment === "AVAILABLE" && entitlement;
  const entitlementLabel = closed
    ? "权益已关闭"
    : !paid
      ? "付款后开通"
      : order.fulfillment === "RUNNING"
        ? "权益已占用"
        : order.fulfillment === "COMPLETED"
          ? "权益已使用"
          : canConfigure
            ? "权益可使用"
            : "权益资料待载入";
  const fulfillment =
    order.fulfillment === "AVAILABLE"
      ? "履约待开始"
      : fulfillmentLabels[order.fulfillment];
  const snapshot = order.serviceSnapshot;
  const relatedRefunds = refunds.filter((item) => item.orderId === order.id);
  const task = previewTasks.find((item) => item.key === order.taskId);
  return (
    <div className="order-detail-page">
      <PageHeading
        title="订单详情"
        description="查看订单信息、服务约定与使用配置，管理本次购买的脚本服务。"
        extra={<Status tone="gray">本地示例</Status>}
      />
      <div className="order-detail-banner">
        <TileIcon name={order.icon} color="gradient" />
        <div>
          <h2>{order.title}</h2>
          <p>
            订单编号　
            <Typography.Text
              copyable={{ text: order.id, icon: <CopyOutlined /> }}
            >
              {order.id}
            </Typography.Text>
          </p>
          <p>{order.summary}</p>
        </div>
        <div>
          <strong>¥{formatMinorUnits(order.amountMinor)}</strong>
          <p>
            <Status tone={paid ? "green" : "orange"}>
              {paid ? "已支付" : "待支付"}
            </Status>
            <Status>{entitlementLabel}</Status>
            <Status tone="orange">{fulfillment}</Status>
          </p>
        </div>
      </div>
      <div className="order-status-grid">
        <Panel>
          <span className="tile-icon tile-green">
            <CheckCircleOutlined aria-hidden />
          </span>
          <div>
            <h3>支付状态</h3>
            <p>
              {paid ? "已支付" : "待支付"} ¥
              {formatMinorUnits(order.amountMinor)}
            </p>
          </div>
        </Panel>
        <Panel>
          <TileIcon name="rocket" />
          <div>
            <h3>使用权益</h3>
            <p>{entitlementLabel}</p>
          </div>
        </Panel>
        <Panel>
          <TileIcon name="clock" color="orange" />
          <div>
            <h3>履约状态</h3>
            <p>{fulfillment}</p>
          </div>
        </Panel>
      </div>
      <div className="order-contract-grid">
        <Panel title="服务约定与合同">
          <dl className="contract-definition">
            <dt>
              <Icon name="file" />
              合同快照版本
            </dt>
            <dd>
              {order.contract?.version ||
                (snapshot ? serviceVersion(snapshot) : "合同快照待载入")}
            </dd>
            <dt>
              <Icon name="shield" />
              未达目标的退款规则
            </dt>
            <dd>
              {order.contract?.refundRule ||
                snapshot?.refund_policy.summary ||
                "退款规则待载入"}
            </dd>
            <dt>
              <Icon name="clock" />
              单次服务最长时间
            </dt>
            <dd>
              {order.contract
                ? serviceDuration(order.contract.maxServiceSeconds)
                : snapshot
                  ? serviceDuration(snapshot.max_service_seconds)
                  : "执行约定待载入"}
            </dd>
            <dt>
              <Icon name="calendar" />
              购买时间
            </dt>
            <dd>{order.createdAt}</dd>
            <dt>
              <Icon name="calendar" />
              有效期限
            </dt>
            <dd>{order.contract?.validUntil || "以订单权益期限为准"}</dd>
          </dl>
        </Panel>
        <Panel title="订单操作">
          <div className="order-action-stack">
            {canConfigure ? (
              <Link to={`/me/services/${canConfigure.id}/use`}>
                <Button
                  type="primary"
                  block
                  icon={<PlayCircleOutlined aria-hidden />}
                >
                  配置使用
                </Button>
              </Link>
            ) : task ? (
              <Link to={`/me/tasks/${task.key}`}>
                <Button type="primary" block>
                  查看任务
                </Button>
              </Link>
            ) : !paid && !closed ? (
              <Link to={`/checkout/${order.id}/pay`}>
                <Button type="primary" block>
                  去支付
                </Button>
              </Link>
            ) : (
              <Link to="/me/services">
                <Button block>查看已购服务</Button>
              </Link>
            )}
            <Link
              to={
                paid && !closed
                  ? `/me/refunds?order_id=${order.id}`
                  : "/me/orders"
              }
            >
              <Button block icon={<CloseOutlined aria-hidden />}>
                {paid && !closed ? "取消并退款" : "返回订单列表"}
              </Button>
            </Link>
            <Notice>
              <ul>
                <li>每单仅提供一次完整服务，同次接续不额外收费。</li>
                <li>门票0元不等于脚本服务免费。</li>
                <li>
                  未达目标的退款规则由发布者选择，购买前展示、成交后固定。
                </li>
              </ul>
            </Notice>
          </div>
        </Panel>
      </div>
      <div className="order-related-grid">
        <Panel title="支付记录">
          <Table
            size="small"
            pagination={false}
            dataSource={
              order.paymentRecordId
                ? [{ id: order.paymentRecordId, amount: order.amountMinor }]
                : []
            }
            rowKey="id"
            columns={[
              { title: "记录编号", dataIndex: "id" },
              { title: "支付方式", render: () => "在线支付" },
              {
                title: "金额",
                dataIndex: "amount",
                render: (value: string) => `¥${formatMinorUnits(value)}`,
              },
              { title: "支付时间", render: () => order.createdAt },
              {
                title: "状态",
                render: () => <Status tone="green">支付成功</Status>,
              },
            ]}
          />
        </Panel>
        <Panel title="退款记录">
          <Table
            size="small"
            pagination={false}
            dataSource={relatedRefunds}
            rowKey="id"
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无退款记录"
                />
              ),
            }}
            columns={[
              {
                title: "记录编号",
                dataIndex: "id",
                render: (value) => (
                  <Link to={`/me/refunds/${value}`}>{value}</Link>
                ),
              },
              {
                title: "退款金额",
                dataIndex: "amountMinor",
                render: (value: string) => `¥${formatMinorUnits(value)}`,
              },
              { title: "退款时间", dataIndex: "createdAt" },
              {
                title: "状态",
                render: (_, refund) =>
                  refund.status === "SUCCEEDED"
                    ? "已退款"
                    : refund.status === "PROCESSING"
                      ? "退款处理中"
                      : "申请已记录（预览）",
              },
            ]}
          />
        </Panel>
        <Panel title="关联任务">
          <Table
            size="small"
            pagination={false}
            dataSource={task ? [task] : []}
            rowKey="key"
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无关联任务"
                />
              ),
            }}
            columns={[
              {
                title: "任务编号",
                dataIndex: "key",
                render: (value) => (
                  <Link to={`/me/tasks/${value}`}>{value}</Link>
                ),
              },
              { title: "任务类型", render: () => "脚本执行" },
              {
                title: "状态",
                dataIndex: "status",
                render: (value) => <Status tone="gray">{value}</Status>,
              },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

export function PurchaseSteps({ current }: { current: number }) {
  return (
    <div className="purchase-steps">
      <Steps
        current={current}
        items={[
          { title: "确认订单" },
          { title: "支付" },
          { title: "使用服务" },
        ]}
      />
    </div>
  );
}
