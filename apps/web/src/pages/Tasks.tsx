import { useState } from "react";
import { App, Button, Empty, Modal, Progress, Segmented, Table } from "antd";
import {
  CalendarOutlined,
  CopyOutlined,
  InfoCircleOutlined,
  PauseOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import {
  More,
  Notice,
  PageHeading,
  Panel,
  Status,
  TileIcon,
  UsageBanner,
} from "../components/ui";
import { previewTasks as tasks } from "../lib/consumer-preview";
import { findPreviewRun, runTones } from "../lib/execution-preview";
import { formatMinorUnits } from "../lib/money";

function usePausePreview() {
  const { modal, message } = App.useApp();
  return () =>
    modal.confirm({
      title: "暂停后续启动",
      content:
        "暂停后续计划与停止当前运行分别处理。当前展示本地示例，调度服务待接入。",
      okText: "确认暂停",
      cancelText: "返回",
      onOk: () => {
        void message.info("任务调度接口待接入");
      },
    });
}

export function TasksPage() {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") === "self" ? "本人自用" : "付费服务";
  const prototype = bootstrap.data_mode === "prototype";
  const pause = usePausePreview();
  const rows = prototype && scope === "付费服务" ? tasks : [];
  return (
    <div className="tasks-page">
      <PageHeading
        title="我的任务"
        description="查看并管理已购买服务的执行任务，包括执行进度、使用状态与结果产物。"
        extra={
          <Status tone="gray">
            {prototype ? "本地示例" : "任务服务待接入"}
          </Status>
        }
      />
      <UsageBanner />
      <div className="important-notice">
        <InfoCircleOutlined aria-hidden />
        <b>重要说明</b>
        <span>• 每次新使用需新购，接续原任务不重复计费。</span>
        <span>• 门票0元不等于脚本服务免费。</span>
        <span>• 未达目标的退款规则由发布者选择，购买前展示、成交后固定。</span>
      </div>
      {!prototype && (
        <Notice>任务服务待接入，当前任务数与运行状态暂不可用。</Notice>
      )}
      <Panel
        className="task-list-panel"
        title={
          <>
            任务列表 <small>（共 {prototype ? rows.length : "—"} 项）</small>
            <Segmented
              value={scope}
              onChange={(value) =>
                setParams((previous) => {
                  const next = new URLSearchParams(previous);
                  next.set("scope", value === "本人自用" ? "self" : "paid");
                  return next;
                })
              }
              options={["付费服务", "本人自用"]}
            />
          </>
        }
        extra={
          <span className="muted">
            <CalendarOutlined aria-hidden />{" "}
            {prototype ? "数据日期 2026-11-13" : "数据待载入"}
          </span>
        }
      >
        <Table
          className="task-table"
          rowKey="key"
          pagination={false}
          dataSource={rows}
          scroll={{ x: 1450 }}
          columns={[
            {
              title: "任务",
              width: "23%",
              render: (_, row) => (
                <div className="entity-cell">
                  <TileIcon
                    name={row.icon}
                    color={row.key === "booking" ? "purple" : "blue"}
                  />
                  <div>
                    <b>{row.title}</b>
                    <Status tone={row.key === "booking" ? "purple" : "blue"}>
                      {row.category}
                    </Status>
                  </div>
                </div>
              ),
            },
            {
              title: "服务订单",
              width: "15%",
              render: (_, row) => (
                <>
                  {row.orderId ? (
                    <Link
                      className="dark-link"
                      to={`/me/orders/${row.orderId}`}
                    >
                      {row.orderId}
                    </Link>
                  ) : (
                    <span>{row.order}</span>
                  )}
                  <small>下单时间 2026-11-13</small>
                </>
              ),
            },
            {
              title: "计划",
              width: "17%",
              render: (_, row) => (
                <div className="muted">
                  {row.plan}
                  <br />
                  {row.key === "booking" && (
                    <>
                      {row.used}
                      <br />
                    </>
                  )}
                  有效期限 {findPreviewRun(row.key)?.validUntil || "待载入"}
                </div>
              ),
            },
            {
              title: "使用状态",
              width: "13%",
              render: (_, row) => {
                const run = findPreviewRun(row.key);
                return (
                  <>
                    <Status tone={run ? runTones[run.state] : "gray"}>
                      {row.status}
                    </Status>
                    {row.progress === 100 && <small>{row.used}</small>}
                  </>
                );
              },
            },
            {
              title: "当前进度",
              width: "21%",
              render: (_, row) => (
                <>
                  <Progress
                    percent={row.progress}
                    size="small"
                    strokeColor="#205fff"
                    status="normal"
                  />
                  <small>{row.summary}</small>
                </>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <div className="row-actions">
                  <Link to={`/me/tasks/${row.key}`}>
                    <Button>查看</Button>
                  </Link>
                  {findPreviewRun(row.key)?.state === "RUNNING" && (
                    <Button onClick={pause}>暂停后续</Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

export function TaskDetailPage() {
  const { id = "demo" } = useParams();
  const { bootstrap } = useWorkspace();
  const [dialog, setDialog] = useState<"snapshot" | "copy" | null>(null);
  const pause = usePausePreview();
  const task = tasks.find(
    (item) => item.key === (id === "demo" ? "booking" : id),
  );
  const run = task && findPreviewRun(task.key);
  if (bootstrap.data_mode !== "prototype")
    return <Empty description="任务服务待接入，任务详情暂不可用" />;
  if (!task || !run) return <Empty description="任务不存在或已失效" />;
  const completed = run.state === "SUCCEEDED";
  const waiting = run.state === "WAITING_INPUT";
  const steps = [
    { title: "任务创建", detail: "已创建任务并锁定服务内容", status: "finish" },
    {
      title: "准备执行",
      detail: waiting ? "等待补充必要数据与授权" : "检查运行环境与必要资源",
      status: waiting ? "process" : "finish",
    },
    {
      title: completed
        ? "脚本执行完成"
        : waiting
          ? "脚本待执行"
          : "脚本运行中",
      detail: task.summary,
      status: completed ? "finish" : waiting ? "wait" : "process",
    },
    {
      title: "结果确认",
      detail: completed
        ? "目标已达成，结果产物可查看"
        : "依据业务结果与成交规则确认",
      status: completed ? "finish" : "wait",
    },
  ];
  return (
    <div className="task-detail-page">
      <PageHeading
        title="任务详情"
        extra={<Status tone="gray">本地示例</Status>}
      />
      <div className="task-detail-columns">
        <div>
          <Panel className="task-summary-panel">
            <div className="task-summary-hero">
              <div className="task-summary-title">
                <TileIcon name="code" color="gradient" />
                <div>
                  <h2>
                    {run.service}{" "}
                    <Status tone={runTones[run.state]}>{task.status}</Status>
                  </h2>
                  <p>
                    {run.goalDescription} 每单一次完整服务，同次接续不额外收费。
                  </p>
                </div>
              </div>
              <div className="task-summary-facts">
                <div>
                  <TileIcon name="ticket" />
                  <span>
                    <small>固定版本</small>
                    <b>{run.version}</b>
                  </span>
                </div>
                <div>
                  <TileIcon name="calendar" />
                  <span>
                    <small>服务窗口</small>
                    <b>
                      {task.key === "booking"
                        ? "10:00 - 12:00"
                        : "按本次计划执行"}
                    </b>
                  </span>
                </div>
                <div>
                  <TileIcon name="file" />
                  <span>
                    <small>关联订单（已支付）</small>
                    {run.orderId ? (
                      <Link
                        className="dark-link"
                        aria-label={run.orderId}
                        to={`/me/orders/${run.orderId}`}
                      >
                        <b>{formatMinorUnits(run.amountMinor)} 元</b>
                      </Link>
                    ) : (
                      <b>{formatMinorUnits(run.amountMinor)} 元</b>
                    )}
                  </span>
                </div>
                <div>
                  <TileIcon name="layers" />
                  <span>
                    <small>权益状态</small>
                    <Status tone="purple">
                      {completed ? "本次权益已使用" : "本次权益已占用"}
                    </Status>
                  </span>
                </div>
              </div>
            </div>
          </Panel>
          <Panel
            title="流程与计划"
            className="task-plan-panel"
            extra={
              <Button type="link" onClick={() => setDialog("snapshot")}>
                配置快照
              </Button>
            }
          >
            <div className="task-plan-columns">
              <ol className="task-timeline">
                {steps.map((step, index) => (
                  <li className={`timeline-${step.status}`} key={step.title}>
                    <span className="task-timeline-marker" aria-hidden>
                      {step.status === "finish" ? "✓" : ""}
                    </span>
                    <div>
                      <b>{step.title}</b>
                      <p>
                        {index === 0 ? run.started + " · " : ""}
                        {step.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <section className="task-plan-summary">
                <h3>
                  <CalendarOutlined aria-hidden /> 执行计划
                </h3>
                <dl>
                  <dt>{task.key === "booking" ? "预约日期" : "执行计划"}</dt>
                  <dd>
                    {task.key === "booking"
                      ? String(run.input.visit_date)
                      : task.plan.replace("执行时间：", "")}
                  </dd>
                  <dt>权益有效期</dt>
                  <dd>{run.validUntil}</dd>
                  <dt>可启动至</dt>
                  <dd>{run.launchUntil}</dd>
                  <dt>运行方式</dt>
                  <dd>{run.mode === "continuous" ? "持续运行" : "单次执行"}</dd>
                </dl>
              </section>
            </div>
          </Panel>
          <Panel
            title="运行历史"
            className="task-history-panel"
            extra={<More to={`/me/runs?task=${task.key}`}>查看全部运行</More>}
          >
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={[run]}
              scroll={{ x: 700 }}
              columns={[
                { title: "使用序号", render: () => "#1" },
                { title: "使用时间", dataIndex: "started" },
                {
                  title: "使用内容（逻辑）",
                  render: () => (
                    <Link to={`/me/runs/${run.id}`}>
                      {run.service} · {run.id}
                    </Link>
                  ),
                },
                {
                  title: "状态",
                  render: () => (
                    <Status tone={runTones[run.state]}>{task.status}</Status>
                  ),
                },
              ]}
            />
          </Panel>
        </div>
        <aside>
          <Panel title="目标与退款规则" className="task-goal-panel">
            <div className="task-goal-facts">
              <section>
                <TileIcon name="flag" />
                <div>
                  <h3>
                    目标状态{" "}
                    <Status
                      tone={run.goal === "SUCCEEDED" ? "green" : "orange"}
                    >
                      {run.goal === "SUCCEEDED" ? "已达成" : "待达成"}
                    </Status>
                  </h3>
                  <p>目标　{run.goalDescription}</p>
                </div>
              </section>
              <section>
                <TileIcon name="shield" />
                <div>
                  <h3>
                    退款规则 <Status tone="purple">{run.refundRule}</Status>
                  </h3>
                  <p>
                    {run.refundDescription}
                    {run.orderId && (
                      <Link to={`/me/orders/${run.orderId}`}>查看关联订单</Link>
                    )}
                  </p>
                </div>
              </section>
            </div>
            <Notice>
              <div>
                <b>重要提示</b>
                <ul>
                  <li>每单只有一次完整服务，同次接续不额外收费。</li>
                  <li>门票0元不等于脚本服务免费。</li>
                  <li>
                    未达目标的退款规则由发布者选择，购买前展示，成交后固定。
                  </li>
                </ul>
              </div>
            </Notice>
          </Panel>
          <Panel title="操作" className="task-actions-panel">
            <div className="task-primary-actions">
              <Link to={`/me/runs/${run.id}`}>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined aria-hidden />}
                >
                  查看当前运行
                </Button>
              </Link>
              <Button
                icon={<PauseOutlined aria-hidden />}
                onClick={pause}
                disabled={completed}
              >
                暂停后续
              </Button>
            </div>
            <div className="task-copy-action">
              <Button
                icon={<CopyOutlined aria-hidden />}
                onClick={() => setDialog("copy")}
              >
                复制配置
              </Button>
              <span>复制后需重新绑定权益与授权。</span>
            </div>
            {waiting && (
              <Link to="/me/pending?category=待补充">查看待补充事项</Link>
            )}
          </Panel>
        </aside>
      </div>
      <Modal
        title={dialog === "copy" ? "复制配置预览" : "配置快照"}
        open={dialog !== null}
        onCancel={() => setDialog(null)}
        footer={<Button onClick={() => setDialog(null)}>关闭</Button>}
      >
        <p>
          {dialog === "copy"
            ? "任务创建服务待接入。复制配置需绑定新的使用权益与访问授权。"
            : `${run.service} ${run.version} · 固定参数快照`}
        </p>
        <pre>{JSON.stringify(run.input, null, 2)}</pre>
      </Modal>
    </div>
  );
}
