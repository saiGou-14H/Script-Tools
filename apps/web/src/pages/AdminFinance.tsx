import { useRef, useState } from "react";
import {
  App,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tabs,
} from "antd";
import { BookOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Link, useParams } from "react-router-dom";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useAdminPreview, type AdminRefund } from "../admin-preview";
import { formatMinorUnits } from "../lib/money";

const refundLabels = {
  UNKNOWN: "待核对",
  PROCESSING: "处理中",
  SUCCEEDED: "已到账",
};
const refundTones = {
  UNKNOWN: "orange",
  PROCESSING: "blue",
  SUCCEEDED: "green",
} as const;

export function AdminPaymentsPage() {
  const { refunds } = useAdminPreview();
  const [tab, setTab] = useState("refunds");
  const { message, modal } = App.useApp();
  const isRefund = tab === "refunds";
  return (
    <div className="admin-page admin-payments-page">
      <PageHeading title="支付与退款" />
      <Panel className="admin-payment-summary">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "payments", label: "收款" },
            { key: "refunds", label: "退款" },
          ]}
        />
        <div className="admin-finance-stats">
          {(["UNKNOWN", "PROCESSING", "SUCCEEDED"] as const).map(
            (status, index) => (
              <article key={status} className={`finance-stat-${index}`}>
                <h3>
                  {isRefund
                    ? refundLabels[status]
                    : ["待核对", "处理中", "已收款"][index]}
                </h3>
                <strong>
                  {isRefund
                    ? refunds.filter((item) => item.status === status).length
                    : status === "SUCCEEDED"
                      ? refunds.length
                      : 0}
                </strong>
              </article>
            ),
          )}
        </div>
      </Panel>
      <Panel className="admin-payment-table">
        <Table<AdminRefund>
          rowKey="id"
          dataSource={refunds}
          pagination={false}
          columns={[
            {
              title: isRefund ? "退款编号" : "支付编号",
              render: (_, row) => (isRefund ? row.id : row.paymentId),
            },
            {
              title: isRefund ? "原支付编号" : "渠道",
              render: (_, row) => (isRefund ? row.paymentId : "示例渠道A"),
            },
            {
              title: "金额",
              dataIndex: "amountMinor",
              render: (value) => `${formatMinorUnits(value)} CNY`,
            },
            {
              title: "渠道请求",
              render: (_, row) =>
                `${isRefund ? "RF" : "PAY"}••${row.id.slice(-3)}`,
            },
            {
              title: "状态",
              render: (_, row) => (
                <Status tone={isRefund ? refundTones[row.status] : "green"}>
                  {isRefund ? refundLabels[row.status] : "已收款"}
                </Status>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <Button
                  type="link"
                  onClick={() => {
                    if (!isRefund || row.status === "SUCCEEDED") {
                      modal.info({
                        title: "示例渠道回执",
                        content: (
                          <div>
                            <p>
                              {isRefund ? row.id : row.paymentId} ·{" "}
                              {formatMinorUnits(row.amountMinor)} CNY
                            </p>
                            <p>状态 · {isRefund ? "退款已到账" : "支付成功"}</p>
                            <small>本地原型回执，用于页面验证。</small>
                          </div>
                        ),
                        okText: "关闭",
                      });
                    } else
                      void message.info(
                        `渠道查询接口尚未接入，${row.id}仍待原回执核验`,
                      );
                  }}
                >
                  {isRefund
                    ? row.status === "UNKNOWN"
                      ? "查询原退款"
                      : row.status === "PROCESSING"
                        ? "查询进度"
                        : "查看回执"
                    : "查看回执"}
                </Button>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

export function AdminRefundExceptionPage() {
  const { id } = useParams();
  const { refunds, notes, recordNote } = useAdminPreview();
  const [tab, setTab] = useState("evidence");
  const [editing, setEditing] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const refund = refunds.find(
    (item) => item.id === (id === "demo" ? "REF019" : id),
  );
  if (!refund)
    return (
      <Empty description="退款记录不存在或已失效">
        <Link to="/admin/payments">
          <Button>返回支付与退款</Button>
        </Link>
      </Empty>
    );
  const completed = refund.status === "SUCCEEDED";
  const recordRows = notes.filter((item) => item.resourceId === refund.id);
  return (
    <div className="admin-page admin-refund-exception-page">
      <PageHeading title="退款异常处理" />
      <Panel className="admin-refund-hero">
        <div>
          <TileIcon name="refund" />
          <span>
            <h2>
              退款 {refund.id} 渠道 {refund.status}
            </h2>
            <p>上次请求 · {refund.requestedAt}　•　成交目标未达全退</p>
          </span>
          <div>
            <strong>¥{formatMinorUnits(refund.amountMinor)}</strong>
            <Status
              tone={
                completed
                  ? "green"
                  : refund.status === "UNKNOWN"
                    ? "red"
                    : "blue"
              }
            >
              {completed
                ? "退款已到账"
                : refund.status === "UNKNOWN"
                  ? "退款异常"
                  : "退款处理中"}
            </Status>
          </div>
        </div>
      </Panel>
      <div className="admin-refund-content">
        <Panel title="退款规则" className="admin-refund-rules">
          <ul>
            <li>成交规则 · 目标未达成全退服务费（订单快照）</li>
            <li>仅退还实际支付金额，按照原支付渠道原路退回。</li>
            <li>退款金额不得超过原支付金额。</li>
            <li>预占金额用于处理中的退款，剩余可退为实际可发起的金额。</li>
          </ul>
        </Panel>
        <Panel title="退款金额状态" className="admin-refund-balances">
          <div>
            {[
              ["已退", completed ? refund.amountMinor : "0"],
              ["预占", completed ? "0" : refund.amountMinor],
              ["剩余可退", "0"],
            ].map(([label, amount]) => (
              <article key={label}>
                {label}
                <strong>¥{formatMinorUnits(amount)}</strong>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="原支付信息" className="admin-refund-payment">
          <dl>
            <dt>支付渠道</dt>
            <dd>
              <Status>示例渠道A</Status>
            </dd>
            <dt>支付编号</dt>
            <dd>{refund.paymentId}</dd>
            <dt>支付金额</dt>
            <dd>¥{formatMinorUnits(refund.amountMinor)}</dd>
            <dt>支付状态</dt>
            <dd>
              <Status tone="green">支付成功</Status>
            </dd>
          </dl>
        </Panel>
        <Panel title="可执行操作" className="admin-refund-actions">
          <div className="row-actions">
            <Button
              type="primary"
              icon={<SearchOutlined aria-hidden="true" />}
              onClick={() =>
                void message.info(
                  completed
                    ? `${refund.id}的示例回执已确认到账`
                    : `渠道查询接口尚未接入，${refund.id}仍待原回执核验`,
                )
              }
            >
              查询原退款
            </Button>
            <Button
              icon={<BookOutlined aria-hidden="true" />}
              disabled={completed}
              onClick={() => {
                requestKey.current = crypto.randomUUID();
                form.resetFields();
                setEditing(true);
              }}
            >
              记录处理理由
            </Button>
          </div>
          <Notice>
            请先查询原退款确认当前状态，并记录处理理由。金额与到账状态以渠道回执为准。
          </Notice>
        </Panel>
      </div>
      <Panel title="证据与处理记录" className="admin-refund-evidence">
        <Tabs
          type="card"
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "evidence",
              label: "证据材料",
              children: (
                <Table
                  rowKey="id"
                  pagination={false}
                  dataSource={[{ id: "1" }]}
                  columns={[
                    { title: "序号", dataIndex: "id", width: 100 },
                    { title: "材料名称", render: () => "渠道核验记录" },
                    { title: "类型", render: () => <Status>核验记录</Status> },
                    {
                      title: "说明",
                      render: () =>
                        completed
                          ? "已保存示例退款到账回执。"
                          : "外部查询已确认目标未达成；退款结果仍待查询。",
                    },
                  ]}
                />
              ),
            },
            {
              key: "records",
              label: "处理记录",
              children: (
                <Table
                  rowKey="id"
                  pagination={false}
                  dataSource={recordRows}
                  locale={{ emptyText: "暂无处理记录" }}
                  columns={[
                    { title: "时间", dataIndex: "createdAt", width: 200 },
                    { title: "处理理由（本地预览）", dataIndex: "reason" },
                  ]}
                />
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        forceRender
        title="记录处理理由"
        open={editing}
        onCancel={() => setEditing(false)}
        okText="保存处理预览"
        cancelText="返回"
        onOk={() => form.submit()}
      >
        <Notice>
          本地记录用于页面预览，退款金额和渠道状态以原回执核验为准。
        </Notice>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            recordNote(refund.id, values.reason, requestKey.current);
            setEditing(false);
            setTab("records");
            void message.success("处理理由预览已保存");
          }}
        >
          <Form.Item
            name="reason"
            label="处理理由"
            rules={[
              { required: true, whitespace: true, message: "请填写处理理由" },
            ]}
          >
            <Input.TextArea
              maxLength={200}
              rows={4}
              showCount
              onChange={() => {
                requestKey.current = crypto.randomUUID();
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

const reconciliationRows = [
  {
    id: "PAY021",
    description: "订单取消后晚到成功",
    result: "已原路退款",
    resolved: true,
    kind: "payment",
  },
  {
    id: "PAY022",
    description: "同一订单第二笔真实收款",
    result: "额外款已退款",
    resolved: true,
    kind: "payment",
  },
  {
    id: "REF019",
    description: "渠道结果未知",
    result: "原退款待查询",
    resolved: false,
    kind: "refund",
  },
];
export function AdminReconciliationPage() {
  const { enabled, notes, recordNote } = useAdminPreview();
  const [date, setDate] = useState<dayjs.Dayjs | null>(dayjs("2026-11-13"));
  const [channel, setChannel] = useState("A");
  const [editing, setEditing] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const { message, modal } = App.useApp();
  const rows =
    enabled &&
    (!date || date.format("YYYY-MM-DD") === "2026-11-13") &&
    (channel === "A" || channel === "ALL")
      ? reconciliationRows
      : [];
  return (
    <div className="admin-page admin-reconciliation-page">
      <PageHeading
        title="对账中心"
        description="核对渠道收款、退款与打款的一致性，定位并跟进差异，确保资金数据准确。"
      />
      <Panel>
        <div className="admin-reconciliation-toolbar">
          <DatePicker
            aria-label="对账日期"
            allowClear
            value={date}
            onChange={setDate}
          />
          <Select
            aria-label="对账渠道"
            value={channel}
            onChange={setChannel}
            options={[
              { value: "A", label: "示例渠道A" },
              { value: "ALL", label: "全部渠道" },
            ]}
          />
          <div className="row-actions">
            <Button
              type="primary"
              disabled={!enabled}
              onClick={() => {
                form.resetFields();
                requestKey.current = crypto.randomUUID();
                setEditing(true);
              }}
            >
              启动对账
            </Button>
            <Button onClick={() => setRecordsOpen(true)}>查看核对记录</Button>
            <Link to="/admin/refunds/REF019">
              <Button disabled={!rows.some((item) => item.id === "REF019")}>
                查询原退款
              </Button>
            </Link>
          </div>
        </div>
        <div className="admin-reconciliation-stats">
          {[
            [
              "payment",
              "收款差异",
              rows.filter((item) => item.kind === "payment").length,
              "red",
            ],
            [
              "refund",
              "退款差异",
              rows.filter((item) => item.kind === "refund").length,
              "orange",
            ],
            ["sync", "打款差异", 0, "green"],
          ].map(([icon, label, count, color]) => (
            <article key={String(label)} className={`reconciliation-${color}`}>
              <TileIcon name={String(icon)} color={String(color)} />
              <span>
                <h3>{label}</h3>
                <strong>{count}</strong>
              </span>
            </article>
          ))}
        </div>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          columns={[
            {
              title: "编号",
              dataIndex: "id",
              width: 200,
              render: (id: string, row) =>
                row.kind === "refund" ? (
                  <Link to={`/admin/refunds/${id}`}>
                    <Status>{id}</Status>
                  </Link>
                ) : (
                  <Button
                    type="text"
                    onClick={() =>
                      modal.info({
                        title: `${id}核对记录`,
                        content: (
                          <p>
                            {row.description}，{row.result}
                            。此处为历史示例回执。
                          </p>
                        ),
                        okText: "关闭",
                      })
                    }
                  >
                    <Status>{id}</Status>
                  </Button>
                ),
            },
            { title: "差异说明", dataIndex: "description" },
            { title: "处理结果", dataIndex: "result" },
            {
              title: "状态",
              render: (_, row) => (
                <Status tone={row.resolved ? "green" : "orange"}>
                  {row.resolved ? "已解决" : "待处理"}
                </Status>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        forceRender
        title="启动对账预览"
        open={editing}
        onCancel={() => setEditing(false)}
        onOk={() => form.submit()}
        okText="记录核对预览"
        cancelText="返回"
      >
        <Notice>按原交易号核查渠道回执，资金状态通过渠道接口核验。</Notice>
        <p>
          {date?.format("YYYY-MM-DD") || "全部日期"} ·{" "}
          {channel === "A" ? "示例渠道A" : "全部渠道"}
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            recordNote("RECONCILIATION", values.reason, requestKey.current);
            setEditing(false);
            void message.info("核对预览已记录，渠道查询接口尚未接入");
          }}
        >
          <Form.Item
            label="核对理由"
            name="reason"
            rules={[
              { required: true, whitespace: true, message: "请填写核对理由" },
            ]}
          >
            <Input.TextArea maxLength={200} rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        forceRender
        title="核对记录"
        open={recordsOpen}
        onCancel={() => setRecordsOpen(false)}
        footer={<Button onClick={() => setRecordsOpen(false)}>关闭记录</Button>}
      >
        <Table
          rowKey="id"
          pagination={false}
          dataSource={notes.filter(
            (item) => item.resourceId === "RECONCILIATION",
          )}
          columns={[
            { title: "时间", dataIndex: "createdAt" },
            { title: "本地预览理由", dataIndex: "reason" },
          ]}
        />
      </Modal>
    </div>
  );
}

const settlementBatches = [
  {
    id: "SET017",
    payoutId: "PO017",
    status: "SUCCEEDED",
    amountMinor: "4000",
    income: "4400",
    fee: "400",
    refund: "0",
  },
  {
    id: "SET018",
    payoutId: "PO018",
    status: "PROCESSING",
    amountMinor: "20000",
    income: "23000",
    fee: "2000",
    refund: "1000",
  },
];
export function AdminSettlementsPage() {
  const { enabled } = useAdminPreview();
  const [selectedId, setSelectedId] = useState("SET018");
  const [generating, setGenerating] = useState(false);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const rows = enabled ? settlementBatches : [];
  const selected = rows.find((item) => item.id === selectedId);
  const net = selected
    ? BigInt(selected.income) - BigInt(selected.fee) - BigInt(selected.refund)
    : 0n;
  return (
    <div className="admin-page admin-settlements-page">
      <PageHeading title="发布者结算" />
      <div className="admin-settlement-hero">
        <TileIcon name="database" color="gradient" />
        <h2>
          批次 · {selected?.id || "—"}　 |　 发布者 · {enabled ? "林**" : "—"}
        </h2>
        <div>
          {[
            ["待结算", enabled ? "30000" : "0"],
            ["打款在途", enabled ? "20000" : "0"],
            ["退款冻结", "0"],
          ].map(([label, amount]) => (
            <article key={label}>
              {label}
              <strong>
                {formatMinorUnits(amount).replace(/\.00$/, "")}{" "}
                <small>元</small>
              </strong>
            </article>
          ))}
        </div>
      </div>
      <div className="admin-settlement-toolbar">
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden="true" />}
          disabled={!enabled}
          onClick={() => {
            form.resetFields();
            setGenerating(true);
          }}
        >
          生成批次
        </Button>
        <Button
          icon={<BookOutlined aria-hidden="true" />}
          onClick={() =>
            document
              .getElementById("admin-settlement-ledger")
              ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
          }
        >
          查看账本
        </Button>
        <Button
          icon={<SearchOutlined aria-hidden="true" />}
          disabled={!selected}
          onClick={() => {
            if (selected?.status === "SUCCEEDED")
              modal.info({
                title: "历史打款回执",
                content: (
                  <p>
                    {selected.payoutId} ·{" "}
                    {formatMinorUnits(selected.amountMinor)}{" "}
                    CNY，已到账。收款账号快照 · ****1234。
                  </p>
                ),
                okText: "关闭",
              });
            else
              void message.info(
                `${selected?.payoutId || "打款"}的查询接口尚未接入，打款状态仍为处理中`,
              );
          }}
        >
          查询原回执
        </Button>
        <Notice>在途批次按原打款请求核验。</Notice>
      </div>
      <div className="admin-settlement-columns">
        <Panel title="结算批次列表">
          <Table
            rowKey="id"
            dataSource={rows}
            pagination={false}
            rowClassName={(row) =>
              row.id === selectedId ? "selected-row" : ""
            }
            onRow={(row) => ({ onClick: () => setSelectedId(row.id) })}
            columns={[
              {
                title: "批次号",
                dataIndex: "id",
                render: (value) => (
                  <Button type="text" onClick={() => setSelectedId(value)}>
                    {value}
                  </Button>
                ),
              },
              { title: "打款单号", dataIndex: "payoutId" },
              {
                title: "状态",
                render: (_, row) => (
                  <Status tone={row.status === "SUCCEEDED" ? "green" : "blue"}>
                    {row.status === "SUCCEEDED" ? "已到账" : "处理中"}
                  </Status>
                ),
              },
              {
                title: "结算金额",
                dataIndex: "amountMinor",
                render: (value) =>
                  `${formatMinorUnits(value).replace(/\.00$/, "")} 元`,
              },
            ]}
          />
        </Panel>
        <Panel
          title={`批次明细（${selected?.id || "—"}）`}
          className="admin-settlement-ledger"
        >
          {selected ? (
            <div id="admin-settlement-ledger">
              <Notice>
                <b>
                  净额 ·{" "}
                  {formatMinorUnits(selected.income).replace(/\.00$/, "")}{" "}
                  元收入 - {formatMinorUnits(selected.fee).replace(/\.00$/, "")}{" "}
                  元费用 -{" "}
                  {formatMinorUnits(selected.refund).replace(/\.00$/, "")}{" "}
                  元退款 ={" "}
                  <strong>
                    {formatMinorUnits(net).replace(/\.00$/, "")} 元
                  </strong>
                </b>
              </Notice>
              <h3>明细记录</h3>
              <Table
                rowKey="kind"
                pagination={false}
                dataSource={[
                  {
                    kind: "原单收入",
                    amount: `+${formatMinorUnits(selected.income).replace(/\.00$/, "")} 元`,
                    description: "服务收入",
                    tone: "green" as const,
                  },
                  {
                    kind: "平台及渠道费",
                    amount: `-${formatMinorUnits(selected.fee).replace(/\.00$/, "")} 元`,
                    description: "成交快照费用",
                    tone: "orange" as const,
                  },
                  {
                    kind: "退款冲正",
                    amount: `-${formatMinorUnits(selected.refund).replace(/\.00$/, "")} 元`,
                    description: "追加记录，冲减原收益",
                    tone: "purple" as const,
                  },
                ]}
                columns={[
                  {
                    title: "类型",
                    render: (_, row) => (
                      <Status tone={row.tone}>{row.kind}</Status>
                    ),
                  },
                  { title: "金额", dataIndex: "amount" },
                  { title: "说明", dataIndex: "description" },
                ]}
              />
            </div>
          ) : (
            <Empty description="暂无结算批次" />
          )}
        </Panel>
      </div>
      <Modal
        forceRender
        title="生成结算批次"
        open={generating}
        onCancel={() => setGenerating(false)}
        onOk={() => form.submit()}
        okText="提交生成"
        cancelText="返回"
      >
        <Notice>按成熟窗口、退款冻结与有效收款资料筛选结算分录。</Notice>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ publisher: "林**", currency: "CNY" }}
          onFinish={() =>
            void message.info("结算批次接口尚未接入，待结算金额保留")
          }
        >
          <Form.Item label="发布者" name="publisher">
            <Input readOnly />
          </Form.Item>
          <Form.Item label="币种" name="currency">
            <Input readOnly />
          </Form.Item>
          <Form.Item
            label="结算期间"
            name="period"
            rules={[{ required: true, message: "请选择结算期间" }]}
          >
            <DatePicker.RangePicker />
          </Form.Item>
          <p>待结算 · 300.00 CNY　收款资料快照 · ****1234</p>
        </Form>
      </Modal>
    </div>
  );
}
