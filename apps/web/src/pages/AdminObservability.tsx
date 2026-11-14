import { useEffect, useId, useRef, useState } from "react";
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Table,
} from "antd";
import { AdminOperationDialog } from "../components/AdminOperationDialog";
import { Notice, PageHeading, Panel, Status } from "../components/ui";
import {
  useAdminOperations,
  type AlertRulePreview,
  type DeliveryPreview,
} from "../admin-operations";
import { useAdminPreview } from "../admin-preview";
import { useWorkspace } from "../context";
import { useSearchParams } from "react-router-dom";
import { AdminObservabilityLivePage } from "./AdminRuntimeDiagnostics";

const logFixtures = [
  {
    id: "L01",
    time: "2026-11-13 14:30:22",
    service: "景点预约服务",
    level: "信息",
    minutes: 2,
    content: "调度任务已提交，任务ID · T-8F3D1，状态 · 待执行",
  },
  {
    id: "L02",
    time: "2026-11-13 14:28:47",
    service: "支付回调服务",
    level: "信息",
    minutes: 4,
    content: "接收支付回调成功，服务订单尾号 · 0082，状态 · 已处理",
  },
  {
    id: "L03",
    time: "2026-11-13 14:27:51",
    service: "通知投递服务",
    level: "警告",
    minutes: 5,
    content: "通知投递重试，消息类型 · 预约结果，重试次数 · 1",
  },
  {
    id: "L04",
    time: "2026-11-13 14:26:09",
    service: "调度执行服务",
    level: "信息",
    minutes: 6,
    content: "执行实例启动完成，实例ID · I-4C7A9，预计耗时 · 约45秒",
  },
  {
    id: "L05",
    time: "2026-11-13 14:24:18",
    service: "景点预约服务",
    level: "信息",
    minutes: 8,
    content: "获取景点可预约时段成功，目标景点 · 示例景点A，结果 · 可预约",
  },
];
const alertFixtures = [
  {
    id: "payment-backlog",
    title: "支付回调积压",
    severity: "高",
    service: "支付回调服务",
    time: "2026-11-13 14:20:05",
    minutes: 12,
    evidence: "队列积压已回落，处理速率恢复正常（2026-11-13 14:32:10）",
    expression: "tt_queue_oldest_age_seconds > 60",
  },
  {
    id: "node-lease",
    title: "节点租约过期",
    severity: "中",
    service: "执行节点服务",
    time: "2026-11-13 14:18:37",
    minutes: 14,
    evidence: "节点已重新注册并获取租约（2026-11-13 14:27:04）",
    expression: "tt_runner_lease_expired_total > 0",
  },
  {
    id: "notification-failure",
    title: "通知失败",
    severity: "中",
    service: "通知投递服务",
    time: "2026-11-13 14:16:21",
    minutes: 16,
    evidence: "投递重试后成功，失败率已降至正常范围（2026-11-13 14:25:36）",
    expression: "tt_alert_delivery_failures_total > 0",
  },
];
const serviceOptions = [
  ...new Set([...logFixtures, ...alertFixtures].map((item) => item.service)),
].map((value) => ({ value, label: value }));

function ObservationFilters({
  onSearch,
  values,
}: {
  onSearch: (values: { minutes: number; service?: string }) => void;
  values: { minutes: number; service?: string };
}) {
  const formId = useId();
  return (
    <Form
      name={`observation-${formId}`}
      layout="inline"
      initialValues={values}
      onFinish={onSearch}
    >
      <Form.Item name="minutes" label="时间范围">
        <Select
          aria-label="时间范围"
          options={[
            { value: 60, label: "近1小时" },
            { value: 5, label: "近5分钟" },
            { value: 1440, label: "近24小时" },
          ]}
        />
      </Form.Item>
      <Form.Item name="service" label="关联服务">
        <Select
          aria-label="关联服务"
          placeholder="全部服务"
          allowClear
          options={serviceOptions}
        />
      </Form.Item>
      <Button type="primary" htmlType="submit">
        查询
      </Button>
    </Form>
  );
}

