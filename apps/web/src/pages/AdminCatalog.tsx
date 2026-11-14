import { useRef, useState, type Key } from "react";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Table,
  Tabs,
} from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import {
  useAdminMetadata,
  type AdminUserMetadata,
  type AdminQuotaMetadata,
  type AdminCatalogMetadata,
} from "../lib/admin-metadata";
import { Notice, PageHeading, Panel, Status } from "../components/ui";
import {
  useAdminPreview,
  type AdminAccount,
  type AdminService,
} from "../admin-preview";
import { useWorkspace } from "../context";

const accountStatuses: Record<string, string> = {
  UNVERIFIED: "待验证",
  ACTIVE: "正常",
  FROZEN: "已冻结",
  CLOSING: "注销处理中",
  CLOSED: "已注销",
};
const serviceStatuses: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "在售",
  PAUSED: "停销",
  RETIRED: "已退役",
  BLOCKED: "风险停销",
};
function AccountQuotas({ id }: { id: string }) {
  const query = useAdminMetadata<AdminQuotaMetadata>(
    `users/${encodeURIComponent(id)}/quotas`,
    "",
    true,
  );
  return (
    <div className="admin-quota-details">
      <h3>当前资源配额</h3>
      {query.isError && (
        <Alert
          type="error"
          title="配额查询失败"
          action={
            <Button onClick={() => void query.refetch()}>重试配额</Button>
          }
        />
      )}
      <Table<AdminQuotaMetadata>
        rowKey="id"
        pagination={false}
        loading={query.isFetching}
        dataSource={query.data?.pages.flatMap((page) => page.items) || []}
        scroll={{ x: 720 }}
        columns={[
          { title: "资源", dataIndex: "resource_key" },
          { title: "窗口起点", dataIndex: "window_start" },
          { title: "上限", dataIndex: "limit_amount" },
          { title: "预留", dataIndex: "reserved_amount" },
          { title: "已消耗", dataIndex: "consumed_amount" },
          { title: "可用", dataIndex: "available_amount" },
        ]}
      />
      {query.hasNextPage && (
        <Button
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          加载更多配额
        </Button>
      )}
    </div>
  );
}

