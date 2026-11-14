import { useRef, useState } from "react";
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
} from "antd";
import { Notice, PageHeading, Panel, Status } from "../components/ui";
import { useAdminPreview, type CommercePolicyPreview } from "../admin-preview";
import { formatMinorUnits } from "../lib/money";

function feeBasisPoints(value: string) {
  if (!/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/.test(value))
    throw new Error("费率须为0至100之间的数值，最多两位小数");
  const [whole, fraction = ""] = value.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (basisPoints > 10000)
    throw new Error("费率须为0至100之间的数值，最多两位小数");
  return basisPoints;
}

function PolicyForm({
  policy,
  readOnly,
  onSaved,
}: {
  policy: CommercePolicyPreview;
  readOnly: boolean;
  onSaved: (version: number) => void;
}) {
  const { savePolicy } = useAdminPreview();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const requestKey = useRef(crypto.randomUUID());
  const watchedRate = Form.useWatch("rate", form) as string | undefined;
  const bearer = Form.useWatch("channelCostBearer", form) as
    CommercePolicyPreview["channelCostBearer"] | undefined;
  const rate = watchedRate ?? String(policy.feeBasisPoints / 100);
  let exampleFee: number | null = null;
  try {
    exampleFee = feeBasisPoints(rate);
  } catch {
    /* Field validation explains an invalid rate. */
  }
  return (
    <Panel
      title={`规则配置（v${policy.version}）`}
      className="admin-policy-form"
    >
      <Form
        form={form}
        labelCol={{ flex: "178px" }}
        labelAlign="start"
        wrapperCol={{ flex: 1 }}
        disabled={readOnly}
        initialValues={{
          currency: policy.currency,
          rate: String(policy.feeBasisPoints / 100),
          channelCostBearer: policy.channelCostBearer,
          settlementDays: policy.settlementDays,
          refundDays: policy.refundDays,
        }}
        onValuesChange={() => {
          requestKey.current = crypto.randomUUID();
        }}
        onFinish={(values) => {
          savePolicy({
            currency: values.currency,
            feeBasisPoints: feeBasisPoints(values.rate),
            channelCostBearer: values.channelCostBearer,
            settlementDays: values.settlementDays,
            refundDays: values.refundDays,
            requestKey: requestKey.current,
          });
          onSaved(policy.version);
          void message.success("新费用规则预览已保存，仅用于后续报价预览");
        }}
      >
        <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
          <Select options={[{ value: "CNY", label: "CNY（人民币）" }]} />
        </Form.Item>
        <Form.Item
          name="rate"
          label="平台费率"
          extra="示例 · 5%（非确定费率，实际费率可根据业务调整）"
          rules={[
            { required: true, message: "请填写平台费率" },
            {
              validator: async (_, value) => {
                feeBasisPoints(value || "");
              },
            },
          ]}
        >
          <Input aria-label="平台费率" maxLength={6} suffix="%" />
        </Form.Item>
        <Form.Item
          name="channelCostBearer"
          label="渠道费承担方"
          rules={[{ required: true }]}
        >
          <Radio.Group
            options={[
              { value: "PLATFORM", label: "由平台承担" },
              { value: "CONSUMER", label: "由用户承担" },
              { value: "PUBLISHER", label: "由发布者承担" },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="settlementDays"
          label="结算等待"
          extra="示例 · 7天（订单完成后等待指定天数再进入结算）"
          rules={[
            { required: true },
            {
              type: "integer",
              min: 0,
              max: 365,
              message: "请输入0至365天的整数",
            },
          ]}
        >
          <InputNumber
            min={0}
            max={365}
            precision={0}
            controls={false}
            suffix="天"
            aria-label="结算等待"
          />
        </Form.Item>
        <Form.Item
          name="refundDays"
          label="退款核验处理期限"
          extra="核验超期按公示规则处理，实际到账以渠道回执为准。"
          rules={[
            { required: true },
            {
              type: "integer",
              min: 0,
              max: 365,
              message: "请输入0至365天的整数",
            },
          ]}
        >
          <InputNumber
            min={0}
            max={365}
            precision={0}
            controls={false}
            suffix="天"
            aria-label="退款核验处理期限"
          />
        </Form.Item>
        <div className="admin-policy-example">
          <Notice>
            <b>配置样例（示例，非确定费率）</b>
          </Notice>
          <p>
            示例 · 用户应付100元，平台费
            {exampleFee === null ? "—" : formatMinorUnits(String(exampleFee))}
            元，发布者净额
            {exampleFee === null
              ? "—"
              : formatMinorUnits(10000n - BigInt(exampleFee))}
            元，渠道费用
            {(bearer || policy.channelCostBearer) === "PLATFORM"
              ? "由平台另行承担"
              : (bearer || policy.channelCostBearer) === "CONSUMER"
                ? "由用户承担，随实时报价展示"
                : "由发布者承担，按成交报价扣除"}
            。
          </p>
          <div>
            {[
              ["用户应付", "100.00"],
              [
                "平台费",
                exampleFee === null
                  ? "—"
                  : formatMinorUnits(String(exampleFee)),
              ],
              [
                "发布者净额",
                exampleFee === null
                  ? "—"
                  : formatMinorUnits(10000n - BigInt(exampleFee)),
              ],
            ].map(([label, amount]) => (
              <article key={label}>
                {label}
                <strong>{amount} 元</strong>
              </article>
            ))}
          </div>
        </div>
        {!readOnly && (
          <Button type="primary" htmlType="submit">
            保存新版本
          </Button>
        )}
      </Form>
    </Panel>
  );
}

export function AdminCommercePolicyPage() {
  const { policies, enabled } = useAdminPreview();
  const [selected, setSelected] = useState<number | "draft">("draft");
  const current = policies.at(-1);
  if (!enabled || !current)
    return (
      <div className="admin-page">
        <PageHeading title="费用与结算规则" />
        <Empty description="暂无费用规则，管理接口尚未接入" />
      </div>
    );
  const policy =
    selected === "draft"
      ? { ...current, version: current.version + 1 }
      : policies.find((item) => item.version === selected) || current;
  return (
    <div className="admin-page admin-policy-page">
      <PageHeading
        title="费用与结算规则"
        description="配置平台计费与结算相关规则，生成新版本规则用于后续报价与结算。"
      />
      <div className="admin-policy-versions">
        <button
          type="button"
          aria-pressed={selected !== "draft"}
          className={selected !== "draft" ? "selected" : ""}
          onClick={() => setSelected(current.version)}
        >
          <span
            className={`policy-version-radio ${selected !== "draft" ? "checked" : ""}`}
            aria-hidden="true"
          />
          <span>
            <b>
              v{current.version}（当前生效）{" "}
              <Status tone="green">当前生效</Status>
            </b>
            <small>当前对报价与结算生效</small>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={selected === "draft"}
          className={selected === "draft" ? "selected" : ""}
          onClick={() => setSelected("draft")}
        >
          <span
            className={`policy-version-radio ${selected === "draft" ? "checked" : ""}`}
            aria-hidden="true"
          />
          <span>
            <b>
              v{current.version + 1}（新版本草稿） <Status>新版本草稿</Status>
            </b>
            <small>保存后将作为下个生效版本</small>
          </span>
        </button>
      </div>
      <div className="admin-policy-columns">
        <PolicyForm
          key={
            selected === "draft" ? `draft-${current.version}` : policy.version
          }
          policy={policy}
          readOnly={selected !== "draft"}
          onSaved={setSelected}
        />
        <Panel title="影响预览" className="admin-policy-impact">
          <Notice>
            <b>仅影响新报价，旧订单按快照执行。</b>
          </Notice>
          <ul>
            <li>保存为新版本后，将用于后续的服务报价与结算。</li>
            <li>
              已生成的订单按当时的规则快照执行，成交费用与结算记录可追溯。
            </li>
          </ul>
          {policies.length > 1 && (
            <div className="admin-policy-history">
              <h3>规则历史版本</h3>
              <Select
                aria-label="规则历史版本"
                value={selected === "draft" ? undefined : selected}
                placeholder="查看历史规则快照"
                onChange={setSelected}
                options={policies.map((item) => ({
                  value: item.version,
                  label: `v${item.version} · ${(item.feeBasisPoints / 100).toFixed(2)}%`,
                }))}
              />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
