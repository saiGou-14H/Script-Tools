import { useEffect, useState } from "react";
import { Button, DatePicker, Select, Table } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { CheckCircleFilled } from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import {
  previewRuns,
  runStateLabels,
  runTones,
  runIcons,
} from "../lib/execution-preview";
import { Icon } from "../components/Icon";
import { formatMinorUnits } from "../lib/money";

function readRange(params: URLSearchParams): [Dayjs, Dayjs] | null {
  if (params.get("period") === "all") return null;
  const from = params.get("from") || "2026-11-13";
  const to = params.get("to") || "2026-11-13";
  if (
    ![from, to].every(
      (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        dayjs(value).isValid() &&
        dayjs(value).format("YYYY-MM-DD") === value,
    ) ||
    from > to
  )
    return null;
  return [dayjs(from), dayjs(to)];
}

export function RunsPage() {
  const { bootstrap } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [service, setService] = useState(params.get("service") || "all");
  const [status, setStatus] = useState(params.get("status") || "all");
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(
    readRange(params),
  );
  const prototype = bootstrap.data_mode === "prototype";
  const listPath = `/me/runs${params.size ? `?${params}` : ""}`;
  const detailPath = (id: string) =>
    `/me/runs/${id}?${new URLSearchParams({ returnTo: listPath })}`;
  useEffect(() => {
    setService(params.get("service") || "all");
    setStatus(params.get("status") || "all");
    setRange(readRange(params));
  }, [params]);
  const appliedRange = readRange(params);
  const invalidRange = params.get("period") !== "all" && !appliedRange;
  const data =
    prototype && !invalidRange
      ? previewRuns.filter(
          (run) =>
            (!params.get("task") || params.get("task") === run.taskId) &&
            (!params.get("service") ||
              params.get("service") === "all" ||
              params.get("service") === run.service) &&
            (!params.get("status") ||
              params.get("status") === "all" ||
              params.get("status") === run.state) &&
            (!appliedRange ||
              (run.started.slice(0, 10) >=
                appliedRange[0].format("YYYY-MM-DD") &&
                run.started.slice(0, 10) <=
                  appliedRange[1].format("YYYY-MM-DD"))),
        )
      : [];
  function query() {
    const next = new URLSearchParams(params);
    for (const key of ["service", "status", "from", "to", "period"])
      next.delete(key);
    if (service !== "all") next.set("service", service);
    if (status !== "all") next.set("status", status);
    if (range?.[0] && range[1]) {
      next.set("from", range[0].format("YYYY-MM-DD"));
      next.set("to", range[1].format("YYYY-MM-DD"));
    } else next.set("period", "all");
    setParams(next);
  }
  return (
    <div className="runs-page">
      <PageHeading
        title="运行记录"
        description="查看已购买服务的执行记录、运行状态与目标结果。"
        extra={
          <Status tone="gray">
            {prototype ? "本地示例" : "运行服务待接入"}
          </Status>
        }
      />
      <div className="execution-usage-banner">
        <TileIcon name="stack" color="gradient" />
        <div>
          <h2>通用脚本服务说明</h2>
          <div>
            {[
              "按次付费使用：每单只有一次完整服务，同次接续不额外收费。",
              "门票0元不等于脚本服务免费。",
              "未达目标的退款规则由发布者选择，购买前展示，成交后固定。",
            ].map((text) => (
              <span key={text}>
                <CheckCircleFilled aria-hidden /> {text}
              </span>
            ))}
          </div>
        </div>
      </div>
      {!prototype && (
        <Notice>运行服务待接入，执行状态、目标结果和费用关联暂不可用。</Notice>
      )}
      {invalidRange && (
        <Notice>日期范围无效，请重新选择完整的起止日期。</Notice>
      )}
      <div className="record-filters">
        <label>日期范围</label>
        <DatePicker.RangePicker
          value={range}
          onChange={setRange}
          disabled={!prototype}
          placeholder={["开始日期", "结束日期"]}
        />
        <label htmlFor="run-service">服务</label>
        <Select
          id="run-service"
          aria-label="服务筛选"
          value={service}
          onChange={setService}
          disabled={!prototype}
          options={[
            { value: "all", label: "全部服务" },
            ...previewRuns.map((run) => ({
              value: run.service,
              label:
                run.service === "免费景点预约"
                  ? "景点预约"
                  : run.service === "公开数据整理"
                    ? "数据整理"
                    : run.service,
            })),
          ]}
        />
        <label htmlFor="run-status">状态</label>
        <Select
          id="run-status"
          aria-label="运行状态筛选"
          value={status}
          onChange={setStatus}
          disabled={!prototype}
          options={[
            { value: "all", label: "全部状态" },
            ...Object.entries(runStateLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
        <Button type="primary" disabled={!prototype} onClick={query}>
          查询
        </Button>
      </div>
      <Panel className="record-table">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={data}
          scroll={{ x: 1400 }}
          columns={[
            {
              title: "运行编号",
              width: "13%",
              dataIndex: "id",
              render: (value) => <Link to={detailPath(value)}>{value}</Link>,
            },
            {
              title: "服务",
              width: "18%",
              render: (_, run) => (
                <div className="entity-cell">
                  <TileIcon
                    name={run.icon}
                    color={run.taskId === "booking" ? "purple" : "blue"}
                  />
                  <b>
                    {run.taskId === "booking"
                      ? "景点预约"
                      : run.taskId === "data"
                        ? "数据整理"
                        : run.service}
                  </b>
                </div>
              ),
            },
            { title: "开始时间", width: "19%", dataIndex: "started" },
            {
              title: "执行状态",
              width: "15%",
              render: (_, run) => (
                <Status tone={runTones[run.state]}>
                  <Icon name={runIcons[run.state]} />{" "}
                  {runStateLabels[run.state]}
                </Status>
              ),
            },
            {
              title: "目标结果",
              width: "14%",
              render: (_, run) => (
                <Status tone={run.goal === "SUCCEEDED" ? "green" : "orange"}>
                  {run.goal === "SUCCEEDED" ? "目标达成" : "待确认"}
                </Status>
              ),
            },
            {
              title: "费用关联",
              width: "13%",
              render: (_, run) => (
                <>
                  {formatMinorUnits(run.amountMinor)} 元{" "}
                  {run.taskId === "data" && (
                    <>
                      （原单）<small>接续不另收费</small>
                    </>
                  )}
                </>
              ),
            },
            {
              title: "详情",
              render: (_, run) => (
                <Link to={detailPath(run.id)}>
                  <Button>详情</Button>
                </Link>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
