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
  Tooltip,
} from "antd";
import { BookOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useAdminPreview } from "../admin-preview";
import {
  paymentLabels,
  refundBalance,
  refundLabels,
  refundTones,
} from "../lib/admin-commerce-preview";
import { formatMinorUnits } from "../lib/money";
import {
  payoutLabels,
  payoutTones,
  reconciliationRows,
  settlementBalance,
  settlementBatches,
  settlementOwners,
  settlementTotals,
} from "../lib/admin-finance-preview";

export function AdminPaymentsPage() {
  const { payments, refunds, enabled } = useAdminPreview();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "payments" ? "payments" : "refunds";
  const { message, modal } = App.useApp();
  const isRefund = tab === "refunds";
  const paymentId = params.get("payment");
  const refundId = isRefund ? params.get("refund") : null;
  const rows = (isRefund
    ? refunds.map((refund) => {
        const payment = payments.find((item) => item.id === refund.paymentId);
        return {
          ...refund,
          channel: payment?.channel || "待载入",
          orderId: payment?.orderId,
        };
      })
    : payments.map((payment) => ({ ...payment, paymentId: payment.id }))
  ).filter((row) =>
    (!paymentId || row.paymentId === paymentId) && (!refundId || row.id === refundId),
  );
  return (
    <div className="admin-page admin-payments-page">
      <PageHeading
        title="支付与退款"
        extra={<Status tone="gray">{enabled ? "本地示例" : "支付服务待接入"}</Status>}
      />
      {!enabled && (
        <Notice>支付与退款查询服务待接入，当前计数及记录暂不可用。</Notice>
      )}
      {(paymentId || refundId) && (
        <Notice>
          当前记录范围　{refundId || paymentId}
          <Button
            type="link"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete("payment");
              next.delete("refund");
              setParams(next);
            }}
          >
            查看全部记录
          </Button>
        </Notice>
      )}
      <Panel className="admin-payment-summary">
        <Tabs
          activeKey={tab}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            next.set("tab", value);
            setParams(next);
          }}
          items={[
            { key: "payments", label: "收款" },
            { key: "refunds", label: "退款" },
          ]}
        />
        <div className="admin-finance-stats">
          {(["UNKNOWN", "PROCESSING", "SUCCEEDED"] as const).map((status, index) => (
            <article key={status} className={`finance-stat-${index}`}>
              <h3>{isRefund ? refundLabels[status] : ["待核对", "处理中", "已收款"][index]}</h3>
              <strong>{enabled ? rows.filter((row) => row.status === status).length : "—"}</strong>
            </article>
          ))}
        </div>
      </Panel>
      <Panel className="admin-payment-table">
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1100 }}
          columns={[
          {
            title: isRefund ? "退款编号" : "支付编号",
            width: "16.4%",
            render: (_, row) =>
              isRefund ? (
                <Link to={`/admin/refunds/${row.id}`}>{row.id}</Link>
              ) : row.orderId ? (
                <Link to={`/admin/orders/${row.orderId}`}>{row.id}</Link>
              ) : row.id,
          },
          {
            title: isRefund ? "原支付编号" : "渠道",
            width: "17%",
            render: (_, row) =>
              isRefund ? (
                <Link to={`/admin/payments?tab=payments&payment=${row.paymentId}`}>
                  {row.paymentId}
                </Link>
              ) : row.channel,
          },
          {
            title: "金额",
            width: "16.8%",
            dataIndex: "amountMinor",
            render: (value) => `${formatMinorUnits(value)} CNY`,
          },
          { title: "渠道请求", dataIndex: "requestMask", width: "15.6%" },
          {
            title: "状态",
            width: "15.8%",
            render: (_, row) => (
              <Status tone={refundTones[row.status]}>
                {isRefund
                  ? refundLabels[row.status]
                  : row.status === "SUCCEEDED"
                    ? "已收款"
                    : paymentLabels[row.status]}
              </Status>
            ),
          },
          {
            title: "操作",
            render: (_, row) => (
              <Button
                type="link"
                onClick={() => {
                  if (row.status === "SUCCEEDED") {
                    modal.info({
                      title: "示例渠道回执",
                      content: (
                        <div>
                          <p>{row.id} · {formatMinorUnits(row.amountMinor)} CNY</p>
                          <p>状态 · {isRefund ? "退款已到账" : "支付成功"}</p>
                          <small>本地原型回执，用于页面验证。</small>
                        </div>
                      ),
                      okText: "关闭",
                    });
                  } else {
                    void message.info(`渠道查询接口尚未接入，${row.id}仍待原回执核验`);
                  }
                }}
              >
                {row.status === "SUCCEEDED"
                  ? "查看回执"
                  : row.status === "PROCESSING"
                    ? "查询进度"
                    : isRefund ? "查询原退款" : "查询原支付"}
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
  return <AdminRefundException key={id} id={id} />;
}

function AdminRefundException({ id }: { id?: string }) {
  const { refunds, payments, enabled, notes, recordNote } = useAdminPreview();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "records" ? "records" : "evidence";
  const [editing, setEditing] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const refund = refunds.find(
    (item) => item.id === (id === "demo" ? "REF019" : id),
  );
  if (!refund)
    return (
      <Empty description={enabled ? "退款记录不存在或已失效" : "退款详情服务待接入，当前记录暂不可用"}>
        <Link to="/admin/payments">
          <Button>返回支付与退款</Button>
        </Link>
      </Empty>
    );
  const completed = refund.status === "SUCCEEDED";
  const payment = payments.find((item) => item.id === refund.paymentId);
  const balance = refundBalance(payment, refunds);
  const recordRows = notes.filter((item) => item.resourceId === refund.id);
  return (
    <div className="admin-page admin-refund-exception-page">
      <PageHeading title="退款异常处理" extra={<Status tone="gray">本地示例</Status>} />
      <Panel className="admin-refund-hero">
        <div>
          <TileIcon name="refund" />
          <span>
            <h2>
              退款 {refund.id} 渠道 {refund.status}
            </h2>
            <p>上次请求 · {refund.requestedAt}　•　{refund.ruleLabel}</p>
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
            <li>成交规则 · {refund.ruleLabel}（订单快照）</li>
            <li>仅退还实际支付金额，按照原支付渠道原路退回。</li>
            <li>退款金额不得超过原支付金额。</li>
            <li>预占金额用于处理中的退款，剩余可退为实际可发起的金额。</li>
          </ul>
        </Panel>
        <Panel title="退款金额状态" className="admin-refund-balances">
          <div>
            {[
              ["已退", balance?.returned],
              ["预占", balance?.reserved],
              ["剩余可退", balance?.remaining],
            ].map(([label, amount]) => (
              <article key={label}>
                {label}
                <strong>{amount === undefined ? "—" : `¥${formatMinorUnits(amount)}`}</strong>
              </article>
            ))}
          </div>
          {!balance && <Notice>支付与退款事实待核对，额度暂不可用。</Notice>}
        </Panel>
        <Panel title="原支付信息" className="admin-refund-payment">
          <dl>
            <dt>支付渠道</dt>
            <dd>
              <Status>{payment?.channel || "待载入"}</Status>
            </dd>
            <dt>支付编号</dt>
            <dd>
              <Link to={`/admin/payments?tab=payments&payment=${refund.paymentId}`}>
                {refund.paymentId}
              </Link>
            </dd>
            <dt>支付金额</dt>
            <dd>{payment ? `¥${formatMinorUnits(payment.amountMinor)}` : "待载入"}</dd>
            <dt>支付状态</dt>
            <dd>
              <Status tone={payment?.status === "SUCCEEDED" ? "green" : "orange"}>
                {payment ? payment.status === "SUCCEEDED" ? "支付成功" : paymentLabels[payment.status] : "待载入"}
              </Status>
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
          onChange={(value) => {
            const next = new URLSearchParams(params);
            next.set("tab", value);
            setParams(next);
          }}
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
                    { title: "材料名称", width: 477, render: () => "渠道核验记录" },
                    { title: "类型", width: 260, render: () => <Status>核验记录</Status> },
                    {
                      title: "说明",
                      render: () => refund.evidence,
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
            const next = new URLSearchParams(params);
            next.set("tab", "records");
            setParams(next);
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

export function AdminReconciliationPage() {
  const { enabled } = useAdminPreview();
  const [params] = useSearchParams();
  const scope = `${params.get("date") || (enabled ? "2026-11-13" : "all")}/${params.get("channel") || (enabled ? "A" : "")}`;
  return <AdminReconciliation key={scope} />;
}

function AdminReconciliation() {
  const { enabled, notes, recordNote } = useAdminPreview();
  const [params, setParams] = useSearchParams();
  const dateKey = params.get("date") || (enabled ? "2026-11-13" : "all");
  const channel = params.get("channel") || (enabled ? "A" : "");
  const validDate = dateKey === "all" || (
    /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dayjs(dateKey).isValid() &&
    dayjs(dateKey).format("YYYY-MM-DD") === dateKey
  );
  const date = dateKey !== "all" && validDate ? dayjs(dateKey) : null;
  const scopeId = `RECONCILIATION/${dateKey}/${channel}`;
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }
  const [editing, setEditing] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const { message, modal } = App.useApp();
  const rows = enabled && validDate
    ? reconciliationRows.filter((row) =>
        (dateKey === "all" || row.date === dateKey) &&
        (channel === "ALL" || row.channel === channel),
      )
    : [];
  const originalRefund = rows.find((row) => row.kind === "refund" && !row.resolved);

  return (
    <div className="admin-page admin-reconciliation-page">
      <PageHeading
        title="对账中心"
        description="核对渠道收款、退款与打款的一致性，定位并跟进差异，确保资金数据准确。"
        extra={<Status tone="gray">{enabled ? "本地示例" : "对账服务待接入"}</Status>}
      />
      {!enabled && <Notice>对账查询服务待接入，当前计数及记录暂不可用。</Notice>}
      {!validDate && <Notice>对账日期无效，请重新选择。</Notice>}
      <Panel>
        <div className="admin-reconciliation-toolbar">
          <DatePicker
            aria-label="对账日期"
            allowClear
            value={date}
            onChange={(value) => filter("date", value?.format("YYYY-MM-DD") || "all")}
            disabled={!enabled}
          />
          <Select
            aria-label="对账渠道"
            value={channel || undefined}
            placeholder="渠道待载入"
            onChange={(value) => filter("channel", value)}
            disabled={!enabled}
            options={enabled ? [
              { value: "A", label: "示例渠道A" },
              { value: "ALL", label: "全部渠道" },
            ] : []}
          />
          <div className="row-actions">
            <Button
              type="primary"
              disabled={!enabled || !validDate || !["A", "ALL"].includes(channel)}
              onClick={() => {
                form.resetFields();
                requestKey.current = crypto.randomUUID();
                setEditing(true);
              }}
            >
              启动对账
            </Button>
            <Button disabled={!enabled} onClick={() => setRecordsOpen(true)}>查看核对记录</Button>
            {originalRefund ? (
              <Link to={`/admin/refunds/${originalRefund.id}`}><Button>查询原退款</Button></Link>
            ) : <Button disabled>查询原退款</Button>}
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
            ["sync", "打款差异", rows.filter((row) => row.kind === "payout").length, "green"],
          ].map(([icon, label, count, color]) => (
            <article key={String(label)} className={`reconciliation-${color}`}>
              <TileIcon name={String(icon)} color={String(color)} />
              <span>
                <h3>{label}</h3>
                <strong>{enabled ? count : "—"}</strong>
              </span>
            </article>
          ))}
        </div>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1100 }}
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
            recordNote(scopeId, values.reason, requestKey.current);
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
            (item) => enabled && item.resourceId === scopeId,
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

export function AdminSettlementsPage() {
  const { enabled } = useAdminPreview();
  const [params] = useSearchParams();
  const selectedId = params.get("batch") || (enabled ? "SET018" : "");
  return <AdminSettlements key={selectedId} selectedId={selectedId} />;
}

function AdminSettlements({ selectedId }: { selectedId: string }) {
  const { enabled } = useAdminPreview();
  const [params, setParams] = useSearchParams();
  const [generating, setGenerating] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const rows = enabled
    ? settlementBatches.map((batch) => ({
        ...batch.snapshot,
        publisherId: batch.publisherId,
      }))
    : [];
  const selected = rows.find((batch) => batch.id === selectedId);
  const owner = selected && settlementOwners.find((item) => item.id === selected.publisherId);
  const balance = owner ? settlementBalance(owner.ledger) : undefined;
  const totals = selected ? settlementTotals(selected) : undefined;
  function select(id: string) {
    if (id === selectedId) return;
    const next = new URLSearchParams(params);
    next.set("batch", id);
    setParams(next);
  }
  return (
    <div className="admin-page admin-settlements-page">
      <PageHeading title="发布者结算" extra={<Status tone="gray">{enabled ? "本地示例" : "结算服务待接入"}</Status>} />
      {!enabled && <Notice>结算查询服务待接入，当前计数及记录暂不可用。</Notice>}
      <div className="admin-settlement-hero">
        <TileIcon name="database" color="gradient" />
        <h2>批次 · {selectedId || "—"}　 |　 发布者 · {owner?.mask || "—"}</h2>
        <div>
          {[
            ["待结算", balance?.pending],
            ["打款在途", balance?.reserved],
            ["退款冻结", balance?.frozen],
          ].map(([label, amount]) => (
            <article key={label}>
              {label === "待结算" ? (
                <Tooltip trigger={["hover", "focus"]} title={balance
                  ? `发布者全部账本，待成熟${formatMinorUnits(balance.pending - balance.reserved).replace(/\.00$/, "")}元，打款预占${formatMinorUnits(balance.reserved).replace(/\.00$/, "")}元`
                  : "余额待载入"}>
                  <span tabIndex={0} aria-label="待结算金额组成">{label}</span>
                </Tooltip>
              ) : label}
              <strong>
                {amount === undefined ? "—" : formatMinorUnits(amount).replace(/\.00$/, "")} <small>元</small>
              </strong>
            </article>
          ))}
        </div>
      </div>
      <div className="admin-settlement-toolbar">
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          disabled={!owner || !balance || balance.available <= 0n}
          onClick={() => {
            form.resetFields();
            setGenerating(true);
          }}
        >
          生成批次
        </Button>
        <Button icon={<BookOutlined aria-hidden />} disabled={!selected} onClick={() => setLedgerOpen(true)}>
          查看账本
        </Button>
        <Button
          icon={<SearchOutlined aria-hidden />}
          disabled={!selected}
          onClick={() => {
            if (selected?.status === "SUCCEEDED") {
              modal.info({
                title: "历史打款回执",
                content: (
                  <p>
                    {selected.payoutId} · {formatMinorUnits(selected.amountMinor)}
                    {" "}CNY，已到账。收款账号快照 · {selected.accountMask}。
                  </p>
                ),
                okText: "关闭",
              });
            } else if (selected) {
              void message.info(
                `原请求${selected.payoutId}的查询接口尚未接入，打款状态仍为${payoutLabels[selected.status]}`,
              );
            }
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
            scroll={{ x: 630 }}
            rowClassName={(row) => row.id === selectedId ? "selected-row" : ""}
            onRow={(row) => ({ onClick: () => select(row.id) })}
            columns={[
              {
                title: "批次号",
                dataIndex: "id",
                render: (id) => <Button type="text">{id}</Button>,
              },
              { title: "打款单号", dataIndex: "payoutId" },
              {
                title: "状态",
                render: (_, row) => <Status tone={payoutTones[row.status]}>{payoutLabels[row.status]}</Status>,
              },
              {
                title: "结算金额",
                dataIndex: "amountMinor",
                render: (value) => `${formatMinorUnits(value).replace(/\.00$/, "")} 元`,
              },
            ]}
          />
        </Panel>
        <Panel title={`批次明细（${selectedId || "—"}）`} className="admin-settlement-ledger">
          {selected && totals ? <div id="admin-settlement-ledger">
            <Notice><b>
              净额 · {formatMinorUnits(totals.income).replace(/\.00$/, "")} 元收入 -{" "}
              {formatMinorUnits(totals.fee).replace(/\.00$/, "")} 元费用 -{" "}
              {formatMinorUnits(totals.refund).replace(/\.00$/, "")} 元退款 ={" "}
              <strong>{formatMinorUnits(totals.net).replace(/\.00$/, "")} 元</strong>
            </b></Notice>
            {totals.net !== BigInt(selected.amountMinor) && <Notice>批次净额与原打款金额待核对。</Notice>}
            <h3>明细记录</h3>
            <Table rowKey="kind" pagination={false} scroll={{ x: 630 }} dataSource={[
              {
                kind: "原单收入",
                amount: `+${formatMinorUnits(totals.income).replace(/\.00$/, "")} 元`,
                description: "服务收入",
                tone: "green" as const,
              },
              {
                kind: "平台及渠道费",
                amount: `-${formatMinorUnits(totals.fee).replace(/\.00$/, "")} 元`,
                description: "成交快照费用",
                tone: "orange" as const,
              },
              {
                kind: "退款冲正",
                amount: `-${formatMinorUnits(totals.refund).replace(/\.00$/, "")} 元`,
                description: "追加记录，冲减原收益",
                tone: "purple" as const,
              },
            ]} columns={[
              { title: "类型", render: (_, row) => <Status tone={row.tone}>{row.kind}</Status> },
              { title: "金额", dataIndex: "amount" },
              { title: "说明", dataIndex: "description" },
            ]} />
          </div> : <Empty description={enabled ? `结算批次${selectedId}不存在或已失效` : "结算批次待载入"} />}
        </Panel>
      </div>
      <Modal
        title={`批次${selectedId}账本来源`}
        width={900}
        open={ledgerOpen && !!selected}
        onCancel={() => setLedgerOpen(false)}
        footer={<Button onClick={() => setLedgerOpen(false)}>关闭账本</Button>}
      >
        <Table rowKey="id" dataSource={selected?.lines || []} pagination={false} scroll={{ x: 750 }} columns={[
          { title: "交易编号", dataIndex: "id" },
          { title: "账本分组", dataIndex: "ledgerGroupId" },
          { title: "收入", dataIndex: "income", render: formatMinorUnits },
          { title: "费用", dataIndex: "fee", render: formatMinorUnits },
          { title: "退款", dataIndex: "refund", render: formatMinorUnits },
        ]} />
        <p>原打款请求 · {selected?.payoutId}　收款快照 · {selected?.accountMask}</p>
      </Modal>
      <Modal
        forceRender
        title="生成结算批次"
        open={generating && !!owner}
        onCancel={() => setGenerating(false)}
        onOk={() => form.submit()}
        okText="提交生成"
        cancelText="返回"
      >
        <Notice>按成熟窗口、退款冻结与有效收款资料筛选结算分录。</Notice>
        <Form form={form} layout="vertical" initialValues={{ publisher: owner?.mask, currency: owner?.currency }}
          onFinish={() => void message.info("结算批次接口尚未接入，可结算范围保留")}>
          <Form.Item label="发布者" name="publisher"><Input readOnly /></Form.Item>
          <Form.Item label="币种" name="currency"><Input readOnly /></Form.Item>
          <Form.Item label="结算期间" name="period" rules={[{ required: true, message: "请选择结算期间" }]}>
            <DatePicker.RangePicker />
          </Form.Item>
          <p>当前可结算 · {balance ? formatMinorUnits(balance.available) : "—"} CNY　范围 · {balance?.eligibleIds.join("、")}</p>
          <p>期间内可纳入金额待生成预览核定。</p>
          <p>当前收款资料待载入。</p>
        </Form>
      </Modal>
    </div>
  );
}
