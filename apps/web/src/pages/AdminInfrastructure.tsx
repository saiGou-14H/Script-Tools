import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { useAdminMetadata } from "../lib/admin-metadata";
import {
  type RuntimeNodeMetadata,
  type RuntimeImageMetadata,
  type CapacityQuotaMetadata,
  type SchedulingMetadata,
  runtimeModeLabels,
  nodeStateLabels,
} from "../lib/admin-runtime-metadata";
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Table,
} from "antd";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "../components/Icon";
import { AdminOperationDialog } from "../components/AdminOperationDialog";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useAdminOperations, type OperationKind } from "../admin-operations";
import { api } from "../api";

const capacities = [
  { mode: "Docker", key: "docker", used: 48, total: 64, icon: "docker" },
  { mode: "KVM", key: "qemu_kvm", used: 24, total: 32, icon: "desktop" },
  { mode: "TCG", key: "qemu_tcg", used: 12, total: 16, icon: "settings" },
];
export function AdminSchedulingPage() {
  const { enabled, platform, operations, savePlatform, requestOperation } =
    useAdminOperations();
  const { bootstrap } = useWorkspace();
  const snapshot = useQuery({
    queryKey: [
      "admin",
      bootstrap.user?.id,
      bootstrap.user?.security_revision,
      "scheduling",
    ],
    enabled: !enabled,
    queryFn: ({ signal }) =>
      api<SchedulingMetadata>("/admin/scheduling", { signal }),
  });
  const quotas = useAdminMetadata<CapacityQuotaMetadata>(
    "scheduling/quotas",
    "",
    !enabled,
  );
  const [rateOpen, setRateOpen] = useState(false);
  const [drainOpen, setDrainOpen] = useState(false);
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const { message } = App.useApp();
  const rows = capacities;
  const modeMetadata = (key: string) =>
    snapshot.data?.modes.find((item) => item.mode === key);
  const draining = operations.some(
    (item) => item.kind === "NODE_DRAIN" && item.resourceId === "resource-pool",
  );
  return (
    <div
      className={`admin-page admin-scheduling-page ${enabled ? "" : "runtime-metadata-live"}`}
    >
      <PageHeading
        title="调度与容量"
        description="管理计算资源池、调度队列与配额，控制运行与排空策略，保障服务稳定与高效运行。"
        extra={
          !enabled && (
            <div className="runtime-snapshot-time">
              <span>
                {snapshot.data
                  ? `查询快照 ${snapshot.data.as_of}`
                  : "正在查询调度快照"}
              </span>
              <Button
                loading={snapshot.isFetching || quotas.isFetching}
                onClick={() => {
                  void snapshot.refetch();
                  void quotas.refetch();
                }}
              >
                刷新快照
              </Button>
            </div>
          )
        }
      />
      {!enabled && snapshot.isError && (
        <Alert
          type="error"
          title="调度快照查询失败"
          action={
            <Button onClick={() => void snapshot.refetch()}>
              重试调度快照
            </Button>
          }
        />
      )}
      <div className="admin-resource-banner">
        <TileIcon name="layers" />
        <span>
          <h3>资源池</h3>
          <small>
            {enabled ? "当前可用的计算资源池类型" : "按实际执行模式统计租约"}
          </small>
        </span>
        <div className="resource-mode-tags">
          {["Docker", "KVM", "TCG"].map((mode) => (
            <span key={mode}>
              <Icon name="shield" />
              {mode}
              {enabled && mode === "TCG" && <Status tone="green">允许</Status>}
            </span>
          ))}
        </div>
        <div className="resource-queue-stats">
          {[
            [
              "队列待运行",
              enabled ? "12" : (snapshot.data?.counts.queued_runs ?? "—"),
              "play",
            ],
            [
              "活跃",
              enabled ? "32" : (snapshot.data?.counts.active_runs ?? "—"),
              "chart",
            ],
            [
              "预约等待",
              enabled ? "8" : (snapshot.data?.counts.waiting_bookings ?? "—"),
              "clock",
            ],
          ].map(([label, value, icon]) => (
            <article key={label}>
              <b>
                <Icon name={icon} />
                {label}
              </b>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </div>
      <div className="admin-capacity-top">
        <Panel
          title={
            <>
              {enabled ? "容量概览" : "执行模式租约"}{" "}
              <small>{enabled ? "（资源单位）" : "（有效租约）"}</small>
            </>
          }
        >
          <div className="capacity-bars">
            {rows.map((row) => (
              <article key={row.mode}>
                <TileIcon name={row.icon} />
                <strong>{row.mode}</strong>
                {enabled ? (
                  <>
                    <Progress
                      percent={Math.round((row.used * 100) / row.total)}
                      showInfo={false}
                      strokeWidth={10}
                    />
                    <span>
                      {row.used} / {row.total}　（
                      {Math.round((row.used * 100) / row.total)}%）
                    </span>
                  </>
                ) : (
                  <span className="runtime-mode-count">
                    {modeMetadata(row.key)?.active_leases ?? "—"} 个有效租约
                  </span>
                )}
              </article>
            ))}
          </div>
          {!enabled && (
            <p className="muted">按模式的容量总量及使用率采集继续接入。</p>
          )}
        </Panel>
        <Panel
          title={enabled ? "已购服务履约调度" : "履约调度设计"}
          className="scheduling-priorities"
        >
          <p>
            {enabled
              ? "按服务截止时间、等待时长和公平配额调度。"
              : "调度策略接入中，以下为设计中的资源分配顺序。"}
          </p>
          {[
            ["临近截止", "优先处理接近约定截止时间的服务"],
            ["常规履约", "按等待时长和公平配额分配资源"],
            ["开发自用", "使用开发配额，保留已购履约保障"],
          ].map(([label, text], index) => (
            <article key={label}>
              <Status
                tone={index === 0 ? "red" : index === 1 ? "blue" : "gray"}
              >
                {index + 1}
              </Status>
              <b>{label}</b>
              <span>{text}</span>
            </article>
          ))}
        </Panel>
      </div>
      <div className="admin-capacity-middle">
        <Panel
          title={
            <>
              资源配额 <small>（单位）</small>
            </>
          }
        >
          <p>
            {enabled
              ? "各资源池的总量、已用与可用配额。"
              : "按范围及资源分别展示当前窗口的上限、预留、消耗与可用量。"}
          </p>
          {enabled ? (
            <Table
              rowKey="mode"
              dataSource={rows}
              pagination={false}
              scroll={{ x: 850 }}
              columns={[
                {
                  title: "资源池",
                  width: 230,
                  render: (_, row) => (
                    <b>
                      <Icon name={row.icon} /> {row.mode}
                    </b>
                  ),
                },
                { title: "总配额", width: 144, dataIndex: "total" },
                { title: "已用", width: 140, dataIndex: "used" },
                {
                  title: "可用",
                  width: 120,
                  render: (_, row) => row.total - row.used,
                },
                {
                  title: "使用率",
                  render: (_, row) => (
                    <div className="quota-progress">
                      <Progress
                        percent={Math.round((row.used * 100) / row.total)}
                        showInfo={false}
                        strokeWidth={9}
                      />
                      <span>{Math.round((row.used * 100) / row.total)}%</span>
                    </div>
                  ),
                },
              ]}
            />
          ) : (
            <>
              {quotas.isError && (
                <Alert
                  type="error"
                  title="容量配额查询失败"
                  action={
                    <Button onClick={() => void quotas.refetch()}>
                      重试容量配额
                    </Button>
                  }
                />
              )}
              <Table<CapacityQuotaMetadata>
                className="runtime-capacity-quotas"
                rowKey="id"
                pagination={false}
                loading={quotas.isFetching}
                dataSource={
                  quotas.data?.pages.flatMap((page) => page.items) || []
                }
                scroll={{ x: 1000 }}
                columns={[
                  {
                    title: "范围",
                    render: (_, row) => (
                      <span>
                        {row.scope} · {row.scope_key}
                      </span>
                    ),
                  },
                  { title: "资源", dataIndex: "resource_key" },
                  { title: "上限", dataIndex: "limit_amount" },
                  { title: "预留", dataIndex: "reserved_amount" },
                  { title: "消耗", dataIndex: "consumed_amount" },
                  { title: "可用", dataIndex: "available_amount" },
                  { title: "窗口起点", dataIndex: "window_start" },
                ]}
              />
              {quotas.hasNextPage && (
                <Button
                  loading={quotas.isFetchingNextPage}
                  onClick={() => void quotas.fetchNextPage()}
                >
                  加载更多容量配额
                </Button>
              )}
            </>
          )}
        </Panel>
        <Panel title="租约健康">
          <p>
            {enabled
              ? "计算租约的运行健康状态。"
              : "按实际模式核对当前租约记录。"}
          </p>
          <Table
            className="runtime-lease-health"
            rowKey="mode"
            dataSource={rows}
            showHeader={false}
            pagination={false}
            columns={[
              {
                render: (_, row) => (
                  <b>
                    <Icon name={row.icon} /> {row.mode}
                  </b>
                ),
              },
              {
                render: (_, row) =>
                  enabled ? (
                    <Status tone="green">✓ 正常</Status>
                  ) : (
                    <span>
                      过期未撤销{" "}
                      {modeMetadata(row.key)?.expired_unrevoked_leases ?? "—"}
                    </span>
                  ),
                align: "right",
              },
            ]}
          />
        </Panel>
      </div>
      {!enabled && (
        <Notice>
          容量数据保留原资源单位。实际模式未报告的有效租约为
          {snapshot.data?.counts.unreported_mode_leases ?? "—"}
          个。控制指令及调度策略接入中。
        </Notice>
      )}
      <Panel title="操作控制" className="scheduling-controls">
        <p>对资源池进行运行限流或排空，保障平台稳定与维护操作。</p>
        <div>
          <article>
            <span>
              <h3>运行限流</h3>
              <p>限制新任务的启动速率，控制整体负载。</p>
            </span>
            <Button
              type="primary"
              disabled={!enabled}
              onClick={() => {
                form.setFieldsValue({ rate: platform.requestsPerMinute });
                requestKey.current = crypto.randomUUID();
                setRateOpen(true);
              }}
            >
              设置限流
            </Button>
          </article>
          <article>
            <span>
              <h3>排空</h3>
              <p>停止接收新任务，待现有任务完成后释放资源。</p>
            </span>
            <Button
              type="primary"
              disabled={!enabled || draining}
              onClick={() => setDrainOpen(true)}
            >
              {draining ? "排空待处理" : "执行排空"}
            </Button>
          </article>
        </div>
      </Panel>
      <Modal
        forceRender
        title="设置运行限流"
        open={rateOpen}
        onCancel={() => setRateOpen(false)}
        onOk={() => form.submit()}
        okText="保存限流预览"
        cancelText="返回"
      >
        <Form
          name="admininfrastructure-1"
          form={form}
          layout="vertical"
          onValuesChange={() => {
            requestKey.current = crypto.randomUUID();
          }}
          onFinish={(values) => {
            try {
              savePlatform(
                { requestsPerMinute: values.rate },
                values.reason,
                requestKey.current,
              );
              setRateOpen(false);
              void message.success("运行限流预览已保存");
            } catch (error) {
              void message.error(
                error instanceof Error ? error.message : "保存失败",
              );
            }
          }}
        >
          <Form.Item
            name="rate"
            label="每分钟启动上限"
            rules={[
              { required: true },
              { type: "integer", min: 1, message: "请输入正整数" },
            ]}
          >
            <InputNumber min={1} precision={0} />
          </Form.Item>
          <Form.Item
            label="处理理由"
            name="reason"
            rules={[
              { required: true, whitespace: true, message: "请填写处理理由" },
            ]}
          >
            <Input.TextArea rows={3} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
      {drainOpen && (
        <AdminOperationDialog
          title="资源池排空预览"
          onClose={() => setDrainOpen(false)}
          onConfirm={(reason, key) =>
            requestOperation("NODE_DRAIN", "resource-pool", reason, key)
          }
        >
          <Notice>排空停止接收新任务，现有租约与未决业务继续跟踪。</Notice>
        </AdminOperationDialog>
      )}
    </div>
  );
}

interface NodeDisplay {
  id: string;
  name: string;
  status: string;
  cores?: number | string;
  memoryMiB?: string;
  metadata?: RuntimeNodeMetadata;
  memoryGb?: number;
  leases?: number | string;
  cleanup?: boolean;
}
const imageFixtures = [
  {
    id: "script-runtime",
    name: "script-runtime:1.2.0",
    digest: "sha256:9f3d2a1e6b4c********e7a1",
    fullDigest: "sha256:" + "9f3d2a1e6b4c" + "0".repeat(48) + "e7a1",
    verified: true,
  },
  {
    id: "reserve-worker",
    name: "reserve-worker:0.9.6",
    digest: "sha256:3b7c9e0d11a2********c4f8",
    fullDigest: "sha256:" + "3b7c9e0d11a2" + "0".repeat(48) + "c4f8",
    verified: false,
  },
  {
    id: "proxy-adapter",
    name: "proxy-adapter:2.1.3",
    digest: "sha256:7e1a4b8f93d0********17c9",
    fullDigest: "sha256:" + "7e1a4b8f93d0" + "0".repeat(48) + "17c9",
    verified: false,
  },
];
export function AdminInfrastructurePage() {
  const { enabled, nodes, operations, requestOperation } = useAdminOperations();
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const focus = params.get("section") || "nodes";
  const requestedNode = params.get("node")?.toLowerCase();
  const requestedImage = params.get("image")?.toLowerCase();
  function changeParams(values: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }
  const setNodeDetail = (node: NodeDisplay | undefined) =>
    changeParams({ node: node?.id });
  const setImageDetail = (image: { id: string } | undefined) =>
    changeParams({ image: image?.id });
  const [operation, setOperation] = useState<{
    kind: OperationKind;
    id: string;
    title: string;
  }>();
  const { message } = App.useApp();
  const query = useAdminMetadata<RuntimeNodeMetadata>(
    "nodes",
    new URLSearchParams({
      view: "metadata",
      q: params.get("node_q") || "",
    }).toString(),
    !enabled,
  );
  const imageQuery = useAdminMetadata<RuntimeImageMetadata>(
    "images",
    new URLSearchParams({ q: params.get("image_q") || "" }).toString(),
    !enabled,
  );
  const detailQuery = useQuery({
    queryKey: [
      "admin",
      bootstrap.user?.id,
      bootstrap.user?.security_revision,
      "node",
      requestedNode,
    ],
    enabled: !enabled && Boolean(requestedNode),
    queryFn: ({ signal }) =>
      api<RuntimeNodeMetadata>(
        `/admin/nodes/${encodeURIComponent(requestedNode!)}`,
        { signal },
      ),
  });
  function displayNode(node: RuntimeNodeMetadata): NodeDisplay {
    return {
      id: node.id,
      name: node.name,
      status: node.status,
      cores: node.cpu_cores ?? undefined,
      memoryMiB: node.memory_mib ?? undefined,
      leases: node.active_leases,
      metadata: node,
    };
  }
  const rows: NodeDisplay[] = enabled
    ? nodes
    : (query.data?.pages.flatMap((page) => page.items) || []).map(displayNode);
  const images = imageQuery.data?.pages.flatMap((page) => page.items) || [];
  const imageLookup = useAdminMetadata<RuntimeImageMetadata>(
    "images",
    new URLSearchParams({ q: requestedImage || "" }).toString(),
    !enabled &&
      Boolean(
        requestedImage && !images.some((image) => image.id === requestedImage),
      ),
  );
  const nodeDetail = enabled
    ? rows.find((node) => node.id === requestedNode)
    : detailQuery.data
      ? displayNode(detailQuery.data)
      : undefined;
  const imageDetail = enabled
    ? imageFixtures.find((image) => image.id === requestedImage)
    : images.find((image) => image.id === requestedImage) ||
      imageLookup.data?.pages
        .flatMap((page) => page.items)
        .find((image) => image.id === requestedImage);
  const status = (node: NodeDisplay) =>
    enabled &&
    operations.some(
      (item) => item.resourceId === node.id && item.kind === "NODE_DRAIN",
    )
      ? "DRAINING"
      : node.status;
  return (
    <div className="admin-page admin-infrastructure-page">
      <PageHeading title="节点与镜像" />
      <div className="admin-segment-tabs">
        {[
          ["nodes", "节点"],
          ["images", "镜像"],
        ].map(([key, label]) => (
          <Button
            key={key}
            type={focus === key ? "primary" : "default"}
            aria-pressed={focus === key}
            onClick={() => {
              changeParams({ section: key });
              document
                .getElementById(`infrastructure-${key}`)
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {!["nodes", "images"].includes(focus) && (
        <Notice>所选基础设施视图不存在，请选择节点或镜像。</Notice>
      )}
      {!enabled && (
        <Notice>
          当前支持节点与镜像元数据查询。受控操作、清理证明及验证内容接入中。
        </Notice>
      )}
      {query.isError && !enabled && (
        <Alert
          type="error"
          title="节点数据加载失败"
          description={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <div id="infrastructure-nodes">
        <Panel
          title="计算节点"
          extra={
            !enabled && (
              <Input.Search
                key={params.get("node_q") || ""}
                aria-label="搜索节点"
                placeholder="搜索节点"
                defaultValue={params.get("node_q") || ""}
                onSearch={(value) =>
                  changeParams({ node_q: value.trim() || undefined })
                }
              />
            )
          }
        >
          <Table<NodeDisplay>
            rowKey="id"
            loading={query.isLoading && !enabled}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 1400 }}
            columns={[
              {
                title: "节点名称",
                width: 254,
                render: (_, row) => (
                  <Button
                    type="text"
                    className="node-name"
                    onClick={() => setNodeDetail(row)}
                  >
                    <Icon name="cube" />
                    {row.name}
                  </Button>
                ),
              },
              {
                title: "状态",
                width: 204,
                render: (_, row) => (
                  <Status
                    tone={
                      status(row) === "ONLINE"
                        ? "green"
                        : status(row) === "DRAINING"
                          ? "orange"
                          : "gray"
                    }
                  >
                    {!enabled
                      ? nodeStateLabels[status(row)] || status(row)
                      : status(row) === "ONLINE"
                        ? "● 健康"
                        : status(row) === "DRAINING"
                          ? "● 排空中"
                          : "● 停用"}
                  </Status>
                ),
              },
              {
                title: "CPU",
                width: 169,
                render: (_, row) =>
                  row.cores !== undefined ? `${row.cores} 核` : "—",
              },
              {
                title: "内存",
                width: 181,
                render: (_, row) =>
                  row.memoryMiB !== undefined
                    ? `${row.memoryMiB} MiB`
                    : row.memoryGb !== undefined
                      ? `${row.memoryGb} GB`
                      : "—",
              },
              {
                title: "活动租约",
                width: 173,
                render: (_, row) =>
                  row.leases === undefined ? "—" : `${row.leases} 个`,
              },
              {
                title: "最近清理证明",
                width: 251,
                render: (_, row) =>
                  row.metadata ? (
                    "证明查询待接入"
                  ) : row.cleanup === undefined ? (
                    "待采集"
                  ) : row.cleanup ? (
                    <Status tone="green">✓ 已生成</Status>
                  ) : (
                    "◷ 待完成"
                  ),
              },
              {
                title: "操作",
                width: 270,
                render: (_, row) => (
                  <div>
                    <div className="row-actions">
                      <Button
                        disabled={!enabled || status(row) !== "ONLINE"}
                        onClick={() =>
                          setOperation({
                            kind: "NODE_DRAIN",
                            id: row.id,
                            title: `排空节点 ${row.name}`,
                          })
                        }
                      >
                        排空
                      </Button>
                      <Button disabled>停用</Button>
                    </div>
                    {status(row) === "DRAINING" && (
                      <small>排空中，等待活动租约归零</small>
                    )}
                  </div>
                ),
              },
            ]}
          />
          {!enabled && query.hasNextPage && (
            <Button
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              加载更多节点
            </Button>
          )}
        </Panel>
      </div>
      <div id="infrastructure-images">
        <Panel
          title="镜像列表"
          extra={
            !enabled && (
              <Input.Search
                key={params.get("image_q") || ""}
                aria-label="搜索镜像"
                placeholder="搜索镜像"
                defaultValue={params.get("image_q") || ""}
                onSearch={(value) =>
                  changeParams({ image_q: value.trim() || undefined })
                }
              />
            )
          }
        >
          {!enabled && imageQuery.isError && (
            <Alert
              type="error"
              title="镜像查询失败"
              action={
                <Button onClick={() => void imageQuery.refetch()}>
                  重试镜像查询
                </Button>
              }
            />
          )}
          <Table
            rowKey="id"
            dataSource={
              enabled
                ? imageFixtures
                : images.map((image) => ({
                    id: image.id,
                    name: `${image.name}:${image.version}`,
                    digest: image.digest,
                    fullDigest: image.digest,
                    verified: false,
                    metadata: image,
                  }))
            }
            pagination={false}
            loading={!enabled && imageQuery.isFetching}
            scroll={{ x: 1250 }}
            columns={[
              {
                title: "镜像名称",
                width: 414,
                render: (_, row) => (
                  <b>
                    <Icon name="cube" /> {row.name}
                  </b>
                ),
              },
              {
                title: "摘要（SHA256）",
                width: 559,
                dataIndex: "digest",
                render: (value) => <code>{value}</code>,
              },
              {
                title: enabled ? "镜像验证" : "镜像状态",
                width: 266,
                render: (_, row) =>
                  !enabled ? (
                    <Status>
                      {images.find((image) => image.id === row.id)?.status}
                    </Status>
                  ) : row.verified ? (
                    <Status tone="green">✓ 已验证</Status>
                  ) : (
                    <span>⊖ 未验证</span>
                  ),
              },
              {
                title: "操作",
                render: (_, row) => (
                  <Button onClick={() => setImageDetail(row)}>镜像验证</Button>
                ),
              },
            ]}
          />
          {!enabled && imageQuery.hasNextPage && (
            <Button
              loading={imageQuery.isFetchingNextPage}
              onClick={() => void imageQuery.fetchNextPage()}
            >
              加载更多镜像
            </Button>
          )}
        </Panel>
      </div>
      <p className="infrastructure-footnote">
        <Icon name="info" />{" "}
        {enabled
          ? "环境清理与镜像验证的证据可分别查看，业务结果由运行核验确认。"
          : "环境回收及镜像验证内容接入中，业务结果由运行核验确认。"}
      </p>
      <Modal
        title="节点状态与受控操作"
        open={Boolean(requestedNode)}
        onCancel={() => setNodeDetail(undefined)}
        footer={
          <Button onClick={() => setNodeDetail(undefined)}>关闭节点详情</Button>
        }
      >
        {!nodeDetail && (
          <Alert
            type={!enabled && detailQuery.isError ? "error" : "info"}
            title={
              !enabled && detailQuery.isPending
                ? "正在查询节点详情"
                : "所选节点不存在或暂不可用"
            }
            action={
              !enabled &&
              detailQuery.isError && (
                <Button onClick={() => void detailQuery.refetch()}>
                  重试节点详情
                </Button>
              )
            }
          />
        )}
        <p>
          {nodeDetail?.name}　活动租约 · {nodeDetail?.leases ?? "—"}
        </p>
        {nodeDetail?.metadata && (
          <dl className="runtime-node-summary">
            <dt>记录修订</dt>
            <dd>{nodeDetail.metadata.revision}</dd>
            <dt>节点状态</dt>
            <dd>
              {nodeStateLabels[nodeDetail.metadata.status] ||
                nodeDetail.metadata.status}
            </dd>
            <dt>最近心跳</dt>
            <dd>{nodeDetail.metadata.last_heartbeat_at || "未报告"}</dd>
            <dt>时钟偏差</dt>
            <dd>{nodeDetail.metadata.clock_offset_ms ?? "未报告"} ms</dd>
            <dt>隔离纪元</dt>
            <dd>{nodeDetail.metadata.isolation_epoch}</dd>
            <dt>过期未撤销租约</dt>
            <dd>{nodeDetail.metadata.expired_unrevoked_leases}</dd>
            <dt>已停止待清理环境</dt>
            <dd>{nodeDetail.metadata.cleanup_pending}</dd>
            <dt>清理失败记录</dt>
            <dd>{nodeDetail.metadata.cleanup_failed}</dd>
          </dl>
        )}
        <Notice>
          恢复节点需要新的健康与隔离清理证据，旧租约继续保持既有状态。
        </Notice>
        <div className="row-actions">
          <Button
            disabled={!enabled || nodeDetail?.leases !== 0}
            onClick={() => {
              if (nodeDetail) {
                setOperation({
                  kind: "NODE_CLEANUP",
                  id: nodeDetail.id,
                  title: "登记环境清理预览",
                });
                setNodeDetail(undefined);
              }
            }}
          >
            受控清理
          </Button>
          <Button
            onClick={() => void message.info("恢复需要新的节点健康与清理证据")}
          >
            核查恢复条件
          </Button>
        </div>
      </Modal>
      <Modal
        title="镜像验证证据"
        open={Boolean(requestedImage)}
        onCancel={() => setImageDetail(undefined)}
        footer={
          <>
            <Button onClick={() => setImageDetail(undefined)}>
              关闭镜像详情
            </Button>
            <Button
              type="primary"
              disabled={
                !enabled ||
                operations.some(
                  (item) =>
                    item.kind === "IMAGE_VERIFY" &&
                    item.resourceId === imageDetail?.id,
                )
              }
              onClick={() => {
                if (imageDetail) {
                  setOperation({
                    kind: "IMAGE_VERIFY",
                    id: imageDetail.id,
                    title: "发起镜像验证预览",
                  });
                  setImageDetail(undefined);
                }
              }}
            >
              发起验证
            </Button>
          </>
        }
      >
        {!imageDetail && (
          <Alert
            type={!enabled && imageLookup.isError ? "error" : "info"}
            title={
              !enabled && imageLookup.isPending
                ? "正在查询镜像详情"
                : "所选镜像不存在或暂不可用"
            }
            action={
              !enabled &&
              imageLookup.isError && (
                <Button onClick={() => void imageLookup.refetch()}>
                  重试镜像详情
                </Button>
              )
            }
          />
        )}
        <h3>{imageDetail?.name}</h3>
        <p>
          <code>{imageDetail?.digest}</code>
        </p>
        <p>
          {enabled
            ? "本地镜像示例用于复制交互，验证证据按执行模式记录。"
            : "镜像状态及支持模式读取当前记录，验证内容接入中。"}
        </p>
        {enabled && imageDetail && "verified" in imageDetail ? (
          <Status tone={imageDetail.verified ? "green" : "gray"}>
            {imageDetail.verified ? "已保存示例验证证据" : "等待对应模式验证"}
          </Status>
        ) : (
          imageDetail &&
          "status" in imageDetail && (
            <dl className="runtime-node-summary">
              <dt>镜像状态</dt>
              <dd>{imageDetail.status}</dd>
              <dt>记录修订</dt>
              <dd>{imageDetail.revision}</dd>
              <dt>执行模式</dt>
              <dd>
                {imageDetail.modes
                  .map((mode) => runtimeModeLabels[mode] || mode)
                  .join("、")}
              </dd>
              <dt>证据元数据</dt>
              <dd>{imageDetail.has_evidence ? "有记录" : "暂无记录"}</dd>
              <dt>样例标记</dt>
              <dd>
                {imageDetail.development_fixture ? "开发样例" : "常规记录"}
              </dd>
            </dl>
          )
        )}
        <Button
          disabled={!imageDetail}
          onClick={() => {
            if (!imageDetail) return;
            const digest =
              "fullDigest" in imageDetail
                ? imageDetail.fullDigest
                : imageDetail.digest;
            void navigator.clipboard.writeText(digest).then(
              () => message.success("摘要已复制"),
              () => message.error("复制失败，请手动复制摘要"),
            );
          }}
        >
          复制摘要
        </Button>
      </Modal>
      {operation && (
        <AdminOperationDialog
          title={operation.title}
          onClose={() => setOperation(undefined)}
          onConfirm={(reason, key) =>
            requestOperation(operation.kind, operation.id, reason, key)
          }
        >
          <Notice>
            当前操作记录本地预览请求，节点与镜像的完成状态等待工作节点证据。
          </Notice>
        </AdminOperationDialog>
      )}
    </div>
  );
}
