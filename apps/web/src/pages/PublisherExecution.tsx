import { useEffect, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Empty,
  Form,
  InputNumber,
  Modal,
  Select,
  Spin,
  Table,
  Tabs,
  Typography,
} from "antd";
import {
  CheckCircleFilled,
  CloseCircleFilled,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status } from "../components/ui";
import {
  deploymentModeLabels,
  executionRecordLabels,
  recordDuration,
  usePublisherRecord,
  usePublisherRecords,
  type PublisherDeploymentRecord,
  type PublisherExecutionRecord,
} from "../lib/publisher-execution";
import { ApiError } from "../api";

interface BuildRecord {
  id: string;
  script: string;
  version: string;
  status: string;
  duration: string;
  metadata?: PublisherExecutionRecord;
}

function buildRecord(record: PublisherExecutionRecord): BuildRecord {
  return {
    id: record.id,
    script: record.script_name,
    version: record.version,
    status: record.status,
    duration: recordDuration(record.duration_ms),
    metadata: record,
  };
}

function RecordStatus({ status }: { status: string }) {
  const success = ["SUCCEEDED", "READY"].includes(status);
  const failed = ["FAILED", "TIMED_OUT", "CLOSED_UNRESOLVED"].includes(status);
  return (
    <Status
      tone={
        success
          ? "green"
          : failed
            ? "red"
            : ["CANCELLED", "EXPIRED"].includes(status)
              ? "gray"
              : "orange"
      }
    >
      {success ? <CheckCircleFilled /> : failed ? <CloseCircleFilled /> : "···"}{" "}
      {executionRecordLabels[status] || status}
    </Status>
  );
}

const buildFixtures = [
  {
    id: "B031",
    script: "表格清洗",
    version: "v1.2",
    status: "SUCCEEDED",
    duration: "1m20s",
  },
  {
    id: "B032",
    script: "文件处理",
    version: "v0.4",
    status: "FAILED",
    duration: "—",
  },
  {
    id: "B033",
    script: "预约",
    version: "v1.1",
    status: "QUEUED",
    duration: "—",
  },
];
const trialFixtures = [
  {
    id: "TEST081",
    script: "表格清洗",
    version: "v1.2",
    status: "SUCCEEDED",
    duration: "2m06s",
  },
  {
    id: "TEST082",
    script: "景点预约",
    version: "v1.0",
    status: "QUEUED",
    duration: "—",
  },
];