export function AdminUsersPage() {
  const { accounts, updateAccount, enabled } = useAdminPreview();
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const handled = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [dialog, setDialog] = useState<{
    account: AdminAccount;
    action: "summary" | "quota" | "status";
  }>();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const canRead = Boolean(bootstrap.user?.capabilities.includes("user.manage"));
  const canManage = enabled && canRead;
  const remote = useAdminMetadata<AdminUserMetadata>(
    "users",
    new URLSearchParams({ q: query.trim() }).toString(),
    !enabled && canRead,
  );
  const rows: AdminAccount[] = enabled
    ? accounts.filter(
        (item) =>
          item.name.includes(query.trim()) || item.mask.includes(query.trim()),
      )
    : (remote.data?.pages.flatMap((page) => page.items) || []).map((item) => ({
        id: item.id,
        name: item.display_name_mask,
        mask: item.account_mask,
        publisher: item.publisher,
        status: item.status as AdminAccount["status"],
        revision: item.revision,
        quota: 0,
        used: 0,
        openOrders: item.open_order_count,
        live: true,
        quotaResourceCount: item.quota_resource_count,
        lastAccessManager: item.is_last_access_manager,
      }));
  const visibleSelectedIds = selectedIds.filter((id) =>
    rows.some((item) => item.id === id),
  );
  const selected =
    visibleSelectedIds.length === 1
      ? rows.find((item) => item.id === visibleSelectedIds[0])
      : undefined;
  function protectedAccount(account: AdminAccount) {
    return account.id === bootstrap.user?.id || account.lastAccessManager;
  }
  function open(account: AdminAccount, action: "summary" | "quota" | "status") {
    if (
      action !== "summary" &&
      (!canManage || (action === "status" && protectedAccount(account)))
    )
      return;
    handled.current = false;
    form.resetFields();
    form.setFieldValue("quota", account.quota);
    setDialog({ account, action });
  }
  function openSelected(action: "summary" | "quota" | "status") {
    if (!selected) {
      void message.info("请先选择一个账号");
      return;
    }
    open(selected, action);
  }
  return (
    <div className="admin-page admin-users-page">
      <PageHeading
        title="用户与发布者"
        description="管理平台的用户与脚本发布者，查看能力与配额，按需调整配额或限制新业务，支持冻结账号以保障已有退款和结算不受影响。"
      />
      <div className="admin-users-freeze-notice">
        <Notice>
          <span>
            <h3>冻结说明</h3>
            <p>
              冻结后将停止该账号的新业务申请和创建，已有订单的退款与结算继续处理。
            </p>
          </span>
        </Notice>
      </div>
      <div className="admin-users-toolbar">
        <div className="row-actions">
          <Button type="primary" onClick={() => openSelected("summary")}>
            查看摘要
          </Button>
          <Button disabled={!canManage} onClick={() => openSelected("quota")}>
            调整配额
          </Button>
          <Button
            disabled={
              !canManage || Boolean(selected && protectedAccount(selected))
            }
            onClick={() => openSelected("status")}
          >
            {selected?.status === "FROZEN" ? "解除限制" : "限制新业务"}
          </Button>
        </div>
        <Input
          aria-label="搜索用户"
          prefix={<SearchOutlined />}
          placeholder="搜索用户昵称或账号"
          value={query}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set("q", event.target.value);
            else next.delete("q");
            setParams(next, { replace: true });
            setSelectedIds([]);
          }}
          allowClear
        />
      </div>
      {!enabled && (
        <Notice>管理变更接口待接入，当前支持账号摘要与按资源查看配额。</Notice>
      )}
      {!enabled && remote.isError && (
        <Alert
          className="admin-metadata-error"
          type="error"
          title="账号查询失败"
          action={
            <Button onClick={() => void remote.refetch()}>重试账号查询</Button>
          }
        />
      )}
      <Panel className="admin-users-table">
        <Table<AdminAccount>
          rowKey="id"
          dataSource={rows}
          loading={!enabled && remote.isFetching}
          scroll={{ x: 1100 }}
          pagination={false}
          rowSelection={{
            selectedRowKeys: visibleSelectedIds,
            onChange: setSelectedIds,
          }}
          columns={[
            { title: "用户昵称", dataIndex: "name", width: 150 },
            { title: "账号掩码", dataIndex: "mask", width: 165 },
            { title: "消费者能力", render: () => <Status>消费者</Status> },
            {
              title: "发布能力",
              render: (_, row) =>
                row.publisher ? <Status tone="purple">发布者</Status> : "—",
            },
            {
              title: "状态",
              render: (_, row) => (
                <Status tone={row.status === "ACTIVE" ? "green" : "orange"}>
                  {accountStatuses[row.status] || row.status}
                </Status>
              ),
            },
            {
              title: "配额",
              dataIndex: "quota",
              render: (_, row) =>
                row.live
                  ? `${row.quotaResourceCount} 类资源`
                  : `${row.quota.toLocaleString("en-US")} 次`,
            },
            {
              title: enabled ? "未结订单" : "待支付/履约订单",
              dataIndex: "openOrders",
            },
            {
              title: "操作",
              width: 355,
              render: (_, row) => (
                <div className="row-actions">
                  <Button type="link" onClick={() => open(row, "summary")}>
                    查看摘要
                  </Button>
                  <Button
                    type="link"
                    disabled={!canManage}
                    onClick={() => open(row, "quota")}
                  >
                    调整配额
                  </Button>
                  <Button
                    type="link"
                    disabled={
                      !canManage ||
                      protectedAccount(row) ||
                      !["ACTIVE", "FROZEN"].includes(row.status)
                    }
                    onClick={() => open(row, "status")}
                  >
                    {row.status === "ACTIVE" ? "限制新业务" : "解除限制"}
                  </Button>
                </div>
              ),
            },
          ]}
        />
        {!enabled && remote.hasNextPage && (
          <Button
            loading={remote.isFetchingNextPage}
            onClick={() => void remote.fetchNextPage()}
          >
            加载更多账号
          </Button>
        )}
      </Panel>
      <Modal
        forceRender
        width={dialog?.account.live ? 820 : 520}
        title={
          dialog?.action === "summary"
            ? "账号摘要"
            : dialog?.action === "quota"
              ? "调整账号配额"
              : dialog?.account.status === "FROZEN"
                ? "解除新业务限制"
                : "限制新业务"
        }
        open={Boolean(dialog)}
        onCancel={() => setDialog(undefined)}
        footer={
          dialog?.action === "summary" ? (
            <Button onClick={() => setDialog(undefined)}>关闭摘要</Button>
          ) : undefined
        }
        okText="保存管理预览"
        cancelText="返回"
        onOk={() => form.submit()}
      >
        {dialog?.action === "summary" ? (
          <div>
            <dl className="admin-account-summary">
              <dt>用户昵称</dt>
              <dd>{dialog.account.name}</dd>
              <dt>账号掩码</dt>
              <dd>{dialog.account.mask}</dd>
              <dt>账号能力</dt>
              <dd>消费者{dialog.account.publisher ? "、发布者" : ""}</dd>
              <dt>资源配额</dt>
              <dd>
                {dialog.account.live
                  ? `${dialog.account.quotaResourceCount} 类资源`
                  : `${dialog.account.used} / ${dialog.account.quota} 次`}
              </dd>
              <dt>{dialog.account.live ? "待支付/履约订单" : "未结订单"}</dt>
              <dd>{dialog.account.openOrders}</dd>
              <dt>状态</dt>
              <dd>
                {accountStatuses[dialog.account.status] ||
                  dialog.account.status}
              </dd>
              <dt>记录版本</dt>
              <dd>{dialog.account.revision}</dd>
              {(dialog.account.id === bootstrap.user?.id ||
                dialog.account.lastAccessManager) && (
                <>
                  <dt>账号保护</dt>
                  <dd>
                    {dialog.account.id === bootstrap.user?.id
                      ? "当前管理员"
                      : "最后有效权限管理员"}
                  </dd>
                </>
              )}
            </dl>
            {dialog.account.live && (
              <AccountQuotas key={dialog.account.id} id={dialog.account.id} />
            )}
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => {
              if (!dialog || handled.current || !canManage) return;
              try {
                updateAccount(
                  dialog.account.id,
                  dialog.action === "quota"
                    ? { quota: values.quota }
                    : {
                        status:
                          dialog.account.status === "ACTIVE"
                            ? "FROZEN"
                            : "ACTIVE",
                      },
                  values.reason,
                  dialog.account.revision,
                );
                handled.current = true;
                setDialog(undefined);
                void message.success("账号管理预览已保存");
              } catch (error) {
                void message.error(
                  error instanceof Error ? error.message : "操作失败",
                );
              }
            }}
          >
            <Notice>
              {dialog?.action === "quota"
                ? `当前占用${dialog?.account.used ?? 0}次，降低配额需要覆盖已占用资源。`
                : dialog?.account.status === "FROZEN"
                  ? "解冻恢复后续新业务申请，原任务按既有状态展示。"
                  : "限制新业务后，存量退款、结算与未决事实继续处理。"}
            </Notice>
            <p>
              {dialog?.account.name} · {dialog?.account.mask}
            </p>
            {dialog?.action === "quota" && (
              <Form.Item
                label="账号配额"
                name="quota"
                rules={[
                  { required: true, message: "请填写配额" },
                  {
                    type: "integer",
                    min: dialog.account.used,
                    max: 1000000,
                    message: `配额须为${dialog.account.used}至1000000之间的整数`,
                  },
                ]}
              >
                <InputNumber
                  aria-label="账号配额"
                  min={dialog.account.used}
                  max={1000000}
                  precision={0}
                  suffix="次"
                />
              </Form.Item>
            )}
            <Form.Item
              name="reason"
              label="处理理由"
              rules={[
                { required: true, whitespace: true, message: "请填写处理理由" },
              ]}
            >
              <Input.TextArea rows={3} maxLength={200} showCount />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}

