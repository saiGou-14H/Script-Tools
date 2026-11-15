import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  App,
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Table,
  Tabs,
  Upload,
  Typography,
  Spin,
} from "antd";
import {
  CheckCircleFilled,
  CloudUploadOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { SchemaInput, type SchemaInputHandle } from "../components/SchemaInput";
import dayjs from "dayjs";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  usePublisherPreview,
  type PublisherScript,
} from "../publisher-preview";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useWorkspace } from "../context";
import { api, ApiError } from "../api";
import {
  usePublisherRecords,
  type PublisherExecutionRecord,
  executionRecordLabels,
} from "../lib/publisher-execution";
import type {
  ScriptActionMetadata,
  ScriptVersionMetadata,
  ScriptVersionSummary,
} from "../lib/script-versions";
import type { RJSFSchema } from "@rjsf/utils";

export function ScriptsPage() {
  const { scripts, createScript, loading, loadError } = usePublisherPreview();
  const { bootstrap } = useWorkspace();
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim().toLocaleLowerCase();
  const records = scripts.filter((script) =>
    `${script.title} ${script.purpose} ${scriptVersionLabel(script.version)}`
      .toLocaleLowerCase()
      .includes(query),
  );
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();
  return (
    <div className="publisher-scripts-page">
      <PageHeading
        title="我的脚本"
        extra={
          bootstrap.data_mode === "prototype" ? (
            <Status>含本地示例</Status>
          ) : undefined
        }
      />
      <div className="publisher-script-toolbar">
        <Upload
          accept=".py,.js,.mjs,.cjs,.json"
          showUploadList={false}
          beforeUpload={async (file) => {
            if (file.size > 2 * 1024 * 1024) {
              void message.error("上传文件上限为2MiB，包内源码合计上限为1MiB");
              return false;
            }
            try {
              const text = await file.text();
              let title = file.name.replace(/\.[^.]+$/, "");
              let files = { [file.name]: text };
              if (file.name.endsWith(".script.json")) {
                const bundle = JSON.parse(text);
                if (
                  bundle.format !== "script-tools/source-package@1" ||
                  !bundle.files
                )
                  throw new Error("脚本包格式无效");
                title = bundle.name;
                files = bundle.files;
              }
              const script = await createScript(title, files);
              navigate(`/publisher/scripts/${script.id}/edit`);
            } catch (error) {
              void message.error((error as Error).message);
            }
            return false;
          }}
        >
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            aria-label="上传脚本"
          >
            上传脚本
          </Button>
        </Upload>
        <Button
          icon={<PlusOutlined />}
          aria-label="新建脚本"
          onClick={() => setCreating(true)}
        >
          新建脚本
        </Button>
      </div>
      {loadError && <Alert type="error" showIcon message={loadError} />}
      <Panel className="publisher-scripts-list">
        <Table
          loading={loading}
          rowKey="id"
          dataSource={records}
          pagination={false}
          scroll={{ x: 1491, y: "calc(100vh - 380px)" }}
          columns={[
            {
              title: "名称",
              dataIndex: "title",
              width: 160,
              ellipsis: true,
              onCell: (record) => ({ title: record.title }),
              render: (value) => <b>{value}</b>,
            },
            { title: "用途", dataIndex: "purpose", width: 280, ellipsis: true },
            {
              title: "最新版本",
              dataIndex: "version",
              width: 130,
              ellipsis: true,
              render: scriptVersionLabel,
            },
            {
              title: "内容状态",
              dataIndex: "contentStatus",
              width: 165,
              render: (value) => (
                <Status
                  tone={
                    value === "SEALED"
                      ? "purple"
                      : value === "DRAFT"
                        ? "gray"
                        : "blue"
                  }
                >
                  {value}
                </Status>
              ),
            },
            {
              title: "构建状态",
              dataIndex: "buildStatus",
              width: 196,
              render: (value) => (
                <Status
                  tone={
                    value === "SUCCEEDED"
                      ? "green"
                      : value === "FAILED"
                        ? "red"
                        : "gray"
                  }
                >
                  {value === "SUCCEEDED"
                    ? "✓ 构建成功"
                    : value === "FAILED"
                      ? "× 构建失败"
                      : "尚未构建"}
                </Status>
              ),
            },
            {
              title: "部署",
              dataIndex: "deployed",
              width: 150,
              render: (value) =>
                value ? <Status tone="green">部署可用</Status> : "—",
            },
            {
              title: "操作",
              width: 410,
              render: (_, row) => (
                <div className="text-actions">
                  <Link to={`/publisher/scripts/${row.id}/edit`}>编辑</Link>
                  <Link to={`/publisher/versions/${row.id}`}>版本测试</Link>
                  <Link to={`/publisher/deployments?script=${row.id}`}>
                    部署
                  </Link>
                  <Link
                    to={`/publisher/services/new/edit?script=${encodeURIComponent(row.id)}`}
                  >
                    创建服务
                  </Link>
                  <Link to={`/publisher/versions/${row.id}?tab=self`}>
                    自用测试
                  </Link>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        title="新建脚本"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
        okText="创建草稿"
        cancelText="取消"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (values) => {
            try {
              const script = await createScript(values.title.trim());
              form.resetFields();
              setCreating(false);
              navigate(`/publisher/scripts/${script.id}/edit`);
            } catch (error) {
              void message.error((error as Error).message);
            }
          }}
        >
          <Form.Item
            name="title"
            label="脚本名称"
            rules={[{ required: true, whitespace: true }, { max: 120 }]}
          >
            <Input placeholder="输入自定义用途的脚本名称" />
          </Form.Item>
          <Notice>草稿源码加密保存，构建与发布按各自状态推进。</Notice>
        </Form>
      </Modal>
    </div>
  );
}

function scriptVersionLabel(value: string) {
  return /^\d/.test(value) ? "v" + value : value;
}

const tableVersionPreview = {
  version: "v1.2",
  sourceDigest:
    "a9f4c2e7b1d8f4a67e3d5f0a1c9b7e426d2f3a8c1e9b4a70384ea5c26d7b1f90",
  inputRows: 1200,
  resultRows: 86,
};
const versionTabs = ["version", "test", "self", "impact"];

export function VersionTestsPage() {
  const { id = "demo" } = useParams();
  const { bootstrap } = useWorkspace();
  return bootstrap.data_mode === "prototype" ? (
    <VersionTests key={id} id={id} />
  ) : (
    <LiveVersionTests key={id} id={id} />
  );
}

interface LiveVersionState {
  version: ScriptVersionMetadata;
  action: ScriptActionMetadata | undefined;
  actionName: string | null;
  versions: ScriptVersionSummary[];
  hasMoreVersions: boolean;
  loadingMore: boolean;
  loadMore(): void;
  switchVersion(id: string): void;
  switchAction(name: string): void;
  refresh(): void;
  latestTest: PublisherExecutionRecord | undefined;
  testing: boolean;
  testError: Error | null;
  retryTests(): void;
  loadError: Error | null;
  retryMetadata(): void;
}

function LiveTestSummary({ live }: { live: LiveVersionState }) {
  if (live.testing) return <Spin />;
  if (live.testError)
    return (
      <Alert
        type="error"
        showIcon
        title="试运行记录加载失败"
        description={live.testError.message}
        action={<Button onClick={live.retryTests}>重试</Button>}
      />
    );
  if (!live.latestTest)
    return (
      <Notice>
        {live.action
          ? "当前动作尚无试运行记录。"
          : "选择动作后读取对应试运行记录。"}
      </Notice>
    );
  const test = live.latestTest;
  const route = new URLSearchParams({
    tab: "trial",
    script_id: live.version.script_id,
    version: live.version.version,
    action: live.action!.name,
    record: test.id,
  });
  return (
    <div className="version-live-test">
      <p>运行状态　{executionRecordLabels[test.status] || test.status}</p>
      <p>动作　{live.action!.name}</p>
      <p>
        测试判定　
        {test.test_passed == null ? (
          "尚无判定"
        ) : (
          <Status tone={test.test_passed ? "green" : "red"}>
            {test.test_passed ? "通过" : "未通过"}
          </Status>
        )}
      </p>
      <Link to={`/publisher/builds?${route}`}>查看本次试运行</Link>
    </div>
  );
}

function LiveVersionTests({ id }: { id: string }) {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const versions = usePublisherRecords<ScriptVersionSummary>(
    `scripts/${encodeURIComponent(id)}/versions`,
    "",
    true,
  );
  const choices = versions.data?.pages.flatMap((page) => page.items) || [];
  const requested = params.get("version_id");
  const versionId = requested === null ? choices[0]?.id : requested;
  useEffect(() => {
    if (requested === null && versionId) {
      const next = new URLSearchParams(params);
      next.set("version_id", versionId);
      setParams(next, { replace: true });
    }
  }, [requested, versionId, params, setParams]);
  const metadata = useQuery({
    queryKey: [
      "script-version",
      bootstrap.user?.id,
      bootstrap.user?.security_revision,
      versionId,
    ],
    enabled: versionId !== undefined,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      api<ScriptVersionMetadata>(
        `/script-versions/${encodeURIComponent(versionId!)}`,
        { signal },
      ),
  });
  const version = metadata.data;
  const actionName =
    params.get("action") ??
    version?.default_action ??
    (version?.actions.length === 1 ? version.actions[0].name : null);
  const action = version?.actions.find((item) => item.name === actionName);
  const testSearch = new URLSearchParams();
  if (versionId) testSearch.set("script_version_id", versionId);
  if (action) testSearch.set("action", action.name);
  const belongsToScript = version?.script_id.toLowerCase() === id.toLowerCase();
  const tests = usePublisherRecords<PublisherExecutionRecord>(
    "test-runs",
    testSearch.toString(),
    !!version && belongsToScript && !!action,
  );
  if ((versions.isLoading && versionId === undefined) || metadata.isLoading)
    return <Spin />;
  if (
    (versions.isError && !versions.data && !version) ||
    (metadata.isError && !metadata.data)
  ) {
    const error = metadata.error || versions.error;
    if (error instanceof ApiError && error.status === 404)
      return <Empty description="脚本版本不存在或已失效" />;
    return (
      <Alert
        type="error"
        showIcon
        title="版本资料加载失败"
        description={error?.message}
        action={
          <Button
            onClick={() => {
              void versions.refetch();
              if (versionId) void metadata.refetch();
            }}
          >
            重试
          </Button>
        }
      />
    );
  }
  if (!version || !belongsToScript)
    return <Empty description="所选版本不存在或不属于当前脚本" />;
  const options = choices.some((item) => item.id === version.id)
    ? choices
    : [version, ...choices];
  const changeIdentity = (key: "version_id" | "action", value: string) => {
    const next = new URLSearchParams(params);
    next.set("version_id", version.id);
    next.set(key, value);
    if (key === "version_id") next.delete("action");
    setParams(next);
  };
  const live: LiveVersionState = {
    version,
    action,
    actionName,
    versions: options,
    hasMoreVersions: !!versions.hasNextPage,
    loadingMore: versions.isFetchingNextPage,
    loadMore: () => {
      void versions.fetchNextPage();
    },
    switchVersion: (value) => changeIdentity("version_id", value),
    switchAction: (value) => changeIdentity("action", value),
    refresh: () => {
      void metadata.refetch();
    },
    latestTest: action ? tests.data?.pages[0]?.items[0] : undefined,
    testing: !!action && tests.isFetching,
    testError: action ? tests.error : null,
    retryTests: () => {
      void tests.refetch();
    },
    loadError: metadata.error || versions.error,
    retryMetadata: () => {
      void versions.refetch();
      void metadata.refetch();
    },
  };
  return (
    <VersionTests
      key={`${version.id}:${version.revision}:${actionName || ""}`}
      id={id}
      live={live}
    />
  );
}

function VersionTests({ id, live }: { id: string; live?: LiveVersionState }) {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const { scripts, loading } = usePublisherPreview();
  const previewScript = scripts.find(
    (item) => item.id === (id === "demo" ? "table" : id),
  );
  const script:
    | (Omit<
        PublisherScript,
        "contentStatus" | "buildStatus" | "inputSchema"
      > & {
        contentStatus: string;
        buildStatus: string;
        inputSchema: RJSFSchema | boolean | null;
      })
    | undefined = live
    ? {
        id: live.version.script_id,
        title: live.version.script_name,
        purpose: live.version.description,
        version: live.version.version,
        contentStatus: live.version.content_status,
        buildStatus: live.version.latest_build_status || "NOT_BUILT",
        sourceDigest: live.version.source_digest || undefined,
        inputSchema: live.action?.input_schema ?? null,
        deployed: live.version.deployment_states.some(
          (item) => item.status === "READY",
        ),
      }
    : previewScript;
  const requestedTab = params.get("tab") || "self";
  const tab = versionTabs.includes(requestedTab) ? requestedTab : "self";
  const [input, setInput] = useState<unknown>(
    id === "demo" || id === "table"
      ? { source_file: "sample.csv", deduplicate_by: "邮箱" }
      : {},
  );
  const [schedule, setSchedule] = useState("manual");
  const [onceAt, setOnceAt] = useState<dayjs.Dayjs | null>(null);
  const [cron, setCron] = useState("0 9 * * *");
  const [authorized, setAuthorized] = useState(!live);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const form = useRef<SchemaInputHandle>(null);
  const { message, modal } = App.useApp();
  if (!live && loading) return <Spin />;
  if (!script) return <Empty description="脚本版本不存在或已失效" />;
  const ready = live
    ? live.version.content_status === "READY" &&
      live.version.artifact_available &&
      live.version.artifact_build_status === "SUCCEEDED"
    : script.buildStatus === "SUCCEEDED";
  const buildSucceeded = script.buildStatus === "SUCCEEDED";
  const schemaAvailable =
    (!live || !!live.action?.input_schema_available) &&
    script.inputSchema !== null;
  const inputSchema = script.inputSchema;
  const recordedVersion =
    bootstrap.data_mode === "prototype" &&
    script.id === "table" &&
    script.version === tableVersionPreview.version
      ? tableVersionPreview
      : undefined;
  const sourceDigest = script.sourceDigest;
  const digest =
    typeof sourceDigest === "string" && /^[a-f0-9]{64}$/i.test(sourceDigest)
      ? sourceDigest
      : recordedVersion?.sourceDigest;
  function validateConfiguration() {
    if (!schemaAvailable) return false;
    if (!form.current?.validateForm()) return false;
    setInput(form.current.getValue());
    if (schedule === "once" && (!onceAt || onceAt.valueOf() <= Date.now())) {
      void message.error("请选择未来的执行时间");
      return false;
    }
    if (schedule === "cron" && !cron.trim()) {
      void message.error("请输入周期执行表达式");
      return false;
    }
    return true;
  }
  function changeSelection(change: () => void) {
    if (!dirty) {
      change();
      return;
    }
    modal.confirm({
      title: "切换版本或动作",
      content: "当前配置有未保存输入。继续后将加载目标定义，请核对参数与授权。",
      okText: "切换并重新填写",
      cancelText: "继续编辑",
      onOk: change,
    });
  }
  return (
    <div className="version-tests-page">
      <PageHeading
        title="版本与测试"
        extra={
          <Status tone="gray">
            {bootstrap.data_mode === "prototype" ? "本地示例" : "版本元数据"}
          </Status>
        }
      />
      {live?.loadError && (
        <Alert
          className="publisher-record-error"
          type="error"
          showIcon
          title="版本资料刷新失败"
          description={live.loadError.message}
          action={
            <Button onClick={() => changeSelection(live.retryMetadata)}>
              重试
            </Button>
          }
        />
      )}
      <div className="version-banner">
        <TileIcon name="code" />
        <div>
          <h2>
            {script.title} {script.version}{" "}
            <Status tone={ready ? "green" : "purple"}>
              {script.contentStatus}
            </Status>{" "}
            <Status
              tone={
                buildSucceeded
                  ? "blue"
                  : script.buildStatus === "FAILED"
                    ? "red"
                    : "gray"
              }
            >
              {script.buildStatus === "NOT_BUILT"
                ? "尚未构建"
                : `${live ? "最近构建" : "构建"}${executionRecordLabels[script.buildStatus] || script.buildStatus}`}
            </Status>
          </h2>
          <p>
            摘要（sha256）　
            {digest ? (
              <Typography.Text
                copyable={{
                  text: digest,
                  tooltips: ["复制完整摘要", "已复制"],
                }}
              >
                {digest.slice(0, 12)}****{digest.slice(16, 28)}****
                {digest.slice(32, 45)}****
              </Typography.Text>
            ) : (
              "摘要待载入"
            )}
          </p>
        </div>
      </div>
      <Tabs
        className="version-tabs"
        activeKey={tab}
        onChange={(value) => {
          const next = new URLSearchParams(params);
          next.set("tab", value);
          setParams(next);
        }}
        items={[
          { key: "version", label: "版本" },
          { key: "test", label: "测试" },
          { key: "self", label: "本人自用" },
          { key: "impact", label: "影响" },
        ]}
      />
      {tab === "self" ? (
        <div className="version-self-columns">
          <Panel title="本人自用配置">
            <Form.Item label="本人版本" colon={false}>
              <Select
                aria-label="本人固定版本"
                value={live?.version.id || script.version}
                options={
                  live
                    ? live.versions.map((item) => ({
                        value: item.id,
                        label: `${item.version}（${item.content_status}）`,
                      }))
                    : [
                        {
                          value: script.version,
                          label: `${script.version}（${ready ? "构建成功" : "尚未就绪"}）`,
                        },
                      ]
                }
                disabled={!live}
                onChange={(value) => {
                  if (live && value !== live.version.id)
                    changeSelection(() => live.switchVersion(value));
                }}
              />
            </Form.Item>
            {live?.hasMoreVersions && (
              <Button
                className="version-load-more"
                loading={live.loadingMore}
                onClick={live.loadMore}
              >
                加载更多版本
              </Button>
            )}
            {live && (live.version.actions.length > 1 || !live.action) && (
              <Form.Item label="执行动作" colon={false}>
                <Select
                  aria-label="自用执行动作"
                  value={live.actionName || undefined}
                  placeholder="选择脚本动作"
                  options={live.version.actions.map((item) => ({
                    value: item.name,
                    label: `${item.title}（${item.name}）`,
                  }))}
                  onChange={(value) => {
                    if (value !== live.actionName)
                      changeSelection(() => live.switchAction(value));
                  }}
                />
              </Form.Item>
            )}
            {schemaAvailable && inputSchema !== null ? (
              <SchemaInput
                ref={form}
                schema={inputSchema}
                formData={input}
                uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
                onChange={setInput}
                onEdit={() => setDirty(true)}
                showErrorList={false}
                formContext={{
                  labelCol: { flex: "125px" },
                  wrapperCol: { flex: 1 },
                  colon: false,
                }}
              />
            ) : (
              <Notice>
                {live?.action
                  ? "当前动作参数Schema不可用，请核对版本定义。"
                  : "请选择当前版本已声明的动作。"}
              </Notice>
            )}
            <div className="self-schedule">
              <label>执行计划</label>
              <Radio.Group
                value={schedule}
                onChange={(event) => {
                  setSchedule(event.target.value);
                  setDirty(true);
                }}
              >
                <Radio value="manual">立即执行</Radio>
                <Radio value="once">指定时间</Radio>
                <Radio value="cron">周期执行</Radio>
              </Radio.Group>
            </div>
            {schedule === "once" && (
              <DatePicker
                aria-label="自用执行时间"
                showTime
                value={onceAt}
                onChange={(value) => {
                  setOnceAt(value);
                  setDirty(true);
                }}
              />
            )}{" "}
            {schedule === "cron" && (
              <Input
                aria-label="Cron表达式"
                placeholder="Cron表达式，例如 0 9 * * *"
                value={cron}
                onChange={(event) => {
                  setCron(event.target.value);
                  setDirty(true);
                }}
              />
            )}
            <div className="self-authorization">
              <label>本人授权</label>
              <Checkbox
                checked={authorized}
                onChange={(event) => {
                  setAuthorized(event.target.checked);
                  setDirty(true);
                }}
              >
                仅本人使用（不对外提供服务）
              </Checkbox>
            </div>
            <div className="self-configuration-actions">
              <Button
                disabled={!schemaAvailable || inputSchema === false}
                onClick={() => {
                  if (validateConfiguration()) setPreview(true);
                }}
              >
                预览
              </Button>
              <Button
                type="primary"
                disabled={
                  !authorized ||
                  !ready ||
                  !schemaAvailable ||
                  inputSchema === false
                }
                onClick={() => {
                  if (validateConfiguration())
                    void message.info("自用调度接口尚未接通，未创建Run");
                }}
              >
                自用启用
              </Button>
              <span>
                <InfoCircleOutlined /> 开发配额执行，不生成付费订单
              </span>
            </div>
          </Panel>
          <aside>
            <Panel
              title={
                live
                  ? "最近试运行"
                  : ready && recordedVersion
                    ? "最近测试通过"
                    : "最近测试状态"
              }
            >
              {live ? (
                <LiveTestSummary live={live} />
              ) : ready && recordedVersion ? (
                <div className="version-test-success">
                  <CheckCircleFilled />
                  <div>
                    <h2>测试通过</h2>
                    <p>
                      输入数据　{recordedVersion.inputRows}行　|　去重结果　
                      {recordedVersion.resultRows}条
                    </p>
                  </div>
                </div>
              ) : (
                <Notice>
                  {ready
                    ? "当前版本尚无已通过的测试记录。"
                    : "当前构建尚未就绪，完成构建后才能运行测试。"}
                </Notice>
              )}
              <Button
                type="primary"
                disabled={!ready || !schemaAvailable || inputSchema === false}
                onClick={() =>
                  void message.info(
                    live
                      ? "测试执行器尚未接入"
                      : "测试执行器尚未接入，保留已有原型测试记录",
                  )
                }
              >
                运行测试
              </Button>
            </Panel>
            <Panel
              title="本人自用任务摘要"
              extra={
                <Link to="/me/tasks?scope=self">
                  查看我的任务（切换个人视图） ›
                </Link>
              }
            >
              <Notice>
                {recordedVersion
                  ? "当前有1个自用任务示例，使用本人授权的版本运行，数据仅本人可见。"
                  : "当前版本自用任务元数据待接入。"}
              </Notice>
              <div className="version-management-actions">
                <Link
                  to={
                    live
                      ? `/publisher/deployments?${new URLSearchParams({ script_version_id: live.version.id })}`
                      : `/publisher/deployments?script=${script.id}`
                  }
                >
                  <Button>去部署</Button>
                </Link>
                {live ? (
                  <Button disabled>创建服务</Button>
                ) : (
                  <Link to={`/publisher/services/${script.id}/edit`}>
                    <Button>创建服务</Button>
                  </Link>
                )}
                <Button
                  danger
                  disabled={!recordedVersion}
                  onClick={() =>
                    modal.confirm({
                      title: "停用版本影响预览",
                      content:
                        "停用将影响2个未使用权益。后端影响预览与补偿作业尚未接入，当前版本继续保持原状态。",
                      okText: "了解影响",
                      cancelText: "返回",
                    })
                  }
                >
                  {recordedVersion
                    ? "停用（影响2个未使用权益）"
                    : "停用（影响待查询）"}
                </Button>
              </div>
            </Panel>
          </aside>
        </div>
      ) : tab === "version" ? (
        <Panel title="固定版本">
          <dl>
            <dt>内容状态</dt>
            <dd>{script.contentStatus}</dd>
            <dt>版本</dt>
            <dd>{script.version}</dd>
            <dt>动作输入Schema</dt>
            <dd>
              <pre>{JSON.stringify(script.inputSchema, null, 2)}</pre>
            </dd>
          </dl>
          {live && (
            <>
              <p>固定版本编号　{live.version.id}</p>
              <p>
                已绑定构建状态　{live.version.artifact_build_status || "未绑定"}
              </p>
              <p>
                制品对象登记　
                {live.version.artifact_available ? "可用" : "当前不可用"}
              </p>
              <p>
                关联部署状态　
                {live.version.deployment_states
                  .map((item) => `${item.status} ${item.count}`)
                  .join("、") || "暂无关联"}
              </p>
              <p>
                当前服务状态　
                {live.version.current_service_states
                  .map((item) => `${item.status} ${item.count}`)
                  .join("、") || "暂无关联"}
              </p>
              <Button onClick={() => changeSelection(live.refresh)}>
                刷新版本资料
              </Button>
            </>
          )}
          {!live ? (
            <Link to={`/publisher/scripts/${script.id}/edit`}>
              <Button>编辑新草稿</Button>
            </Link>
          ) : (
            <Button disabled>编辑新草稿</Button>
          )}
        </Panel>
      ) : tab === "test" ? (
        <Panel title="构建与试运行">
          <p>
            构建状态　{executionRecordLabels[script.buildStatus] || "尚未构建"}
          </p>
          <Link
            to={
              live
                ? `/publisher/builds?${new URLSearchParams({ script_id: live.version.script_id, version: live.version.version, ...(live.version.latest_build_id ? { record: live.version.latest_build_id } : {}) })}`
                : "/publisher/builds"
            }
          >
            <Button>查看构建与测试记录</Button>
          </Link>
        </Panel>
      ) : (
        <Panel title="版本影响">
          <Notice>
            发布新版本后，已有订单继续引用成交时固定的版本与价格快照。
          </Notice>
          <Link
            to={
              live
                ? `/publisher/deployments?${new URLSearchParams({ script_version_id: live.version.id })}`
                : "/publisher/deployments"
            }
          >
            <Button>查看关联部署</Button>
          </Link>
        </Panel>
      )}
      <Modal
        title="本人自用配置预览"
        open={preview}
        onCancel={() => setPreview(false)}
        footer={<Button onClick={() => setPreview(false)}>返回配置</Button>}
      >
        <p>
          {script.title} {script.version}
        </p>
        <pre>
          {JSON.stringify(
            {
              ...(live
                ? {
                    script_version_id: live.version.id,
                    action: live.action?.name,
                    schema_digest: live.action?.input_schema_digest,
                  }
                : {}),
              input,
              schedule: {
                type: schedule,
                once_at:
                  schedule === "once" ? onceAt?.toISOString() : undefined,
                cron_expr: schedule === "cron" ? cron.trim() : undefined,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              authorization: authorized ? "OWNER_ONLY" : "NONE",
            },
            null,
            2,
          )}
        </pre>
      </Modal>
    </div>
  );
}
