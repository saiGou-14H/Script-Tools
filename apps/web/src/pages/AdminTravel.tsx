import { useRef, useState, type Key } from "react";
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  Tabs,
} from "antd";
import { Link, useSearchParams } from "react-router-dom";
import { AdminOperationDialog } from "../components/AdminOperationDialog";
import { Icon } from "../components/Icon";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import {
  useAdminTravel,
  type AttractionPreview,
  type TravelChannelPreview,
} from "../admin-travel-preview";
import { useAdminPreview } from "../admin-preview";

export function AdminAttractionsPage() {
  const {
    enabled,
    cities,
    attractions,
    channels,
    saveCity,
    saveAttraction,
    isSaleable,
  } = useAdminTravel();
  const [cityId, setCityId] = useState("hangzhou");
  const [selectedId, setSelectedId] = useState<string>();
  const [editor, setEditor] = useState<"new" | "edit">();
  const [tab, setTab] = useState("attraction");
  const [creatingCity, setCreatingCity] = useState(false);
  const [attractionForm] = Form.useForm();
  const [cityForm] = Form.useForm();
  const draftId = useRef(crypto.randomUUID());
  const requestKey = useRef(crypto.randomUUID());
  const { message } = App.useApp();
  const city = cities.find((item) => item.id === cityId);
  const rows = attractions.filter((item) => item.cityId === cityId);
  const selected = attractions.find((item) => item.id === selectedId);
  function open(mode: "new" | "edit") {
    draftId.current = crypto.randomUUID();
    requestKey.current = crypto.randomUUID();
    attractionForm.resetFields();
    cityForm.resetFields();
    setCreatingCity(false);
    attractionForm.setFieldsValue(
      mode === "edit" && selected ? selected : { cityId, enabled: false },
    );
    cityForm.setFieldsValue(city);
    setTab(mode === "edit" && !selected ? "city" : "attraction");
    setEditor(mode);
  }
  return (
    <div className="admin-page admin-attractions-page">
      <PageHeading
        title="城市与景点"
        description="管理各城市的景点及其票种信息，维护票款、规则来源与关联服务，控制景点的售卖状态。"
      />
      <div className="admin-travel-banner">
        <TileIcon name="travel" />
        <span>
          <h3>城市与景点管理</h3>
          <p>以下均为界面示例，实际开放以真实渠道验证为准。</p>
        </span>
      </div>
      <div className="admin-attraction-columns">
        <Panel title="城市" className="admin-city-list">
          {cities.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cityId === item.id ? "selected" : ""}
              onClick={() => {
                setCityId(item.id);
                setSelectedId(undefined);
              }}
            >
              <span>{cityId === item.id ? "⌄" : "›"}</span>
              {item.name}
              <small>
                （{attractions.filter((row) => row.cityId === item.id).length}）
              </small>
              {!item.enabled && <Status tone="gray">停用</Status>}
            </button>
          ))}
        </Panel>
        <Panel
          title={`景点列表（${city?.name || "—"}）`}
          extra={
            <div className="row-actions">
              <Button
                type="primary"
                disabled={!enabled}
                onClick={() => open("new")}
              >
                新增景点
              </Button>
              <Button disabled={!enabled} onClick={() => open("edit")}>
                编辑
              </Button>
            </div>
          }
        >
          <Table<AttractionPreview>
            rowKey="id"
            dataSource={rows}
            pagination={false}
            rowClassName={(row) =>
              row.id === selectedId ? "selected-row" : ""
            }
            onRow={(row) => ({ onClick: () => setSelectedId(row.id) })}
            columns={[
              {
                title: "景点",
                dataIndex: "name",
                render: (value, row) => (
                  <Button type="text" onClick={() => setSelectedId(row.id)}>
                    {value}
                  </Button>
                ),
              },
              { title: "票种", render: () => <Status>参观预约</Status> },
              { title: "票款", render: () => "0元" },
              { title: "规则来源", dataIndex: "ruleSource" },
              {
                title: "关联服务",
                render: (_, row) =>
                  row.service ? (
                    <Link to="/admin/services">{row.service}</Link>
                  ) : (
                    <span className="muted">未关联</span>
                  ),
              },
              {
                title: "支持状态",
                render: (_, row) => (
                  <Status tone={isSaleable(row) ? "green" : "red"}>
                    {isSaleable(row) ? "可售卖（示例）" : "未开放"}
                  </Status>
                ),
              },
            ]}
          />
        </Panel>
      </div>
      <Modal
        forceRender
        title={editor === "new" ? "新增免费景点" : "城市与景点信息"}
        open={Boolean(editor)}
        onCancel={() => setEditor(undefined)}
        onOk={() =>
          tab === "city" ? cityForm.submit() : attractionForm.submit()
        }
        okText="保存目录预览"
        cancelText="返回"
      >
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "attraction",
              label: "景点信息",
              children: (
                <Form
                  name="admintravel-1"
                  form={attractionForm}
                  layout="vertical"
                  onValuesChange={() => {
                    requestKey.current = crypto.randomUUID();
                  }}
                  onFinish={(values) => {
                    try {
                      saveAttraction(
                        {
                          ...values,
                          id:
                            editor === "edit" && selected
                              ? selected.id
                              : draftId.current,
                        },
                        requestKey.current,
                      );
                      setEditor(undefined);
                      void message.success("景点配置预览已保存");
                    } catch (error) {
                      void message.error(
                        error instanceof Error ? error.message : "保存失败",
                      );
                    }
                  }}
                >
                  <Form.Item
                    label="城市"
                    name="cityId"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={cities.map((item) => ({
                        value: item.id,
                        label: item.name,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    label="景点名称"
                    name="name"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={200} />
                  </Form.Item>
                  <Form.Item
                    label="规则来源网址"
                    name="officialUrl"
                    rules={[
                      { required: true },
                      { type: "url", message: "请填写有效网址" },
                    ]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item
                    label="规则来源"
                    name="ruleSource"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={500} />
                  </Form.Item>
                  <Form.Item label="预约渠道" name="channelId">
                    <Select
                      allowClear
                      options={channels.map((item) => ({
                        value: item.id,
                        label: `${item.name} · ${item.status}`,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item label="关联服务" name="service">
                    <Input maxLength={200} />
                  </Form.Item>
                  <p>票款 · 0元　票种 · 免费参观预约</p>
                  <Form.Item
                    label="开放新售卖"
                    name="enabled"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Notice>
                    开放依赖有效城市、已验证渠道、规则来源与关联服务。历史未决预约持续保留。
                  </Notice>
                </Form>
              ),
            },
            {
              key: "city",
              label: "城市信息",
              children: (
                <Form
                  name="admintravel-2"
                  form={cityForm}
                  layout="vertical"
                  onFinish={(values) => {
                    try {
                      saveCity({
                        ...values,
                        id: creatingCity ? draftId.current : cityId,
                      });
                      if (creatingCity) setCityId(draftId.current);
                      setEditor(undefined);
                      void message.success("城市配置预览已保存");
                    } catch (error) {
                      void message.error(
                        error instanceof Error ? error.message : "保存失败",
                      );
                    }
                  }}
                >
                  <Button
                    type="link"
                    onClick={() => {
                      setCreatingCity(true);
                      draftId.current = crypto.randomUUID();
                      cityForm.setFieldsValue({
                        name: "",
                        timezone: "Asia/Shanghai",
                        enabled: true,
                      });
                    }}
                  >
                    新增城市
                  </Button>
                  <Form.Item
                    label="城市名称"
                    name="name"
                    rules={[{ required: true, whitespace: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    label="时区"
                    name="timezone"
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="Asia/Shanghai" />
                  </Form.Item>
                  <Form.Item
                    label="开放城市"
                    name="enabled"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Notice>
                    城市停用限制后续新售卖，存量订单与预约核验入口保留。
                  </Notice>
                </Form>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}

const unresolvedChannelRows = [
  { id: "P2024010001", channelId: "A", attraction: "示例景点A" },
  { id: "P2024010002", channelId: "B", attraction: "示例景点B" },
  { id: "P2024010003", channelId: "C", attraction: "示例景点C" },
];
const channelLabels = {
  VERIFIED: "已验证",
  UNVERIFIED: "未验证",
  DEGRADED: "降级",
};
const channelTones = {
  VERIFIED: "green",
  UNVERIFIED: "gray",
  DEGRADED: "orange",
} as const;
export function AdminChannelsPage() {
  const { enabled, channels, disableChannel, saveChannelRule } =
    useAdminTravel();
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [filters, setFilters] = useState<{ name?: string; status?: string }>(
    {},
  );
  const [unresolvedFilters, setUnresolvedFilters] = useState<{
    id?: string;
    channelId?: string;
  }>({});
  const [form] = Form.useForm();
  const [unresolvedForm] = Form.useForm();
  const [ruleForm] = Form.useForm();
  const [evidence, setEvidence] = useState<TravelChannelPreview>();
  const [editing, setEditing] = useState<TravelChannelPreview>();
  const [disabling, setDisabling] = useState<TravelChannelPreview>();
  const requestKey = useRef(crypto.randomUUID());
  const { message } = App.useApp();
  const rows = channels.filter(
    (item) =>
      item.name.includes(filters.name?.trim() || "") &&
      (!filters.status || item.status === filters.status),
  );
  const unresolved = enabled
    ? unresolvedChannelRows.filter(
        (item) =>
          item.id.includes(unresolvedFilters.id?.trim() || "") &&
          (!unresolvedFilters.channelId ||
            item.channelId === unresolvedFilters.channelId),
      )
    : [];
  function selected() {
    const row = channels.find((item) => item.id === selectedIds[0]);
    if (!row || selectedIds.length !== 1) {
      void message.info("请先选择一个渠道");
      return;
    }
    return row;
  }
  function openRule(row: TravelChannelPreview) {
    ruleForm.setFieldsValue({
      source: row.ruleSource,
      snapshot: row.ruleSnapshot,
      reason: "",
    });
    requestKey.current = crypto.randomUUID();
    setEditing(row);
  }
  return (
    <div className="admin-page admin-channels-page">
      <PageHeading
        title="渠道与适配"
        description="管理各景点预约渠道的适配配置、验证结果与运行状态，支持规则更新与渠道管控。"
      />
      <Panel className="admin-channel-main">
        <Form
          name="admintravel-3"
          form={form}
          layout="inline"
          onFinish={setFilters}
        >
          <Form.Item label="渠道名称" name="name">
            <Input
              placeholder="请输入渠道名称"
              prefix={<Icon name="search" />}
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              placeholder="全部状态"
              allowClear
              options={Object.entries(channelLabels).map(([value, label]) => ({
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
        <div className="channel-toolbar">
          <Button
            type="primary"
            disabled={!enabled}
            onClick={() => {
              const row = selected();
              if (row) setEvidence(row);
            }}
          >
            查看验证记录
          </Button>
          <Button
            disabled={!enabled}
            onClick={() => {
              const row = selected();
              if (row) setDisabling(row);
            }}
          >
            禁用新提交
          </Button>
          <Button
            disabled={!enabled}
            onClick={() => {
              const row = selected();
              if (row) openRule(row);
            }}
          >
            更新规则
          </Button>
        </div>
        <Table<TravelChannelPreview>
          rowKey="id"
          dataSource={rows}
          pagination={false}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: setSelectedIds,
          }}
          columns={[
            {
              title: "渠道",
              dataIndex: "name",
              render: (value) => <b>{value}</b>,
            },
            {
              title: "版本",
              dataIndex: "version",
              render: (value) => <Status>{value}</Status>,
            },
            { title: "适配器", dataIndex: "adapter" },
            { title: "验证时间", dataIndex: "verifiedAt" },
            {
              title: "证据",
              render: (_, row) => (
                <Button type="link" onClick={() => setEvidence(row)}>
                  {row.evidence}
                </Button>
              ),
            },
            {
              title: "状态",
              render: (_, row) => (
                <>
                  <Status tone={channelTones[row.status]}>
                    ● {channelLabels[row.status]}
                  </Status>
                  {!row.enabled && row.status === "VERIFIED" && (
                    <Status tone="gray">新提交停用</Status>
                  )}
                </>
              ),
            },
          ]}
        />
      </Panel>
      <Panel title="未决预约查询" className="channel-unresolved">
        <p>查询当前未完成的景点预约记录，便于跟踪处理。</p>
        <Form
          name="admintravel-4"
          form={unresolvedForm}
          layout="inline"
          onFinish={setUnresolvedFilters}
        >
          <Form.Item label="预约编号" name="id">
            <Input
              placeholder="请输入预约编号"
              prefix={<Icon name="search" />}
            />
          </Form.Item>
          <Form.Item label="渠道" name="channelId">
            <Select
              placeholder="全部渠道"
              allowClear
              options={channels.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
          </Form.Item>
          <Form.Item label="状态">
            <Select
              value="PENDING"
              aria-label="未决预约状态"
              options={[{ value: "PENDING", label: "全部待处理状态" }]}
            />
          </Form.Item>
          <div className="row-actions">
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button
              onClick={() => {
                unresolvedForm.resetFields();
                setUnresolvedFilters({});
              }}
            >
              重置
            </Button>
          </div>
        </Form>
        <Table
          rowKey="id"
          dataSource={unresolved}
          pagination={false}
          columns={[
            { title: "预约编号", dataIndex: "id" },
            { title: "渠道", render: (_, row) => `渠道${row.channelId}` },
            { title: "景点", dataIndex: "attraction" },
            { title: "状态", render: () => <Status>● 待处理</Status> },
          ]}
        />
      </Panel>
      <Modal
        title="渠道验证记录"
        open={Boolean(evidence)}
        onCancel={() => setEvidence(undefined)}
        footer={
          <Button onClick={() => setEvidence(undefined)}>关闭验证记录</Button>
        }
      >
        <h3>
          {evidence?.name} · {evidence?.version}
        </h3>
        <p>
          {evidence?.evidence} · {evidence?.verifiedAt}
        </p>
        <p>{evidence?.ruleSource}</p>
        <pre>{evidence?.ruleSnapshot}</pre>
        {evidence?.historicalEvidence?.map((item) => (
          <section key={item.version}>
            <h3>历史版本 {item.version}</h3>
            <p>
              {item.evidence} · {item.verifiedAt} · {item.status}
            </p>
            <p>{item.ruleSource}</p>
            <pre>{item.ruleSnapshot}</pre>
          </section>
        ))}
        <Notice>
          此处为示例证据摘要，能力升级以对应版本的真实验证回执为准。
        </Notice>
      </Modal>
      <Modal
        forceRender
        title={`更新规则 · ${editing?.name || ""}`}
        open={Boolean(editing)}
        onCancel={() => setEditing(undefined)}
        onOk={() => ruleForm.submit()}
        okText="保存规则草稿"
        cancelText="返回"
      >
        <Notice>
          规则更新生成新版本草稿，等待重新验证。未决预约记录继续保留。
        </Notice>
        <Form
          name="admintravel-5"
          form={ruleForm}
          layout="vertical"
          onValuesChange={() => {
            requestKey.current = crypto.randomUUID();
          }}
          onFinish={(values) => {
            if (!editing) return;
            saveChannelRule(
              editing.id,
              values.source,
              values.snapshot,
              values.reason,
              requestKey.current,
            );
            setEditing(undefined);
            void message.success("渠道规则草稿预览已保存");
          }}
        >
          <Form.Item
            name="source"
            label="规则来源"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="snapshot"
            label="规则快照"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={3} />
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
      {disabling && (
        <AdminOperationDialog
          title={`禁用新提交 · ${disabling.name}`}
          onClose={() => setDisabling(undefined)}
          onConfirm={(reason, key) => disableChannel(disabling.id, reason, key)}
        >
          <Notice>新提交停用后，已存在的未决预约继续按原操作核验。</Notice>
        </AdminOperationDialog>
      )}
    </div>
  );
}

export function AdminUnresolvedBookingsPage() {
  const { enabled, notes, recordNote } = useAdminPreview();
  const [params] = useSearchParams();
  const [querying, setQuerying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const { message } = App.useApp();
  const bookingId = params.get("booking") || "BK082";
  const exists = enabled && bookingId === "BK082";
  const rows = exists
    ? [
        {
          id: "BK082",
          orderId: "TT202611130082",
          orderMask: "TT••••0082",
          attraction: "示例博物馆",
        },
      ]
    : [];
  return (
    <div className="admin-page admin-unresolved-bookings-page">
      <PageHeading title="异常预约" />
      <div className="admin-unresolved-columns">
        <Panel className="unresolved-booking-table">
          <Table
            rowKey="id"
            dataSource={rows}
            pagination={false}
            rowClassName={() => "selected-row"}
            columns={[
              {
                title: "外部预约",
                dataIndex: "id",
                render: (value) => <b className="blue-text">{value}</b>,
              },
              {
                title: "关联服务订单",
                render: (_, row) => (
                  <Link to={`/admin/orders/${row.orderId}`}>
                    {row.orderMask}
                  </Link>
                ),
              },
              { title: "景点", dataIndex: "attraction" },
              { title: "渠道返回", render: () => <b>UNKNOWN</b> },
              {
                title: "当前状态",
                render: () => <Status tone="orange">待核验2小时</Status>,
              },
              { title: "服务费", render: () => "8元待判定" },
            ]}
          />
        </Panel>
        <Panel title="预约详情" className="unresolved-booking-detail">
          {exists ? (
            <>
              <h3>原提交请求</h3>
              <pre>
                {JSON.stringify(
                  {
                    景点: "示例博物馆",
                    预约日期: "2026-11-21",
                    参观时段: "14:00-15:00",
                    游客数量: 2,
                  },
                  null,
                  2,
                )}
              </pre>
              <dl>
                <dt>最近渠道查询</dt>
                <dd>
                  <Status tone="gray">未知</Status>
                </dd>
                <dt>核验截止</dt>
                <dd>2026年11月14日21:00</dd>
                <dt>门票费用</dt>
                <dd>0元（无需支付）</dd>
              </dl>
              <Notice>退款不解除外部防重。</Notice>
              <div className="row-actions">
                <Button
                  type="primary"
                  onClick={() => {
                    form.resetFields();
                    requestKey.current = crypto.randomUUID();
                    setQuerying(true);
                  }}
                >
                  查询原预约
                </Button>
                <Button onClick={() => setRecording(true)}>记录核验结论</Button>
              </div>
              {notes.filter((item) => item.resourceId === bookingId).length >
                0 && (
                <details>
                  <summary>本地处理记录</summary>
                  {notes
                    .filter((item) => item.resourceId === bookingId)
                    .map((item) => (
                      <p key={item.id}>{item.reason}</p>
                    ))}
                </details>
              )}
            </>
          ) : (
            <Empty
              description={
                enabled ? `未找到未决预约 ${bookingId}` : "未决预约接口尚未接入"
              }
            />
          )}
        </Panel>
      </div>
      <Modal
        forceRender
        title="原预约只读核验"
        open={querying}
        onCancel={() => setQuerying(false)}
        onOk={() => form.submit()}
        okText="记录查询预览"
        cancelText="返回"
      >
        <Notice>
          核验使用现有只读业务授权，敏感访问范围和有效期由服务端复核。
        </Notice>
        <Form
          name="admintravel-6"
          form={form}
          layout="vertical"
          onFinish={(values) => {
            recordNote(
              bookingId,
              `原预约查询预览 · ${values.reason}`,
              requestKey.current,
            );
            setQuerying(false);
            void message.info("预约核验接口尚未接入，BK082保持UNKNOWN");
          }}
        >
          <Form.Item
            name="binding"
            label="只读授权绑定"
            rules={[
              {
                required: true,
                whitespace: true,
                message: "请填写现有只读授权绑定",
              },
            ]}
          >
            <Input placeholder="现有授权绑定ID" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="处理理由"
            rules={[
              { required: true, whitespace: true, message: "请填写处理理由" },
            ]}
          >
            <Input.TextArea rows={3} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
      {recording && (
        <AdminOperationDialog
          title="记录核验说明"
          onClose={() => setRecording(false)}
          onConfirm={(reason, key) =>
            recordNote(bookingId, `核验说明 · ${reason}`, key)
          }
        >
          <Notice>文字记录作为处理证据，渠道状态由原渠道可信回执确定。</Notice>
        </AdminOperationDialog>
      )}
    </div>
  );
}
