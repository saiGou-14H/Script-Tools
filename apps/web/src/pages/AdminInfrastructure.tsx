import { useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Empty,
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
  { mode: "Docker", used: 48, total: 64, icon: "container" },
  { mode: "KVM", used: 24, total: 32, icon: "laptop" },
  { mode: "TCG", used: 12, total: 16, icon: "settings" },
];
export function AdminSchedulingPage() {
  const { enabled, platform, operations, savePlatform, requestOperation } =
    useAdminOperations();
  const [rateOpen, setRateOpen] = useState(false);
  const [drainOpen, setDrainOpen] = useState(false);
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const { message } = App.useApp();
  if (!enabled)
    return (
      <div className="admin-page admin-scheduling-page">
        <PageHeading title="调度与容量" />
        <Empty description="调度指标接口尚未接入" />
      </div>
    );
  const rows = enabled ? capacities : [];
  const draining = operations.some(
    (item) => item.kind === "NODE_DRAIN" && item.resourceId === "resource-pool",
  );
  return (
    <div className="admin-page admin-scheduling-page">
      <PageHeading
        title="调度与容量"
        description="管理计算资源池、调度队列与配额，控制运行与排空策略，保障服务稳定与高效运行。"
      />
      <div className="admin-resource-banner">
        <TileIcon name="container" />
        <span>
          <h3>资源池</h3>
          <small>当前可用的计算资源池类型</small>
        </span>
        <div className="resource-mode-tags">
          {["Docker", "KVM", "TCG"].map((mode) => (
            <span key={mode}>
              <Icon name="shield" />
              {mode}
              {mode === "TCG" && <Status tone="green">允许</Status>}
            </span>
          ))}
        </div>
        <div className="resource-queue-stats">
          {[
            ["队列待运行", "12", "play"],
            ["活跃", "32", "chart"],
            ["预约等待", "8", "clock"],
          ].map(([label, value, icon]) => (
            <article key={label}>
              <b>
                <Icon name={icon} />
                {label}
              </b>
              <strong>{enabled ? value : "—"}</strong>
            </article>
          ))}
        </div>
      </div>
      <div className="admin-capacity-top">
        <Panel
          title={
            <>
              容量概览 <small>（资源单位）</small>
            </>
          }
        >
          <div className="capacity-bars">
            {rows.map((row) => (
              <article key={row.mode}>
                <TileIcon name={row.icon} />
                <strong>{row.mode}</strong>
                <Progress percent={75} showInfo={false} strokeWidth={10} />
                <span>
                  {row.used} / {row.total}　（75%）
                </span>
              </article>
            ))}
          </div>
          {!enabled && <Empty description="调度指标接口尚未接入" />}
        </Panel>
        <Panel title="已购服务履约调度" className="scheduling-priorities">
          <p>按服务截止时间、等待时长和公平配额调度。</p>
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
          <p>各资源池的总量、已用与可用配额。</p>
          <Table
            rowKey="mode"
            dataSource={rows}
            pagination={false}
            columns={[
              {
                title: "资源池",
                render: (_, row) => (
                  <b>
                    <Icon name={row.icon} /> {row.mode}
                  </b>
                ),
              },
              { title: "总配额", dataIndex: "total" },
              { title: "已用", dataIndex: "used" },
              { title: "可用", render: (_, row) => row.total - row.used },
              {
                title: "使用率",
                render: () => (
                  <div className="quota-progress">
                    <Progress percent={75} showInfo={false} strokeWidth={9} />
                    <span>75%</span>
                  </div>
                ),
              },
            ]}
          />
        </Panel>
        <Panel title="租约健康">
          <p>计算租约的运行健康状态。</p>
          <Table
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
                render: () => <Status tone="green">✓ 正常</Status>,
                align: "right",
              },
            ]}
          />
        </Panel>
      </div>
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
            savePlatform(
              { requestsPerMinute: values.rate },
              values.reason,
              requestKey.current,
            );
            setRateOpen(false);
            void message.success("运行限流预览已保存");
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
  cores?: number;
  memoryGb?: number;
  leases?: number;
  cleanup?: boolean;
}
const imageFixtures = [
  {
    id: "script-runtime",
    name: "script-runtime:1.2.0",
    digest: "sha256:9f3d2a1e6b4c********e7a1",
    verified: true,
  },
  {
    id: "reserve-worker",
    name: "reserve-worker:0.9.6",
    digest: "sha256:3b7c9e0d11a2********c4f8",
    verified: false,
  },
  {
    id: "proxy-adapter",
    name: "proxy-adapter:2.1.3",
    digest: "sha256:7e1a4b8f93d0********17c9",
    verified: false,
  },
];
export function AdminInfrastructurePage() {
  const { enabled, nodes, operations, requestOperation } = useAdminOperations();
  const [focus, setFocus] = useState("nodes");
  const [nodeDetail, setNodeDetail] = useState<NodeDisplay>();
  const [imageDetail, setImageDetail] =
    useState<(typeof imageFixtures)[number]>();
  const [operation, setOperation] = useState<{
    kind: OperationKind;
    id: string;
    title: string;
  }>();
  const { message } = App.useApp();
  const query = useQuery({
    queryKey: ["admin", "nodes"],
    queryFn: () => api<NodeDisplay[]>("/admin/nodes"),
    enabled: !enabled,
  });
  const rows: NodeDisplay[] = enabled ? nodes : query.data || [];
  const status = (node: NodeDisplay) =>
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
            onClick={() => {
              setFocus(key);
              document
                .getElementById(`infrastructure-${key}`)
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {query.isError && !enabled && (
        <Alert
          type="error"
          title="节点数据加载失败"
          description={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <div id="infrastructure-nodes">
        <Panel title="计算节点">
          <Table<NodeDisplay>
            rowKey="id"
            loading={query.isLoading && !enabled}
            dataSource={rows}
            pagination={false}
            columns={[
              {
                title: "节点名称",
                render: (_, row) => (
                  <Button
                    type="text"
                    className="node-name"
                    onClick={() => setNodeDetail(row)}
                  >
                    <Icon name="container" />
                    {row.name}
                  </Button>
                ),
              },
              {
                title: "状态",
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
                    {status(row) === "ONLINE"
                      ? "● 健康"
                      : status(row) === "DRAINING"
                        ? "● 排空中"
                        : "● 停用"}
                  </Status>
                ),
              },
              {
                title: "CPU",
                render: (_, row) => (row.cores ? `${row.cores} 核` : "—"),
              },
              {
                title: "内存",
                render: (_, row) => (row.memoryGb ? `${row.memoryGb} GB` : "—"),
              },
              {
                title: "活动租约",
                render: (_, row) =>
                  row.leases === undefined ? "—" : `${row.leases} 个`,
              },
              {
                title: "最近清理证明",
                render: (_, row) =>
                  row.cleanup === undefined ? (
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
        </Panel>
      </div>
      <div id="infrastructure-images">
        <Panel title="镜像列表">
          <Table
            rowKey="id"
            dataSource={enabled ? imageFixtures : []}
            pagination={false}
            columns={[
              {
                title: "镜像名称",
                render: (_, row) => (
                  <b>
                    <Icon name="container" /> {row.name}
                  </b>
                ),
              },
              {
                title: "摘要（SHA256）",
                dataIndex: "digest",
                render: (value) => <code>{value}</code>,
              },
              {
                title: "镜像验证",
                render: (_, row) =>
                  row.verified ? (
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
        </Panel>
      </div>
      <p className="infrastructure-footnote">
        <Icon name="info" />{" "}
        环境清理与镜像验证的证据可分别查看，业务结果由运行核验确认。
      </p>
      <Modal
        title="节点状态与受控操作"
        open={Boolean(nodeDetail)}
        onCancel={() => setNodeDetail(undefined)}
        footer={
          <Button onClick={() => setNodeDetail(undefined)}>关闭节点详情</Button>
        }
      >
        <p>
          {nodeDetail?.name}　活动租约 · {nodeDetail?.leases ?? "—"}
        </p>
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
        open={Boolean(imageDetail)}
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
        <h3>{imageDetail?.name}</h3>
        <p>
          <code>{imageDetail?.digest}</code>
        </p>
        <p>摘要固定，支持Docker、KVM和TCG的证据分别记录。</p>
        <Status tone={imageDetail?.verified ? "green" : "gray"}>
          {imageDetail?.verified ? "已保存示例验证证据" : "等待对应模式验证"}
        </Status>
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
