import { useState } from "react";
import { Button, Select, Table, Tabs } from "antd";
import { CloudUploadOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";

const sales = [
  {
    id: "TT202611130018",
    service: "表格清洗",
    buyer: "张**",
    amount: 6,
    fulfillment: "执行完成",
    refund: "无退款",
    settlement: "待结算",
    date: "2026-11-13",
  },
  {
    id: "TT202611130027",
    service: "景点预约",
    buyer: "李**",
    amount: 8,
    fulfillment: "目标未达",
    refund: "退款处理中",
    settlement: "冻结",
    date: "2026-11-13",
  },
];

export function SalesPage() {
  const { bootstrap } = useWorkspace();
  const [service, setService] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const all = bootstrap.data_mode === "prototype" ? sales : [];
  const rows = all.filter(
    (row) =>
      (!service || row.service === service) &&
      (!status || row.fulfillment === status) &&
      (!date || row.date === date),
  );
  const paid = rows.reduce((sum, row) => sum + row.amount, 0);
  const refunded = rows
    .filter((row) => row.refund === "退款处理中")
    .reduce((sum, row) => sum + row.amount, 0);
  return (
    <div className="publisher-sales-page">
      <PageHeading
        title="销售订单"
        description="查看已产生的服务订单，包含履约摘要与结算关联信息。"
      />
      <div className="sales-summary">
        {[
          ["file", "订单", rows.length, ""],
          ["database", "实付", paid, "元"],
          ["history", "退款处理中", refunded, "元"],
        ].map(([icon, title, value, unit]) => (
          <article key={title}>
            <TileIcon name={String(icon)} />
            <div>
              <span>{title}</span>
              <strong>
                {value}
                <small> {unit}</small>
              </strong>
            </div>
          </article>
        ))}
      </div>
      <Panel className="sales-list">
        <div className="sales-filters">
          <b>服务</b>
          <Select
            aria-label="销售服务"
            value={service}
            onChange={setService}
            options={[
              { value: "", label: "全部服务" },
              ...["表格清洗", "景点预约"].map((value) => ({ value })),
            ]}
          />
          <b>日期</b>
          <Select
            aria-label="销售日期"
            value={date}
            onChange={setDate}
            options={[
              { value: "", label: "全部日期" },
              { value: "2026-11-13", label: "2026-11-13" },
            ]}
          />
          <b>履约状态</b>
          <Select
            aria-label="销售履约状态"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "全部" },
              { value: "执行完成" },
              { value: "目标未达" },
            ]}
          />
        </div>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          columns={[
            { title: "订单编号", dataIndex: "id" },
            {
              title: "服务",
              dataIndex: "service",
              render: (value) => <Status>{value}</Status>,
            },
            { title: "购买用户", dataIndex: "buyer" },
            {
              title: "支付金额",
              dataIndex: "amount",
              render: (value) => (
                <>
                  实付 <b>{value}</b> 元
                </>
              ),
            },
            {
              title: "履约摘要",
              dataIndex: "fulfillment",
              render: (value) => (
                <Status tone={value === "执行完成" ? "green" : "orange"}>
                  {value}
                </Status>
              ),
            },
            {
              title: "退款状态",
              dataIndex: "refund",
              render: (value) => (
                <Status tone={value === "无退款" ? "gray" : "blue"}>
                  {value}
                </Status>
              ),
            },
            {
              title: "结算关联",
              dataIndex: "settlement",
              render: (value) => (
                <Status tone={value === "待结算" ? "blue" : "gray"}>
                  {value}
                </Status>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

const sources = [
  {
    id: "git",
    name: "景点预约脚本仓库",
    type: "Git",
    url: "https://example.com/travel/schedule-scripts.git",
    commit: "a1b2c3d",
  },
  {
    id: "url",
    name: "常用脚本仓库",
    type: "URL",
    url: "https://example.com/travel/common-scripts.git",
    commit: "d4e5f6a",
  },
];

export function ImportsPage() {
  const { bootstrap } = useWorkspace();
  const [tab, setTab] = useState("全部来源");
  const rows =
    bootstrap.data_mode === "prototype"
      ? sources.filter((row) => tab === "全部来源" || tab.startsWith(row.type))
      : [];
  return (
    <div className="publisher-imports-page">
      <PageHeading title="来源与同步" />
      <div className="imports-disabled-notice">
        <Notice>
          <b>P1规划功能</b>　当前未启用，启用需配置来源能力。
        </Notice>
      </div>
      <Panel className="publisher-imports-list">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={["全部来源", "Git来源", "URL来源"].map((value) => ({
            key: value,
            label: value,
          }))}
          tabBarExtraContent={
            <Link to="/publisher/scripts">
              <Button type="primary" icon={<CloudUploadOutlined />}>
                上传本地脚本
              </Button>
            </Link>
          }
        />
        <Table
          rowKey="id"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: "来源名称",
              render: (_, row) => (
                <div className="entity-cell">
                  <TileIcon
                    name={row.type === "Git" ? "code" : "link"}
                    color={row.type === "Git" ? "red" : "blue"}
                  />
                  <b>{row.name}</b>
                  <Status>{row.type}</Status>
                </div>
              ),
            },
            { title: "来源地址", dataIndex: "url" },
            {
              title: "固定提交快照 ⓘ",
              dataIndex: "commit",
              render: (value) => <Status tone="gray">{value}</Status>,
            },
            {
              title: "差异检查 ⓘ",
              render: () => <Button disabled>查看差异</Button>,
            },
            { title: "操作", render: () => <Button disabled>生成草稿</Button> },
          ]}
        />
        <Notice>同步以固定快照生成新草稿，发布版本保持其成交时的内容。</Notice>
      </Panel>
    </div>
  );
}
