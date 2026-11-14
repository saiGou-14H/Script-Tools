import { Alert, Button, Descriptions, Input, Modal, Select, Table } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useWorkspace } from "../context";
import { AdminDiagnosisForm } from "../components/AdminDiagnosisForm";
import { Notice, PageHeading, Panel, Status } from "../components/ui";
import { useAdminMetadata } from "../lib/admin-metadata";
import {
  type AlertMetadata,
  type PlatformLogSegmentMetadata,
  type RunMetadata,
  diagnosticTime,
  runStateLabels,
} from "../lib/admin-diagnostics";
import { runtimeModeLabels } from "../lib/admin-runtime-metadata";

export function AdminRunsLivePage() {
  const [params, setParams] = useSearchParams();
  const { bootstrap } = useWorkspace();
  const query = new URLSearchParams();
  for (const key of ["q", "status", "node_id", "run_mode"]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  const runs = useAdminMetadata<RunMetadata>("runs", query.toString(), true);
  const selectedId = params.get("run");
  const detail = useQuery({
    queryKey: [
      "admin",
      bootstrap.user?.id,
      bootstrap.user?.security_revision,
      "run",
      selectedId,
    ],
    enabled: Boolean(selectedId),
    queryFn: ({ signal }) =>
      api<RunMetadata>(`/admin/runs/${encodeURIComponent(selectedId!)}`, {
        signal,
      }),
  });
  const selected = detail.data;
  function update(key: string, value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <div className="admin-page admin-runs-page diagnostics-live">
      <PageHeading
        title="运行与排障"
        description="查看全站运行元数据，提供受控排障会话、受控停止与外部效果核验，保障服务稳定可用。"
      />
      <div className="admin-runs-columns">
        <div>
          <Panel title="全站运行元数据表" className="admin-runs-table">
            <div className="diagnostics-filters">
              <Input.Search
                key={params.get("q") || ""}
                aria-label="运行编号搜索"
                defaultValue={params.get("q") || ""}
                placeholder="运行、任务或脚本版本编号"
                onSearch={(q) => update("q", q.trim())}
              />
              <Select
                aria-label="运行状态筛选"
                allowClear
                placeholder="全部状态"
                value={params.get("status") || undefined}
                options={Object.entries(runStateLabels).map(
                  ([value, label]) => ({ value, label }),
                )}
                onChange={(value) => update("status", value)}
              />
              <Select
                aria-label="运行类型筛选"
                allowClear
                placeholder="全部运行"
                value={params.get("run_mode") || undefined}
                options={[
                  { value: "finite", label: "有限运行" },
                  { value: "continuous", label: "持续运行" },
                ]}
                onChange={(value) => update("run_mode", value)}
              />
            </div>
            {params.get("node_id") && (
              <p className="diagnostics-scope">
                节点筛选 {params.get("node_id")}{" "}
                <Button type="link" onClick={() => update("node_id")}>
                  清除节点筛选
                </Button>
              </p>
            )}
            {runs.isError && (
              <Alert
                type="error"
                title="运行查询失败"
                action={
                  <Button onClick={() => void runs.refetch()}>
                    重试运行查询
                  </Button>
                }
              />
            )}
            <Table
              rowKey="id"
              loading={runs.isPending}
              dataSource={runs.data?.pages.flatMap((page) => page.items) || []}
              pagination={false}
              scroll={{ x: 760 }}
              columns={[
                {
                  title: "运行编号",
                  width: 165,
                  render: (_, row) => (
                    <Button type="link" onClick={() => update("run", row.id)}>
                      {row.id.slice(0, 8)}
                    </Button>
                  ),
                },
                {
                  title: "运行状态",
                  width: 140,
                  render: (_, row) => (
                    <Status tone={row.status === "RUNNING" ? "green" : "blue"}>
                      {runStateLabels[row.status] || row.status}
                    </Status>
                  ),
                },
                {
                  title: "关联对象",
                  width: 175,
                  render: (_, row) => (
                    <span title={row.task_id}>
                      任务 {row.task_id.slice(0, 8)}
                    </span>
                  ),
                },
                {
                  title: "运行说明",
                  render: (_, row) => (
                    <>
                      {row.run_mode === "continuous" ? "持续运行" : "有限运行"}{" "}
                      · 效果 {row.effect_status}
                      <br />
                      核验 {row.verification_status}
                    </>
                  ),
                },
              ]}
            />
            {runs.hasNextPage && (
              <Button
                loading={runs.isFetchingNextPage}
                onClick={() => void runs.fetchNextPage()}
              >
                加载更多运行
              </Button>
            )}
          </Panel>
          <Panel title="受控停止" className="admin-controlled-stop">
            <div>
              <span className="stop-pending-ring" />
              <span>
                <h3>
                  {selected
                    ? runStateLabels[selected.status]
                    : "选择运行查看状态"}
                </h3>
                <p>
                  {selected?.stop_requested_at
                    ? `停止请求记录于 ${diagnosticTime(selected.stop_requested_at)}`
                    : "停止指令与节点清理证据等待接入"}
                </p>
              </span>
            </div>
          </Panel>
          <Panel title="外部效果核验" className="admin-external-verification">
            <Button disabled>开始核验</Button>
            <span>核验作业服务待接入</span>
          </Panel>
        </div>
        <Panel
          title="受控排障"
          className="admin-runtime-diagnosis admin-diagnosis-form"
        >
          <p>在受控范围内开启限时会话，安全读取指定对象的数据以定位问题。</p>
          <AdminDiagnosisForm
            resourceId={selectedId || undefined}
            resourceLabel="对象ID"
            fieldsBeforeReason
          />
          <div className="diagnosis-capability">
            <span>
              所需能力 <Status>data.diagnose</Status>
            </span>
            <span>
              密钥 <b>********</b>
            </span>
          </div>
        </Panel>
      </div>
      <Modal
        title="运行诊断元数据"
        open={Boolean(selectedId)}
        onCancel={() => update("run")}
        footer={<Button onClick={() => update("run")}>关闭运行详情</Button>}
        width={680}
      >
        {detail.isPending && <p>正在读取运行元数据</p>}
        {detail.isError && (
          <Alert
            type="error"
            title="运行详情不可用"
            description={detail.error.message}
            action={
              <Button onClick={() => void detail.refetch()}>
                重试运行详情
              </Button>
            }
          />
        )}
        {selected && (
          <Descriptions
            column={1}
            bordered
            size="small"
            items={[
              { key: "id", label: "运行编号", children: selected.id },
              { key: "task", label: "任务编号", children: selected.task_id },
              {
                key: "version",
                label: "脚本版本",
                children: selected.script_version_id,
              },
              {
                key: "status",
                label: "运行状态",
                children: runStateLabels[selected.status] || selected.status,
              },
              {
                key: "effect",
                label: "外部效果",
                children: selected.effect_status,
              },
              {
                key: "verify",
                label: "核验状态",
                children: selected.verification_status,
              },
              {
                key: "continuation",
                label: "接续序号",
                children: selected.current_continuation,
              },
              {
                key: "progress",
                label: "最近进展",
                children: diagnosticTime(selected.last_progress_at),
              },
              {
                key: "attempt",
                label: "最近执行尝试",
                children: selected.latest_attempt
                  ? `${selected.latest_attempt.attempt_no} · ${selected.latest_attempt.status}`
                  : "尚无执行尝试",
              },
              {
                key: "node",
                label: "节点编号",
                children: selected.latest_attempt?.node_id || "未分配",
              },
              {
                key: "mode",
                label: "实际运行方式",
                children: selected.latest_attempt?.actual_execution_mode
                  ? runtimeModeLabels[
                      selected.latest_attempt.actual_execution_mode
                    ]
                  : "未上报",
              },
              {
                key: "lease",
                label: "租约状态",
                children: selected.latest_attempt?.lease_state || "ABSENT",
              },
              {
                key: "generation",
                label: "租约代数",
                children: selected.latest_attempt?.lease_generation || "未分配",
              },
              {
                key: "heartbeat",
                label: "最近心跳",
                children: diagnosticTime(
                  selected.latest_attempt?.last_heartbeat_at || null,
                ),
              },
              {
                key: "cleanup",
                label: "清理状态",
                children: selected.latest_attempt?.cleanup_status || "未记录",
              },
              {
                key: "exit",
                label: "退出码",
                children: selected.latest_attempt?.exit_code ?? "未记录",
              },
            ]}
          />
        )}
        <div className="row-actions diagnostics-pending-actions">
          <Button disabled>受控停止</Button>
          <Button disabled>隔离执行</Button>
          <Button disabled>读取授权正文</Button>
        </div>
      </Modal>
    </div>
  );
}

export function AdminObservabilityLivePage() {
  const [params, setParams] = useSearchParams();
  const windowOptions = [
    { value: "all", label: "全部时间" },
    { value: "5", label: "近5分钟" },
    { value: "60", label: "近1小时" },
    { value: "1440", label: "近24小时" },
    { value: "custom", label: "已指定时间" },
  ];
  function windowValue(prefix: string) {
    const from = params.get(`${prefix}_from`);
    const to = params.get(`${prefix}_to`);
    if (!from && !to) return "all";
    const minutes = (Date.parse(to || "") - Date.parse(from || "")) / 60000;
    return [5, 60, 1440].includes(minutes) ? String(minutes) : "custom";
  }
  function setWindow(prefix: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "all") {
      next.delete(`${prefix}_from`);
      next.delete(`${prefix}_to`);
    } else {
      const now = Date.now();
      next.set(
        `${prefix}_from`,
        new Date(now - Number(value) * 60000).toISOString(),
      );
      next.set(`${prefix}_to`, new Date(now).toISOString());
    }
    setParams(next);
  }
  const logQuery = new URLSearchParams({ view: "segments" });
  const alertQuery = new URLSearchParams();
  for (const key of ["q", "status", "from", "to"]) {
    const logValue = params.get(`log_${key}`);
    const alertValue = params.get(`alert_${key}`);
    if (logValue) logQuery.set(key, logValue);
    if (alertValue) alertQuery.set(key, alertValue);
  }
  if (params.get("severity"))
    alertQuery.set("severity", params.get("severity")!);
  const logs = useAdminMetadata<PlatformLogSegmentMetadata>(
    "observability/logs",
    logQuery.toString(),
    true,
  );
  const alerts = useAdminMetadata<AlertMetadata>(
    "observability/alerts",
    alertQuery.toString(),
    true,
  );
  function update(key: string, value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <div className="admin-page admin-observability-page diagnostics-live">
      <PageHeading
        title="日志与告警"
        description="查看平台日志分段元数据与运行告警，按存储状态查询并核对发生及恢复时间。"
      />
      <Panel title="平台日志分段" className="admin-log-panel">
        <Notice>
          平台日志正文检索与导出待接入。分段记录包含归档、索引和过期状态。
        </Notice>
        <div className="diagnostics-filters">
          <Select
            aria-label="平台日志时间范围"
            value={windowValue("log")}
            options={windowOptions.map((option) => ({
              ...option,
              disabled: option.value === "custom",
            }))}
            onChange={(value) => setWindow("log", value)}
          />
          <Input.Search
            key={params.get("log_q") || ""}
            aria-label="平台日志来源搜索"
            placeholder="来源实例或分段编号"
            defaultValue={params.get("log_q") || ""}
            onSearch={(q) => update("log_q", q.trim())}
          />
          <Select
            aria-label="日志归档状态"
            allowClear
            placeholder="全部归档状态"
            value={params.get("log_status") || undefined}
            options={["COMMITTED", "MISSING", "DELETED"].map((value) => ({
              value,
            }))}
            onChange={(value) => update("log_status", value)}
          />
        </div>
        {(params.has("log_from") || params.has("log_to")) && (
          <p className="diagnostics-scope">
            查询时间 {params.get("log_from") || "最早"} 至{" "}
            {params.get("log_to") || "最新"}
          </p>
        )}
        {logs.isError && (
          <Alert
            type="error"
            title="日志分段查询失败"
            action={
              <Button onClick={() => void logs.refetch()}>重试日志查询</Button>
            }
          />
        )}
        <Table
          rowKey="id"
          loading={logs.isPending}
          dataSource={logs.data?.pages.flatMap((page) => page.items) || []}
          pagination={false}
          scroll={{ x: 1100 }}
          columns={[
            { title: "来源实例", dataIndex: "source_instance_id", width: 210 },
            {
              title: "日志时间范围",
              width: 240,
              render: (_, row) => (
                <>
                  {diagnosticTime(row.started_at)}
                  <br />
                  {diagnosticTime(row.ended_at)}
                </>
              ),
            },
            {
              title: "序列范围",
              width: 240,
              render: (_, row) => (
                <>
                  {row.sequence_start}–{row.sequence_end}
                </>
              ),
            },
            { title: "字节数", dataIndex: "size_bytes", width: 170 },
            {
              title: "归档 / 索引",
              width: 190,
              render: (_, row) => (
                <>
                  {row.archive_status} / {row.index_status}
                </>
              ),
            },
            {
              title: "有效期",
              width: 210,
              render: (_, row) => (
                <>
                  {diagnosticTime(row.expires_at)}
                  <br />
                  {row.expired ? "已过期" : "有效期内"}
                </>
              ),
            },
          ]}
        />
        {logs.hasNextPage && (
          <Button
            loading={logs.isFetchingNextPage}
            onClick={() => void logs.fetchNextPage()}
          >
            加载更多日志分段
          </Button>
        )}
      </Panel>
      <Panel title="告警" className="admin-alert-panel">
        <div className="admin-alert-toolbar">
          <div className="diagnostics-filters">
            <Select
              aria-label="告警时间范围"
              value={windowValue("alert")}
              options={windowOptions.map((option) => ({
                ...option,
                disabled: option.value === "custom",
              }))}
              onChange={(value) => setWindow("alert", value)}
            />
            <Input.Search
              key={params.get("alert_q") || ""}
              aria-label="告警规则搜索"
              placeholder="规则键或告警编号"
              defaultValue={params.get("alert_q") || ""}
              onSearch={(q) => update("alert_q", q.trim())}
            />
            <Select
              aria-label="告警状态筛选"
              allowClear
              placeholder="全部告警状态"
              value={params.get("alert_status") || undefined}
              options={[
                { value: "FIRING", label: "告警中" },
                { value: "ACKNOWLEDGED", label: "已确认" },
                { value: "RECOVERED", label: "已恢复" },
              ]}
              onChange={(value) => update("alert_status", value)}
            />
            <Select
              aria-label="告警级别筛选"
              allowClear
              placeholder="全部严重级别"
              value={params.get("severity") || undefined}
              options={["INFO", "WARNING", "CRITICAL"].map((value) => ({
                value,
              }))}
              onChange={(value) => update("severity", value)}
            />
          </div>
          <div className="row-actions">
            <Button disabled>限时静默</Button>
            <Button disabled>规则设置</Button>
          </div>
        </div>
        {(params.has("alert_from") || params.has("alert_to")) && (
          <p className="diagnostics-scope">
            查询时间 {params.get("alert_from") || "最早"} 至{" "}
            {params.get("alert_to") || "最新"}
          </p>
        )}
        {alerts.isError && (
          <Alert
            type="error"
            title="告警查询失败"
            action={
              <Button onClick={() => void alerts.refetch()}>
                重试告警查询
              </Button>
            }
          />
        )}
        <Table
          rowKey="id"
          loading={alerts.isPending}
          dataSource={alerts.data?.pages.flatMap((page) => page.items) || []}
          pagination={false}
          scroll={{ x: 1100 }}
          columns={[
            {
              title: "告警规则",
              width: 225,
              render: (_, row) => (
                <>
                  {row.rule_key}
                  <br />
                  版本 {row.rule_version} · 第{row.occurrence}次
                </>
              ),
            },
            {
              title: "严重级别",
              dataIndex: "severity",
              width: 130,
              render: (value) => (
                <Status tone={value === "CRITICAL" ? "red" : "orange"}>
                  {value}
                </Status>
              ),
            },
            { title: "状态", dataIndex: "status", width: 150 },
            {
              title: "发生 / 最近出现",
              width: 235,
              render: (_, row) => (
                <>
                  {diagnosticTime(row.first_seen_at)}
                  <br />
                  {diagnosticTime(row.last_seen_at)}
                </>
              ),
            },
            {
              title: "恢复记录",
              width: 225,
              render: (_, row) => (
                <>
                  {diagnosticTime(row.recovered_at)}
                  <br />
                  处置事件 {row.event_count} · 附证据 {row.evidence_event_count}
                </>
              ),
            },
          ]}
        />
        {alerts.hasNextPage && (
          <Button
            loading={alerts.isFetchingNextPage}
            onClick={() => void alerts.fetchNextPage()}
          >
            加载更多告警
          </Button>
        )}
        <p className="diagnostics-scope">
          确认、静默、规则同步及恢复证据正文等待服务接入
        </p>
      </Panel>
    </div>
  );
}
