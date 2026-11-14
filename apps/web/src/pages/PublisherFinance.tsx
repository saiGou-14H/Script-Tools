import { useState } from "react";
import {
  Alert,
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Skeleton,
  Steps,
  Table,
} from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircleFilled } from "@ant-design/icons";
import { Link, useParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { usePublisherPreview } from "../publisher-preview";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { formatMinorUnits } from "../lib/money";
import { api } from "../api";
import { PublisherProfileEditor } from "../components/PublisherProfileEditor";
import type { PublisherProfileView } from "../types";

const earningsLedger = [
  { id: "L001", income: "20000", fee: "-1800", refund: "0" },
  { id: "L002", income: "18000", fee: "-1600", refund: "-8000" },
  { id: "L003", income: "22000", fee: "-2000", refund: "0" },
  { id: "L004", income: "8000", fee: "-600", refund: "0" },
];
const compactMoney = (value: string | bigint) =>
  formatMinorUnits(value).replace(/\.00$/, "");

export function EarningsPage() {
  const { bootstrap } = useWorkspace();
  const { profile } = usePublisherPreview();
  const [requesting, setRequesting] = useState(false);
  const { message } = App.useApp();
  const rows = bootstrap.data_mode === "prototype" ? earningsLedger : [];
  const gross = rows.reduce((sum, row) => sum + BigInt(row.income), 0n);
  const fees = rows.reduce((sum, row) => sum - BigInt(row.fee), 0n);
  const refunded = rows.reduce((sum, row) => sum - BigInt(row.refund), 0n);
  const net = gross - fees - refunded;
  const available = rows.length ? "20000" : "0";
  return (
    <div className="publisher-earnings-page">
      <PageHeading
        title="收益与结算"
        description="查看脚本服务的收入、费用与结算情况，支持申请打款与查看结算明细。"
      />
      <div className="publisher-earnings-summary">
        {[
          ["database", "总收入", gross, "blue"],
          ["refund", "退款", refunded, "red"],
          ["box", "平台及渠道费 ⓘ", fees, "orange"],
          ["wallet", "净收益", net, "blue"],
        ].map(([icon, title, amount, color]) => (
          <Panel key={String(title)}>
            <TileIcon name={String(icon)} color={String(color)} />
            <div>
              <h3>{String(title)}</h3>
              <strong>{compactMoney(amount)}</strong> 元
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="净收益分布" className="earnings-distribution">
        <div>
          {[
            ["clock", "待结算", rows.length ? "30000" : "0"],
            ["shield", "可结算", available],
            ["wallet", "已到账", rows.length ? "4000" : "0"],
            ["lock", "冻结", "0"],
          ].map(([icon, title, amount]) => (
            <article key={title}>
              <TileIcon name={icon} />
              <span>
                {title}
                <strong>
                  {compactMoney(amount)}
                  <small> 元</small>
                </strong>
              </span>
            </article>
          ))}
        </div>
        <div className="row-actions">
          <Button
            type="primary"
            disabled={!profile.payoutVerified || available === "0"}
            onClick={() => setRequesting(true)}
          >
            申请打款
          </Button>
          <Link to="/publisher/settlements/SET018">
            <Button>查看结算详情</Button>
          </Link>
        </div>
      </Panel>
      <Panel title="账本列表" className="earnings-ledger">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: "交易内容",
              width: "34%",
              render: (_, row) => (
                <>
                  景点预约脚本 · 按次服务　
                  {row.id === "L001" && (
                    <Link to="/publisher/pricing">
                      <Status>费用配置</Status>
                    </Link>
                  )}
                </>
              ),
            },
            {
              title: "原单收入",
              dataIndex: "income",
              render: (value) => `${compactMoney(value)} 元`,
            },
            {
              title: "费用",
              dataIndex: "fee",
              render: (value) => `${compactMoney(value)} 元`,
            },
            {
              title: "退款冲正",
              dataIndex: "refund",
              render: (value) => `${compactMoney(value)} 元`,
            },
            {
              title: "净额",
              render: (_, row) => (
                <b>
                  {compactMoney(
                    BigInt(row.income) + BigInt(row.fee) + BigInt(row.refund),
                  )}{" "}
                  元
                </b>
              ),
              align: "center",
            },
          ]}
        />
      </Panel>
      <Modal
        title="申请收益打款"
        open={requesting}
        onCancel={() => setRequesting(false)}
        okText="提交申请"
        cancelText="返回"
        onOk={() => void message.info("打款接口尚未接入，当前可结算收益保留")}
      >
        <dl>
          <dt>可结算金额</dt>
          <dd>{formatMinorUnits(available)}元</dd>
          <dt>收款账户</dt>
          <dd>{profile.payoutMask}</dd>
          <dt>币种</dt>
          <dd>CNY</dd>
        </dl>
        <Notice>发起后固定本次收款资料快照，按原请求查询渠道回执。</Notice>
      </Modal>
    </div>
  );
}

const settlementLines = [
  { id: "TT202611130101", income: "15000", refund: "0", fee: "1500" },
  { id: "TT202611130102", income: "8000", refund: "1000", fee: "500" },
];

export function SettlementDetailPage() {
  const { id = "demo" } = useParams();
  const { bootstrap } = useWorkspace();
  const { message } = App.useApp();
  if (!["demo", "SET018"].includes(id) || bootstrap.data_mode !== "prototype")
    return <Empty description="结算批次不存在或已失效" />;
  return (
    <div className="publisher-settlement-page">
      <PageHeading title="结算详情" />
      <div className="settlement-steps">
        <Steps
          current={3}
          items={["可结算", "资金预占", "渠道受理", "等待回执"].map(
            (title, index) => ({
              title,
              status: index === 3 ? "wait" : "finish",
              icon:
                index < 3 ? (
                  <CheckCircleFilled />
                ) : (
                  <span className="settlement-wait-icon" />
                ),
            }),
          )}
        />
      </div>
      <Panel className="settlement-detail-panel">
        <div className="settlement-fact-cards">
          <article>
            <span>批次</span>
            <strong>SET018</strong>
          </article>
          <article>
            <span>打款</span>
            <strong>
              P0018 <Status>处理中</Status>
            </strong>
            <p>待渠道回执</p>
          </article>
          <article>
            <span>金额</span>
            <strong>
              200<small> 元</small>
            </strong>
          </article>
          <article>
            <span>收款账户</span>
            <strong>****1234</strong>
            <p>使用发起时快照</p>
          </article>
        </div>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={settlementLines}
          columns={[
            { title: "交易编号", dataIndex: "id" },
            {
              title: "收入（元）",
              dataIndex: "income",
              render: compactMoney,
              align: "center",
            },
            {
              title: "退款（元）",
              dataIndex: "refund",
              render: compactMoney,
              align: "center",
            },
            {
              title: "费用（元）",
              dataIndex: "fee",
              render: compactMoney,
              align: "center",
            },
            {
              title: "净额（元）",
              render: (_, row) =>
                compactMoney(
                  BigInt(row.income) - BigInt(row.refund) - BigInt(row.fee),
                ),
              align: "center",
            },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="center">
                230
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="center">
                10
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="center">
                20
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="center">
                200元
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
        <Button
          type="primary"
          size="large"
          onClick={() =>
            void message.info(
              "原打款请求P0018仍等待渠道回执，当前状态保持处理中",
            )
          }
        >
          查询原请求
        </Button>
      </Panel>
    </div>
  );
}

export function PublisherSettingsPage() {
  const { profile, saveProfile } = usePublisherPreview();
  const { bootstrap } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const queryClient = useQueryClient();
  const profileKey = ["personal", bootstrap.user?.id, "publisher-profile"];
  const query = useQuery({
    queryKey: profileKey,
    queryFn: () => api<PublisherProfileView>("/me/publisher-profile"),
  });
  const [payoutForm] = Form.useForm();
  const [editingPayout, setEditingPayout] = useState(false);
  const { message } = App.useApp();
  function updatePayout(values: { accountToken: string }) {
    try {
      saveProfile({
        ...profile,
        payoutMask: `********${values.accountToken.slice(-4)}`,
        payoutVerified: false,
      });
      payoutForm.resetFields();
      setEditingPayout(false);
      void message.info("收款资料掩码预览已更新，技术验证待接入");
    } catch (error) {
      void message.error((error as Error).message);
    }
  }
  return (
    <div className="publisher-settings-page">
      <PageHeading
        title="发布者设置"
        description="维护你的发布者信息、收款与技术验证设置，用于脚本服务的发布、交易与结算。"
      />
      <div className="publisher-settings-columns">
        <Panel title="基本信息">
          {query.isPending ? (
            <Skeleton active />
          ) : query.error ? (
            <Alert
              type="error"
              title="发布者资料暂时无法加载"
              description={query.error.message}
              action={
                <Button onClick={() => void query.refetch()}>重试</Button>
              }
            />
          ) : query.data?.profile ? (
            <PublisherProfileEditor
              profile={query.data.profile}
              terms={query.data.terms}
              formId="publisher-settings-form"
              layout="horizontal"
              descriptionLabel="服务简介"
              externalSubmit
              onSaved={(saved, values) => {
                queryClient.setQueryData(profileKey, {
                  ...query.data,
                  profile: saved,
                });
                if (prototype)
                  saveProfile({
                    ...profile,
                    publicName: saved.public_name,
                    description: saved.description,
                    contactEmail: values.contactEmail || profile.contactEmail,
                  });
                void message.success("发布者资料已保存");
              }}
              onReload={async () => {
                const result = await query.refetch();
                if (result.error) throw result.error;
              }}
            >
              {prototype && (
                <Form.Item
                  name="contactEmail"
                  label="联系邮箱"
                  initialValue={profile.contactEmail}
                  extra="联系邮箱仅供本地预览。公开联系说明随服务简介保存。"
                  rules={[{ type: "email" }, { max: 254 }]}
                >
                  <Input />
                </Form.Item>
              )}
            </PublisherProfileEditor>
          ) : (
            <Empty description="请先开通发布者工作区" />
          )}
        </Panel>
        <Panel title="收款与验证">
          <dl>
            <dt>收款账户</dt>
            <dd>{profile.payoutMask || "待配置"}</dd>
            <dt>技术验证</dt>
            <dd>
              <Status tone={profile.payoutVerified ? "green" : "orange"}>
                {profile.payoutVerified ? "✓ 已通过" : "待验证"}
              </Status>
            </dd>
          </dl>
          <Button
            disabled={!prototype}
            onClick={() => {
              payoutForm.resetFields();
              setEditingPayout(true);
            }}
          >
            更新收款资料
          </Button>
        </Panel>
      </div>
      <Notice>变更仅作用于新打款，在途使用原快照。</Notice>
      {!prototype && <Notice>收款资料与技术验证接口待接入。</Notice>}
      <Button
        type="primary"
        className="publisher-settings-save"
        htmlType="submit"
        form="publisher-settings-form"
        disabled={!query.data?.profile?.enabled}
      >
        保存设置
      </Button>
      <Modal
        title="更新收款资料"
        open={editingPayout}
        onCancel={() => {
          payoutForm.resetFields();
          setEditingPayout(false);
        }}
        onOk={() => payoutForm.submit()}
        okText="保存资料预览"
        cancelText="取消"
        forceRender
      >
        <Form form={payoutForm} layout="vertical" onFinish={updatePayout}>
          <Form.Item
            name="accountToken"
            label="收款账户令牌"
            rules={[{ required: true }, { min: 6, max: 8192 }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Notice>保存后生成新的资料版本，验证通过后可用于新打款。</Notice>
        </Form>
      </Modal>
    </div>
  );
}
