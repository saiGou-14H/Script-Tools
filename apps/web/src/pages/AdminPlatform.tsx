import { useEffect, useRef, useState } from "react";
import {
  App,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
  Table,
} from "antd";
import dayjs from "dayjs";
import { Link, useSearchParams } from "react-router-dom";
import { AdminPlatformSettingsLivePage } from "./AdminDeliverySettings";
import { AdminAccessLivePage, AdminRecoveryLivePage } from "./AdminGovernance";
import { governanceCapabilities } from "../lib/admin-governance";
import { AdminOperationDialog } from "../components/AdminOperationDialog";
import { Icon } from "../components/Icon";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import {
  managementCapabilities,
  useAdminOperations,
  type GrantPreview,
  type PlatformPreview,
} from "../admin-operations";
import { useAdminPreview } from "../admin-preview";
import { useWorkspace } from "../context";

export function AdminPlatformSettingsPage() {
  const { enabled, platform, savePlatform } = useAdminOperations();
  const [params, setParams] = useSearchParams();
  const tab = ["basic", "features", "network", "protection"].includes(
    params.get("tab") || "",
  )
    ? params.get("tab")!
    : "basic";
  function setTab(value: string) {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next);
  }
  const [change, setChange] = useState<{
    field: "pauseSales" | "pauseRuns" | "pauseFunds";
    value: boolean;
    title: string;
  }>();
  const [networkOpen, setNetworkOpen] = useState(false);
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const { message } = App.useApp();
  if (!enabled) return <AdminPlatformSettingsLivePage />;
  const protections = [
    {
      field: "pauseSales" as const,
      title: "暂停新销售",
      icon: "order",
      description: "开启后将停止新的服务销售，已成交订单继续处理。",
    },
    {
      field: "pauseRuns" as const,
      title: "暂停新运行",
      icon: "play",
      description: "开启后停止接受新运行请求，在途任务继续跟踪。",
    },
    {
      field: "pauseFunds" as const,
      title: "暂停资金发送",
      icon: "database",
      description: "开启后暂停外发资金，退款与发布者结算事实持续保留。",
    },
  ];
  return (
    <div className="admin-page admin-platform-settings-page">
      <PageHeading
        title="平台设置"
        description="管理平台的基础配置、能力开关、网络策略与销售保护，控制服务对外能力与运行边界。"
      />
      <div className="admin-segment-tabs">
        {[
          ["basic", "基本"],
          ["features", "能力开关"],
          ["network", "网络策略"],
          ["protection", "销售保护"],
        ].map(([key, label]) => (
          <Button
            key={key}
            type={tab === key ? "primary" : "default"}
            onClick={() => {
              setTab(key);
              document
                .getElementById(`platform-${key}`)
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="admin-platform-grid">
        <div id="platform-basic">
          <Panel>
            <div className="commerce-core-switch">
              <TileIcon name="info" />
              <span>
                <h3>通用按次商业</h3>
                <p>平台按次计费的商业模式开关，影响全部服务的实际可售性。</p>
              </span>
              <Switch
                aria-label="通用按次商业"
                checked
                onChange={() =>
                  void message.info(
                    "按次商业持续提供历史履约入口，新销售由销售保护控制",
                  )
                }
              />
              <span>开启</span>
            </div>
            <h3 className="platform-section-title" id="platform-features">
              服务与通道配置
            </h3>
            {[
              [
                "travel",
                "旅行示例（景点预约等）",
                "示例场景 · 景点预约、门票查询等，当前为待渠道验证状态。",
                "travel",
              ],
              [
                "laptop",
                "远程来源（P1）",
                "从Git/URL导入新草稿，测试部署后才可发布。",
                "remote",
              ],
              [
                "link",
                "Webhook（P1）",
                "向用户配置的地址投递事件通知，当前未启用。",
                "webhook",
              ],
              [
                "code",
                "个人API（P2）",
                "面向个人使用者的API访问能力，P2级能力。",
                "api",
              ],
            ].map(([icon, title, description, key]) => (
              <article className="platform-feature-row" key={key}>
                <TileIcon name={icon} />
                <span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </span>
                {key === "travel" ? (
                  <Status tone="orange">待渠道验证</Status>
                ) : (
                  <>
                    <Switch aria-label={title} checked={false} disabled />
                    <span>关闭</span>
                  </>
                )}
              </article>
            ))}
          </Panel>
        </div>
        <div id="platform-protection">
          <Panel title="销售保护">
            <p>
              用于在必要时快速控制销售、运行与资金发送，保障平台安全与稳定。
            </p>
            {protections.map((item) => (
              <article className="platform-protection-row" key={item.field}>
                <TileIcon name={item.icon} />
                <span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </span>
                <Switch
                  aria-label={item.title}
                  checked={platform[item.field]}
                  disabled={!enabled}
                  onChange={(value) =>
                    setChange({ field: item.field, value, title: item.title })
                  }
                />
                <span>{platform[item.field] ? "开启" : "关闭"}</span>
              </article>
            ))}
          </Panel>
        </div>
        <div id="platform-network">
          <Panel title="网络策略">
            <button
              className="platform-network-row"
              type="button"
              disabled={!enabled}
              onClick={() => {
                form.setFieldsValue({
                  domains: platform.domains.join("\n"),
                  reason: "",
                });
                requestKey.current = crypto.randomUUID();
                setNetworkOpen(true);
              }}
            >
              <TileIcon name="shield" />
              <span>
                <h3>网络白名单</h3>
                <p>按已配置目标白名单校验出站访问。</p>
              </span>
              <Status>出站限制</Status>
            </button>
          </Panel>
        </div>
        <Panel title="回调与对账">
          <Link className="platform-history-row" to="/admin/reconciliation">
            <TileIcon name="audit" />
            <span>
              <h3>历史查询回调对账</h3>
              <p>保留历史查询、回调与对账记录，用于问题追溯与数据核对。</p>
            </span>
            <Status tone="green">✓ 保留</Status>
          </Link>
        </Panel>
      </div>
      {change && (
        <AdminOperationDialog
          title={`${change.value ? "开启" : "解除"}${change.title}`}
          onClose={() => setChange(undefined)}
          onConfirm={(reason, key) =>
            savePlatform(
              { [change.field]: change.value } as Partial<PlatformPreview>,
              reason,
              key,
            )
          }
        >
          <Notice>
            配置变更作为本地预览保存，历史订单、未决核验与资金事实继续可查。
          </Notice>
        </AdminOperationDialog>
      )}
      <Modal
        forceRender
        title="网络白名单预览"
        open={networkOpen}
        onCancel={() => setNetworkOpen(false)}
        onOk={() => form.submit()}
        okText="保存网络预览"
        cancelText="返回"
      >
        <Notice>
          域名按逐项白名单配置，实际解析地址与网络预算由执行网关校验。
        </Notice>
        <Form
          name="adminplatform-1"
          form={form}
          layout="vertical"
          onValuesChange={() => {
            requestKey.current = crypto.randomUUID();
          }}
          onFinish={(values) => {
            try {
              savePlatform(
                {
                  domains: [
                    ...new Set(
                      String(values.domains || "")
                        .split(/[\n,，]/)
                        .map((value) => value.trim().toLowerCase())
                        .filter(Boolean),
                    ),
                  ],
                },
                values.reason,
                requestKey.current,
              );
              setNetworkOpen(false);
              void message.success("网络策略预览已保存");
            } catch (error) {
              void message.error(
                error instanceof Error ? error.message : "保存失败",
              );
            }
          }}
        >
          <Form.Item name="domains" label="允许域名">
            <Input.TextArea
              rows={4}
              placeholder="每行一个公网域名，如 api.example.com"
            />
          </Form.Item>
          <Form.Item
            label="处理理由"
            name="reason"
            rules={[
              { required: true, whitespace: true, message: "请填写处理理由" },
            ]}
          >
            <Input.TextArea rows={2} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

const initialAuditRows = [
  {
    id: "A01",
    object: "账号 adm****001",
    action: "授权能力",
    reason: "开通catalog.manage以处理目录维护",
    result: "成功",
  },
  {
    id: "A02",
    object: "账号 ops****217",
    action: "调整授权",
    reason: "排障临时需要运行权限",
    result: "成功",
  },
  {
    id: "A03",
    object: "账号 biz****308",
    action: "撤销授权",
    reason: "项目结束，收回临时权限",
    result: "成功",
  },
  {
    id: "A04",
    object: "账号 dev****745",
    action: "授权能力",
    reason: "联调运行环境",
    result: "成功",
  },
  {
    id: "A05",
    object: "账号 ops****217",
    action: "排障会话",
    reason: "临时排查运行异常（30分钟）",
    result: "成功",
  },
];
export function AdminAccessPage() {
  const { enabled, grants, saveGrant, revokeGrant } = useAdminOperations();
  const { notes } = useAdminPreview();
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const editingId = params.get("grant");
  const editing = Boolean(editingId);
  const sessionsOpen = params.get("sessions") === "1";
  const requestKey = useRef(crypto.randomUUID());
  const submitted = useRef(false);
  function setEditing(value: boolean, id = "new") {
    const next = new URLSearchParams(params);
    if (value) next.set("grant", id);
    else next.delete("grant");
    setParams(next);
  }
  function setSessionsOpen(value: boolean) {
    const next = new URLSearchParams(params);
    if (value) next.set("sessions", "1");
    else next.delete("sessions");
    setParams(next);
  }
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const activeGrants = grants.filter((item) => !item.revoked);
  const auditRows = enabled
    ? [
        ...notes.map((item) => ({
          id: item.id,
          object: item.resourceId,
          action: "本地管理预览",
          reason: item.reason,
          result: "已记录",
        })),
        ...initialAuditRows,
      ]
    : [];
  useEffect(() => {
    if (!enabled || !editingId) return;
    form.resetFields();
    const grant = grants.find((item) => item.id === editingId && !item.revoked);
    if (grant)
      form.setFieldsValue({
        id: grant.id,
        capabilities: grant.capabilities,
        expiresAt: grant.expiresAt ? dayjs(grant.expiresAt) : undefined,
        revision: grant.revision ?? 1,
        reason: "",
      });
    requestKey.current = crypto.randomUUID();
    submitted.current = false;
  }, [editingId, enabled, form]);
  function chooseGrant(id: string) {
    setEditing(true, id);
  }
  function open(grant?: GrantPreview) {
    setEditing(true, grant?.id || "new");
  }
  if (!enabled) return <AdminAccessLivePage />;
  function submit(revoke = false) {
    void form
      .validateFields()
      .then((values) => {
        try {
          if (submitted.current) return;
          if (revoke)
            revokeGrant(
              values.id,
              values.reason,
              values.revision,
              requestKey.current,
            );
          else
            saveGrant(
              values.id,
              values.capabilities,
              values.expiresAt?.format("YYYY-MM-DD"),
              values.reason,
              values.revision,
              requestKey.current,
            );
          submitted.current = true;
          setEditing(false);
          void message.success("授权管理预览已保存");
        } catch (error) {
          void message.error(
            error instanceof Error ? error.message : "保存失败",
          );
        }
      })
      .catch(() => {});
  }
  return (
    <div className="admin-page admin-access-page">
      <div className="admin-access-banner">
        <PageHeading
          title="权限与操作审计"
          description="管理平台权限与账号授权，提供关键操作的审计记录与可追溯能力，保障平台安全合规运行。"
        />
      </div>
      <Panel title="ADMIN能力矩阵" className="admin-capability-matrix">
        <div>
          {governanceCapabilities.map(([capability, text]) => (
            <article key={capability}>
              <span className="governance-capability-icon" aria-hidden>
                <Icon name="code-brackets" />
              </span>
              <span>
                <h3>{capability}</h3>
                <p>{text}</p>
              </span>
            </article>
          ))}
        </div>
      </Panel>
      <div className="admin-access-columns">
        <Panel
          title="账号权限管理"
          extra={
            <Button type="primary" disabled={!enabled} onClick={() => open()}>
              授权管理
            </Button>
          }
        >
          <p>查看账号权限、授权范围与有效期。最后有效权限管理员受到保护。</p>
          <Table<GrantPreview>
            rowKey="id"
            tableLayout="fixed"
            dataSource={activeGrants}
            scroll={{ x: 690 }}
            pagination={false}
            columns={[
              {
                title: "账号（掩码）",
                width: "25%",
                render: (_, row) => (
                  <span>
                    {row.mask} <Status>{row.label}</Status>
                  </span>
                ),
              },
              {
                title: "已授权能力",
                width: "41%",
                render: (_, row) => (
                  <div className="grant-capabilities">
                    {row.capabilities.map((item) => (
                      <code key={item}>{item}</code>
                    ))}
                  </div>
                ),
              },
              {
                title: "授权到期",
                width: "19%",
                render: (_, row) => row.expiresAt || "长期有效",
              },
              {
                title: "操作",
                width: "15%",
                render: (_, row) =>
                  row.ownerId === bootstrap.user?.id ? (
                    "—"
                  ) : (
                    <Button type="link" onClick={() => open(row)}>
                      调整权限
                    </Button>
                  ),
              },
            ]}
          />
          <Notice>
            最后有效权限管理员用于保障平台可用性，撤销前需要保留有效管理能力。
          </Notice>
        </Panel>
        <Panel
          title="操作审计"
          extra={
            <Button
              type="text"
              disabled={!bootstrap.user?.capabilities.includes("data.diagnose")}
              onClick={() => setSessionsOpen(true)}
            >
              <Icon name="clock" /> 限时排障会话30分钟
            </Button>
          }
        >
          <p>
            记录关键操作行为，包括操作对象、动作、理由与执行结果，便于追溯与排障。
          </p>
          <Table
            rowKey="id"
            tableLayout="fixed"
            dataSource={auditRows}
            scroll={{ x: 740 }}
            pagination={
              auditRows.length > 5
                ? { pageSize: 5, showSizeChanger: false }
                : false
            }
            columns={[
              { title: "对象", dataIndex: "object", width: "26%" },
              { title: "动作", dataIndex: "action", width: 132 },
              { title: "理由", dataIndex: "reason" },
              {
                title: "结果",
                dataIndex: "result",
                width: 114,
                render: (value) => (
                  <Status tone={value === "成功" ? "green" : "blue"}>
                    {value}
                  </Status>
                ),
              },
            ]}
          />
        </Panel>
      </div>
      <Notice>
        权限规则 ·
        本人授权由其他有效权限管理员处理，授权操作直接记录能力与审计。
      </Notice>
      <Modal
        forceRender
        title="授权管理预览"
        open={editing}
        onCancel={() => setEditing(false)}
        footer={
          <>
            <Button onClick={() => setEditing(false)}>返回</Button>
            <Button danger onClick={() => submit(true)}>
              撤销授权
            </Button>
            <Button type="primary" onClick={() => submit()}>
              保存授权预览
            </Button>
          </>
        }
      >
        <Notice>
          后台能力按账号分配，账号身份和当前登录会话以服务端授权为准。
        </Notice>
        {editingId &&
          editingId !== "new" &&
          !activeGrants.some((item) => item.id === editingId) && (
            <Empty description={`授权 ${editingId} 不可用`} />
          )}
        <Form
          name="adminplatform-2"
          form={form}
          layout="vertical"
          onValuesChange={() => {
            requestKey.current = crypto.randomUUID();
          }}
        >
          <Form.Item name="revision" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="id"
            label="目标账号"
            rules={[{ required: true, message: "请选择目标账号" }]}
          >
            <Select
              aria-label="目标账号"
              options={activeGrants.map((item) => ({
                value: item.id,
                label: `${item.mask} · ${item.label}`,
                disabled: item.ownerId === bootstrap.user?.id,
              }))}
              onChange={chooseGrant}
            />
          </Form.Item>
          <Form.Item
            name="capabilities"
            label="授权能力"
            rules={[
              {
                required: true,
                type: "array",
                min: 1,
                message: "至少选择一项能力",
              },
            ]}
          >
            <Select
              aria-label="授权能力"
              mode="multiple"
              options={managementCapabilities.map((value) => ({ value }))}
            />
          </Form.Item>
          <Form.Item name="expiresAt" label="授权到期日">
            <DatePicker placeholder="留空表示长期有效" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="处理理由"
            rules={[
              { required: true, whitespace: true, message: "请填写处理理由" },
            ]}
          >
            <Input.TextArea maxLength={200} rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="限时排障会话"
        open={sessionsOpen}
        onCancel={() => setSessionsOpen(false)}
        footer={
          <Button onClick={() => setSessionsOpen(false)}>关闭会话记录</Button>
        }
      >
        <Notice>
          会话按对象、字段、动作和期限授权，签发与撤销需要服务端回执。
        </Notice>
        <p>当前页面预览未签发敏感访问凭证。</p>
        <Link to="/admin/runs">前往运行与排障</Link>
      </Modal>
    </div>
  );
}

export function AdminRecoveryPage() {
  const { enabled, retention, operations, saveRetention, requestOperation } =
    useAdminOperations();
  const [params, setParams] = useSearchParams();
  const dialog = params.get("dialog");
  const policyOpen = dialog === "retention";
  const precheckOpen = dialog === "precheck";
  const operation =
    dialog === "backup"
      ? "BACKUP_CREATE"
      : dialog === "drill"
        ? "RECOVERY_PLAN"
        : undefined;
  function setDialog(value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("dialog", value);
    else next.delete("dialog");
    setParams(next);
  }
  function setPolicyOpen(value: boolean) {
    setDialog(value ? "retention" : undefined);
  }
  function setPrecheckOpen(value: boolean) {
    setDialog(value ? "precheck" : undefined);
  }
  function setOperation(value?: "BACKUP_CREATE" | "RECOVERY_PLAN") {
    setDialog(
      value === "BACKUP_CREATE"
        ? "backup"
        : value === "RECOVERY_PLAN"
          ? "drill"
          : undefined,
    );
  }
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const policySubmitted = useRef(false);
  useEffect(() => {
    if (!enabled || !policyOpen) return;
    form.resetFields();
    form.setFieldsValue({ ...retention, reason: "" });
    requestKey.current = crypto.randomUUID();
    policySubmitted.current = false;
  }, [policyOpen, enabled, form]);
  const { message, modal } = App.useApp();
  const planned = operations.some((item) => item.kind === "RECOVERY_PLAN");
  if (!enabled) return <AdminRecoveryLivePage />;
  const policyRows = enabled
    ? [
        {
          id: "ledger",
          object: "订单账本",
          label: "核心",
          policy: "按成交与财务保留策略",
          description: "未结资金事实持续保留，已结记录按配置期限保留。",
        },
        {
          id: "bookings",
          object: "未决预约",
          label: "关键",
          policy: "有界延期保留",
          description: "只保留必要证据，延期须有原因、到期日与审计。",
        },
        {
          id: "logs",
          object: "运行日志",
          label: "工具",
          policy: `热检索${retention.hotDays}天 / 总保留${retention.totalDays}天`,
          description: "总期限包含热检索，按原观察时间计算。",
        },
        {
          id: "outputs",
          object: "普通产物",
          label: "存档",
          policy: `默认保留${retention.outputDays}天`,
          description: "按批次创建时间计算，必要证据有界延期。",
        },
      ]
    : [];
  return (
    <div className="admin-page admin-recovery-page">
      <PageHeading title="备份与清理" />
      <div className="admin-backup-banner">
        <div className="backup-stack">
          <span />
          <span />
          <span />
          <i>
            <Icon name="sync" />
          </i>
        </div>
        <span>
          <h2>备份与清理</h2>
          <p>
            保障数据可恢复与存储可控，支持备份、恢复预检与恢复演练。未结事实按保留规则处理。
          </p>
        </span>
        <Button
          type="primary"
          disabled={!enabled}
          onClick={() => setOperation("BACKUP_CREATE")}
        >
          创建备份
        </Button>
        <Button disabled={!enabled} onClick={() => setPrecheckOpen(true)}>
          恢复预检
        </Button>
      </div>
      <div className="backup-status-row">
        <Status tone={enabled ? "green" : "gray"}>
          <Icon name={enabled ? "check-solid" : "clock"} />
          {enabled ? "最近备份成功" : "备份状态待采集"}
        </Status>
        <Status tone={planned ? "blue" : "orange"}>
          <Icon name={planned ? "clock" : "exclamation"} />
          {planned ? "恢复演练已登记" : "恢复演练未执行"}
        </Status>
      </div>
      <div className="admin-recovery-columns">
        <Panel
          title={
            <>
              保留策略 <small>建议初值，上线前配置</small>
            </>
          }
        >
          <Table
            rowKey="id"
            tableLayout="fixed"
            dataSource={policyRows}
            scroll={{ x: 944 }}
            pagination={false}
            columns={[
              {
                title: "数据对象",
                width: 230,
                render: (_, row) => (
                  <Button
                    type="text"
                    onClick={() => {
                      if (row.id === "logs" || row.id === "outputs") {
                        setPolicyOpen(true);
                      } else
                        modal.info({
                          title: row.object,
                          content: (
                            <p>
                              {row.description}　{row.policy}
                            </p>
                          ),
                          okText: "关闭",
                        });
                    }}
                  >
                    <b>{row.object}</b> <Status>{row.label}</Status>
                  </Button>
                ),
              },
              { title: "保留策略", dataIndex: "policy", width: 237 },
              { title: "说明", dataIndex: "description", width: 477 },
            ]}
          />
        </Panel>
        <div>
          <Panel title="备份包含范围" className="backup-scope">
            <span className="backup-scope-cylinder" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span>
              <h3>备份包含权益去重及撤权墓碑</h3>
              <p>
                除业务数据外，同时备份权益去重信息与撤权的基础记录，确保恢复后历史权益及撤权状态可追溯。
              </p>
            </span>
          </Panel>
          <Panel title="恢复演练步骤" className="recovery-steps">
            <Notice>
              <span>
                <h3>演练前请先核对资金和未决预约。</h3>
                <p>
                  恢复演练在独立验证环境执行，恢复后的资金与外部预约由原事实核对。
                </p>
              </span>
            </Notice>
            {[
              ["核对资金", "确认账本金额与状态一致，无异常。"],
              ["核对未决预约", "确认未决预约数量与关键状态一致。"],
              ["执行演练", "按预检结果进行数据恢复演练，验证可恢复性。"],
            ].map(([title, description], index) => (
              <article key={title}>
                <b>{index + 1}</b>
                <span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </span>
              </article>
            ))}
          </Panel>
        </div>
      </div>
      <Modal
        forceRender
        title={`保留策略预览 v${retention.version + 1}`}
        open={policyOpen}
        onCancel={() => setPolicyOpen(false)}
        onOk={() => form.submit()}
        okText="保存策略预览"
        cancelText="返回"
      >
        <Form
          name="adminplatform-3"
          form={form}
          layout="vertical"
          onValuesChange={() => {
            requestKey.current = crypto.randomUUID();
          }}
          onFinish={(values) => {
            try {
              if (policySubmitted.current) return;
              saveRetention(
                {
                  hotDays: values.hotDays,
                  totalDays: values.totalDays,
                  outputDays: values.outputDays,
                },
                values.reason,
                requestKey.current,
                values.version,
              );
              policySubmitted.current = true;
              setPolicyOpen(false);
              void message.success("保留策略预览已保存");
            } catch (error) {
              void message.error(
                error instanceof Error ? error.message : "保存失败",
              );
            }
          }}
        >
          <Form.Item name="version" hidden>
            <Input />
          </Form.Item>
          <Form.Item
            name="hotDays"
            label="日志热检索天数"
            rules={[{ required: true }, { type: "integer", min: 1 }]}
          >
            <InputNumber min={1} precision={0} />
          </Form.Item>
          <Form.Item
            name="totalDays"
            label="日志总保留天数"
            rules={[{ required: true }, { type: "integer", min: 1 }]}
          >
            <InputNumber min={1} precision={0} />
          </Form.Item>
          <Form.Item
            name="outputDays"
            label="普通产物保留天数"
            rules={[{ required: true }, { type: "integer", min: 1 }]}
          >
            <InputNumber min={1} precision={0} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="处理理由"
            rules={[
              { required: true, whitespace: true, message: "请填写处理理由" },
            ]}
          >
            <Input.TextArea maxLength={200} rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="恢复预检"
        open={precheckOpen}
        onCancel={() => setPrecheckOpen(false)}
        footer={
          <>
            <Button onClick={() => setPrecheckOpen(false)}>关闭预检</Button>
            <Button
              type="primary"
              onClick={() => {
                setPrecheckOpen(false);
                setOperation("RECOVERY_PLAN");
              }}
            >
              登记恢复演练
            </Button>
          </>
        }
      >
        <Notice>
          预检和演练证据由受控运维作业记录，当前提供本地计划预览。
        </Notice>
        <p>最近备份 · 示例备份2026-11-13</p>
        <p>
          资金核对 · 待执行　
          <Link to="/admin/reconciliation">查看对账中心</Link>
        </p>
        <p>
          未决预约核对 · 待执行　
          <Link to="/admin/travel/unresolved">查看异常预约</Link>
        </p>
        <p>演练范围 · 独立验证环境</p>
      </Modal>
      {operation && (
        <AdminOperationDialog
          title={
            operation === "BACKUP_CREATE"
              ? "创建备份请求预览"
              : "登记恢复演练预览"
          }
          onClose={() => setOperation(undefined)}
          onConfirm={(reason, key) =>
            requestOperation(operation, "BACKUP-20261113", reason, key)
          }
        >
          <Notice>
            备份与恢复实际执行等待受控运维作业证据，当前记录请求计划。
          </Notice>
        </AdminOperationDialog>
      )}
    </div>
  );
}