export function BuildsPage() {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "trial" ? "trial" : "build";
  const prototype = bootstrap.data_mode === "prototype";
  const applied = {
    script: params.get("script") || "",
    script_id: params.get("script_id") || "",
    version: params.get("version") || "",
    status: params.get("status") || "",
  };
  const [filters, setFilters] = useState(applied);
  useEffect(() => {
    setFilters({
      script: params.get("script") || "",
      script_id: params.get("script_id") || "",
      version: params.get("version") || "",
      status: params.get("status") || "",
    });
  }, [params]);
  const { message, modal } = App.useApp();
  const search = new URLSearchParams();
  const textQuery = params.get("q") || "";
  if (textQuery) search.set("q", textQuery);
  if (applied.script) search.set("script_name", applied.script);
  if (applied.script_id) search.set("script_id", applied.script_id);
  if (applied.version) search.set("version", applied.version);
  if (applied.status) search.set("status", applied.status);
  const resource = tab === "build" ? "builds" : "test-runs";
  const records = usePublisherRecords<PublisherExecutionRecord>(
    resource,
    search.toString(),
    !prototype,
  );
  const requested = params.get("record");
  const detail = usePublisherRecord<PublisherExecutionRecord>(
    resource,
    requested,
    !prototype,
  );
  const all: BuildRecord[] = prototype
    ? tab === "build"
      ? buildFixtures
      : trialFixtures
    : records.data?.pages.flatMap((page) => page.items.map(buildRecord)) || [];
  function matchesFilters(item: BuildRecord) {
    return (
      (!applied.script || item.script === applied.script) &&
      (!applied.script_id ||
        item.metadata?.script_id === applied.script_id.toLowerCase()) &&
      (!applied.version || item.version === applied.version) &&
      (!applied.status || item.status === applied.status) &&
      (!textQuery ||
        [item.id, item.script, item.version]
          .join(" ")
          .toLowerCase()
          .includes(textQuery.toLowerCase()))
    );
  }
  const rows = all.filter(matchesFilters);
  const selected = detail.data ? buildRecord(detail.data) : undefined;
  const selectedMatches = selected && matchesFilters(selected);
  const scriptOptions = new Map<
    string,
    { value: string; label: string; title: string }
  >();
  for (const row of all) {
    const id = prototype ? row.script : row.metadata!.script_id;
    const label = prototype ? row.script : `${row.script} · ${id.slice(0, 8)}`;
    scriptOptions.set(id, { value: id, label, title: `${row.script} ${id}` });
  }
  const defaultId = tab === "build" ? "B032" : "TEST081";
  const item = requested
    ? rows.find((row) => row.id === requested) ||
      (selectedMatches ? selected : undefined)
    : rows.find((row) => row.id === defaultId) || rows[0];
  function selectRecord(id: string) {
    const next = new URLSearchParams(params);
    next.set("record", id);
    setParams(next);
  }
  function query() {
    const next = new URLSearchParams(params);
    next.delete("record");
    for (const [key, value] of Object.entries(filters)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }
  return (
    <div className="publisher-builds-page">
      <PageHeading
        title="构建与测试记录"
        extra={
          <Status tone="gray">{prototype ? "本地示例" : "本人记录"}</Status>
        }
      />
      {!prototype && records.isError && (
        <Alert
          className="publisher-record-error"
          type="error"
          showIcon
          title="记录加载失败"
          description={records.error.message}
          action={<Button onClick={() => void records.refetch()}>重试</Button>}
        />
      )}
      <Panel>
        <Tabs
          activeKey={tab}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            for (const key of [
              "script",
              "script_id",
              "version",
              "status",
              "record",
              "tab",
            ])
              next.delete(key);
            if (value === "trial") next.set("tab", "trial");
            setParams(next);
          }}
          items={[
            { key: "build", label: "构建记录" },
            { key: "trial", label: "试运行记录" },
          ]}
        />
        <div className="build-filters">
          <b>脚本</b>
          <Select
            aria-label="构建脚本"
            value={filters.script_id || filters.script}
            onChange={(script) =>
              setFilters((previous) => ({
                ...previous,
                script: prototype ? script : "",
                script_id: prototype ? "" : script,
              }))
            }
            options={[
              { value: "", label: "全部脚本" },
              ...scriptOptions.values(),
            ]}
          />
          <b>版本</b>
          <Select
            aria-label="构建版本"
            value={filters.version}
            onChange={(version) =>
              setFilters((previous) => ({ ...previous, version }))
            }
            options={[
              { value: "", label: "全部版本" },
              ...[...new Set(all.map((row) => row.version))].map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
          <b>状态</b>
          <Select
            aria-label="构建状态"
            value={filters.status}
            onChange={(status) =>
              setFilters((previous) => ({ ...previous, status }))
            }
            options={[
              { value: "", label: "全部状态" },
              ...(tab === "build"
                ? ["SUCCEEDED", "FAILED", "QUEUED", "RUNNING", "CANCELLED"]
                : Object.keys(executionRecordLabels)
              ).map((value) => ({
                value,
                label: executionRecordLabels[value],
              })),
            ]}
          />
          <Button type="primary" aria-label="查询构建记录" onClick={query}>
            查询
          </Button>
        </div>
        <div className="builds-columns">
          <div className="build-records">
            <Table
              rowKey="id"
              dataSource={rows}
              loading={!prototype && records.isFetching}
              pagination={false}
              scroll={{ x: 850, y: prototype ? undefined : 480 }}
              rowClassName={(row) =>
                row.id === item?.id ? "selected-build" : ""
              }
              columns={[
                {
                  title: tab === "build" ? "构建编号" : "试运行编号",
                  width: prototype ? 140 : 330,
                  dataIndex: "id",
                  render: (value) => (
                    <Button
                      className="build-record-id"
                      type="link"
                      aria-label={`查看${value}`}
                      onClick={() => selectRecord(value)}
                    >
                      {value}
                    </Button>
                  ),
                },
                { title: "脚本名称", dataIndex: "script", width: 180 },
                { title: "版本", dataIndex: "version", width: 123 },
                {
                  title: "状态",
                  width: 163,
                  dataIndex: "status",
                  render: (value) => <RecordStatus status={value} />,
                },
                { title: "耗时", dataIndex: "duration", width: 134 },
                {
                  title: "操作",
                  render: (_, row) =>
                    row.status === "QUEUED" ? (
                      <Button
                        type="link"
                        disabled={!prototype}
                        aria-label={`取消${row.id}`}
                        onClick={() =>
                          modal.confirm({
                            title: "取消排队作业",
                            content: `${row.id} 的取消作业接口待接入，可在详情查看排队状态。`,
                            okText: "了解",
                            cancelText: "返回",
                          })
                        }
                      >
                        取消
                      </Button>
                    ) : (
                      <Button type="link" onClick={() => selectRecord(row.id)}>
                        查看详情
                      </Button>
                    ),
                },
              ]}
            />
            {!prototype && records.hasNextPage && (
              <Button
                className="publisher-record-more"
                loading={records.isFetchingNextPage}
                onClick={() => void records.fetchNextPage()}
              >
                加载更多记录
              </Button>
            )}
          </div>
          <section className="build-detail">
            {!prototype && requested && detail.isFetching ? (
              <Spin />
            ) : item ? (
              <>
                <h2>
                  {tab === "build" ? "构建详情" : "试运行详情"}　{item.id}
                </h2>
                <p>
                  脚本名称　<b>{item.script}</b>
                  <span>
                    版本　<b>{item.version}</b>
                  </span>
                </p>
                <p>
                  状态　
                  <RecordStatus status={item.status} />
                </p>
                <hr />
                {item.metadata ? (
                  <div className="execution-record-metadata">
                    <dl>
                      <dt>版本编号</dt>
                      <dd>{item.metadata.script_version_id}</dd>
                      <dt>创建时间</dt>
                      <dd>{item.metadata.created_at}</dd>
                      <dt>开始时间</dt>
                      <dd>{item.metadata.started_at || "未登记"}</dd>
                      <dt>结束时间</dt>
                      <dd>{item.metadata.finished_at || "未登记"}</dd>
                      {tab === "build" ? (
                        <>
                          <dt>制品摘要</dt>
                          <dd>{item.metadata.artifact_digest || "未登记"}</dd>
                        </>
                      ) : (
                        <>
                          <dt>测试证据</dt>
                          <dd>
                            {item.metadata.test_passed == null
                              ? "尚无判定"
                              : item.metadata.test_passed
                                ? "通过"
                                : "未通过"}
                          </dd>
                          <dt>实测模式</dt>
                          <dd>
                            {deploymentModeLabels[
                              item.metadata.tested_execution_mode || ""
                            ] || "未登记"}
                          </dd>
                        </>
                      )}
                      {item.metadata.failure_code && (
                        <>
                          <dt>错误代码</dt>
                          <dd>{item.metadata.failure_code}</dd>
                        </>
                      )}
                    </dl>
                    <Notice>
                      {item.metadata.has_log_segments
                        ? "已登记日志分段，日志正文读取待接入。"
                        : "当前未登记日志分段。"}
                    </Notice>
                    {tab === "build" && item.status === "FAILED" && (
                      <Button type="primary" disabled icon={<ReloadOutlined />}>
                        重新构建
                      </Button>
                    )}
                  </div>
                ) : item.status === "FAILED" ? (
                  <>
                    <h3>错误信息（已脱敏）</h3>
                    <Alert
                      type="error"
                      showIcon
                      title="构建过程异常，依赖锁缺失，请检查依赖配置。"
                    />
                    <h3>修复建议</h3>
                    <Notice>
                      <ol>
                        <li>补充对应的依赖锁文件。</li>
                        <li>核对依赖版本是否与脚本配置一致。</li>
                        <li>修复后可重新构建。</li>
                      </ol>
                    </Notice>
                    <Button
                      type="primary"
                      icon={<ReloadOutlined aria-hidden />}
                      onClick={() =>
                        void message.info(`${item.id} 的构建服务待接入`)
                      }
                    >
                      重新构建
                    </Button>
                  </>
                ) : item.status === "SUCCEEDED" ? (
                  <>
                    <Alert
                      type="success"
                      showIcon
                      title={
                        tab === "build"
                          ? "固定制品构建成功"
                          : "原型测试记录通过"
                      }
                    />
                    <pre>
                      {tab === "build"
                        ? "[INFO] 依赖安装完成\n[INFO] 制品摘要已固定\n[INFO] 构建完成"
                        : "输入1200行\n去重86条\n结果文件已生成"}
                    </pre>
                  </>
                ) : (
                  <Notice>当前作业等待可用的开发配额。</Notice>
                )}
              </>
            ) : (
              <Empty
                description={
                  requested
                    ? `记录 ${requested} 不存在或不在当前筛选范围内`
                    : "当前筛选无记录"
                }
              />
            )}
            {!prototype &&
              detail.isError &&
              !(
                detail.error instanceof ApiError && detail.error.status === 404
              ) && (
                <Alert
                  type="error"
                  showIcon
                  title="记录详情加载失败"
                  description={detail.error.message}
                  action={
                    <Button onClick={() => void detail.refetch()}>重试</Button>
                  }
                />
              )}
          </section>
        </div>
      </Panel>
    </div>
  );
}

interface DeploymentRecord {
  id: string;
  script: string;
  version: string;
  category: string;
  digest: string | null;
  mode: string;
  status: string;
  service: string;
  metadata?: PublisherDeploymentRecord;
}

function deploymentRecord(record: PublisherDeploymentRecord): DeploymentRecord {
  return {
    id: record.id,
    script: record.script_name,
    version: record.version,
    category: "",
    digest: record.artifact_digest,
    mode:
      deploymentModeLabels[record.configured_execution_mode || ""] || "未登记",
    status: record.status,
    service:
      record.services
        .map((item) => item.title + (item.is_current ? "" : "（历史关联）"))
        .join("、") || "未关联",
    metadata: record,
  };
}

function deploymentResources(record: DeploymentRecord) {
  return record.metadata
    ? `${record.metadata.cpu ?? "未登记"} CPU　${record.metadata.memory_mib ?? "未登记"} MiB`
    : "1 CPU　512 MB";
}

const deploymentFixtures: DeploymentRecord[] = [
  {
    id: "table",
    script: "表格清洗",
    version: "v1.2",
    category: "数据清洗",
    digest:
      "sha256:8f3e9a2d67bd4b76c8a841085df181f1ce8d7a0b48f762f443ed6919cfaf2c31",
    mode: "Docker",
    status: "READY",
    service: "表格清洗",
  },
  {
    id: "files",
    script: "文件处理",
    version: "v0.4",
    category: "文件处理",
    digest:
      "sha256:4b7c1d50174e9db83c08abccf19bfd8e7a4c0db0192f9f507faf2129f634e6ac",
    mode: "Docker",
    status: "FAILED",
    service: "未关联",
  },
  {
    id: "booking",
    script: "景点预约",
    version: "v1.0",
    category: "景点预约适配",
    digest:
      "sha256:9d2e5f7a2768d2d8cdf87a2aa2cb13df876bb4886ad3ad2846012d1b0aa90dc7",
    mode: "KVM",
    status: "READY",
    service: "免费景点预约",
  },
];

export function DeploymentsPage() {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const requested = params.get("deployment");
  const prototype = bootstrap.data_mode === "prototype";
  const [creating, setCreating] = useState(false);
  const [configuration, setConfiguration] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [form] = Form.useForm();
  const mode = Form.useWatch("mode", form);
  const { modal, message } = App.useApp();
  const records = usePublisherRecords<PublisherDeploymentRecord>(
    "deployments",
    "",
    !prototype,
  );
  const detail = usePublisherRecord<PublisherDeploymentRecord>(
    "deployments",
    requested,
    !prototype,
  );
  const rows = prototype
    ? deploymentFixtures
    : records.data?.pages.flatMap((page) => page.items.map(deploymentRecord)) ||
      [];
  const selected = requested || (prototype ? "table" : rows[0]?.id || "");
  const item =
    rows.find((row) => row.id === selected) ||
    (detail.data ? deploymentRecord(detail.data) : undefined);
  function selectDeployment(id: string) {
    const next = new URLSearchParams(params);
    next.set("deployment", id);
    setParams(next);
  }
  function stop(deployment: DeploymentRecord) {
    modal.confirm({
      title: "停用部署影响预览",
      content: `${deployment.script} ${deployment.version} 停用将停止新售卖，并处理存量权益的履约或补偿。影响预览与停用作业接口待接入，受影响订单及权益数量待计算。`,
      okText: "了解影响",
      cancelText: "返回",
    });
  }
  function previewConfiguration(values: {
    version: string;
    mode: string;
    cpu: number;
    memory: number;
    allowTcg?: boolean;
  }) {
    const version = rows.find(
      (row) => row.id === values.version && row.status === "READY",
    );
    if (!version) {
      void message.error("请选择已就绪的固定版本");
      return;
    }
    setConfiguration({
      script: version.script,
      version: version.version,
      artifact_digest: version.digest,
      execution_mode: values.mode,
      cpu: values.cpu,
      memory_mb: values.memory,
      allow_tcg: values.mode === "qemu_tcg" && values.allowTcg === true,
    });
    void message.info("部署接口尚未接通，配置已通过前端校验");
  }
  return (
    <div className="publisher-deployments-page">
      <PageHeading
        title="部署管理"
        description="管理脚本的运行部署，配置运行环境与资源，支持启停与重试。"
        extra={
          <Status tone="gray">{prototype ? "本地示例" : "本人记录"}</Status>
        }
      />
      {!prototype && records.isError && (
        <Alert
          className="publisher-record-error"
          type="error"
          showIcon
          title="部署记录加载失败"
          description={records.error.message}
          action={<Button onClick={() => void records.refetch()}>重试</Button>}
        />
      )}
      <div className="deployments-columns">
        <Panel className="deployments-list">
          <Button
            type="primary"
            aria-label="创建部署"
            icon={<PlusOutlined aria-hidden />}
            disabled={!prototype}
            onClick={() => {
              form.resetFields();
              setConfiguration(null);
              setCreating(true);
            }}
          >
            创建部署
          </Button>
          <Table
            rowKey="id"
            pagination={false}
            dataSource={rows}
            loading={!prototype && records.isFetching}
            scroll={{ x: 1030, y: prototype ? undefined : 480 }}
            rowClassName={(row) =>
              row.id === selected ? "selected-deployment" : ""
            }
            columns={[
              {
                title: "脚本版本",
                width: prototype ? undefined : 220,
                render: (_, row) => (
                  <>
                    {prototype ? (
                      <Link
                        className="dark-link"
                        to={`/publisher/versions/${row.id}`}
                      >
                        <b>
                          {row.script} {row.version}
                        </b>
                      </Link>
                    ) : (
                      <b>
                        {row.script} {row.version}
                      </b>
                    )}
                    {row.category && (
                      <small>
                        <Status>{row.category}</Status>
                      </small>
                    )}
                  </>
                ),
              },
              {
                title: "镜像摘要",
                dataIndex: "digest",
                render: (value: string | null) =>
                  value ? (
                    <Typography.Text
                      title={value}
                      copyable={{
                        text: value,
                        tooltips: [
                          prototype ? "复制完整示例摘要" : "复制完整制品摘要",
                          "已复制",
                        ],
                      }}
                    >
                      {value.slice(0, 15)}...
                    </Typography.Text>
                  ) : (
                    "未登记"
                  ),
              },
              {
                title: "运行模式",
                dataIndex: "mode",
                render: (value) => <Status tone="gray">{value}</Status>,
              },
              { title: "资源", render: (_, row) => deploymentResources(row) },
              {
                title: "状态",
                dataIndex: "status",
                render: (value) => (
                  <Status
                    tone={
                      value === "READY"
                        ? "green"
                        : value === "FAILED" || value === "DEGRADED"
                          ? "red"
                          : value === "STOPPED"
                            ? "gray"
                            : "orange"
                    }
                  >
                    ● {value}
                  </Status>
                ),
              },
              {
                title: "服务",
                dataIndex: "service",
                render: (value, row) =>
                  !prototype || row.id === "files" ? (
                    <Status>{value}</Status>
                  ) : (
                    <Link to={`/publisher/services/${row.id}/edit`}>
                      <Status>{value}</Status>
                    </Link>
                  ),
              },
              {
                title: "操作",
                render: (_, row) => (
                  <div className="text-actions">
                    <Button
                      type="link"
                      onClick={() => selectDeployment(row.id)}
                    >
                      详情
                    </Button>
                    <Button
                      type="link"
                      disabled={!prototype || row.status !== "READY"}
                      onClick={() => stop(row)}
                    >
                      停用
                    </Button>
                    <Button
                      type="link"
                      disabled={!prototype || row.status !== "FAILED"}
                      onClick={() =>
                        void message.info(
                          `${row.script} ${row.version} 的部署重试接口待接入`,
                        )
                      }
                    >
                      重试
                    </Button>
                  </div>
                ),
              },
            ]}
          />
          {!prototype && records.hasNextPage && (
            <Button
              className="publisher-record-more"
              loading={records.isFetchingNextPage}
              onClick={() => void records.fetchNextPage()}
            >
              加载更多记录
            </Button>
          )}
        </Panel>
        <aside>
          <Panel title="部署详情">
            {!prototype && requested && detail.isFetching ? (
              <Spin />
            ) : item ? (
              <dl>
                <dt>脚本版本</dt>
                <dd>
                  <b>
                    {item.script} {item.version}
                  </b>{" "}
                  <Status
                    tone={
                      item.status === "READY"
                        ? "green"
                        : item.status === "FAILED" || item.status === "DEGRADED"
                          ? "red"
                          : "gray"
                    }
                  >
                    {item.status}
                  </Status>
                </dd>
                <dt>运行模式</dt>
                <dd>{item.mode}</dd>
                <dt>资源</dt>
                <dd>{deploymentResources(item)}</dd>
                <dt>服务</dt>
                <dd>{item.service}</dd>
                {item.metadata && (
                  <>
                    <dt>资源模板</dt>
                    <dd>
                      {item.metadata.resource_profile_name} v
                      {item.metadata.resource_profile_version}
                    </dd>
                    <dt>最近健康检查</dt>
                    <dd>{item.metadata.last_health_at || "未登记"}</dd>
                    <dt>健康证据</dt>
                    <dd>
                      {item.metadata.has_health_evidence ? "已登记" : "未登记"}
                    </dd>
                    <dt>制品对象</dt>
                    <dd>
                      {item.metadata.artifact_available ? "可用" : "当前不可用"}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <Empty
                description={
                  selected ? `部署 ${selected} 不存在或已失效` : "暂无部署记录"
                }
              />
            )}
            {!prototype &&
              detail.isError &&
              !(
                detail.error instanceof ApiError && detail.error.status === 404
              ) && (
                <Alert
                  type="error"
                  showIcon
                  title="部署详情加载失败"
                  description={detail.error.message}
                  action={
                    <Button onClick={() => void detail.refetch()}>重试</Button>
                  }
                />
              )}
          </Panel>
          <Panel title="资源限额">
            <dl>
              <dt>单次部署上限</dt>
              <dd>{prototype ? "4 CPU　8 GB" : "待载入"}</dd>
              <dt>当前已用</dt>
              <dd>{prototype ? "3 CPU　1.5 GB" : "待载入"}</dd>
            </dl>
          </Panel>
          <Panel title="日志">
            <pre className="deployment-log">
              {!prototype
                ? "部署日志正文待接入"
                : item?.status === "READY"
                  ? "[INFO] 启动运行环境...\n[INFO] 加载脚本依赖完成\n[INFO] 服务已就绪，开始提供请求"
                  : item
                    ? "[ERROR] 固定制品依赖检查未通过\n[INFO] 部署等待修复"
                    : "部署日志待载入"}
            </pre>
            <div className="row-actions">
              <Button
                disabled={!prototype || item?.status !== "FAILED"}
                onClick={() =>
                  void message.info(
                    `${item?.script} ${item?.version} 的部署重试接口待接入`,
                  )
                }
              >
                重试
              </Button>
              <Button
                disabled={!prototype || item?.status !== "READY"}
                onClick={() => item && stop(item)}
              >
                停用
              </Button>
            </div>
            <Alert
              type="warning"
              showIcon
              title="停用说明　停用将影响新售卖及存量权益补偿。"
              description="TCG仅显式允许时可选，不作为服务名称。"
            />
          </Panel>
        </aside>
      </div>
      <Modal
        title="创建部署"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
        okText="提交部署"
        cancelText="取消"
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            version: "table",
            mode: "docker",
            cpu: 1,
            memory: 512,
          }}
          onFinish={previewConfiguration}
          onValuesChange={() => setConfiguration(null)}
        >
          <Form.Item
            name="version"
            label="固定版本"
            rules={[{ required: true }]}
          >
            <Select
              aria-label="固定版本"
              options={rows
                .filter((row) => row.status === "READY")
                .map((row) => ({
                  value: row.id,
                  label: `${row.script} ${row.version}`,
                }))}
            />
          </Form.Item>
          <Form.Item name="mode" label="运行模式" rules={[{ required: true }]}>
            <Select
              aria-label="运行模式"
              options={[
                { value: "docker", label: "Docker" },
                { value: "qemu_kvm", label: "QEMU KVM" },
                { value: "qemu_tcg", label: "QEMU TCG" },
              ]}
            />
          </Form.Item>
          {mode === "qemu_tcg" && (
            <Form.Item
              name="allowTcg"
              preserve={false}
              valuePropName="checked"
              rules={[
                {
                  validator: (_, value) =>
                    value
                      ? Promise.resolve()
                      : Promise.reject(new Error("请明确允许TCG执行")),
                },
              ]}
            >
              <Checkbox>显式允许TCG执行</Checkbox>
            </Form.Item>
          )}
          <Form.Item
            name="cpu"
            label="CPU核数"
            rules={[
              { required: true },
              {
                type: "number",
                min: 1,
                max: 4,
                message: "CPU核数须在1至4之间",
              },
            ]}
          >
            <InputNumber aria-label="CPU核数" min={1} max={4} />
          </Form.Item>
          <Form.Item
            name="memory"
            label="内存（MB）"
            rules={[
              { required: true },
              {
                type: "number",
                min: 128,
                max: 8192,
                message: "内存须在128至8192 MB之间",
              },
            ]}
          >
            <InputNumber
              aria-label="内存（MB）"
              min={128}
              max={8192}
              step={128}
            />
          </Form.Item>
          {configuration && (
            <div className="deployment-configuration-preview">
              <Alert
                type="info"
                showIcon
                title="部署配置预览"
                description="资源模板、实际配额及部署作业由部署服务接入后校验。"
              />
              <pre>{JSON.stringify(configuration, null, 2)}</pre>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  );
}
