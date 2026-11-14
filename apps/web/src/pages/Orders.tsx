import { useState } from "react";
import { App, Button, Empty, Steps, Table, Typography } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import {
  findPreviewOrder,
  usePrototype,
  type PreviewOrder,
} from "../prototype";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";

export const fulfillmentLabels: Record<PreviewOrder["fulfillment"], string> = {
  AVAILABLE: "待使用",
  RUNNING: "执行中",
  WAITING_PAYMENT: "待付款",
  CLOSED: "已关闭",
  COMPLETED: "已完成",
};

export function OrdersPage() {
  const [tab, setTab] = useState("全部");
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
      <PageHeading title="我的订单" />
      <div className="orders-banner">
        <TileIcon name="code" color="gradient" />
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
          {["全部", "待支付", "待使用", "履约中", "已完成", "已关闭"].map(
            (item) => (
              <Button
                key={item}
                type={tab === item ? "primary" : "default"}
                onClick={() => setTab(item)}
              >
                {item}
              </Button>
            ),
          )}
        </div>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={data}
          columns={[
            {
              title: "订单编号",
              dataIndex: "id",
              width: "15%",
              render: (value, order) => (
                <>
                  <b>{value}</b>
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
              render: (value) => `${Number(value) / 100} 元`,
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
  const { orders } = usePrototype();
  const order = findPreviewOrder(orders, id);
  if (!order) return <Empty description="订单不存在或已失效" />;
  const paid = order.payment === "PAID";
  return (
    <div className="order-detail-page">
      <PageHeading
        title="订单详情"
        description="查看订单信息、服务约定与使用配置，管理本次购买的脚本服务。"
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
          <p>数据文件处理与清洗脚本，一次完整服务，确保输出符合约定目标。</p>
        </div>
        <div>
          <strong>¥{(Number(order.amountMinor) / 100).toFixed(2)}</strong>
          <p>
            <Status tone={paid ? "green" : "orange"}>
              {paid ? "已支付" : "待支付"}
            </Status>
            <Status>权益{paid ? "可使用" : "待开通"}</Status>
            <Status tone="orange">{paid ? "履约待开始" : "等待付款"}</Status>
          </p>
        </div>
      </div>
      <div className="order-status-grid">
        <Panel>
          <TileIcon name="shield" color="green" />
          <div>
            <h3>支付状态</h3>
            <p>
              {paid ? "已支付" : "待支付"} ¥
              {(Number(order.amountMinor) / 100).toFixed(2)}
            </p>
          </div>
        </Panel>
        <Panel>
          <TileIcon name="rocket" />
          <div>
            <h3>使用权益</h3>
            <p>{paid ? "权益可使用" : "付款后开通"}</p>
          </div>
        </Panel>
        <Panel>
          <TileIcon name="history" color="orange" />
          <div>
            <h3>履约状态</h3>
            <p>{fulfillmentLabels[order.fulfillment]}</p>
          </div>
        </Panel>
      </div>
      <div className="order-contract-grid">
        <Panel title="服务约定与合同">
          <dl className="contract-definition">
            <dt>合同快照版本</dt>
            <dd>v1.2</dd>
            <dt>未达目标的退款规则</dt>
            <dd>目标未达全退</dd>
            <dt>单次服务最长时间</dt>
            <dd>最长5分钟</dd>
            <dt>购买时间</dt>
            <dd>{order.createdAt}</dd>
            <dt>有效期限</dt>
            <dd>2026-11-20</dd>
          </dl>
        </Panel>
        <Panel title="订单操作">
          <div className="order-action-stack">
            {paid ? (
              <Link to="/me/services/demo/use">
                <Button type="primary" block icon={<PlayCircleOutlined />}>
                  配置使用
                </Button>
              </Link>
            ) : (
              <Link to={`/checkout/${order.id}/pay`}>
                <Button type="primary" block>
                  去支付
                </Button>
              </Link>
            )}
            <Link to={paid ? `/me/refunds?order=${order.id}` : "/me/orders"}>
              <Button block icon={<CloseOutlined />}>
                {paid ? "取消并退款" : "返回订单列表"}
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
              paid ? [{ id: "PAY202611130001", amount: order.amountMinor }] : []
            }
            rowKey="id"
            columns={[
              { title: "记录编号", dataIndex: "id" },
              { title: "支付方式", render: () => "在线支付" },
              {
                title: "金额",
                dataIndex: "amount",
                render: (value) => `¥${(Number(value) / 100).toFixed(2)}`,
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
            dataSource={[]}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无退款记录"
                />
              ),
            }}
            columns={[
              { title: "记录编号" },
              { title: "退款金额" },
              { title: "退款时间" },
              { title: "状态" },
            ]}
          />
        </Panel>
        <Panel title="关联任务">
          <Table
            size="small"
            pagination={false}
            rowKey="id"
            dataSource={paid ? [{ id: "TASK202611130001" }] : []}
            columns={[
              {
                title: "任务编号",
                dataIndex: "id",
                render: (value) => <Link to="/me/tasks/demo">{value}</Link>,
              },
              { title: "任务类型", render: () => "脚本执行" },
              {
                title: "状态",
                render: () => <Status tone="gray">待开始</Status>,
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
