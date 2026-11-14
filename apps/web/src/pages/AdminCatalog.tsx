import { useRef, useState, type Key } from "react";
import {
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
import { Link } from "react-router-dom";
import { Notice, PageHeading, Panel, Status } from "../components/ui";
import {
  useAdminPreview,
  type AdminAccount,
  type AdminService,
} from "../admin-preview";
import { useWorkspace } from "../context";

export function AdminUsersPage() {
  const { accounts, updateAccount } = useAdminPreview();
  const { bootstrap } = useWorkspace();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [dialog, setDialog] = useState<{
    account: AdminAccount;
    action: "summary" | "quota" | "status";
  }>();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const rows = accounts.filter(
    (item) =>
      item.name.includes(query.trim()) || item.mask.includes(query.trim()),
  );
  const canManage = Boolean(
    bootstrap.user?.capabilities.includes("user.manage"),
  );
  function open(account: AdminAccount, action: "summary" | "quota" | "status") {
    form.resetFields();
    form.setFieldValue("quota", account.quota);
    setDialog({ account, action });
  }
  function openSelected(action: "summary" | "quota" | "status") {
    const selected = accounts.find((item) => item.id === selectedIds[0]);
    if (!selected || selectedIds.length !== 1) {
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
          <Button disabled={!canManage} onClick={() => openSelected("status")}>
            限制新业务
          </Button>
        </div>
        <Input
          aria-label="搜索用户"
          prefix={<SearchOutlined />}
          placeholder="搜索用户昵称或账号"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
      </div>
      <Panel className="admin-users-table">
        <Table<AdminAccount>
          rowKey="id"
          dataSource={rows}
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedIds,
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
                  {row.status === "ACTIVE" ? "正常" : "已冻结"}
                </Status>
              ),
            },
            {
              title: "配额",
              dataIndex: "quota",
              render: (value) => `${value.toLocaleString("en-US")} 次`,
            },
            { title: "未结订单", dataIndex: "openOrders" },
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
                      row.id === bootstrap.user?.id ||
                      row.lastAccessManager
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
      </Panel>
      <Modal
        forceRender
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
          <dl className="admin-account-summary">
            <dt>用户昵称</dt>
            <dd>{dialog.account.name}</dd>
            <dt>账号掩码</dt>
            <dd>{dialog.account.mask}</dd>
            <dt>账号能力</dt>
            <dd>消费者{dialog.account.publisher ? "、发布者" : ""}</dd>
            <dt>资源配额</dt>
            <dd>
              {dialog.account.used} / {dialog.account.quota} 次
            </dd>
            <dt>未结订单</dt>
            <dd>{dialog.account.openOrders}</dd>
            <dt>状态</dt>
            <dd>{dialog.account.status === "ACTIVE" ? "正常" : "已冻结"}</dd>
          </dl>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => {
              if (!dialog) return;
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
                );
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
  const { services, updateService, notes } = useAdminPreview();
  const { bootstrap } = useWorkspace();
  const [tab, setTab] = useState("services");
  const [dialog, setDialog] = useState<{
    service: AdminService;
    action: "block" | "restore" | "revoke" | "impact";
  }>();
  const [form] = Form.useForm();
  const handled = useRef(false);
  const { message } = App.useApp();
  const canManage = Boolean(
    bootstrap.user?.capabilities.includes("catalog.manage"),
  );
  function open(
    service: AdminService,
    action: "block" | "restore" | "revoke" | "impact",
  ) {
    form.resetFields();
    handled.current = false;
    setDialog({ service, action });
  }
  return (
    <div className="admin-page admin-services-page">
      <PageHeading title="服务与脚本" />
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
                  dataSource={services}
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
                          {row.deployed ? "READY" : "未就绪"}
                        </Status>
                      ),
                    },
                    {
                      title: "在售状态",
                      render: (_, row) => (
                        <Status tone={row.active ? "blue" : "gray"}>
                          {row.active ? "在售" : "停销"}
                        </Status>
                      ),
                    },
                    {
                      title: "风险提示",
                      render: (_, row) => (
                        <Status
                          tone={
                            row.revoked
                              ? "red"
                              : row.active
                                ? "orange"
                                : "purple"
                          }
                        >
                          {row.revoked
                            ? "已撤销执行"
                            : row.active
                              ? "需关注"
                              : "待核查"}
                        </Status>
                      ),
                    },
                    {
                      title: "存量权益",
                      dataIndex: "entitlements",
                      render: (value) => `${value.toLocaleString("en-US")} 次`,
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
                  dataSource={services}
                  pagination={false}
                  columns={[
                    { title: "脚本", dataIndex: "title" },
                    { title: "版本", dataIndex: "version" },
                    { title: "发布者", dataIndex: "publisher" },
                    {
                      title: "内容状态",
                      render: (_, row) => (
                        <Status tone={row.revoked ? "red" : "green"}>
                          {row.revoked ? "REVOKED" : "READY"}
                        </Status>
                      ),
                    },
                    {
                      title: "存量权益",
                      dataIndex: "entitlements",
                      render: (value) => `${value.toLocaleString("en-US")} 次`,
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
          {dialog?.service.entitlements.toLocaleString("en-US")} 次
        </p>
        <Notice>
          {dialog?.action === "restore"
            ? "基础可售检查预览 · 部署READY、版本有效。恢复后开放新购买，历史合同继续可追溯。"
            : dialog?.action === "revoke"
              ? "问题版本停止新调用，存量履约进入影响核验与补偿流程。"
              : "停销停止新购买，存量订单继续履约或按成交规则处理退款。"}
        </Notice>
        {dialog?.action === "impact" ? (
          <div>
            <Link
              to={`/admin/orders?service=${encodeURIComponent(dialog.service.id === "clean" ? "表格清洗" : "文件工具")}`}
            >
              查看相关服务订单
            </Link>
            <h3>本地处理记录</h3>
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
              if (!dialog || handled.current) return;
              try {
                updateService(
                  dialog.service.id,
                  dialog.action === "revoke"
                    ? { revoked: true }
                    : { active: dialog.action === "restore" },
                  values.reason,
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
