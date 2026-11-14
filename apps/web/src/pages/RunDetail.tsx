import { useState } from "react";
import { Button, Empty, Steps, Table, Tabs } from "antd";
import {
  CheckCircleOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";

const logs = [
  ["2026-11-13 09:00:12", "运行环境准备完成。"],
  ["2026-11-13 09:00:28", "输入文件读取成功，行数为1200。"],
  ["2026-11-13 09:01:05", "去重处理完成，共去重86条。"],
  ["2026-11-13 09:01:36", "清洗与校验通过，开始生成产物。"],
  ["2026-11-13 09:02:10", "产物生成完成，文件已就绪。"],
  ["2026-11-13 09:02:18", "本次执行已结束，目标已达成。"],
];

export function RunDetailPage() {
  const { id = "demo" } = useParams();
  const [tab, setTab] = useState("overview");
  const running = id === "RUN082" || id === "booking";
  const pending = id === "RUN083" || id === "data";
  const completed = !running && !pending;
  if (
    ![
      "demo",
      "RUN081",
      "RUN082",
      "RUN083",
      "clean",
      "booking",
      "data",
    ].includes(id)
  )
    return <Empty description="运行不存在或已失效" />;
  const title = running
    ? "景点预约 Run082"
    : pending
      ? "公开数据整理 Run083"
      : "表格清洗 Run081";
  const amount = running ? "8.00" : pending ? "5.00" : "6.00";
  const status = running ? "执行中" : pending ? "待补充" : "执行已结束";
  return (
    <div className="run-detail-page">
      <PageHeading
        title="运行详情"
        description="查看本次脚本服务的执行进度、运行结果与产物文件。"
      />
      <div className="run-service-notice">
        <InfoCircleOutlined />
        <b>服务说明</b>
        <span>
          每单只有一次完整服务，同次接续不额外收费。门票0元不等于脚本服务免费。未达目标的退款规则由发布者选择，购买前展示，成交后固定。
        </span>
      </div>
      <Panel className="run-header">
        <TileIcon name={running ? "calendar" : "table"} />
        <div>
          <h2>
            {title}{" "}
            <Status tone={completed ? "green" : pending ? "orange" : "blue"}>
              {status}
            </Status>
            <Status>{completed ? "目标达成" : "目标待确认"}</Status>
          </h2>
          <p>运行日期 2026-11-13</p>
        </div>
        <div className="run-cost">
          费用 <strong>¥{amount}</strong>
        </div>
      </Panel>
      <div className="run-steps">
        <Steps
          current={completed ? 4 : pending ? 0 : 1}
          items={["校验", "执行", "产物生成", "交付"].map((title) => ({
            title,
            content: completed ? "已完成" : undefined,
          }))}
        />
      </div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
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
            <Panel title="执行结果">
              <div className="run-result-grid">
                <div>
                  <TileIcon name="table" />
                  <span>
                    <small>清洗数据</small>
                    <b>
                      {completed ? "1200" : "—"} <em>行</em>
                    </b>
                  </span>
                </div>
                <div>
                  <TileIcon name="database" />
                  <span>
                    <small>去重数量</small>
                    <b>
                      {completed ? "86" : "—"} <em>条</em>
                    </b>
                  </span>
                </div>
                <div>
                  <TileIcon name="file" />
                  <span>
                    <small>文件状态</small>
                    <Status tone={completed ? "green" : "gray"}>
                      {completed ? "READY" : "等待生成"}
                    </Status>
                  </span>
                  <Link to="/me/outputs">
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      disabled={!completed}
                    >
                      下载文件
                    </Button>
                  </Link>
                </div>
              </div>
            </Panel>
          )}
          {(tab === "overview" || tab === "logs") && (
            <Panel title="运行日志（脱敏）">
              <div className="run-log-lines">
                {(completed ? logs : logs.slice(0, running ? 2 : 1)).map(
                  ([time, text]) => (
                    <div key={time}>
                      <CheckCircleOutlined />
                      <time>{time}</time>
                      <span>{text}</span>
                    </div>
                  ),
                )}
              </div>
              {pending && (
                <Notice>
                  本次运行等待补充资料，请在待处理事项中完成操作。
                </Notice>
              )}
            </Panel>
          )}
          {tab === "outputs" && (
            <Panel title="本次运行产物">
              <Table
                rowKey="key"
                size="small"
                pagination={false}
                dataSource={
                  completed
                    ? [
                        { key: "1", name: "cleaned.csv", size: "142 KB" },
                        { key: "2", name: "summary.json", size: "28 KB" },
                      ]
                    : []
                }
                columns={[
                  { title: "文件名称", dataIndex: "name" },
                  { title: "大小", dataIndex: "size" },
                  {
                    title: "状态",
                    render: () => <Status tone="green">READY</Status>,
                  },
                  {
                    title: "操作",
                    render: () => (
                      <Link to="/me/outputs">
                        <Button size="small">预览与下载</Button>
                      </Link>
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
                dataSource={
                  completed
                    ? [
                        { key: "1", channel: "站内消息", state: "已通知" },
                        { key: "2", channel: "邮件", state: "已通知" },
                      ]
                    : []
                }
                columns={[
                  { title: "通知渠道", dataIndex: "channel" },
                  {
                    title: "投递状态",
                    dataIndex: "state",
                    render: (value) => <Status tone="green">{value}</Status>,
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
            <dd>
              {running ? "景点预约" : pending ? "公开数据整理" : "表格清洗"}
            </dd>
            <dt>订单编号</dt>
            <dd>
              <Link className="dark-link" to="/me/orders/demo">
                TT202611130018
              </Link>
            </dd>
            <dt>支付状态</dt>
            <dd>
              <Status tone="green">已支付</Status>
            </dd>
            <dt>服务版本</dt>
            <dd>v1.2</dd>
            <dt>费用</dt>
            <dd>
              <b>¥{amount}</b>
            </dd>
            <dt>可启动至</dt>
            <dd>2026-11-20</dd>
            <dt>最长执行</dt>
            <dd>5分钟</dd>
          </dl>
          <Notice>
            <div>
              <b>同次接续说明</b>
              <p>每单只有一次完整服务，同次接续不额外收费。</p>
            </div>
          </Notice>
        </Panel>
      </div>
    </div>
  );
}
