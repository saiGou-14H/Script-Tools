import { pendingFixtures } from "../lib/consumer-preview";
import { useLayoutEffect, useRef } from "react";
import {
  App,
  Alert,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tabs,
} from "antd";
import {
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  IdcardOutlined,
  PhoneOutlined,
  PlusOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import {
  usePrototype,
  type CredentialRow,
  type TravelerRow,
} from "../prototype";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";

export function PendingActionsPage() {
  const { bootstrap } = useWorkspace();
  const [filters, setFilters] = useSearchParams();
  const requested = filters.get("category") || "全部";
  const categories = ["全部", "待补充", "待核验", "已解决"];
  const tab = categories.includes(requested) ? requested : "全部";
  function setTab(value: string) {
    const next = new URLSearchParams(filters);
    if (value === "全部") next.delete("category");
    else next.set("category", value);
    setFilters(next);
  }
  const prototype = bootstrap.data_mode === "prototype";
  const { message } = App.useApp();
  const allItems = prototype ? pendingFixtures : [];
  const verifyRequested = filters.get("dialog") === "verify";
  const verification = verifyRequested
    ? allItems.find(
        (item) => item.id === filters.get("item") && item.category === "待核验",
      )
    : undefined;
  function openVerification(id: string) {
    const next = new URLSearchParams(filters);
    next.set("item", id);
    next.set("dialog", "verify");
    setFilters(next);
  }
  function closeVerification() {
    const next = new URLSearchParams(filters);
    next.delete("item");
    next.delete("dialog");
    setFilters(next);
  }
  const items = allItems.filter(
    (item) => tab === "全部" || item.category === tab,
  );

  return (
    <div className="pending-actions-page">
      <PageHeading
        title="待处理事项"
        description="处理服务执行中的必要事项，及时补充或核验，用于保障本次服务顺利完成。"
        extra={prototype ? <Status tone="gray">本地示例</Status> : undefined}
      />
      <div className="pending-columns">
        <div>
          <div className="pending-intro">
            <TileIcon name="stack" />
            <div>
              <h2>及时处理本次服务的待办事项</h2>
              <p>
                部分服务需要更新凭据或核验已有预约结果。请在截止时间前完成，避免影响目标结果的达成。
              </p>
            </div>
          </div>
          {!prototype && (
            <Notice>待处理事项服务待接入，事项与状态暂不可用。</Notice>
          )}
          {requested !== tab && (
            <Alert
              className="pending-feedback"
              type="warning"
              title="事项分类无效，请选择有效分类"
              showIcon
            />
          )}
          {verifyRequested && !verification && prototype && (
            <Alert
              className="pending-feedback"
              type="warning"
              title="指定待核验事项不存在或暂不可用"
              showIcon
            />
          )}
          <Panel className="pending-items">
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={categories.map((label) => ({
                key: label,
                label: `${label}（${prototype ? (label === "全部" ? allItems.length : allItems.filter((item) => item.category === label).length) : "—"}）`,
              }))}
            />
            {items.length ? (
              items.map((item) => (
                <article className="pending-action-card" key={item.id}>
                  <div>
                    <TileIcon
                      name={item.id === "booking" ? "ticket-stub" : item.icon}
                      color={item.id === "booking" ? "purple" : "blue"}
                    />
                    <section>
                      <h2>
                        {item.title}{" "}
                        <Status
                          tone={item.id === "booking" ? "purple" : "orange"}
                        >
                          {item.category}
                        </Status>
                      </h2>
                      <p>关联服务　{item.service}</p>
                      <p>{item.description}</p>
                    </section>
                    {item.id === "credential" ? (
                      <Link to="/me/credentials">
                        <Button type="primary">{item.action}</Button>
                      </Link>
                    ) : (
                      <Button
                        type="primary"
                        onClick={() => openVerification(item.id)}
                      >
                        {item.action}
                      </Button>
                    )}
                  </div>
                  <footer>
                    <CalendarOutlined /> {item.deadlineLabel}　{item.deadlineAt}
                  </footer>
                </article>
              ))
            ) : (
              <Empty
                description={
                  prototype ? "暂无符合条件的事项" : "事项数据待载入"
                }
              />
            )}
          </Panel>
        </div>
        <aside>
          <Panel
            title={
              <>
                <TileIcon name="info" />
                同一次服务接续不重复收费
              </>
            }
          >
            <p>
              本次服务在完成前的必要接续，如补充材料、核验已有预约结果等，不额外收取费用。
            </p>
          </Panel>
          <Panel
            title={
              <>
                <TileIcon name="shield" />
                退款处理说明
              </>
            }
          >
            <p>
              若未达成目标，按照该服务发布者设定的退款规则处理，规则在购买前展示，成交后固定。
            </p>
            <p>退款处理不解除预约防重，已生成的预约记录仍按原规则保留。</p>
          </Panel>
        </aside>
      </div>
      <Modal
        title="核验原预约"
        open={!!verification}
        onCancel={closeVerification}
        footer={
          <Button
            type="primary"
            onClick={() =>
              void message.info("官方核验通道尚未配置，原预约保持待核验状态")
            }
          >
            再次核验
          </Button>
        }
      >
        <dl>
          <dt>关联服务</dt>
          <dd>{verification?.service}</dd>
          <dt>预约日期</dt>
          <dd>{verification?.visitDate || "预约日期待载入"}</dd>
          <dt>当前结果</dt>
          <dd>
            <Status tone="orange">外部结果待确认</Status>
          </dd>
          <dt>核验截止</dt>
          <dd>{verification?.deadlineAt}</dd>
        </dl>
        <Notice>请核对原预约记录，核验期间保留本次任务及防重限制。</Notice>
      </Modal>
    </div>
  );
}

export function CredentialsPage() {
  const { bootstrap } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const { credentials, setCredentials: setRows } = usePrototype();
  const rows = prototype ? credentials : [];
  const [params, setParams] = useSearchParams();
  const dialog = params.get("dialog");
  const selectedCredential = rows.find(
    (row) => row.id === params.get("credential"),
  );
  const editing = !prototype
    ? undefined
    : dialog === "new"
      ? "new"
      : dialog === "update" && selectedCredential && !selectedCredential.revoked
        ? selectedCredential
        : undefined;
  const bindingCredential =
    dialog === "bindings" ? selectedCredential : undefined;
  const invalidDialog = !!dialog && !editing && !bindingCredential;
  const [form] = Form.useForm();
  const { modal, message } = App.useApp();
  useLayoutEffect(() => {
    form.resetFields();
    if (editing)
      form.setFieldsValue(
        editing === "new"
          ? { kind: "接口凭据" }
          : { name: editing.name, kind: editing.kind },
      );
  }, [editing, form]);
  function closeDialog() {
    const next = new URLSearchParams(params);
    next.delete("dialog");
    next.delete("credential");
    setParams(next);
  }
  function open(row: CredentialRow | "new") {
    const next = new URLSearchParams(params);
    next.set("dialog", row === "new" ? "new" : "update");
    if (row === "new") next.delete("credential");
    else next.set("credential", row.id);
    setParams(next);
  }
  function save(values: { name: string; kind: string; secret: string }) {
    if (bootstrap.data_mode !== "prototype") {
      void message.info("凭据保存接口尚未配置");
      return;
    }
    const characters = Array.from(values.secret);
    const suffix = characters.length > 4 ? characters.slice(-4).join("") : "";
    const mask = `••••${suffix}`;
    if (editing === "new")
      setRows((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          name: values.name.trim(),
          kind: values.kind,
          mask,
          version: 1,
          verified: "未验证",
          bindings: 0,
          bindingRefs: [],
        },
      ]);
    else if (editing)
      setRows((previous) =>
        previous.map((row) =>
          row.id === editing.id
            ? {
                ...row,
                mask,
                version: row.version + 1,
                verified: "未验证",
              }
            : row,
        ),
      );
    form.resetFields();
    closeDialog();
    void message.success("凭据预览已更新");
  }
  function revoke(row: CredentialRow) {
    modal.confirm({
      title: "撤销凭据",
      content: `${row.name}绑定了${row.bindings}个任务。撤销后这些任务需要重新绑定有效凭据。`,
      okText: "确认撤销",
      cancelText: "取消",
      onOk: () =>
        setRows((previous) =>
          previous.map((item) =>
            item.id === row.id ? { ...item, revoked: true } : item,
          ),
        ),
    });
  }
  function showBindings(row: CredentialRow) {
    const next = new URLSearchParams(params);
    next.set("dialog", "bindings");
    next.set("credential", row.id);
    setParams(next);
  }
  return (
    <div className="credentials-page">
      <PageHeading
        title="凭据管理"
        description="集中管理您在使用脚本服务时所需的账号或访问凭据，保障安全、便于复用。"
        extra={prototype ? <Status>本地开发示例</Status> : undefined}
      />
      <div className="credential-intro">
        <InfoCircleOutlined />
        <div>
          <h2>通用脚本服务：一次完整服务、规则透明</h2>
          <p>
            每单只有一次完整服务，同次接续不额外收费。门票0元不等于脚本服务免费。未达目标的退款规则由发布者选择，购买前展示，成交后固定执行。
          </p>
        </div>
      </div>
      {!prototype && (
        <Alert
          className="personal-integration-note"
          type="info"
          showIcon
          title="凭据管理接口待接入"
          description="凭据读取、版本保存、绑定及受控验证服务接入后可在此管理本人凭据。"
        />
      )}
      {invalidDialog && (
        <Alert
          className="personal-integration-note"
          type="warning"
          showIcon
          title="凭据操作不可用"
          description="请返回凭据列表选择可用记录。"
          action={<Button onClick={closeDialog}>返回凭据列表</Button>}
        />
      )}
      <div className="credentials-columns">
        <Panel
          title={
            <>
              凭据列表 <small>共 {prototype ? rows.length : "—"} 条</small>
            </>
          }
          extra={
            <Button
              type="primary"
              aria-label="新增凭据"
              icon={<PlusOutlined />}
              disabled={!prototype}
              onClick={() => open("new")}
            >
              新增凭据
            </Button>
          }
        >
          <Table
            rowKey="id"
            tableLayout="fixed"
            scroll={{ x: 1080 }}
            pagination={false}
            dataSource={rows}
            locale={{
              emptyText: (
                <Empty
                  description={prototype ? "尚未添加凭据" : "凭据服务待接入"}
                />
              ),
            }}
            columns={[
              {
                title: "名称",
                width: 174,
                dataIndex: "name",
                render: (value, row) => (
                  <>
                    {value}
                    {row.revoked && <Status tone="gray">已撤销</Status>}
                  </>
                ),
              },
              {
                title: "类型",
                width: 127,
                dataIndex: "kind",
                render: (value) => (
                  <Status tone={value === "平台账号" ? "purple" : "blue"}>
                    {value}
                  </Status>
                ),
              },
              { title: "掩码", dataIndex: "mask", width: 137 },
              {
                title: "版本",
                width: 103,
                dataIndex: "version",
                render: (value) => `v${value}`,
              },
              { title: "最近验证", dataIndex: "verified", width: 165 },
              {
                title: "绑定任务",
                width: 178,
                dataIndex: "bindings",
                render: (_, row) => (
                  <Button type="link" onClick={() => showBindings(row)}>
                    {row.bindings}　查看绑定
                  </Button>
                ),
              },
              {
                title: "操作",
                render: (_, row) => (
                  <div className="text-actions">
                    <Button
                      type="link"
                      disabled={row.revoked}
                      onClick={() => open(row)}
                    >
                      更新
                    </Button>
                    <Button
                      type="link"
                      disabled={row.revoked}
                      onClick={() =>
                        void message.info(
                          "身份校验通道尚未配置，验证状态保持不变",
                        )
                      }
                    >
                      验证
                    </Button>
                    <Button
                      type="link"
                      danger
                      disabled={row.revoked}
                      onClick={() => revoke(row)}
                    >
                      撤销
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        </Panel>
        <Panel
          title={
            <>
              <TileIcon name="shield" />
              使用说明
            </>
          }
        >
          <ul className="blue-bullets">
            <li>凭据只归本人使用，发布者不可查看明文。</li>
            <li>为保障安全，页面不显示实际token或密码，仅展示掩码信息。</li>
            <li>请按需维护凭据的有效性，确保脚本服务正常执行。</li>
          </ul>
        </Panel>
      </div>
      <Modal
        title={editing === "new" ? "新增凭据" : "更新凭据版本"}
        open={!!editing}
        onCancel={() => {
          form.resetFields();
          closeDialog();
        }}
        onOk={() => form.submit()}
        okText="保存凭据"
        cancelText="取消"
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item
            name="name"
            label="名称"
            rules={[
              { required: true, whitespace: true, message: "请输入凭据名称" },
              { max: 120 },
            ]}
          >
            <Input disabled={editing !== "new"} />
          </Form.Item>
          <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
            <Select
              disabled={editing !== "new"}
              options={[{ value: "接口凭据" }, { value: "平台账号" }]}
            />
          </Form.Item>
          <Form.Item
            name="secret"
            label="凭据内容"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "请输入新的完整凭据",
              },
              { max: 8192 },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Notice>更新后生成新的凭据版本，原任务需要明确选择新版本。</Notice>
        </Form>
      </Modal>
      <Modal
        title={
          bindingCredential ? `${bindingCredential.name}的绑定任务` : "绑定任务"
        }
        open={!!bindingCredential}
        onCancel={closeDialog}
        footer={
          <Button type="primary" onClick={closeDialog}>
            知道了
          </Button>
        }
      >
        {bindingCredential?.bindingRefs?.length ? (
          <div className="credential-binding-list">
            {bindingCredential.bindingRefs.map((binding) => (
              <p key={binding.taskId}>
                <Link to={`/me/tasks/${binding.taskId}`}>{binding.title}</Link>
                <span>
                  绑定 v{binding.version} · 当前 v{bindingCredential.version}
                </span>
              </p>
            ))}
            {bindingCredential.revoked && (
              <Status tone="red">凭据已撤销</Status>
            )}
          </div>
        ) : (
          <Empty
            description={
              bindingCredential?.bindings
                ? "绑定任务明细待接入"
                : "暂无绑定任务"
            }
          />
        )}
      </Modal>
    </div>
  );
}

function maskPersonalValue(value: string, leading: number, trailing: number) {
  const characters = Array.from(value);
  if (characters.length <= leading + trailing) return "****";
  return (
    characters.slice(0, leading).join("") +
    "*".repeat(characters.length - leading - trailing) +
    characters.slice(-trailing).join("")
  );
}

export function TravelersPage() {
  const { bootstrap } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const { travelers, setTravelers: setRows } = usePrototype();
  const rows = prototype ? travelers : [];
  const [params, setParams] = useSearchParams();
  const editing = params.get("traveler") || undefined;
  const selectedTraveler = rows.find((row) => row.id === editing);
  const [form] = Form.useForm();
  const { modal, message } = App.useApp();
  const initializedTravelerId = useRef<string | undefined>(undefined);
  function initializeForm(row?: TravelerRow, selection = row?.id || "new") {
    initializedTravelerId.current = selection;
    form.resetFields();
    if (row)
      form.setFieldsValue({
        kind: row.identityType || "身份证",
        isDefault: row.isDefault,
      });
  }
  useLayoutEffect(() => {
    const selection = editing || "new";
    if (initializedTravelerId.current !== selection)
      initializeForm(selectedTraveler, selection);
  }, [editing, selectedTraveler, form]);
  function clearSelection() {
    const next = new URLSearchParams(params);
    next.delete("traveler");
    setParams(next);
  }
  function reset() {
    initializeForm();
    clearSelection();
  }
  function save(values: {
    name: string;
    phone: string;
    identity: string;
    kind: string;
    isDefault: boolean;
  }) {
    if (bootstrap.data_mode !== "prototype" || (editing && !selectedTraveler)) {
      void message.info("出行人保存接口尚未配置");
      return;
    }
    const characters = Array.from(values.name.trim());
    const record = {
      id: editing || crypto.randomUUID(),
      name: characters.length > 1 ? `${characters[0]}*` : "*",
      phone: maskPersonalValue(values.phone.replace(/[ -]/g, ""), 3, 4),
      identity: maskPersonalValue(values.identity.trim(), 4, 4),
      identityType: values.kind,
      version: editing ? (selectedTraveler?.version || 1) + 1 : 1,
      isDefault: !!values.isDefault,
    };
    setRows((previous) => {
      const updated = previous.map((row) =>
        row.id === record.id
          ? record
          : record.isDefault
            ? { ...row, isDefault: false }
            : row,
      );
      return editing ? updated : [...updated, record];
    });
    if (editing) clearSelection();
    else reset();
    void message.success(editing ? "出行人资料已更新" : "出行人资料已添加");
  }
  return (
    <div className="travelers-page">
      <PageHeading
        title="出行人资料"
        description="管理用于脚本服务下单与预约的出行人信息，可添加、编辑或删除。"
        extra={prototype ? <Status>本地开发示例</Status> : undefined}
      />
      {!prototype && (
        <Alert
          className="personal-integration-note"
          type="info"
          showIcon
          title="出行人资料接口待接入"
          description="资料版本、授权快照及删除保留策略按本人资料服务接入。"
        />
      )}
      <div className="travelers-columns">
        <div>
          <div className="traveler-intro">
            <h2>
              <InfoCircleOutlined /> 使用提示
            </h2>
            <ul className="blue-bullets">
              <li>
                下单时会生成本次服务的授权快照，用于服务执行与预约，修改出行人资料不会覆盖已生成的预约。
              </li>
              <li>
                每单仅提供一次完整服务，同次接续不额外收费。门票0元不等于脚本服务免费。
              </li>
              <li>未达目标的退款规则由发布者选择，购买前展示、成交后固定。</li>
            </ul>
            <div className="traveler-card-art" aria-hidden="true">
              <i />
              <span />
              <b />
            </div>
          </div>
          <Button
            className="new-traveler"
            aria-label="新建出行人"
            type="primary"
            icon={<PlusOutlined />}
            onClick={reset}
            disabled={!prototype}
          >
            新建出行人
          </Button>
          <div className="traveler-list">
            {rows.map((row) => (
              <article
                key={row.id}
                className={row.id === editing ? "is-editing" : undefined}
              >
                <span className="traveler-avatar">
                  <UserOutlined />
                </span>
                <h2>{row.name}</h2>
                <div>
                  <small>
                    <PhoneOutlined /> 手机号
                  </small>
                  <b>{row.phone}</b>
                </div>
                <div>
                  <small>
                    <IdcardOutlined /> 证件
                  </small>
                  <b>{row.identity}</b>
                </div>
                {row.isDefault && <Status>默认联系人</Status>}
                <div className="traveler-actions">
                  <Button
                    type="link"
                    icon={<EditOutlined aria-hidden />}
                    onClick={() => {
                      initializeForm(row);
                      const next = new URLSearchParams(params);
                      next.set("traveler", row.id);
                      setParams(next);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined aria-hidden />}
                    onClick={() =>
                      modal.confirm({
                        title: "删除出行人资料",
                        content: "已生成的授权快照和预约记录按原规则保留。",
                        okText: "确认删除",
                        cancelText: "取消",
                        onOk: () => {
                          setRows((previous) =>
                            previous.filter((item) => item.id !== row.id),
                          );
                          if (editing === row.id) reset();
                        },
                      })
                    }
                  >
                    删除
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!rows.length && (
            <Empty
              className="traveler-empty"
              description={
                prototype ? "尚未添加出行人资料" : "出行人资料服务待接入"
              }
            />
          )}
        </div>
        <Panel title={editing ? "更新出行人资料" : "添加出行人资料"}>
          {editing && !selectedTraveler && (
            <Alert
              className="personal-integration-note"
              type="warning"
              showIcon
              title="出行人资料不可用"
              description="请重新选择出行人或新建资料。"
              action={<Button onClick={reset}>新建出行人</Button>}
            />
          )}
          {selectedTraveler && (
            <p className="traveler-edit-note">
              正在更新 {selectedTraveler?.name} 的 v
              {selectedTraveler?.version || 1} 资料，请重新填写完整信息。
            </p>
          )}
          <Form
            form={form}
            layout="vertical"
            initialValues={{ kind: "身份证", isDefault: true }}
            onFinish={save}
            disabled={!prototype || (!!editing && !selectedTraveler)}
          >
            <Form.Item
              name="name"
              label="姓名"
              rules={[
                { required: true, whitespace: true, message: "请输入姓名" },
                { max: 80 },
              ]}
            >
              <Input placeholder="请输入姓名（如：张三）" />
            </Form.Item>
            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                { required: true, message: "请输入手机号" },
                {
                  pattern: /^[+\d][\d -]{5,30}$/,
                  message: "请输入有效的手机号",
                },
                {
                  validator: (_, value: string | undefined) => {
                    if (!value || value.replace(/\D/g, "").length >= 6)
                      return Promise.resolve();
                    return Promise.reject(new Error("请输入有效的手机号"));
                  },
                },
              ]}
            >
              <Input placeholder="请输入手机号（如：138****5201）" />
            </Form.Item>
            <Form.Item
              name="kind"
              label="证件类型"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: "身份证" },
                  { value: "护照" },
                  { value: "其他证件" },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="identity"
              label="证件号码"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: "请输入完整的证件号码",
                },
                {
                  transform: (value: string) => value?.trim(),
                  min: 6,
                  max: 40,
                  message: "请输入6至40位的证件号码",
                },
                { pattern: /^[^*•]+$/u, message: "请输入完整的证件号码" },
              ]}
            >
              <Input placeholder="请输入证件号码（如：3301************1234）" />
            </Form.Item>
            <Form.Item
              name="isDefault"
              valuePropName="checked"
              className="traveler-default-field"
            >
              <Checkbox>设为默认联系人</Checkbox>
            </Form.Item>
            <p className="muted form-field-help">
              下单时将优先使用默认联系人信息。
            </p>
            <div className="traveler-form-notice">
              <div>
                <b>
                  <InfoCircleOutlined /> 说明
                </b>
                <ul>
                  <li>下单时会生成本次服务的授权快照，用于服务执行与预约。</li>
                  <li>修改出行人资料不会覆盖已生成的预约。</li>
                </ul>
              </div>
            </div>
            <div className="form-button-row">
              <Button type="primary" htmlType="submit">
                {editing ? "更新资料" : "添加资料"}
              </Button>
              <Button onClick={reset}>重置</Button>
            </div>
          </Form>
        </Panel>
      </div>
    </div>
  );
}
