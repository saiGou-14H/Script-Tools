import { useRef, useState } from "react";
import {
  App,
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
} from "antd";
import {
  CheckCircleFilled,
  CloudUploadOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import SchemaForm from "@rjsf/antd";
import CoreForm from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import dayjs from "dayjs";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { usePublisherPreview } from "../publisher-preview";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";

export function ScriptsPage() {
  const { scripts, createScript } = usePublisherPreview();
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message } = App.useApp();
  return (
    <div className="publisher-scripts-page">
      <PageHeading title="我的脚本" />
      <div className="publisher-script-toolbar">
        <Upload
          accept=".py,.js,.mjs,.cjs,.json"
          showUploadList={false}
          beforeUpload={async (file) => {
            if (file.size > 10 * 1024 * 1024) {
              void message.error("单文件预览上限为10MB");
              return false;
            }
            try {
              const script = createScript(file.name.replace(/\.[^.]+$/, ""), {
                [file.name]: await file.text(),
              });
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
      <Panel className="publisher-scripts-list">
        <Table
          rowKey="id"
          dataSource={scripts}
          pagination={false}
          columns={[
            {
              title: "名称",
              dataIndex: "title",
              render: (value) => <b>{value}</b>,
            },
            { title: "用途", dataIndex: "purpose" },
            { title: "最新版本", dataIndex: "version" },
            {
              title: "内容状态",
              dataIndex: "contentStatus",
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
              render: (value) =>
                value ? <Status tone="green">部署可用</Status> : "—",
            },
            {
              title: "操作",
              render: (_, row) => (
                <div className="text-actions">
                  <Link to={`/publisher/scripts/${row.id}/edit`}>编辑</Link>
                  <Link to={`/publisher/versions/${row.id}`}>版本测试</Link>
                  <Link to={`/publisher/deployments?script=${row.id}`}>
                    部署
                  </Link>
                  <Link to={`/publisher/services/${row.id}/edit`}>
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
          onFinish={(values) => {
            const script = createScript(values.title.trim());
            form.resetFields();
            setCreating(false);
            navigate(`/publisher/scripts/${script.id}/edit`);
          }}
        >
          <Form.Item
            name="title"
            label="脚本名称"
            rules={[{ required: true, whitespace: true }, { max: 120 }]}
          >
            <Input placeholder="输入自定义用途的脚本名称" />
          </Form.Item>
          <Notice>前端预览保存草稿，构建与发布需连接对应后端服务。</Notice>
        </Form>
      </Modal>
    </div>
  );
}

export function VersionTestsPage() {
  const { id = "demo" } = useParams();
  const [params] = useSearchParams();
  const { scripts } = usePublisherPreview();
  const script = scripts.find(
    (item) => item.id === (id === "demo" ? "table" : id),
  );
  const [tab, setTab] = useState(params.get("tab") || "self");
  const [input, setInput] = useState<Record<string, unknown>>(
    id === "demo" || id === "table"
      ? { source_file: "sample.csv", deduplicate_by: "邮箱" }
      : {},
  );
  const [schedule, setSchedule] = useState("manual");
  const [onceAt, setOnceAt] = useState<dayjs.Dayjs | null>(null);
  const [cron, setCron] = useState("0 9 * * *");
  const [authorized, setAuthorized] = useState(true);
  const [preview, setPreview] = useState(false);
  const form = useRef<CoreForm>(null);
  const { message, modal } = App.useApp();
  if (!script) return <Empty description="脚本版本不存在或已失效" />;
  const ready = script.buildStatus === "SUCCEEDED";
  function validateConfiguration() {
    if (!form.current?.validateForm()) return false;
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
  return (
    <div className="version-tests-page">
      <PageHeading title="版本与测试" />
      <div className="version-banner">
        <TileIcon name="code" />
        <div>
          <h2>
            {script.title} {script.version}{" "}
            <Status tone={ready ? "green" : "purple"}>
              {script.contentStatus}
            </Status>{" "}
            <Status tone={ready ? "blue" : "red"}>
              {ready
                ? "构建成功"
                : script.buildStatus === "FAILED"
                  ? "构建失败"
                  : "尚未构建"}
            </Status>
          </h2>
          <p>
            摘要（sha256）　a9f4c2e7b1d8****e3d5f0a1c9b7e****6d2f3a8c1e9b4****
          </p>
        </div>
      </div>
      <Tabs
        className="version-tabs"
        activeKey={tab}
        onChange={setTab}
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
            <Form.Item label="本人版本">
              <Select
                value={script.version}
                options={[
                  {
                    value: script.version,
                    label: `${script.version}（${ready ? "构建成功" : "尚未就绪"}）`,
                  },
                ]}
                disabled
              />
            </Form.Item>
            <SchemaForm
              ref={form}
              schema={script.inputSchema}
              formData={input}
              validator={validator}
              uiSchema={{ "ui:submitButtonOptions": { norender: true } }}
              onChange={(event) => setInput(event.formData || {})}
              showErrorList={false}
              formContext={{
                labelCol: { flex: "125px" },
                wrapperCol: { flex: 1 },
                colon: false,
              }}
            />
            <div className="self-schedule">
              <label>执行计划</label>
              <Radio.Group
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
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
                onChange={setOnceAt}
              />
            )}{" "}
            {schedule === "cron" && (
              <Input
                aria-label="Cron表达式"
                placeholder="Cron表达式，例如 0 9 * * *"
                value={cron}
                onChange={(event) => setCron(event.target.value)}
              />
            )}
            <div className="self-authorization">
              <label>本人授权</label>
              <Checkbox
                checked={authorized}
                onChange={(event) => setAuthorized(event.target.checked)}
              >
                仅本人使用（不对外提供服务）
              </Checkbox>
            </div>
            <div className="self-configuration-actions">
              <Button
                onClick={() => {
                  if (validateConfiguration()) setPreview(true);
                }}
              >
                预览
              </Button>
              <Button
                type="primary"
                disabled={!authorized || !ready}
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
            <Panel title={ready ? "最近测试通过" : "最近测试状态"}>
              {ready ? (
                <div className="version-test-success">
                  <CheckCircleFilled />
                  <div>
                    <h2>测试通过</h2>
                    <p>输入数据　1200行　|　去重结果　86条</p>
                  </div>
                </div>
              ) : (
                <Notice>当前构建尚未就绪，完成构建后才能运行测试。</Notice>
              )}
              <Button
                type="primary"
                disabled={!ready}
                onClick={() =>
                  void message.info("测试执行器尚未接入，保留已有原型测试记录")
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
                当前有1个自用任务，使用本人授权的版本运行，数据仅本人可见。
              </Notice>
              <div className="version-management-actions">
                <Link to={`/publisher/deployments?script=${script.id}`}>
                  <Button>去部署</Button>
                </Link>
                <Link to={`/publisher/services/${script.id}/edit`}>
                  <Button>创建服务</Button>
                </Link>
                <Button
                  danger
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
                  停用（影响2个未使用权益）
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
          <Link to={`/publisher/scripts/${script.id}/edit`}>
            <Button>编辑新草稿</Button>
          </Link>
        </Panel>
      ) : tab === "test" ? (
        <Panel title="构建与试运行">
          <p>构建状态　{ready ? "构建成功" : "构建未就绪"}</p>
          <Link to="/publisher/builds">
            <Button>查看构建与测试记录</Button>
          </Link>
        </Panel>
      ) : (
        <Panel title="版本影响">
          <Notice>
            发布新版本后，已有订单继续引用成交时固定的版本与价格快照。
          </Notice>
          <Link to="/publisher/deployments">
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
