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
import dayjs, { type Dayjs } from "dayjs";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useAdminPreview, type AdminOrder } from "../admin-preview";
import { formatMinorUnits } from "../lib/money";
import {
  orderRefundStatus,
  paymentLabels,
  refundLabels,
  refundTones,
} from "../lib/admin-commerce-preview";
import { AdminDiagnosisForm } from "../components/AdminDiagnosisForm";

const fulfillmentLabels = {
  AVAILABLE: "待使用",
  RUNNING: "履约中",
  UNMET: "目标未达",
};

interface OrderFilters {
  id?: string;
  buyer?: string;
  service?: string;
  bookingId?: string;
  dates?: [Dayjs, Dayjs] | null;
}

export function AdminOrdersPage() {
  const [params] = useSearchParams();
  return <AdminOrderList key={params.toString()} />;
}

function AdminOrderList() {
  const { orders, payments, refunds, enabled } = useAdminPreview();
  const [params, setParams] = useSearchParams();
  const [form] = Form.useForm<OrderFilters>();
  const start = params.get("start") || "";
  const end = params.get("end") || "";
  const validDates = (!start && !end) || (
    [start, end].every((value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      dayjs(value).isValid() && dayjs(value).format("YYYY-MM-DD") === value,
    ) && start <= end
  );
  const filters: OrderFilters = {
    id: params.get("order") || "",
    buyer: params.get("buyer") || "",
    service: params.get("service") || undefined,
    bookingId: params.get("booking") || "",
    dates: start && end && validDates ? [dayjs(start), dayjs(end)] : undefined,
  };
  function apply(values: OrderFilters) {
    const next = new URLSearchParams(params);
    const entries = {
      order: values.id?.trim(), buyer: values.buyer?.trim(),
      service: values.service, booking: values.bookingId?.trim(),
      start: values.dates?.[0].format("YYYY-MM-DD"),
      end: values.dates?.[1].format("YYYY-MM-DD"),
    };
    for (const [key, value] of Object.entries(entries)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }
  const globalQuery = params.get("q")?.trim() || "";
  const rows = orders.filter((row) =>
    validDates &&
    [row.id, row.buyer, row.service, row.bookingId || ""].some((value) =>
      value.includes(globalQuery),
    ) &&
    row.id.includes(filters.id?.trim() || "") &&
    row.buyer.includes(filters.buyer?.trim() || "") &&
    (!filters.service || row.service === filters.service) &&
    (row.bookingId || "").includes(filters.bookingId?.trim() || "") &&
    (!start || (row.date >= start && row.date <= end)),
  );
  return (
    <div className="admin-page admin-orders-page">
      <PageHeading title="服务订单" extra={<Status tone="gray">{enabled ? "本地示例" : "订单服务待接入"}</Status>} />
      {!enabled && <Notice>平台订单查询服务待接入，当前记录暂不可用。</Notice>}
      {!validDates && <Notice>日期筛选无效，请重新选择完整日期范围。</Notice>}
      {globalQuery && (
        <p className="admin-global-query">
          全局检索 · {globalQuery}
          <Button type="link" onClick={() => {
            const next = new URLSearchParams(params);
            next.delete("q");
            setParams(next);
          }}>
            清除检索
          </Button>
        </p>
      )}
      <Panel className="admin-order-filters">
        <Form
          form={form}
          layout="vertical"
          initialValues={filters}
          disabled={!enabled}
          onFinish={apply}
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
                const next = new URLSearchParams(params);
                for (const key of ["order", "buyer", "service", "booking", "start", "end", "q"])
                  next.delete(key);
                setParams(next);
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
          scroll={{ x: 1524 }}
          columns={[
            { title: "订单号", dataIndex: "id", width: 195 },
            {
              title: "关联预约编号",
              dataIndex: "bookingId",
              width: 190,
              render: (value) =>
                value ? (
                  <Link to={`/admin/travel/unresolved?booking=${value}`}>
                    <Status>{value}</Status>
                  </Link>
                ) : (
                  <Status tone="gray">—</Status>
                ),
            },
            { title: "用户", dataIndex: "buyer", width: 106 },
            { title: "服务", dataIndex: "service", width: 143 },
            {
              title: "金额",
              width: 99,
              dataIndex: "amountMinor",
              render: (value) =>
                `${formatMinorUnits(value).replace(/\.00$/, "")} 元`,
            },
            {
              title: "付款状态",
              width: 142,
              render: (_, row) => {
                const payment = payments.find((item) => item.id === row.paymentId);
                return <Status tone={payment?.status === "SUCCEEDED" ? "green" : "orange"}>
                  {payment ? paymentLabels[payment.status] : "待载入"}
                </Status>;
              },
            },
            {
              title: "履约状态",
              width: 148,
              dataIndex: "fulfillment",
              render: (value: AdminOrder["fulfillment"]) => (
                <Status tone={value === "UNMET" ? "red" : "blue"}>
                  {fulfillmentLabels[value]}
                </Status>
              ),
            },
            {
              title: "退款状态",
              width: 150,
              render: (_, row) => {
                const status = orderRefundStatus(refunds.filter((item) => item.paymentId === row.paymentId));
                return <Status tone={status ? refundTones[status] : "gray"}>
                  {status ? `退款${refundLabels[status]}` : "无退款"}
                </Status>;
              },
            },
            {
              title: "结算状态",
              width: 139,
              render: (_, row) => (
                <Status tone={row.settlement === "FROZEN" ? "orange" : "gray"}>
                  {row.settlement === "FROZEN" ? "冻结" : "未结算"}
                </Status>
              ),
            },
            {
              title: "操作",
              width: 212,
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
  return <AdminOrderDetail key={id} id={id} />;
}

function AdminOrderDetail({ id }: { id?: string }) {
  const { orders, payments, refunds, enabled } = useAdminPreview();
  const [params, setParams] = useSearchParams();
  const selectedTab = params.get("tab") || "refund";
  const tab = ["contract", "payment", "refund", "fulfillment", "ledger"].includes(selectedTab)
    ? selectedTab
    : "refund";
  const order = orders.find(
    (item) => item.id === (id === "demo" ? "TT202611130027" : id),
  );
  if (!order)
    return (
      <Empty description={enabled ? "服务订单不存在或已失效" : "订单详情服务待接入，当前记录暂不可用"}>
        <Link to="/admin/orders">
          <Button>返回服务订单</Button>
        </Link>
      </Empty>
    );
  const payment = payments.find((item) => item.id === order.paymentId);
  const orderRefunds = refunds.filter((item) => item.paymentId === order.paymentId);
  const refundStatus = orderRefundStatus(orderRefunds);
  const execution = { NOT_STARTED: "待使用", RUNNING: "执行中", FINISHED: "已结束" };
  const goal = { PENDING: "待核验", UNKNOWN: "待核验", UNMET: "未达成", MET: "已达成" };
  return (
    <div className="admin-page admin-order-detail-page">
      <PageHeading title="服务订单详情" extra={<Status tone="gray">本地示例</Status>} />
      <div className="admin-order-detail-grid">
        <div>
          <div className="admin-order-hero">
            <TileIcon
              name={order.bookingId ? "ticket" : "table"}
              color="gradient"
            />
            <div>
              <h2>服务单 {order.id}</h2>
              <p>
                {order.service}固定 <Status>{order.version}</Status>
                {order.contract.ticketAmountMinor !== undefined && <span>
                  门票 · {formatMinorUnits(order.contract.ticketAmountMinor).replace(/\.00$/, "")} 元
                </span>}
              </p>
            </div>
            <div className="order-hero-amount">
              <Status tone={payment?.status === "SUCCEEDED" ? "green" : "orange"}>
                {payment ? paymentLabels[payment.status] : "待载入"}
              </Status>
              <strong>
                {formatMinorUnits(order.amountMinor).replace(/\.00$/, "")}{" "}
                <small>元</small>
              </strong>
            </div>
          </div>
          <Panel className="admin-order-stages">
            <div>
              <article className={payment?.status === "SUCCEEDED" ? undefined : "stage-pending"}>
                <CheckCircleOutlined />
                <span>
                  <b>支付</b>
                  <strong>{payment ? paymentLabels[payment.status] : "待载入"}</strong>
                </span>
              </article>
              <article>
                <PlayCircleOutlined />
                <span>
                  <b>执行</b>
                  <strong>
                    {execution[order.execution]}
                  </strong>
                </span>
              </article>
              <article className={
                order.goal === "UNMET"
                  ? "stage-failed"
                  : order.goal === "MET" ? undefined : "stage-pending"
              }>
                {order.goal === "MET" ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                <span>
                  <b>目标</b>
                  <strong>{goal[order.goal]}</strong>
                </span>
              </article>
              <article className={refundStatus === "SUCCEEDED" ? undefined : "stage-refund"}>
                <ClockCircleOutlined />
                <span>
                  <b>退款</b>
                  <strong>{refundStatus ? refundLabels[refundStatus] : "无退款"}</strong>
                </span>
              </article>
            </div>
            <Notice>
              {order.entitlement === "AVAILABLE"
                ? "购买权益可用于一次完整服务，当前尚未使用。"
                : "权益已消耗，退款不会恢复一次使用。"}
            </Notice>
          </Panel>
          <Panel className="admin-order-events">
            <Tabs
              activeKey={tab}
              onChange={(value) => {
                const next = new URLSearchParams(params);
                next.set("tab", value);
                setParams(next);
              }}
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
                          v{order.contract.pricePlanVersion} · PER_USE · {formatMinorUnits(order.amountMinor)} CNY /
                          次
                        </dd>
                        <dt>交付目标</dt>
                        <dd>{order.contract.goal}</dd>
                        <dt>退款规则</dt>
                        <dd>{order.contract.refundRule === "FULL_IF_UNMET" ? "目标未达成全退服务费" : "按约交付但目标未达不退服务费"}</dd>
                        <dt>平台规则快照</dt>
                        <dd>v{order.contract.commercePolicyVersion} · 平台费率{order.contract.feeBasisPoints / 100}%</dd>
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
                          <Link to={`/admin/payments?tab=payments&payment=${order.paymentId}`}>
                            支付 {order.paymentId}
                          </Link>
                        </h3>
                        <p>
                          {payment ? `${formatMinorUnits(payment.amountMinor)} CNY` : "金额待载入"}{" "}
                          <Status tone={payment?.status === "SUCCEEDED" ? "green" : "orange"}>
                            {payment ? paymentLabels[payment.status] : "待载入"}
                          </Status>
                        </p>
                        <small>{payment?.status === "SUCCEEDED" ? "已验签的示例支付回执" : "渠道事实待核验"}</small>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "refund",
                  label: "退款事件",
                  children: orderRefunds.length ? orderRefunds.map((refund) => (
                    <div key={refund.id} className="admin-refund-event">
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
                            元　原路退回　
                            <Status tone={refundTones[refund.status]}>
                              {refund.status === "PROCESSING" ? "待回执" : refundLabels[refund.status]}
                            </Status>
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
                  )) : (
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
                      <Notice>当前订单的结算账本查询服务待接入。</Notice>
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
