import { useState } from "react";
import { App, Button, Modal, Table } from "antd";
import {
  CheckOutlined,
  ClockCircleOutlined,
  InfoCircleFilled,
} from "@ant-design/icons";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status } from "../components/ui";

const bookings = [
  {
    id: "BK582",
    attraction: "城市展览馆",
    date: "2026-11-20",
    slot: "上午场",
    verified: true,
    code: "BK•••582",
    order: "TT202611130081",
  },
  {
    id: "BK583",
    attraction: "博物馆",
    date: "2026-11-21",
    slot: "下午场",
    verified: false,
    code: "-",
    order: "TT202611130082",
  },
];

export function BookingsPage() {
  const { bootstrap } = useWorkspace();
  const [selected, setSelected] = useState<(typeof bookings)[number]>();
  const { message } = App.useApp();
  const isPrototype = bootstrap.data_mode === "prototype";
  return (
    <div className="bookings-page">
      <PageHeading
        title="预约凭证与票款"
        extra={
          <Status tone="gray">
            {isPrototype ? "本地示例" : "预约服务待接入"}
          </Status>
        }
      />
      <div className="booking-ticket-notice">
        <div className="notice">
          <InfoCircleFilled aria-hidden />
          <div>
            <h2>门票款说明</h2>
            <p>
              {isPrototype
                ? "本页面展示通过脚本预约的凭证与票款信息。门票款为景区官方票款，当前展示的门票款均为 ¥0，脚本服务费另见平台服务订单。"
                : "预约服务待接入，官方票款、预约状态和凭证暂不可用。"}
            </p>
          </div>
        </div>
      </div>
      <Panel className="bookings-list">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={isPrototype ? bookings : []}
          scroll={{ x: 1470 }}
          columns={[
            {
              title: "景点",
              width: "14%",
              dataIndex: "attraction",
              render: (value) => <b>{value}</b>,
            },
            {
              title: "日期场次",
              width: "11%",
              render: (_, row) => (
                <div>
                  {row.date}
                  <br />
                  {row.slot}
                </div>
              ),
            },
            {
              title: "预约状态",
              width: "17%",
              render: (_, row) => (
                <Status tone={row.verified ? "green" : "orange"}>
                  {row.verified ? (
                    <CheckOutlined aria-hidden />
                  ) : (
                    <ClockCircleOutlined aria-hidden />
                  )}{" "}
                  {row.verified ? "已核验预约成功" : "结果待核验"}
                </Status>
              ),
            },
            {
              title: "官方凭证",
              width: "9%",
              dataIndex: "code",
              render: (value, row) =>
                row.verified ? (
                  <Status tone="gray">{value}</Status>
                ) : (
                  <span className="muted">{value}</span>
                ),
            },
            {
              title: "门票款",
              width: "10%",
              render: () => <b>¥0 · 无需支付</b>,
            },
            {
              title: "平台服务订单",
              width: "18%",
              dataIndex: "order",
              render: (value) => (
                <Status tone="gray">{value} · 已支付¥8</Status>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <div className="row-actions">
                  <Button
                    type="primary"
                    disabled={!row.verified}
                    onClick={() => setSelected(row)}
                  >
                    查看凭证
                  </Button>
                  <Button
                    onClick={() =>
                      void message.info(
                        "官方核验通道尚未接入，保留原预约及当前状态",
                      )
                    }
                  >
                    核验原预约
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        title="预约凭证"
        open={!!selected}
        onCancel={() => setSelected(undefined)}
        footer={<Button onClick={() => setSelected(undefined)}>关闭</Button>}
      >
        <dl>
          <dt>景点</dt>
          <dd>{selected?.attraction}</dd>
          <dt>预约日期及场次</dt>
          <dd>
            {selected?.date} {selected?.slot}
          </dd>
          <dt>官方凭证（掩码）</dt>
          <dd>{selected?.code}</dd>
          <dt>门票款</dt>
          <dd>0元，无需支付</dd>
          <dt>平台服务订单</dt>
          <dd>{selected?.order} · 已支付¥8</dd>
        </dl>
        <Notice>
          此凭证为原型示例，真实入场凭证以官方渠道返回的信息为准。
        </Notice>
      </Modal>
    </div>
  );
}