export function AdminServicesPage() {
  const { services, updateService, notes, enabled } = useAdminPreview();
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("view") || "services";
  const validTab = ["services", "scripts"].includes(requestedTab);
  const tab = validTab ? requestedTab : "services";
  function setTab(value: string) {
    const next = new URLSearchParams(params);
    next.set("view", value);
    setParams(next);
  }
  const [dialog, setDialog] = useState<{
    service: AdminService;
    action: "block" | "restore" | "revoke" | "impact";
  }>();
  const [form] = Form.useForm();
  const handled = useRef(false);
  const { message } = App.useApp();
  const canRead = Boolean(
    bootstrap.user?.capabilities.includes("catalog.manage"),
  );
  const canManage = enabled && canRead;
  const remote = useAdminMetadata<AdminCatalogMetadata>(
    "services",
    new URLSearchParams({
      view: tab === "scripts" ? "versions" : "services",
    }).toString(),
    !enabled && canRead && validTab,
  );
  const rows: AdminService[] = !validTab
    ? []
    : enabled
      ? services
      : (remote.data?.pages.flatMap((page) => page.items) || []).map(
          (item) => ({
            id: item.id,
            title: item.title,
            publisher: item.publisher,
            version: item.version || "未绑定版本",
            deployed: item.deployment_status === "READY",
            active: item.status === "ACTIVE",
            revoked: item.content_status === "REVOKED",
            entitlements: item.entitlement_count,
            revision: item.revision,
            contentStatus: item.content_status,
            deploymentStatus: item.deployment_status,
            status: item.status,
            live: true,
            risk: "待接入风险核验",
          }),
        );
  function open(
    service: AdminService,
    action: "block" | "restore" | "revoke" | "impact",
  ) {
    if (action !== "impact" && !canManage) return;
    form.resetFields();
    handled.current = false;
    setDialog({ service, action });
  }
  return (
    <div className="admin-page admin-services-page">
      <PageHeading title="服务与脚本" />
      {!validTab && (
        <Notice>所选目录视图不存在，请选择服务商品或脚本版本。</Notice>
      )}
      {!enabled && (
        <Notice>管理变更接口待接入，当前支持服务和脚本版本元数据查询。</Notice>
      )}
      {!enabled && remote.isError && (
        <Alert
          className="admin-metadata-error"
          type="error"
          title="目录查询失败"
          action={
            <Button onClick={() => void remote.refetch()}>重试目录查询</Button>
          }
        />
      )}
      <Panel>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "services",
              label: "服务商品",
              children: (
                <Table<AdminService>
                  rowKey="id"
                  dataSource={rows}
                  loading={!enabled && remote.isFetching}
                  scroll={{ x: 1200 }}
                  pagination={false}
                  columns={[
                    {
                      title: "服务",
                      dataIndex: "title",
                      width: 200,
                      render: (value) => <strong>{value}</strong>,
                    },
                    { title: "发布者", dataIndex: "publisher" },
                    {
                      title: "部署",
                      render: (_, row) => (
                        <Status tone={row.deployed ? "green" : "orange"}>
                          {row.live
                            ? row.deploymentStatus || "未绑定部署"
                            : row.deployed
                              ? "READY"
                              : "未就绪"}
                        </Status>
                      ),
                    },
                    {
                      title: "在售状态",
                      render: (_, row) => (
                        <Status tone={row.active ? "blue" : "gray"}>
                          {row.live
                            ? serviceStatuses[row.status || ""] || row.status
                            : row.active
                              ? "在售"
                              : "停销"}
                        </Status>
                      ),
                    },
                    {
                      title: "风险提示",
                      render: (_, row) => (
                        <Status
                          tone={
                            row.live
                              ? "gray"
                              : row.revoked
                                ? "red"
                                : row.risk === "需关注"
                                  ? "orange"
                                  : row.risk === "已核查"
                                    ? "green"
                                    : "purple"
                          }
                        >
                          {row.risk}
                        </Status>
                      ),
                    },
                    {
                      title: "存量权益",
                      dataIndex: "entitlements",
                      render: (value, row) =>
                        `${typeof value === "number" ? value.toLocaleString("en-US") : value} ${row.live ? "项" : "次"}`,
                    },
                    {
                      title: "操作",
                      width: 390,
                      render: (_, row) => (
                        <div className="row-actions">
                          <Button
                            type={row.active ? "primary" : "default"}
                            disabled={!canManage || !row.active}
                            onClick={() => open(row, "block")}
                          >
                            风险停销
                          </Button>
                          <Button
                            disabled={
                              !canManage ||
                              row.active ||
                              !row.deployed ||
                              row.contentStatus !== "READY" ||
                              row.revoked
                            }
                            onClick={() => open(row, "restore")}
                          >
                            核查恢复
                          </Button>
                          <Button onClick={() => open(row, "impact")}>
                            查看影响
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: "scripts",
              label: "脚本版本",
              children: (
                <Table<AdminService>
                  rowKey="id"
                  dataSource={rows}
                  loading={!enabled && remote.isFetching}
                  scroll={{ x: 1200 }}
                  pagination={false}
                  columns={[
                    { title: "脚本", dataIndex: "title" },
                    { title: "版本", dataIndex: "version" },
                    { title: "发布者", dataIndex: "publisher" },
                    {
                      title: "内容状态",
                      render: (_, row) => (
                        <Status tone={row.revoked ? "red" : "green"}>
                          {row.contentStatus || "未绑定版本"}
                        </Status>
                      ),
                    },
                    {
                      title: "存量权益",
                      dataIndex: "entitlements",
                      render: (value, row) =>
                        `${typeof value === "number" ? value.toLocaleString("en-US") : value} ${row.live ? "项" : "次"}`,
                    },
                    {
                      title: "操作",
                      render: (_, row) => (
                        <div className="row-actions">
                          <Button
                            danger
                            disabled={!canManage || row.revoked}
                            onClick={() => open(row, "revoke")}
                          >
                            撤销执行
                          </Button>
                          <Button onClick={() => open(row, "impact")}>
                            查看影响
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
        {!enabled && remote.hasNextPage && (
          <Button
            loading={remote.isFetchingNextPage}
            onClick={() => void remote.fetchNextPage()}
          >
            加载更多目录
          </Button>
        )}
      </Panel>
      <Modal
        forceRender
        title={
          dialog?.action === "impact"
            ? "存量服务影响"
            : dialog?.action === "block"
              ? "风险停销预览"
              : dialog?.action === "restore"
                ? "核查恢复预览"
                : "撤销问题版本执行"
        }
        open={Boolean(dialog)}
        onCancel={() => setDialog(undefined)}
        okText="确认管理预览"
        cancelText="返回"
        footer={
          dialog?.action === "impact" ? (
            <Button onClick={() => setDialog(undefined)}>关闭影响</Button>
          ) : undefined
        }
        onOk={() => form.submit()}
      >
        <p>
          <b>{dialog?.service.title}</b> · {dialog?.service.version} · 存量权益{" "}
          {dialog?.service.entitlements.toLocaleString("en-US")}{" "}
          {dialog?.service.live ? "项" : "次"}
        </p>
        <Notice>
          {dialog?.action === "impact"
            ? "以下为所选记录快照，权益覆盖仍须结合订单、版本和履约状态核验。"
            : dialog?.action === "restore"
              ? "基础可售检查预览 · 部署READY、版本有效。恢复后开放新购买，历史合同继续可追溯。"
              : dialog?.action === "revoke"
                ? "问题版本停止新调用，存量履约进入影响核验与补偿流程。"
                : "停销停止新购买，存量订单继续履约或按成交规则处理退款。"}
        </Notice>
        {dialog?.action === "impact" ? (
          <div>
            <dl className="admin-account-summary">
              <dt>资源编号</dt>
              <dd>{dialog.service.id}</dd>
              <dt>记录版本</dt>
              <dd>{dialog.service.revision}</dd>
              <dt>内容状态</dt>
              <dd>{dialog.service.contentStatus || "未绑定版本"}</dd>
              <dt>部署状态</dt>
              <dd>
                {dialog.service.live
                  ? dialog.service.deploymentStatus || "未绑定部署"
                  : dialog.service.deployed
                    ? "READY"
                    : "未就绪"}
              </dd>
            </dl>
            {enabled && (
              <Link
                to={`/admin/orders?service=${encodeURIComponent(dialog.service.id === "clean" ? "表格清洗" : dialog.service.title)}`}
              >
                查看相关服务订单
              </Link>
            )}
            {enabled && <h3>本地处理记录</h3>}
            {notes
              .filter((item) => item.resourceId === dialog.service.id)
              .map((item) => (
                <p key={item.id}>
                  {item.createdAt}　{item.reason}
                </p>
              ))}
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => {
              if (!dialog || handled.current || !canManage) return;
              try {
                updateService(
                  dialog.service.id,
                  dialog.action === "revoke"
                    ? { revoked: true }
                    : { active: dialog.action === "restore" },
                  values.reason,
                  dialog.service.revision,
                );
                handled.current = true;
                setDialog(undefined);
                void message.success("服务管理预览已保存");
              } catch (error) {
                void message.error(
                  error instanceof Error ? error.message : "操作失败",
                );
              }
            }}
          >
            <Form.Item
              name="reason"
              label={
                dialog?.action === "revoke" ? "风险证据与处理理由" : "处理理由"
              }
              rules={[
                { required: true, whitespace: true, message: "请填写处理理由" },
              ]}
            >
              <Input.TextArea rows={4} maxLength={200} showCount />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
