import {
  Button,
  Progress,
  Segmented,
  Table,
  App,
  Tabs,
  Descriptions,
  Empty,
} from "antd";
import { CalendarOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import {
  More,
  PageHeading,
  Panel,
  Status,
  TileIcon,
  UsageBanner,
} from "../components/ui";

import { previewTasks as tasks } from "../lib/consumer-preview";

export function TasksPage() {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const scope = params.get("scope") === "self" ? "本人自用" : "付费服务";
  const { modal, message } = App.useApp();
  const rows =
    bootstrap.data_mode === "prototype" && scope === "付费服务" ? tasks : [];
  return (
    <>
      <PageHeading
        title="我的任务"
        description="查看并管理已购买服务的执行任务，包括执行进度、使用状态与结果产物。"
      />
      <UsageBanner />
      <div className="important-notice">
        <InfoCircleOutlined />
        <b>重要说明</b>
        <span>• 每次新使用需新购，接续原任务不重复计费。</span>
        <span>• 门票0元不等于脚本服务免费。</span>
        <span>• 未达目标的退款规则由发布者选择，购买前展示、成交后固定。</span>
      </div>
      <Panel
        className="task-list-panel"
        title={
          <>
            任务列表 <small>（共 {rows.length} 项）</small>
            <Segmented
              value={scope}
              onChange={(value) =>
                setParams(
                  (previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("scope", value === "本人自用" ? "self" : "paid");
                    return next;
                  },
                  { replace: true },
                )
              }
              options={["付费服务", "本人自用"]}
            />
          </>
        }
        extra={
          <span className="muted">
            <CalendarOutlined /> 数据日期 2026-11-13
          </span>
        }
      >
        <Table
          className="task-table"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: "任务",
              dataIndex: "title",
              width: "23%",
              render: (value, row) => (
                <div className="entity-cell">
                  <TileIcon
                    name={row.icon}
                    color={row.icon === "calendar" ? "purple" : "blue"}
                  />
                  <div>
                    <b>{value}</b>
                    <Status tone={row.icon === "calendar" ? "purple" : "blue"}>
                      {row.category}
                    </Status>
                  </div>
                </div>
              ),
            },
            {
              title: "服务订单",
              dataIndex: "order",
              width: "15%",
              render: (value) => (
                <>
                  <Link className="dark-link" to="/me/orders/demo">
                    {value}
                  </Link>
                  <small>下单时间 2026-11-13</small>
                </>
              ),
            },
            {
              title: "计划",
              dataIndex: "plan",
              width: "17%",
              render: (value, row) => (
                <div className="muted">
                  {value}
                  <br />
                  {row.icon === "calendar" && (
                    <>
                      {row.used}
                      <br />
                    </>
                  )}
                  有效期限 2026-11-30
                </div>
              ),
            },
            {
              title: "使用状态",
              dataIndex: "status",
              width: "14%",
              render: (value, row) => (
                <>
                  <Status
                    tone={
                      row.progress === 100
                        ? "green"
                        : row.progress === 0
                          ? "orange"
                          : "blue"
                    }
                  >
                    {value}
                  </Status>
                  {row.progress === 100 && <small>{row.used}</small>}
                </>
              ),
            },
            {
              title: "当前进度",
              dataIndex: "progress",
              width: "22%",
              render: (value, row) => (
                <>
                  <Progress
                    percent={value}
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
                  {row.progress === 60 && (
                    <Button
                      onClick={() =>
                        modal.confirm({
                          title: "暂停后续启动",
                          content:
                            "当前执行中的预约将继续。确认后暂停后续计划。",
                          okText: "确认暂停",
                          cancelText: "取消",
                          onOk: () => {
                            void message.info(
                              "任务调度接口正在接入，原计划保持不变",
                            );
                          },
                        })
                      }
                    >
                      暂停后续
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
export function TaskDetailPage() {
  const { id = "demo" } = useParams();
  const { bootstrap } = useWorkspace();
  const task = tasks.find(
    (item) => item.key === (id === "demo" ? "clean" : id),
  );
  if (!task || bootstrap.data_mode !== "prototype")
    return <Empty description="任务不存在或已失效" />;
  const isClean = task.key === "clean";
  const service = isClean
    ? "表格清洗"
    : task.key === "booking"
      ? "景点预约"
      : "公开数据整理";
  return (
    <>
      <PageHeading
        title="任务详情"
        extra={
          <Link to={`/me/runs/${task.key}`}>
            <Button type="primary">查看当前运行</Button>
          </Link>
        }
      />
      <UsageBanner compact />
      <Panel title={`${service} · 固定配置 v1`}>
        <Descriptions
          column={3}
          items={[
            {
              key: "1",
              label: "服务版本",
              children: `${service} ${isClean ? "v1.2" : "v1.0"}`,
            },
            {
              key: "2",
              label: "服务订单",
              children: (
                <Link
                  to={`/me/orders/${task.key === "booking" ? "OD202611130002" : "demo"}`}
                >
                  {task.order}
                </Link>
              ),
            },
            {
              key: "3",
              label: "使用状态",
              children: (
                <Status tone={isClean ? "green" : "orange"}>
                  {task.status}
                </Status>
              ),
            },
            {
              key: "4",
              label: "计划",
              children: isClean ? "手动执行" : task.plan,
            },
            {
              key: "5",
              label: "使用次数",
              children: isClean ? "已用 1 次" : "本次权益已占用",
            },
            { key: "6", label: "有效期限", children: "2026-11-30" },
          ]}
        />
      </Panel>
      <Panel title="执行与配置">
        <Tabs
          items={[
            {
              key: "history",
              label: "运行历史",
              children: (
                <>
                  <p>
                    2026-11-13{" "}
                    {isClean
                      ? "10:55　执行完成，已生成清洗结果。"
                      : task.summary}
                  </p>
                  <More to="/me/runs">查看全部运行</More>
                </>
              ),
            },
            {
              key: "config",
              label: "配置快照",
              children: (
                <pre>
                  {JSON.stringify(
                    isClean
                      ? {
                          source_file: "sample.csv",
                          deduplicate_by: "邮箱",
                          output_format: "CSV",
                        }
                      : task.key === "booking"
                        ? { visit_date: "2026-11-15", time_slot: "上午场" }
                        : { source: "城市基本信息", status: "待补充数据" },
                    null,
                    2,
                  )}
                </pre>
              ),
            },
            {
              key: "holds",
              label: "阻塞与授权",
              children:
                task.key === "data" ? (
                  <Link to="/me/pending">查看待补充事项</Link>
                ) : (
                  "当前没有未解决的阻塞事项。"
                ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
