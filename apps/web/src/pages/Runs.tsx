import { useState } from "react";
import { Button, DatePicker, Select, Table } from "antd";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context";
import {
  PageHeading,
  Panel,
  Status,
  TileIcon,
  UsageBanner,
} from "../components/ui";

const runs = [
  {
    id: "RUN081",
    name: "表格清洗",
    icon: "file",
    started: "2026-11-13 09:00",
    status: "执行结束",
    goal: "目标达成",
    fee: "6 元",
    tone: "green" as const,
  },
  {
    id: "RUN082",
    name: "景点预约",
    icon: "calendar",
    started: "2026-11-13 10:00",
    status: "执行中",
    goal: "待确认",
    fee: "8 元",
    tone: "blue" as const,
  },
  {
    id: "RUN083",
    name: "数据整理",
    icon: "database",
    started: "2026-11-13 10:45",
    status: "待补充",
    goal: "待确认",
    fee: "5 元（原单）",
    tone: "orange" as const,
  },
];
export function RunsPage() {
  const { bootstrap } = useWorkspace();
  const [service, setService] = useState("全部服务");
  const [status, setStatus] = useState("全部状态");
  const [filter, setFilter] = useState({ service, status });
  const data =
    bootstrap.data_mode === "prototype"
      ? runs.filter(
          (run) =>
            (filter.service === "全部服务" || filter.service === run.name) &&
            (filter.status === "全部状态" || filter.status === run.status),
        )
      : [];
  return (
    <>
      <PageHeading
        title="运行记录"
        description="查看已购买服务的执行记录、运行状态与目标结果。"
      />
      <UsageBanner compact />
      <div className="record-filters">
        <label>日期范围</label>
        <DatePicker.RangePicker
          defaultValue={[dayjs("2026-11-13"), dayjs("2026-11-13")]}
        />
        <label>服务</label>
        <Select
          value={service}
          onChange={setService}
          options={["全部服务", ...runs.map((run) => run.name)].map(
            (value) => ({ value }),
          )}
        />
        <label>状态</label>
        <Select
          value={status}
          onChange={setStatus}
          options={["全部状态", ...runs.map((run) => run.status)].map(
            (value) => ({ value }),
          )}
        />
        <Button type="primary" onClick={() => setFilter({ service, status })}>
          查询
        </Button>
      </div>
      <Panel className="record-table">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={data}
          columns={[
            {
              title: "运行编号",
              dataIndex: "id",
              render: (value) => <Link to={`/me/runs/${value}`}>{value}</Link>,
            },
            {
              title: "服务",
              dataIndex: "name",
              render: (value, row) => (
                <div className="entity-cell">
                  <TileIcon
                    name={row.icon}
                    color={row.icon === "calendar" ? "purple" : "blue"}
                  />
                  <b>{value}</b>
                </div>
              ),
            },
            { title: "开始时间", dataIndex: "started" },
            {
              title: "执行状态",
              dataIndex: "status",
              render: (value, row) => <Status tone={row.tone}>{value}</Status>,
            },
            {
              title: "目标结果",
              dataIndex: "goal",
              render: (value) => (
                <Status tone={value === "目标达成" ? "green" : "orange"}>
                  {value}
                </Status>
              ),
            },
            {
              title: "费用关联",
              dataIndex: "fee",
              render: (value, row) => (
                <>
                  {value}
                  {row.id === "RUN083" && <small>接续不另收费</small>}
                </>
              ),
            },
            {
              title: "详情",
              render: (_, row) => (
                <Link to={`/me/runs/${row.id}`}>
                  <Button>详情</Button>
                </Link>
              ),
            },
          ]}
        />
      </Panel>
    </>
  );
}
