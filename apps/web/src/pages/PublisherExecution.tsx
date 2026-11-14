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
  Table,
  Tabs,
  Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status } from "../components/ui";

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
    version: params.get("version") || "",
    status: params.get("status") || "",
  };
  const [filters, setFilters] = useState(applied);
  useEffect(() => {
    setFilters({
      script: params.get("script") || "",
      version: params.get("version") || "",
      status: params.get("status") || "",
    });
  }, [params]);
  const { message, modal } = App.useApp();
  const all =
    prototype
      ? tab === "build"
        ? buildFixtures
        : trialFixtures
      : [];
  const rows = all.filter(
    (item) =>
      (!applied.script || item.script === applied.script) &&
      (!applied.version || item.version === applied.version) &&
      (!applied.status || item.status === applied.status),
  );
  const requested = params.get("record");
  const defaultId = tab === "build" ? "B032" : "TEST081";
  const item = requested
    ? rows.find((row) => row.id === requested)
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
  function label(status: string) {
    return status === "SUCCEEDED"
      ? "✓ 成功"
      : status === "FAILED"
        ? "× 失败"
        : "··· 排队中";
  }
  return (
    <div className="publisher-builds-page">
      <PageHeading
        title="构建与测试记录"
        extra={
          <Status tone="gray">
            {prototype ? "本地示例" : "构建服务待接入"}
          </Status>
        }
      />
      {!prototype && (
        <Notice>构建、测试证据与开发配额服务待接入，当前记录暂不可用。</Notice>
      )}
      <Panel>
        <Tabs
          activeKey={tab}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            for (const key of ["script", "version", "status", "record", "tab"])
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
            value={filters.script}
            disabled={!prototype}
            onChange={(script) =>
              setFilters((previous) => ({ ...previous, script }))
            }
            options={[
              { value: "", label: "全部脚本" },
              ...[...new Set(all.map((row) => row.script))].map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
          <b>版本</b>
          <Select
            aria-label="构建版本"
            value={filters.version}
            disabled={!prototype}
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
            disabled={!prototype}
            onChange={(status) =>
              setFilters((previous) => ({ ...previous, status }))
            }
            options={[
              { value: "", label: "全部状态" },
              { value: "SUCCEEDED", label: "成功" },
              { value: "FAILED", label: "失败" },
              { value: "QUEUED", label: "排队中" },
            ]}
          />
          <Button
            type="primary"
            aria-label="查询构建记录"
            disabled={!prototype}
            onClick={query}
          >
            查询
          </Button>
        </div>
        <div className="builds-columns">
          <div className="build-records">
            <Table
              rowKey="id"
              dataSource={rows}
              pagination={false}
              scroll={{ x: 850 }}
              rowClassName={(row) =>
                row.id === item?.id ? "selected-build" : ""
              }
              columns={[
                {
                  title: tab === "build" ? "构建编号" : "试运行编号",
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
                { title: "脚本名称", dataIndex: "script" },
                { title: "版本", dataIndex: "version" },
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (value) => (
                    <Status
                      tone={
                        value === "SUCCEEDED"
                          ? "green"
                          : value === "FAILED"
                            ? "red"
                            : "orange"
                      }
                    >
                      {label(value)}
                    </Status>
                  ),
                },
                { title: "耗时", dataIndex: "duration" },
                {
                  title: "操作",
                  render: (_, row) =>
                    row.status === "QUEUED" ? (
                      <Button
                        type="link"
                        aria-label={`取消${row.id}`}
                        onClick={() =>
                          modal.confirm({
                            title: "取消排队作业",
                            content:
                              `${row.id} 的取消作业接口待接入，可在详情查看排队状态。`,
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
          </div>
          <section className="build-detail">
            {item ? (
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
                  <Status
                    tone={
                      item.status === "FAILED"
                        ? "red"
                        : item.status === "SUCCEEDED"
                          ? "green"
                          : "orange"
                    }
                  >
                    {label(item.status)}
                  </Status>
                </p>
                <hr />
                {item.status === "FAILED" ? (
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
                        void message.info(
                          `${item.id} 的构建服务待接入`,
                        )
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
                  !prototype
                    ? "构建详情待接入"
                    : requested
                      ? `记录 ${requested} 不存在或不在当前筛选范围内`
                      : "当前筛选无记录"
                }
              />
            )}
          </section>
        </div>
      </Panel>
    </div>
  );
}

const deploymentFixtures = [
  {
    id: "table",
    script: "表格清洗",
    version: "v1.2",
    category: "数据清洗",
    digest: "sha256:8f3e9a2d67bd4b76c8a841085df181f1ce8d7a0b48f762f443ed6919cfaf2c31",
    mode: "Docker",
    status: "READY",
    service: "表格清洗",
  },
  {
    id: "files",
    script: "文件处理",
    version: "v0.4",
    category: "文件处理",
    digest: "sha256:4b7c1d50174e9db83c08abccf19bfd8e7a4c0db0192f9f507faf2129f634e6ac",
    mode: "Docker",
    status: "FAILED",
    service: "未关联",
  },
  {
    id: "booking",
    script: "景点预约",
    version: "v1.0",
    category: "景点预约适配",
    digest: "sha256:9d2e5f7a2768d2d8cdf87a2aa2cb13df876bb4886ad3ad2846012d1b0aa90dc7",
    mode: "KVM",
    status: "READY",
    service: "免费景点预约",
  },
];

export function DeploymentsPage() {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const selected = params.get("deployment") || "table";
  const prototype = bootstrap.data_mode === "prototype";
  const [creating, setCreating] = useState(false);
  const [configuration, setConfiguration] = useState<Record<string, unknown> | null>(
    null,
  );
  const [form] = Form.useForm();
  const mode = Form.useWatch("mode", form);
  const { modal, message } = App.useApp();
  const rows = prototype ? deploymentFixtures : [];
  const item = rows.find((row) => row.id === selected);
  function selectDeployment(id: string) {
    const next = new URLSearchParams(params);
    next.set("deployment", id);
    setParams(next);
  }
  function stop(deployment: (typeof deploymentFixtures)[number]) {
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
          <Status tone="gray">
            {prototype ? "本地示例" : "部署服务待接入"}
          </Status>
        }
      />
      {!prototype && (
        <Notice>部署、资源模板与配额服务待接入，当前可用性和用量暂不可用。</Notice>
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
            scroll={{ x: 1030 }}
            rowClassName={(row) =>
              row.id === selected ? "selected-deployment" : ""
            }
            columns={[
              {
                title: "脚本版本",
                render: (_, row) => (
                  <>
                    <Link
                      className="dark-link"
                      to={`/publisher/versions/${row.id}`}
                    >
                      <b>{row.script} {row.version}</b>
                    </Link>
                    <small>
                      <Status>{row.category}</Status>
                    </small>
                  </>
                ),
              },
              {
                title: "镜像摘要",
                dataIndex: "digest",
                render: (value) => (
                  <Typography.Text
                    title={value}
                    copyable={{
                      text: value,
                      tooltips: ["复制完整示例摘要", "已复制"],
                    }}
                  >
                    {value.slice(0, 15)}...
                  </Typography.Text>
                ),
              },
              {
                title: "运行模式",
                dataIndex: "mode",
                render: (value) => <Status tone="gray">{value}</Status>,
              },
              { title: "资源", render: () => "1 CPU　512 MB" },
              {
                title: "状态",
                dataIndex: "status",
                render: (value) => (
                  <Status tone={value === "READY" ? "green" : "red"}>
                    ● {value}
                  </Status>
                ),
              },
              {
                title: "服务",
                dataIndex: "service",
                render: (value, row) =>
                  row.id === "files" ? (
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
                    <Button type="link" onClick={() => selectDeployment(row.id)}>
                      详情
                    </Button>
                    <Button
                      type="link"
                      disabled={row.status !== "READY"}
                      onClick={() => stop(row)}
                    >
                      停用
                    </Button>
                    <Button
                      type="link"
                      disabled={row.status !== "FAILED"}
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
        </Panel>
        <aside>
          <Panel title="部署详情">
            {item ? (
              <dl>
                <dt>脚本版本</dt>
                <dd>
                  <b>
                    {item.script} {item.version}
                  </b>{" "}
                  <Status tone={item.status === "READY" ? "green" : "red"}>
                    {item.status}
                  </Status>
                </dd>
                <dt>运行模式</dt>
                <dd>{item.mode}</dd>
                <dt>资源</dt>
                <dd>1 CPU　512 MB</dd>
                <dt>服务</dt>
                <dd>{item.service}</dd>
              </dl>
            ) : (
              <Empty
                description={
                  prototype
                    ? `部署 ${selected} 不存在或已失效`
                    : "部署详情待接入"
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
              {item?.status === "READY"
                ? "[INFO] 启动运行环境...\n[INFO] 加载脚本依赖完成\n[INFO] 服务已就绪，开始提供请求"
                : item
                  ? "[ERROR] 固定制品依赖检查未通过\n[INFO] 部署等待修复"
                  : "部署日志待载入"}
            </pre>
            <div className="row-actions">
              <Button
                disabled={item?.status !== "FAILED"}
                onClick={() =>
                  void message.info(
                    `${item?.script} ${item?.version} 的部署重试接口待接入`,
                  )
                }
              >
                重试
              </Button>
              <Button
                disabled={item?.status !== "READY"}
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
              { type: "number", min: 1, max: 4, message: "CPU核数须在1至4之间" },
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
