import { App, Button, Empty, Form, Input, Select, Steps, Table } from "antd";
import { CalendarOutlined, DownloadOutlined } from "@ant-design/icons";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useWorkspace } from "../context";
import { usePrototype, type PreviewRefund } from "../prototype";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { formatMinorUnits } from "../lib/money";

const billFixtures = [
  {
    id: "booking",
    title: "景点预约",
    category: "预约",
    amountMinor: "800",
    channel: "示例渠道A",
    receipt: "WX****3921",
    orderId: "TT202611130027",
    date: "2026-11-13",
  },
  {
    id: "table",
    title: "表格清洗",
    category: "数据处理",
    amountMinor: "600",
    channel: "示例渠道B",
    receipt: "ALI****7845",
    orderId: "TT202611130018",
    date: "2026-11-13",
  },
  {
    id: "file",
    title: "文件处理",
    category: "文件工具",
    amountMinor: "300",
    channel: "示例渠道B",
    receipt: "WX****6607",
    orderId: "TT202611130025",
    date: "2026-11-12",
  },
];

export function BillsPage() {
  const { bootstrap } = useWorkspace();
  const { refunds } = usePrototype();
  const [search, setSearch] = useSearchParams();
  const range = search.get("date") || "all";
  const selected = search.get("order_id");
  const isPrototype = bootstrap.data_mode === "prototype";
  const all = isPrototype
    ? billFixtures.map((bill) => ({
        ...bill,
        refund: refunds.find((refund) => refund.orderId === bill.orderId),
      }))
    : [];
  const rows = all.filter((item) => range === "all" || item.date === range);
  const item = selected
    ? rows.find((row) => row.orderId === selected)
    : rows[0];
  const summary = [
    {
      icon: "payment",
      label: "总实付",
      amount: rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n),
      color: "blue",
    },
    {
      icon: "refund",
      label: "已退款",
      amount: rows.reduce(
        (sum, row) =>
          sum +
          (row.refund?.status === "SUCCEEDED"
            ? BigInt(row.refund.amountMinor)
            : 0n),
        0n,
      ),
      color: "green",
    },
    {
      icon: "clock",
      label: "退款处理中",
      amount: rows.reduce(
        (sum, row) =>
          sum +
          (row.refund?.status === "PROCESSING"
            ? BigInt(row.refund.amountMinor)
            : 0n),
        0n,
      ),
      color: "orange",
    },
  ];

  function exportBills() {
    const lines = [
      [
        "服务名称",
        "实付金额（元）",
        "支付渠道",
        "交易回执（掩码）",
        "支付状态",
        "退款状态",
        "日期",
      ],
      ...rows.map((row) => [
        row.title,
        formatMinorUnits(row.amountMinor),
        row.channel,
        row.receipt,
        "已支付",
        row.refund ? refundStatus(row.refund) : "无退款",
        row.date,
      ]),
    ];
    const content = "\ufeff" + lines.map((line) => line.join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "本人账单-原型示例.csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="bills-page">
      <PageHeading
        title="支付与账单"
        description="查看服务支付、退款及账单明细。"
        extra={
          <Status tone="gray">
            {isPrototype ? "本地示例" : "账单服务待接入"}
          </Status>
        }
      />
      {!isPrototype && (
        <Notice>账单服务待接入，实付与退款汇总暂不可用。</Notice>
      )}
      <div className="bill-summary">
        {summary.map(({ icon, label, amount, color }) => (
          <Panel key={label}>
            <TileIcon name={icon} color={color} />
            <div>
              <h3>{label}</h3>
              <strong>{isPrototype ? formatMinorUnits(amount) : "—"}</strong> 元
            </div>
          </Panel>
        ))}
      </div>
      <div className="bills-columns">
        <Panel className="bill-list">
          <div className="bill-filter">
            <span>时间筛选：</span>
            <Select
              aria-label="账单时间筛选"
              value={range}
              onChange={(date) => setSearch(date === "all" ? {} : { date })}
              prefix={<CalendarOutlined />}
              disabled={!isPrototype}
              options={[
                { value: "all", label: "全部时间" },
                { value: "2026-11-13", label: "2026-11-13" },
                { value: "2026-11-12", label: "2026-11-12" },
              ]}
            />
            <Button
              icon={<DownloadOutlined />}
              aria-label="导出本人账单"
              onClick={exportBills}
              disabled={!rows.length}
            >
              导出本人账单
            </Button>
          </div>
          <Table
            rowKey="id"
            pagination={false}
            dataSource={rows}
            rowClassName={(row) => (row.id === item?.id ? "selected-bill" : "")}
            scroll={{ x: 960 }}
            columns={[
              {
                title: "服务名称",
                width: 204,
                render: (_, row) => (
                  <b>
                    {row.title}{" "}
                    <Status tone={row.id === "table" ? "purple" : "blue"}>
                      {row.category}
                    </Status>
                  </b>
                ),
              },
              {
                title: "实付金额",
                dataIndex: "amountMinor",
                width: 124,
                render: (value: string) => <b>{formatMinorUnits(value)} 元</b>,
              },
              { title: "支付渠道", dataIndex: "channel", width: 124 },
              { title: "交易回执（掩码）", dataIndex: "receipt", width: 200 },
              { title: "支付状态", render: () => "已支付", width: 120 },
              {
                title: "退款状态",
                render: (_, row) =>
                  row.refund ? refundStatus(row.refund) : "无退款",
                width: 130,
              },
              {
                title: "",
                render: (_, row) => (
                  <Button
                    type="link"
                    onClick={() => {
                      const next = new URLSearchParams(search);
                      next.set("order_id", row.orderId);
                      setSearch(next);
                    }}
                  >
                    详情
                  </Button>
                ),
              },
            ]}
          />
        </Panel>
        <Panel className="bill-detail">
          {item ? (
            <>
              <h2>交易详情</h2>
              <dl>
                <dt>服务名称</dt>
                <dd>
                  <b>{item.title}</b> <Status>{item.category}</Status>
                </dd>
                <dt>原服务订单</dt>
                <dd>{item.orderId}</dd>
                <dt>实付金额</dt>
                <dd>
                  <strong>{formatMinorUnits(item.amountMinor)}</strong> 元
                </dd>
                <dt>支付渠道</dt>
                <dd>{item.channel}</dd>
                <dt>交易回执</dt>
                <dd>{item.receipt}</dd>
              </dl>
              <hr />
              <h2>费用明细</h2>
              <div className="bill-fees">
                <p>
                  服务费 <b>{formatMinorUnits(item.amountMinor)} 元</b>
                </p>
                {item.id === "booking" && (
                  <p>
                    门票 <b>0.00 元</b>
                  </p>
                )}
                <p>
                  退服务费{" "}
                  <b>
                    {formatMinorUnits(
                      item.refund?.status === "SUCCEEDED"
                        ? item.refund.amountMinor
                        : "0",
                    )}{" "}
                    元
                  </b>
                </p>
                {item.refund && (
                  <Link to={`/me/refunds/${item.refund.id}`}>
                    {refundStatus(item.refund)} · 查看退款
                  </Link>
                )}
              </div>
            </>
          ) : (
            <Empty
              description={
                selected
                  ? "该订单的账单尚未载入或不在所选日期范围内"
                  : "暂无交易明细"
              }
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

export function refundStatus(refund: PreviewRefund) {
  return refund.status === "SUCCEEDED"
    ? "已退款"
    : refund.status === "PROCESSING"
      ? "退款处理中"
      : "申请已记录（预览）";
}

export function RefundsPage() {
  const { bootstrap } = useWorkspace();
  const { refunds, requestRefund } = usePrototype();
  const navigate = useNavigate();
  const { modal, message } = App.useApp();
  const [params] = useSearchParams();
  const requestedOrder = params.get("order_id") || params.get("order");
  const isPrototype = bootstrap.data_mode === "prototype";
  const eligible =
    isPrototype && (!requestedOrder || requestedOrder === "TT202611130028");
  function submit(values: {
    orderId: string;
    reason: string;
    description?: string;
  }) {
    modal.confirm({
      title: "确认退款申请",
      content:
        "原型预览将记录8.00元退款申请。渠道退款及资金回执需要接入后端服务。",
      okText: "记录申请",
      cancelText: "返回修改",
      onOk() {
        try {
          const refund = requestRefund(
            values.orderId,
            values.reason,
            values.description,
          );
          navigate(`/me/refunds/${refund.id}`);
        } catch (error) {
          void message.error((error as Error).message);
        }
      },
    });
  }
  return (
    <div className="refunds-page">
      <PageHeading
        title="退款与售后"
        description="查看订单的退款进度，提交退款申请并了解可退款规则。"
        extra={
          <Status tone="gray">
            {isPrototype ? "本地示例" : "退款服务待接入"}
          </Status>
        }
      />
      {!isPrototype && (
        <Notice>退款服务待接入，订单规则与可退金额暂不可用。</Notice>
      )}
      <div className="refunds-columns">
        <Panel className="refunds-list">
          <Table
            rowKey="id"
            dataSource={refunds}
            pagination={false}
            scroll={{ x: 960 }}
            columns={[
              { title: "订单", dataIndex: "orderId" },
              {
                title: "服务",
                dataIndex: "service",
                render: (value) => <Status>{value}</Status>,
              },
              { title: "原因", dataIndex: "reason" },
              {
                title: "申请金额",
                dataIndex: "amountMinor",
                render: (value: string) => `¥ ${formatMinorUnits(value)}`,
              },
              {
                title: "状态",
                render: (_, row) => (
                  <Status
                    tone={row.status === "SUCCEEDED" ? "green" : "orange"}
                  >
                    {refundStatus(row)}
                  </Status>
                ),
              },
              { title: "时间", dataIndex: "createdAt" },
              {
                title: "详情",
                render: (_, row) => (
                  <Link to={`/me/refunds/${row.id}`}>查看详情 ›</Link>
                ),
              },
            ]}
          />
        </Panel>
        <Panel title="申请退款" className="refund-application">
          <Form
            key={requestedOrder || "default"}
            layout="vertical"
            requiredMark={false}
            disabled={!eligible}
            initialValues={
              isPrototype
                ? {
                    orderId: requestedOrder || "TT202611130028",
                    reason: "目标未达",
                  }
                : {}
            }
            onFinish={submit}
          >
            <Form.Item
              name="orderId"
              label="选择订单"
              rules={[{ required: true }]}
            >
              <Select
                options={
                  eligible
                    ? [
                        {
                          value: "TT202611130028",
                          label: "TT202611130028 · 景点预约 · ¥8.00",
                        },
                      ]
                    : requestedOrder
                      ? [
                          {
                            value: requestedOrder,
                            label: `${requestedOrder} · 可退金额待核对`,
                          },
                        ]
                      : []
                }
              />
            </Form.Item>
            {eligible ? (
              <Notice>
                <div>
                  <b>成交规则</b>
                  <p>目标未达成全退服务费，以原订单约定的目标为准。</p>
                  <b>
                    可退金额　<span className="price">¥8.00</span>
                  </b>
                </div>
              </Notice>
            ) : (
              <Notice>当前订单的成交规则、已交付量与可退金额待载入。</Notice>
            )}
            <Form.Item
              name="reason"
              label="退款原因"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: "目标未达" },
                  { value: "未使用" },
                  { value: "其他" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="description"
              label="补充说明（可选）"
              rules={[{ max: 200 }]}
            >
              <Input.TextArea
                placeholder="请输入说明，便于更好地处理退款申请"
                rows={4}
                maxLength={200}
                showCount
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block disabled={!eligible}>
              提交退款
            </Button>
          </Form>
        </Panel>
      </div>
    </div>
  );
}

export function RefundDetailPage() {
  const { id } = useParams();
  const { refunds } = usePrototype();
  const { message } = App.useApp();
  const refund = refunds.find(
    (item) => item.id === (id === "demo" ? "REF018" : id),
  );
  if (!refund) return <Empty description="退款申请不存在或已失效" />;
  const current =
    refund.status === "SUCCEEDED" ? 5 : refund.status === "PROCESSING" ? 3 : 0;
  return (
    <div className="refund-detail-page">
      <PageHeading
        title="退款详情"
        extra={<Status tone="gray">本地示例</Status>}
      />
      <div className="refund-detail-banner">
        <TileIcon name="refund" color="gradient" />
        <div>
          <h2>
            {refund.id.startsWith("PREVIEW") ? "退款申请预览" : refund.id}{" "}
            {refund.service}
          </h2>
          <strong>¥{formatMinorUnits(refund.amountMinor)}</strong>
        </div>
        <div>
          <p>退款状态</p>
          <Status tone={refund.status === "SUCCEEDED" ? "green" : "blue"}>
            {refund.status === "PROCESSING"
              ? "渠道退款处理中"
              : refundStatus(refund)}
          </Status>
        </div>
      </div>
      <Panel className="refund-progress-panel">
        <Steps
          titlePlacement="vertical"
          current={current}
          items={[
            "提交申请",
            "规则匹配",
            "退款请求已发送",
            "等待渠道确认",
            "退款到账",
          ].map((title, index) => ({
            title,
            icon: (
              <span
                aria-hidden
                className={`refund-step-marker ${index < current ? "is-finished" : index === current ? "is-current" : ""}`}
              >
                {index < current ? "✓" : ""}
              </span>
            ),
          }))}
        />
        <div className="refund-facts">
          <div>
            <TileIcon name="file" />
            <b>退款规则</b>
            <span>
              {refund.ruleSnapshot
                ? `已固定规则　${refund.ruleSnapshot}`
                : "原订单退款规则待载入"}
            </span>
          </div>
          <div>
            <TileIcon name="flag" />
            <b>执行结果</b>
            <span>{refund.executionResult || "执行结果待载入"}</span>
          </div>
          <div>
            <TileIcon name="link" />
            <b>关联原订单</b>
            <span>
              <Link
                to={`/me/bills?order_id=${encodeURIComponent(refund.orderId)}`}
              >
                {refund.orderId} {refund.service}
              </Link>
            </span>
          </div>
        </div>
        {refund.description && (
          <div className="refund-description">
            <b>补充说明</b>
            <p>{refund.description}</p>
          </div>
        )}
        <div className="refund-facts refund-delivery-facts">
          <div>
            <TileIcon name="payment" />
            <b>退款方式</b>
            <span>原路退回</span>
          </div>
          <div>
            <TileIcon name="info" />
            <b>到账说明</b>
            <span>
              {refund.status === "SUCCEEDED"
                ? "渠道回执已确认退款到账。"
                : refund.status === "PROCESSING"
                  ? "退款请求已提交至渠道，尚未到账，到账时间由支付渠道处理进度决定。"
                  : "申请已记录到前端预览，等待接入退款服务及渠道回执。"}
            </span>
          </div>
        </div>
        <Button
          type="primary"
          size="large"
          onClick={() =>
            void message.info(
              refund.status === "SUCCEEDED"
                ? "原型回执显示已退款"
                : "退款渠道尚未接通，当前进度保持不变",
            )
          }
        >
          查询进度
        </Button>
      </Panel>
    </div>
  );
}