export function AdminObservabilityPage() {
  const { enabled, silences, ruleDrafts, saveSilence, endSilence, saveRule } =
    useAdminOperations();
  const { recordNote } = useAdminPreview();
  const { bootstrap } = useWorkspace();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  function filters(prefix: string) {
    const minutes = Number(params.get(`${prefix}_minutes`) || 60);
    return {
      minutes: [5, 60, 1440].includes(minutes) ? minutes : 60,
      service: params.get(`${prefix}_service`) || undefined,
    };
  }
  const logsFilter = filters("log");
  const alertsFilter = filters("alert");
  function setFilters(
    prefix: string,
    values: { minutes: number; service?: string },
  ) {
    const next = new URLSearchParams(params);
    next.set(`${prefix}_minutes`, String(values.minutes));
    if (values.service) next.set(`${prefix}_service`, values.service);
    else next.delete(`${prefix}_service`);
    setParams(next);
  }
  const [editing, setEditing] = useState<"silence" | "rule">();
  const [acknowledging, setAcknowledging] =
    useState<(typeof alertFixtures)[number]>();
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const nextExpiry = Math.min(
      ...silences
        .map((item) => Date.parse(item.expiresAt))
        .filter((time) => time > now),
    );
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(nextExpiry - Date.now(), 1), 2147483647),
    );
    return () => window.clearTimeout(timer);
  }, [silences, now]);
  const canManage = Boolean(
    bootstrap.user?.capabilities.includes("observability.manage"),
  );
  const logs = enabled
    ? logFixtures.filter(
        (item) =>
          item.minutes <= logsFilter.minutes &&
          (!logsFilter.service || item.service === logsFilter.service),
      )
    : [];
  const alerts = enabled
    ? alertFixtures.filter(
        (item) =>
          item.minutes <= alertsFilter.minutes &&
          (!alertsFilter.service || item.service === alertsFilter.service),
      )
    : [];
  if (!enabled) return <AdminObservabilityLivePage />;
  function open(kind: "silence" | "rule", id?: string) {
    form.resetFields();
    const alert =
      alertFixtures.find((item) => item.id === id) || alertFixtures[0];
    const draft = ruleDrafts.find((item) => item.id === alert.id);
    form.setFieldsValue({
      alertId: id,
      minutes: 30,
      ruleId: alert.id,
      expression: draft?.expression || alert.expression,
      severity: draft?.severity || alert.severity,
      forSeconds: draft?.forSeconds ?? 60,
    });
    requestKey.current = crypto.randomUUID();
    setEditing(kind);
  }
  return (
    <div className="admin-page admin-observability-page">
      <PageHeading
        title="日志与告警"
        description="查看系统脱敏日志与运行告警，支持按时间与服务筛选，并对告警进行限时静默与规则设置。"
      />
      <Panel className="admin-log-panel">
        <div className="observation-tab-strip">
          <b>脱敏日志</b>
          <Button
            type="text"
            onClick={() =>
              document
                .getElementById("admin-alert-panel")
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
            }
          >
            告警
          </Button>
        </div>
        <ObservationFilters
          key={JSON.stringify(logsFilter)}
          values={logsFilter}
          onSearch={(values) => setFilters("log", values)}
        />
        <Table
          rowKey="id"
          dataSource={logs}
          scroll={{ x: 1500 }}
          pagination={false}
          columns={[
            { title: "发生时间", dataIndex: "time", width: 275 },
            { title: "关联服务", dataIndex: "service", width: 215 },
            {
              title: "日志级别",
              dataIndex: "level",
              width: 150,
              render: (value) => (
                <Status tone={value === "警告" ? "orange" : "blue"}>
                  {value}
                </Status>
              ),
            },
            { title: "事件内容（脱敏）", dataIndex: "content" },
          ]}
        />
      </Panel>
      <div id="admin-alert-panel">
        <Panel className="admin-alert-panel">
          <div className="observation-tab-strip">
            <Button
              type="text"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              脱敏日志
            </Button>
            <b>告警</b>
          </div>
          <div className="admin-alert-toolbar">
            <ObservationFilters
              key={JSON.stringify(alertsFilter)}
              values={alertsFilter}
              onSearch={(values) => setFilters("alert", values)}
            />
            <div className="row-actions">
              <Button
                disabled={!canManage || !enabled}
                onClick={() => open("silence")}
              >
                限时静默
              </Button>
              <Button
                disabled={!canManage || !enabled}
                onClick={() => open("rule")}
              >
                规则设置
              </Button>
            </div>
          </div>
          <Table
            rowKey="id"
            dataSource={alerts}
            scroll={{ x: 1500 }}
            pagination={false}
            columns={[
              {
                title: "告警事件",
                render: (_, row) => (
                  <Button
                    type="text"
                    disabled={!canManage}
                    onClick={() => setAcknowledging(row)}
                  >
                    {row.title}
                  </Button>
                ),
              },
              {
                title: "严重级别",
                dataIndex: "severity",
                width: 120,
                render: (value) => (
                  <Status tone={value === "高" ? "red" : "orange"}>
                    {value}
                  </Status>
                ),
              },
              { title: "关联服务", dataIndex: "service" },
              { title: "发生时间", dataIndex: "time", width: 215 },
              { title: "恢复证据", dataIndex: "evidence", width: "35%" },
              {
                title: "操作",
                width: 230,
                render: (_, row) => {
                  const silence = silences.find(
                    (item) =>
                      (item.alertId === row.id ||
                        item.alertId === "ALL_CURRENT") &&
                      new Date(item.expiresAt).getTime() > now,
                  );
                  return (
                    <div className="row-actions">
                      <Button
                        type="link"
                        disabled={!canManage}
                        onClick={() =>
                          silence
                            ? endSilence(silence.id)
                            : open("silence", row.id)
                        }
                      >
                        {silence ? "结束静默" : "限时静默"}
                      </Button>
                      <Button
                        type="link"
                        disabled={!canManage}
                        onClick={() => open("rule", row.id)}
                      >
                        规则设置
                      </Button>
                    </div>
                  );
                },
              },
            ]}
          />
        </Panel>
      </div>
      <Modal
        forceRender
        title={editing === "silence" ? "限时静默" : "告警规则草稿"}
        open={Boolean(editing)}
        onCancel={() => setEditing(undefined)}
        onOk={() => form.submit()}
        okText="保存预览"
        cancelText="返回"
      >
        <Form
          name="adminobservability-2"
          form={form}
          layout="vertical"
          onValuesChange={() => {
            requestKey.current = crypto.randomUUID();
          }}
          onFinish={(values) => {
            try {
              if (editing === "silence")
                saveSilence(
                  values.alertId,
                  values.minutes,
                  values.reason,
                  requestKey.current,
                );
              else
                saveRule(
                  {
                    id: values.ruleId,
                    version:
                      (ruleDrafts.find((row) => row.id === values.ruleId)
                        ?.version || 1) + 1,
                    expression: values.expression,
                    severity: values.severity,
                    forSeconds: values.forSeconds,
                  } satisfies AlertRulePreview,
                  values.reason,
                  requestKey.current,
                );
              setEditing(undefined);
              void message.success(
                editing === "silence"
                  ? "限时静默预览已保存"
                  : "规则草稿预览已保存，等待规则服务校验与同步",
              );
            } catch (error) {
              void message.error(
                error instanceof Error ? error.message : "保存失败，请重试",
              );
            }
          }}
        >
          {editing === "silence" ? (
            <>
              <Notice>
                静默限定告警范围和期限，恢复状态继续依据健康证据。
              </Notice>
              <Form.Item
                label="告警范围"
                name="alertId"
                rules={[{ required: true, message: "请选择告警范围" }]}
              >
                <Select
                  options={[
                    ...alertFixtures.map((item) => ({
                      value: item.id,
                      label: item.title,
                    })),
                    { value: "ALL_CURRENT", label: "当前3项告警" },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label="静默分钟数"
                name="minutes"
                rules={[
                  { required: true },
                  { type: "integer", min: 1, message: "请输入正整数" },
                ]}
              >
                <InputNumber min={1} precision={0} />
              </Form.Item>
            </>
          ) : (
            <>
              <Notice>
                保存生成下一版草稿，启用状态等待规则服务校验与同步。
              </Notice>
              <Form.Item
                label="规则"
                name="ruleId"
                rules={[{ required: true }]}
              >
                <Select
                  aria-label="规则"
                  options={alertFixtures.map((item) => ({
                    value: item.id,
                    label: item.title,
                  }))}
                  onChange={(id) => {
                    const item = alertFixtures.find((row) => row.id === id)!;
                    form.setFieldsValue({
                      expression:
                        ruleDrafts.find((row) => row.id === id)?.expression ||
                        item.expression,
                      severity:
                        ruleDrafts.find((row) => row.id === id)?.severity ||
                        item.severity,
                      forSeconds:
                        ruleDrafts.find((row) => row.id === id)?.forSeconds ??
                        60,
                    });
                  }}
                />
              </Form.Item>
              <Form.Item
                label="表达式"
                name="expression"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input.TextArea rows={3} />
              </Form.Item>
              <Form.Item
                label="严重级别"
                name="severity"
                rules={[{ required: true }]}
              >
                <Select
                  aria-label="严重级别"
                  options={[{ value: "高" }, { value: "中" }, { value: "低" }]}
                />
              </Form.Item>
              <Form.Item
                label="持续秒数"
                name="forSeconds"
                rules={[{ required: true }, { type: "integer", min: 0 }]}
              >
                <InputNumber min={0} precision={0} />
              </Form.Item>
            </>
          )}
          <Form.Item
            label="处理理由"
            name="reason"
            rules={[
              { required: true, whitespace: true, message: "请填写处理理由" },
            ]}
          >
            <Input.TextArea maxLength={200} rows={2} />
          </Form.Item>
        </Form>
      </Modal>
      {acknowledging && (
        <AdminOperationDialog
          title={`记录告警处置 · ${acknowledging.title}`}
          onClose={() => setAcknowledging(undefined)}
          onConfirm={(reason, key) =>
            recordNote(acknowledging.id, `告警处置 · ${reason}`, key)
          }
        >
          <p>{acknowledging.evidence}</p>
        </AdminOperationDialog>
      )}
    </div>
  );
}

const deliveryLabels = {
  SUCCEEDED: "成功",
  FAILED: "失败",
  PENDING: "待核对",
  UNKNOWN: "UNKNOWN",
};
const deliveryTones = {
  SUCCEEDED: "green",
  FAILED: "red",
  PENDING: "orange",
  UNKNOWN: "gray",
} as const;
export function AdminDeliveriesPage() {
  const { enabled, deliveries, operations, requestOperation } =
    useAdminOperations();
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<{
    type?: string;
    channel?: string;
    status?: string;
  }>({});
  const [selected, setSelected] = useState<DeliveryPreview>();
  const rows = deliveries.filter(
    (item) =>
      (!filters.type || item.type === filters.type) &&
      (!filters.channel || item.channel === filters.channel) &&
      (!filters.status || item.status === filters.status),
  );
  const queued = (id: string) =>
    operations.some(
      (item) => item.resourceId === id && item.kind === "DELIVERY_RETRY",
    );
  return (
    <div className="admin-page admin-deliveries-page">
      <PageHeading title="通知投递" />
      <Notice>
        重新投递沿用原逻辑消息与收件人，服务运行及费用记录保持可追溯。
      </Notice>
      <Panel className="admin-delivery-filters">
        <Form
          name="adminobservability-3"
          form={form}
          layout="inline"
          onFinish={setFilters}
        >
          <Form.Item label="消息类型" name="type">
            <Select
              placeholder="全部"
              allowClear
              options={[
                { value: "支付" },
                { value: "运行" },
                { value: "退款" },
              ]}
            />
          </Form.Item>
          <Form.Item label="渠道" name="channel">
            <Select
              placeholder="全部"
              allowClear
              options={[{ value: "站内" }, { value: "邮件" }]}
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              placeholder="全部"
              allowClear
              options={Object.entries(deliveryLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <div className="row-actions">
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button
              onClick={() => {
                form.resetFields();
                setFilters({});
              }}
            >
              重置
            </Button>
          </div>
        </Form>
      </Panel>
      <Panel className="admin-delivery-table">
        <Table<DeliveryPreview>
          rowKey="id"
          dataSource={rows}
          pagination={{
            pageSize: 10,
            hideOnSinglePage: false,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`,
          }}
          columns={[
            {
              title: "消息类型",
              dataIndex: "type",
              render: (value) => (
                <Status
                  tone={
                    value === "支付"
                      ? "blue"
                      : value === "运行"
                        ? "purple"
                        : "orange"
                  }
                >
                  {value}
                </Status>
              ),
            },
            { title: "渠道", dataIndex: "channel" },
            {
              title: "状态",
              render: (_, row) => (
                <Status
                  tone={queued(row.id) ? "blue" : deliveryTones[row.status]}
                >
                  {queued(row.id) ? "重投待处理" : deliveryLabels[row.status]}
                </Status>
              ),
            },
            { title: "回执（掩码）", dataIndex: "receipt", width: "25%" },
            { title: "次数", dataIndex: "attempts" },
            {
              title: "操作",
              width: 230,
              render: (_, row) =>
                row.status === "FAILED" || row.status === "UNKNOWN" ? (
                  <Button
                    disabled={!enabled || queued(row.id)}
                    onClick={() => setSelected(row)}
                  >
                    {row.status === "UNKNOWN"
                      ? "先核验"
                      : queued(row.id)
                        ? "重投待处理"
                        : "重投"}
                  </Button>
                ) : (
                  "-"
                ),
            },
          ]}
        />
      </Panel>
      {selected && (
        <AdminOperationDialog
          title={
            selected.status === "UNKNOWN" ? "原投递回执核验" : "通知重投预览"
          }
          onClose={() => setSelected(undefined)}
          onConfirm={(reason, key) =>
            requestOperation(
              selected.status === "UNKNOWN"
                ? "DELIVERY_RECONCILE"
                : "DELIVERY_RETRY",
              selected.id,
              reason,
              key,
            )
          }
        >
          <p>
            {selected.type} · {selected.channel} · {selected.receipt}
          </p>
          <Notice>
            {selected.status === "UNKNOWN"
              ? "先查询原服务商请求，未知结果等待回执核验。"
              : "已明确失败的原逻辑消息进入重投待处理，尝试次数以投递执行记录为准。"}
          </Notice>
        </AdminOperationDialog>
      )}
    </div>
  );
}
