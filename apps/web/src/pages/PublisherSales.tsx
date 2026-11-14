import { useState } from "react";
import { Button, Select, Table, Tabs } from "antd";
import { CloudUploadOutlined } from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { formatMinorUnits } from "../lib/money";
import { publisherSales } from "../lib/publisher-sales-preview";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";

export function SalesPage() {
  const { bootstrap } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const [params, setParams] = useSearchParams();
  const service = params.get("service") || "";
  const status = params.get("status") || "";
  const date = params.get("date") || "";
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  const all = prototype ? publisherSales : [];
  const rows = all.filter(
    (row) =>
      (!service || row.service === service) &&
      (!status || row.fulfillment === status) &&
      (!date || row.date === date),
  );
  const paid = rows.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  const refunded = rows.reduce((sum, row) => sum + BigInt(row.refundProcessingMinor), 0n);
  return (
    <div className="publisher-sales-page">
      <PageHeading
        title="销售订单"
        description="查看已产生的服务订单，包含履约摘要与结算关联信息。"
        extra={<Status tone="gray">{prototype ? "本地示例" : "销售服务待接入"}</Status>}
      />
      {!prototype && <Notice>本人销售订单、履约与退款汇总服务待接入，当前数值暂不可用。</Notice>}
      <div className="sales-summary">
        {[
          ["file", "订单", String(rows.length), ""],
          ["database", "实付", formatMinorUnits(paid).replace(/\.00$/, ""), "元"],
          ["history", "退款处理中", formatMinorUnits(refunded).replace(/\.00$/, ""), "元"],
        ].map(([icon, title, value, unit]) => (
          <article key={title}>
            <TileIcon name={String(icon)} />
            <div>
              <span>{title}</span>
              <strong>
                {prototype ? value : "—"}
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
            onChange={(value) => filter("service", value)}
            disabled={!prototype}
            options={[
              { value: "", label: "全部服务" },
              ...["表格清洗", "景点预约"].map((value) => ({ value })),
            ]}
          />
          <b>日期</b>
          <Select
            aria-label="销售日期"
            value={date}
            onChange={(value) => filter("date", value)}
            disabled={!prototype}
            options={[
              { value: "", label: "全部日期" },
              { value: "2026-11-13", label: "2026-11-13" },
            ]}
          />
          <b>履约状态</b>
          <Select
            aria-label="销售履约状态"
            value={status}
            onChange={(value) => filter("status", value)}
            disabled={!prototype}
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
          scroll={{ x: 1400 }}
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
              dataIndex: "amountMinor",
              render: (value) => (
                <>
                  实付 <b>{formatMinorUnits(value).replace(/\.00$/, "")}</b> 元
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
