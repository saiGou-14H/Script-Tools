import { App, Button, Empty, Steps, Table, Tabs } from "antd";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import {
  findPreviewRun,
  outputPath,
  outputsForRun,
  runStateLabels,
  runTones,
} from "../lib/execution-preview";
import { formatMinorUnits } from "../lib/money";
import { serviceDuration } from "../lib/service-display";
import { downloadPreviewOutput } from "../lib/consumer-preview";

export function RunDetailPage() {
  const { id = "demo" } = useParams();
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const { modal, message } = App.useApp();
  const run = findPreviewRun(id);
  const tab = ["overview", "logs", "outputs", "notifications"].includes(
    params.get("tab") || "",
  )
    ? params.get("tab")!
    : "overview";
  if (bootstrap.data_mode !== "prototype")
    return <Empty description="运行服务待接入，运行详情暂不可用" />;
  if (!run) return <Empty description="运行不存在或已失效" />;
  const completed = run.state === "SUCCEEDED";
  const waiting = run.state === "WAITING_INPUT";
  const outputs = outputsForRun(run);
  const ready = outputs.filter((output) => output.ready);
  const batches = new Set(ready.map((output) => output.batch)).size;
  const primary = ready.find((output) => output.kind === "file") || ready[0];
  function exportLogs() {
    if (!run) return;
    const content = run.logs
      .map((log) => `${log.time} ${log.message}`)
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${run.id}-脱敏日志-示例.txt`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function stop() {
    modal.confirm({
      title: "停止本次运行",
      content: "执行服务接入后可请求受控停止。已提交产物可独立查看。",
      okText: "请求停止",
      cancelText: "返回",
      onOk: () => {
        void message.info("停止接口待接入");
      },
    });
  }
  return (
    <div className="run-detail-page">
      <PageHeading
        title="运行详情"
        description="查看本次脚本服务的执行进度、运行结果与产物文件。"
        extra={<Status tone="gray">本地示例</Status>}
      />
      <div className="run-service-notice">
        <InfoCircleOutlined aria-hidden />
        <b>服务说明</b>
        <span>
          每单只有一次完整服务，同次接续不额外收费。门票0元不等于脚本服务免费。未达目标的退款规则由发布者选择，购买前展示，成交后固定。
        </span>
      </div>
      <Panel className="run-header">
        <TileIcon name={run.icon} />
        <div>
          <h2>
            {run.service} {run.id.replace("RUN", "Run")}{" "}
            <Status tone={runTones[run.state]}>
              {runStateLabels[run.state]}
            </Status>
            <Status>
              {run.goal === "SUCCEEDED" ? "目标达成" : "目标待确认"}
            </Status>
          </h2>
          <p>
            运行日期 {run.started.slice(0, 10)}
            {run.mode === "continuous" && " · 持续运行"}
          </p>
        </div>
        <div className="run-cost">
          费用 <strong>¥{formatMinorUnits(run.amountMinor)}</strong>
        </div>
      </Panel>
      <div className="run-steps">
        <Steps
          titlePlacement="vertical"
          current={-1}
          items={["校验", "执行", "产物生成", "交付"].map((title, index) => ({
            title,
            status: run.stages[index],
            content:
              run.stages[index] === "finish"
                ? "已完成"
                : index === 2 && batches > 0
                  ? `已提交${batches}批`
                  : undefined,
            icon: (
              <span
                aria-hidden
                className={`execution-step ${run.stages[index] === "finish" ? "step-finished" : run.stages[index] === "process" ? "step-current" : ""}`}
              >
                {run.stages[index] === "finish" ? "✓" : ""}
              </span>
            ),
          }))}
        />
      </div>
      <Tabs
        activeKey={tab}
        onChange={(next) => {
          const search = new URLSearchParams(params);
          if (next === "overview") search.delete("tab");
          else search.set("tab", next);
          setParams(search);
        }}
        items={[
          { key: "overview", label: "概览" },
          { key: "logs", label: "脱敏日志" },
          { key: "outputs", label: "产物" },
          { key: "notifications", label: "通知" },
        ]}
      />
      <div className="run-detail-columns">
        <div>
          {tab === "overview" && (
            <Panel title="执行结果" className="run-result-panel">
              <div className="run-result-grid">
                {run.statistics ? (
                  <>
                    <div>
                      <TileIcon name="table" />
                      <span>
                        <small>清洗数据</small>
                        <b>
                          {run.statistics.rows} <em>行</em>
                        </b>
                      </span>
                    </div>
                    <div>
                      <TileIcon name="layers" />
                      <span>
                        <small>去重数量</small>
                        <b>
                          {run.statistics.duplicatesRemoved} <em>条</em>
                        </b>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <TileIcon name="history" />
                      <span>
                        <small>运行方式</small>
                        <b className="run-mode-label">
                          {run.mode === "continuous" ? "持续运行" : "单次执行"}
                        </b>
                      </span>
                    </div>
                    <div>
                      <TileIcon name="layers" />
                      <span>
                        <small>已提交批次</small>
                        <b>
                          {batches} <em>批</em>
                        </b>
                      </span>
                    </div>
                  </>
                )}
                <div>
                  <TileIcon name="file" />
                  <span>
                    <small>{run.statistics ? "文件状态" : "就绪产物"}</small>
                    <Status tone={primary ? "green" : "gray"}>
                      {run.statistics
                        ? primary
                          ? "READY"
                          : "等待生成"
                        : `${ready.length} 项`}
                    </Status>
                  </span>
                  {primary &&
                    (run.statistics ? (
                      <Button
                        size="small"
                        icon={<DownloadOutlined aria-hidden />}
                        onClick={() => downloadPreviewOutput(primary)}
                      >
                        下载文件
                      </Button>
                    ) : (
                      <Link to={outputPath(primary)}>
                        <Button
                          size="small"
                          icon={<DownloadOutlined aria-hidden />}
                        >
                          查看产物
                        </Button>
                      </Link>
                    ))}
                </div>
              </div>
            </Panel>
          )}
          {(tab === "overview" || tab === "logs") && (
            <Panel
              title="运行日志（脱敏）"
              className="run-log-panel"
              extra={
                tab === "logs" ? (
                  <Button
                    size="small"
                    icon={<DownloadOutlined aria-hidden />}
                    onClick={exportLogs}
                  >
                    导出日志
                  </Button>
                ) : undefined
              }
            >
              <div className="run-log-lines">
                {run.logs.map((log) => (
                  <div key={log.time}>
                    <CheckCircleOutlined aria-hidden />
                    <time>{log.time}</time>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
              {waiting && (
                <Notice>
                  <Link to="/me/pending?category=待补充">查看待补充事项</Link>
                </Notice>
              )}
            </Panel>
          )}
          {tab === "outputs" && (
            <Panel title="本次运行产物" className="run-output-panel">
              <Table
                rowKey="key"
                size="small"
                pagination={false}
                dataSource={outputs}
                scroll={{ x: 700 }}
                columns={[
                  { title: "产物名称", dataIndex: "name" },
                  { title: "批次", dataIndex: "batch" },
                  { title: "大小", dataIndex: "size" },
                  {
                    title: "状态",
                    render: (_, output) => (
                      <Status tone={output.ready ? "green" : "orange"}>
                        {output.ready ? "READY" : "生成中"}
                      </Status>
                    ),
                  },
                  {
                    title: "操作",
                    render: (_, output) =>
                      output.ready ? (
                        <Link to={outputPath(output)}>
                          <Button size="small">预览与下载</Button>
                        </Link>
                      ) : (
                        <Button size="small" disabled>
                          生成中
                        </Button>
                      ),
                  },
                ]}
              />
            </Panel>
          )}
          {tab === "notifications" && (
            <Panel title="通知与投递">
              <Table
                rowKey="key"
                size="small"
                pagination={false}
                dataSource={run.notifications}
                columns={[
                  { title: "通知渠道", dataIndex: "channel" },
                  {
                    title: "投递状态",
                    dataIndex: "state",
                    render: (value) => (
                      <Status tone={value === "SENT" ? "green" : "gray"}>
                        {value === "SENT" ? "已通知（示例）" : "未触发"}
                      </Status>
                    ),
                  },
                  {
                    title: "详情",
                    render: () => <Link to="/me/notifications">查看通知</Link>,
                  },
                ]}
              />
            </Panel>
          )}
        </div>
        <Panel title="订单快照" className="run-order-snapshot">
          <dl>
            <dt>服务名称</dt>
            <dd>{run.service}</dd>
            <dt>订单编号</dt>
            <dd>
              {run.orderId ? (
                <Link className="dark-link" to={`/me/orders/${run.orderId}`}>
                  {run.orderId}
                </Link>
              ) : run.billingOrderId ? (
                <Link
                  className="dark-link"
                  to={`/me/bills?order_id=${run.billingOrderId}`}
                >
                  {run.billingOrderId}
                </Link>
              ) : (
                "原订单资料待载入"
              )}
            </dd>
            <dt>支付状态</dt>
            <dd>
              <Status tone="green">已支付</Status>
            </dd>
            <dt>服务版本</dt>
            <dd>{run.version}</dd>
            <dt>费用</dt>
            <dd>
              <b>¥{formatMinorUnits(run.amountMinor)}</b>
            </dd>
            <dt>可启动至</dt>
            <dd>{run.launchUntil}</dd>
            <dt>最长执行</dt>
            <dd>
              {run.maxServiceSeconds === null
                ? "以服务约定为准"
                : serviceDuration(run.maxServiceSeconds)}
            </dd>
          </dl>
          <Notice>
            <div>
              <b>同次接续说明</b>
              <p>每单只有一次完整服务，同次接续不额外收费。</p>
            </div>
          </Notice>
          {!completed && (
            <Button className="run-stop-button" onClick={stop}>
              停止运行
            </Button>
          )}
        </Panel>
      </div>
    </div>
  );
}
