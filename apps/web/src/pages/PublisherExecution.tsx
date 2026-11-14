import { useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Form,
  InputNumber,
  Modal,
  Select,
  Table,
  Tabs,
  Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
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
  const [tab, setTab] = useState("build");
  const [filters, setFilters] = useState({
    script: "",
    version: "",
    status: "",
  });
  const [applied, setApplied] = useState(filters);
  const [selected, setSelected] = useState("B032");
  const { message, modal } = App.useApp();
  const all =
    bootstrap.data_mode === "prototype"
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
  const item = rows.find((row) => row.id === selected) || rows[0];
  function label(status: string) {
    return status === "SUCCEEDED"
      ? "✓ 成功"
      : status === "FAILED"
        ? "× 失败"
        : "··· 排队中";
  }
  return (
    <div className="publisher-builds-page">
      <PageHeading title="构建与测试记录" />
      <Panel>
        <Tabs
          activeKey={tab}
          onChange={(value) => {
            setTab(value);
            setFilters({ script: "", version: "", status: "" });
            setApplied({ script: "", version: "", status: "" });
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
              { value: "SUCCEEDED", label: "成功" },
              { value: "FAILED", label: "失败" },
              { value: "QUEUED", label: "排队中" },
            ]}
          />
          <Button
            type="primary"
            aria-label="查询构建记录"
            onClick={() => setApplied(filters)}
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
              rowClassName={(row) =>
                row.id === item?.id ? "selected-build" : ""
              }
              columns={[
                {
                  title: tab === "build" ? "构建编号" : "试运行编号",
                  dataIndex: "id",
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
                              "取消作业接口尚未接入，当前作业将保留排队状态。",
                            okText: "了解",
                            cancelText: "返回",
                          })
                        }
                      >
                        取消
                      </Button>
                    ) : (
                      <Button type="link" onClick={() => setSelected(row.id)}>
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
                      icon={<ReloadOutlined />}
                      onClick={() =>
                        void message.info(
                          "构建服务尚未接通，未创建新的构建作业",
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
              <p className="muted">请选择记录查看详情。</p>
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
    digest: "sha256:8f3e9a2d...",
    mode: "Docker",
    status: "READY",
    service: "表格清洗",
  },
  {
    id: "files",
    script: "文件处理",
    version: "v0.4",
    category: "文件处理",
    digest: "sha256:4b7c1d50...",
    mode: "Docker",
    status: "FAILED",
    service: "未关联",
  },
  {
    id: "booking",
    script: "景点预约",
    version: "v1.0",
    category: "景点预约适配",
    digest: "sha256:9d2e5f7a...",
    mode: "KVM",
    status: "READY",
    service: "免费景点预约",
  },
];

export function DeploymentsPage() {
  const { bootstrap } = useWorkspace();
  const [selected, setSelected] = useState("table");
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const mode = Form.useWatch("mode", form);
  const { modal, message } = App.useApp();
  const rows = bootstrap.data_mode === "prototype" ? deploymentFixtures : [];
  const item = rows.find((row) => row.id === selected);
  function stop(name: string) {
    modal.confirm({
      title: "停用部署影响预览",
      content: `${name}停用将停止新售卖，并对未使用权益发起履约或补偿。影响预览与作业接口尚未接通，原部署状态保持不变。`,
      okText: "了解影响",
      cancelText: "返回",
    });
  }
  return (
    <div className="publisher-deployments-page">
      <PageHeading
        title="部署管理"
        description="管理脚本的运行部署，配置运行环境与资源，支持启停与重试。"
      />
      <div className="deployments-columns">
        <Panel className="deployments-list">
          <Button
            type="primary"
            aria-label="创建部署"
            icon={<PlusOutlined />}
            onClick={() => setCreating(true)}
          >
            创建部署
          </Button>
          <Table
            rowKey="id"
            pagination={false}
            dataSource={rows}
            columns={[
              {
                title: "脚本版本",
                render: (_, row) => (
                  <>
                    <b>
                      {row.script} {row.version}
                    </b>
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
                  <Typography.Text copyable>{value}</Typography.Text>
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
                render: (value) => <Status>{value}</Status>,
              },
              {
                title: "操作",
                render: (_, row) => (
                  <div className="text-actions">
                    <Button type="link" onClick={() => setSelected(row.id)}>
                      详情
                    </Button>
                    <Button
                      type="link"
                      disabled={row.status !== "READY"}
                      onClick={() => stop(row.script)}
                    >
                      停用
                    </Button>
                    <Button
                      type="link"
                      disabled={row.status !== "FAILED"}
                      onClick={() =>
                        void message.info("部署执行器尚未接通，未创建重试作业")
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
              <p>暂无部署</p>
            )}
          </Panel>
          <Panel title="资源限额">
            <dl>
              <dt>单次部署上限</dt>
              <dd>4 CPU　8 GB</dd>
              <dt>当前已用</dt>
              <dd>
                {rows.length} CPU　{rows.length * 0.5} GB
              </dd>
            </dl>
          </Panel>
          <Panel title="日志">
            <pre className="deployment-log">
              {item?.status === "READY"
                ? "[INFO] 启动运行环境...\n[INFO] 加载脚本依赖完成\n[INFO] 服务已就绪，开始提供请求"
                : item
                  ? "[ERROR] 固定制品依赖检查未通过\n[INFO] 部署等待修复"
                  : "暂无日志"}
            </pre>
            <div className="row-actions">
              <Button
                disabled={item?.status !== "FAILED"}
                onClick={() =>
                  void message.info("部署执行器尚未接通，未创建重试作业")
                }
              >
                重试
              </Button>
              <Button
                disabled={item?.status !== "READY"}
                onClick={() => item && stop(item.script)}
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
          onFinish={() =>
            void message.info("部署接口尚未接通，配置已通过前端校验")
          }
        >
          <Form.Item
            name="version"
            label="固定版本"
            rules={[{ required: true }]}
          >
            <Select
              options={deploymentFixtures
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
          <Form.Item name="cpu" label="CPU核数" rules={[{ required: true }]}>
            <InputNumber min={1} max={4} />
          </Form.Item>
          <Form.Item
            name="memory"
            label="内存（MB）"
            rules={[{ required: true }]}
          >
            <InputNumber min={128} max={8192} step={128} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
