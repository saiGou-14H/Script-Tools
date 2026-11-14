import { useState } from "react";
import {
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  Select,
  Table,
  Tabs,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useAdminPreview, type AdminOrder } from "../admin-preview";
import { formatMinorUnits } from "../lib/money";
import { AdminDiagnosisForm } from "../components/AdminDiagnosisForm";

const fulfillmentLabels = {
  AVAILABLE: "待使用",
  RUNNING: "履约中",
  UNMET: "目标未达",
};

export function AdminOrdersPage() {
  const { orders } = useAdminPreview();
  const [params, setParams] = useSearchParams();
  const initialFilters = {
    id: params.get("order") || "",
    service: params.get("service") || undefined,
  };
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<{
    id?: string;
    buyer?: string;
    service?: string;
    bookingId?: string;
    dates?: { format: (format: string) => string }[];
  }>(initialFilters);
  const globalQuery = params.get("q")?.trim() || "";
  const rows = orders.filter(
    (row) =>
      [row.id, row.buyer, row.service, row.bookingId || ""].some((value) =>
        value.includes(globalQuery),
      ) &&
      row.id.includes(filters.id?.trim() || "") &&
      row.buyer.includes(filters.buyer?.trim() || "") &&
      (!filters.service || row.service === filters.service) &&
      (row.bookingId || "").includes(filters.bookingId?.trim() || "") &&
      (!filters.dates?.length ||
        (row.date >= filters.dates[0].format("YYYY-MM-DD") &&
          row.date <= filters.dates[1].format("YYYY-MM-DD"))),
  );
  return (
    <div className="admin-page admin-orders-page">
      <PageHeading title="服务订单" />
      {globalQuery && (
        <p className="admin-global-query">
          全局检索 · {globalQuery}
          <Button type="link" onClick={() => setParams({})}>
            清除检索
          </Button>
        </p>
      )}
      <Panel className="admin-order-filters">
        <Form
          form={form}
          layout="vertical"
          initialValues={initialFilters}
          onFinish={setFilters}
        >
          <Form.Item name="id" label="订单号">
            <Input placeholder="请输入服务订单号" />
          </Form.Item>
          <Form.Item name="buyer" label="用户">
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item name="service" label="服务">
            <Select
              placeholder="全部服务"
              allowClear
              options={[{ value: "表格清洗" }, { value: "景点预约" }]}
            />
          </Form.Item>
          <Form.Item name="bookingId" label="关联预约编号">
            <Input placeholder="请输入预约编号" />
          </Form.Item>
          <Form.Item name="dates" label="日期">
            <DatePicker.RangePicker placeholder={["开始日期", "结束日期"]} />
          </Form.Item>
          <div className="row-actions">
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button
              onClick={() => {
                form.resetFields();
                form.setFieldsValue({
                  id: "",
                  buyer: "",
                  service: undefined,
                  bookingId: "",
                  dates: undefined,
                });
                setFilters({});
                setParams({});
              }}
            >
              重置
            </Button>
          </div>
        </Form>
      </Panel>
      <Panel className="admin-order-table">
        <Table<AdminOrder>
          rowKey="id"
          dataSource={rows}
          pagination={false}
          columns={[
            { title: "订单号", dataIndex: "id", width: 195 },
            {
              title: "关联预约编号",
              dataIndex: "bookingId",
              width: 160,
              render: (value) =>
                value ? (
                  <Link to={`/admin/travel/unresolved?booking=${value}`}>
                    <Status>{value}</Status>
                  </Link>
                ) : (
                  <Status tone="gray">—</Status>
                ),
            },
            { title: "用户", dataIndex: "buyer" },
            { title: "服务", dataIndex: "service" },
            {
              title: "金额",
              dataIndex: "amountMinor",
              render: (value) =>
                `${formatMinorUnits(value).replace(/\.00$/, "")} 元`,
            },
            {
              title: "付款状态",
              render: () => <Status tone="green">已支付</Status>,
            },
            {
              title: "履约状态",
              dataIndex: "fulfillment",
              render: (value: AdminOrder["fulfillment"]) => (
                <Status tone={value === "UNMET" ? "red" : "blue"}>
                  {fulfillmentLabels[value]}
                </Status>
              ),
            },
            {
              title: "退款状态",
              render: (_, row) => (
                <Status tone={row.refundId ? "purple" : "gray"}>
                  {row.refundId ? "退款处理中" : "无退款"}
                </Status>
              ),
            },
            {
              title: "结算状态",
              render: (_, row) => (
                <Status tone={row.settlement === "FROZEN" ? "orange" : "gray"}>
                  {row.settlement === "FROZEN" ? "冻结" : "未结算"}
                </Status>
              ),
            },
            {
              title: "操作",
              width: 205,
              render: (_, row) => (
                <div className="row-actions">
                  <Link to={`/admin/orders/${row.id}`}>
                    <Button>详情</Button>
                  </Link>
                  {row.refundId && (
                    <Link to={`/admin/refunds/${row.refundId}`}>
                      <Button type="primary">异常处理</Button>
                    </Link>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

export function AdminOrderDetailPage() {
  const { id } = useParams();
  const { orders, refunds } = useAdminPreview();
  const [tab, setTab] = useState("refund");
  const order = orders.find(
    (item) => item.id === (id === "demo" ? "TT202611130027" : id),
  );
  if (!order)
    return (
      <Empty description="服务订单不存在或已失效">
        <Link to="/admin/orders">
          <Button>返回服务订单</Button>
        </Link>
      </Empty>
    );
  const refund = refunds.find((item) => item.id === order.refundId);
  const ended = order.fulfillment === "UNMET";
  return (
    <div className="admin-page admin-order-detail-page">
      <PageHeading title="服务订单详情" />
      <div className="admin-order-detail-grid">
        <div>
          <div className="admin-order-hero">
            <TileIcon
              name={order.bookingId ? "gift" : "table"}
              color="gradient"
            />
            <div>
              <h2>服务单 {order.id}</h2>
              <p>
                {order.service}固定 <Status>{order.version}</Status>
                {order.bookingId && <span>门票 · 0 元</span>}
              </p>
            </div>
            <div className="order-hero-amount">
              <Status tone="green">已支付</Status>
              <strong>
                {formatMinorUnits(order.amountMinor).replace(/\.00$/, "")}{" "}
                <small>元</small>
              </strong>
            </div>
          </div>
          <Panel className="admin-order-stages">
            <div>
              <article>
                <CheckCircleOutlined />
                <span>
                  <b>支付</b>
                  <strong>已支付</strong>
                </span>
              </article>
              <article>
                <PlayCircleOutlined />
                <span>
                  <b>执行</b>
                  <strong>
                    {ended
                      ? "已结束"
                      : order.fulfillment === "RUNNING"
                        ? "执行中"
                        : "待使用"}
                  </strong>
                </span>
              </article>
              <article className={ended ? "stage-failed" : "stage-pending"}>
                <CloseCircleOutlined />
                <span>
                  <b>目标</b>
                  <strong>{ended ? "未达成" : "待核验"}</strong>
                </span>
              </article>
              <article className="stage-refund">
                <ClockCircleOutlined />
                <span>
                  <b>退款</b>
                  <strong>{refund ? "处理中" : "无退款"}</strong>
                </span>
              </article>
            </div>
            <Notice>
              {order.fulfillment === "AVAILABLE"
                ? "购买权益可用于一次完整服务，当前尚未使用。"
                : "权益已消耗，退款不会恢复一次使用。"}
            </Notice>
          </Panel>
          <Panel className="admin-order-events">
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                {
                  key: "contract",
                  label: "合同快照",
                  children: (
                    <div className="admin-contract-snapshot">
                      <h3>成交时固定的服务规则</h3>
                      <dl>
                        <dt>服务与版本</dt>
                        <dd>
                          {order.service} {order.version}
                        </dd>
                        <dt>价格方案</dt>
                        <dd>
                          PER_USE · {formatMinorUnits(order.amountMinor)} CNY /
                          次
                        </dd>
                        <dt>交付目标</dt>
                        <dd>
                          {order.bookingId
                            ? "指定参观日期及时段的预约核验结果"
                            : "清洗文件及统计摘要"}
                        </dd>
                        <dt>退款规则</dt>
                        <dd>目标未达成全退服务费</dd>
                        <dt>平台规则快照</dt>
                        <dd>v3 · 平台费率5%</dd>
                      </dl>
                    </div>
                  ),
                },
                {
                  key: "payment",
                  label: "支付事件",
                  children: (
                    <div className="admin-event-card">
                      <TileIcon name="payment" />
                      <div>
                        <h3>
                          支付 {refund?.paymentId || `PAY${order.id.slice(-3)}`}
                        </h3>
                        <p>
                          {formatMinorUnits(order.amountMinor)} CNY{" "}
                          <Status tone="green">支付成功</Status>
                        </p>
                        <small>已验签的示例支付回执</small>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "refund",
                  label: "退款事件",
                  children: refund ? (
                    <div className="admin-refund-event">
                      <div>
                        <TileIcon name="sync" />
                        <span>
                          <h3>退款 {refund.id}</h3>
                          <p>
                            金额 ·{" "}
                            {formatMinorUnits(refund.amountMinor).replace(
                              /\.00$/,
                              "",
                            )}{" "}
                            元　原路退回　<Status>待回执</Status>
                          </p>
                        </span>
                      </div>
                      <p>
                        <TileIcon name="payment" />
                        原支付　{refund.paymentId}
                        <Link to={`/admin/refunds/${refund.id}`}>
                          查看异常处理
                        </Link>
                      </p>
                    </div>
                  ) : (
                    <Empty description="当前订单暂无退款事件" />
                  ),
                },
                {
                  key: "fulfillment",
                  label: "履约链路",
                  children: (
                    <div className="admin-contract-snapshot">
                      <h3>一次完整服务</h3>
                      <p>权益 → 任务 → 运行 → 结果核验</p>
                      <p>
                        当前履约状态　
                        <Status>{fulfillmentLabels[order.fulfillment]}</Status>
                      </p>
                      {order.bookingId && (
                        <Link
                          to={`/admin/travel/unresolved?booking=${order.bookingId}`}
                        >
                          查看关联预约 {order.bookingId}
                        </Link>
                      )}
                    </div>
                  ),
                },
                {
                  key: "ledger",
                  label: "账本",
                  children: (
                    <div className="admin-contract-snapshot">
                      <h3>成交及退款账本</h3>
                      <p>服务实付　{formatMinorUnits(order.amountMinor)} CNY</p>
                      <p>
                        结算状态　
                        <Status
                          tone={
                            order.settlement === "FROZEN" ? "orange" : "gray"
                          }
                        >
                          {order.settlement === "FROZEN" ? "冻结" : "未结算"}
                        </Status>
                      </p>
                      <Link to="/admin/settlements">查看结算账本</Link>
                    </div>
                  ),
                },
              ]}
            />
          </Panel>
        </div>
        <Panel
          className="admin-diagnosis-form"
          title={
            <>
              <ToolOutlined />
              按范围排障
            </>
          }
        >
          <p>按对象与字段范围开启限时排障访问，过期自动失效。</p>
          <AdminDiagnosisForm resourceId={order.id} readOnly />
        </Panel>
      </div>
    </div>
  );
}
