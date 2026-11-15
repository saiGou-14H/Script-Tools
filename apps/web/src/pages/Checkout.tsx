import type { RJSFSchema } from "@rjsf/utils";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Empty,
  Modal,
  Radio,
  Skeleton,
} from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  InfoCircleOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  findPreviewOrder,
  usePrototype,
  type PreviewOrder,
} from "../prototype";
import { useWorkspace } from "../context";
import { PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useServices, currency } from "./Market";
import { PurchaseSteps } from "./Orders";
import { validatorForSchema } from "../lib/schema-validator";
import { SchemaInput, type SchemaInputHandle } from "../components/SchemaInput";
import {
  serviceAvailable,
  serviceDate,
  serviceDuration,
  serviceVersion,
} from "../lib/service-display";
import { readTravelContext } from "../lib/public-travel";
import { SourceUploadWidget } from "../components/SourceUploadWidget";

const tableExampleInput = {
  source_file: "客户数据-示例.csv",
  deduplicate_by: "邮箱",
  output_format: "CSV",
};

export function CheckoutPage() {
  const { bootstrap } = useWorkspace();
  const [params] = useSearchParams();
  const { data = [], isPending, error, refetch } = useServices();
  const serviceId = params.get("service");
  const service = serviceId
    ? data.find((item) => item.id === serviceId)
    : data.find((item) => item.delivery_policy.icon === "table");
  const [accepted, setAccepted] = useState(bootstrap.data_mode === "prototype");
  const [sample, setSample] = useState(false);
  const { createOrder } = usePrototype();
  const { message } = App.useApp();
  const requestKey = useRef(crypto.randomUUID());
  const form = useRef<SchemaInputHandle>(null);
  const [input, setInput] = useState<unknown>({});
  const navigate = useNavigate();
  useEffect(() => {
    setInput({});
    setAccepted(bootstrap.data_mode === "prototype");
    requestKey.current = crypto.randomUUID();
  }, [
    params,
    service?.id,
    service?.release_id,
    service?.price_plan_id,
    service?.input_schema_digest,
    bootstrap.data_mode,
  ]);
  if (isPending) return <Skeleton active />;
  if (error)
    return (
      <Alert
        type="error"
        title="服务暂时无法加载"
        description={error.message}
        showIcon
        action={<Button onClick={() => void refetch()}>重试</Button>}
      />
    );
  if (!service) return <Empty description="服务不存在或暂不可购买" />;
  const travel =
    service.scene_key === "travel"
      ? readTravelContext(params, bootstrap.data_mode === "prototype")
      : undefined;
  if (travel?.invalid)
    return <Empty description="景点或预约条件无效，请返回城市与景点重新选择" />;
  const available =
    serviceAvailable(service) && travel?.attraction?.open !== false;
  const tableExample =
    bootstrap.data_mode === "prototype" &&
    service.input_schema_digest === "schema-table" &&
    typeof service.input_schema === "object";
  let hasTableExample = false;
  if (tableExample) {
    try {
      hasTableExample =
        validatorForSchema(service.input_schema).validateFormData(
          tableExampleInput,
          service.input_schema as RJSFSchema,
        ).errors.length === 0;
    } catch {
      // SchemaInput renders compilation errors and blocks submission.
    }
  }
  function submit() {
    if (!service || !accepted || !available) return;
    if (!hasTableExample && !form.current?.validateForm()) return;
    const submittedInput = hasTableExample
      ? tableExampleInput
      : form.current?.getValue();
    try {
      const order = createOrder(service, requestKey.current, submittedInput);
      navigate(`/checkout/${order.id}/pay`);
    } catch (error) {
      void message.error(
        error instanceof Error ? error.message : "创建订单失败",
      );
    }
  }
  return (
    <div className="checkout-page">
      <PageHeading
        title="确认订单"
        description="核对服务信息与规则，确认后提交订单并完成支付，即可使用服务。"
      />
      <PurchaseSteps current={0} />
      <div className="checkout-grid">
        <Panel className="checkout-contract">
          <div className="checkout-service">
            <TileIcon name={service.delivery_policy.icon} />
            <div>
              <h2>
                购买{service.title} {serviceVersion(service)}{" "}
                <Status>{service.category}</Status>
                {hasTableExample && <Status>表格工具</Status>}
                <Status tone="green">{serviceVersion(service)}</Status>
              </h2>
              <p>
                {hasTableExample
                  ? "对输入的表格文件进行清洗与规范化处理，提升数据质量。"
                  : service.description}
              </p>
            </div>
            <div className="muted">
              <p>发布者　{service.delivery_policy.publisher_name}</p>
              <p>更新日期　{serviceDate(service.updated_at)}</p>
            </div>
          </div>
          <h3>服务输入与参数</h3>
          {travel && (
            <Alert
              className="checkout-travel-context"
              type="info"
              title="预约场景条件"
              description={`${travel.attraction ? `${travel.attraction.city} · ${travel.attraction.title}，` : ""}${travel.date || "日期待配置"}，${travel.slot || "场次待配置"}，${travel.partySize ? `${travel.partySize}人` : "人数待配置"}。脚本输入按下方发布者Schema填写。`}
              showIcon
            />
          )}
          {hasTableExample ? (
            <div className="checkout-input-summary">
              <div>
                <b>输入文件</b>
                <span>
                  <span className="checkout-file-format">CSV</span>
                  <span>
                    <strong>客户数据-示例.csv</strong>
                    <small>CSV · 12.3 KB</small>
                  </span>
                  <Button onClick={() => setSample(true)}>查看样例</Button>
                </span>
              </div>
              <div>
                <b>去重字段</b>
                <span>邮箱</span>
              </div>
              <div>
                <b>参数预检</b>
                <span>
                  <Status tone="green">
                    <CheckCircleFilled /> 通过
                  </Status>
                  <span className="muted">
                    示例参数符合当前Schema，文件上传与服务端预检继续接入。
                  </span>
                </span>
              </div>
            </div>
          ) : (
            <>
              {tableExample && (
                <Alert
                  className="checkout-schema-change"
                  type="info"
                  title="示例参数与当前Schema不一致，请重新填写服务输入"
                  showIcon
                />
              )}
              <SchemaInput
                key={`${service.id}-${service.release_id}-${service.price_plan_id}-${service.input_schema_digest}`}
                ref={form}
                schema={service.input_schema}
                uiSchema={{
                  ...service.input_ui_schema,
                  "ui:submitButtonOptions": { norender: true },
                }}
                widgets={{ SourceUpload: SourceUploadWidget }}
                formData={input}
                onChange={setInput}
                showErrorList={false}
                onError={() => undefined}
              />
            </>
          )}
          <h3>服务说明</h3>
          <div className="policy-box policy-blue">
            <InfoCircleOutlined />
            <div>
              <b>单次服务说明</b>
              <ul>
                <li>
                  处理时长　{serviceDuration(service.max_service_seconds)}
                </li>
                <li>服务范围　一次完整执行</li>
                <li>
                  费用说明　含同次接续，在同一次服务过程中，为达成目标而进行的必要补充处理不额外收费。
                </li>
              </ul>
            </div>
          </div>
          <div className="policy-box policy-purple">
            <TileIcon name="shield" color="purple" />
            <div>
              <b>退款政策</b>
              <ul>
                <li>{service.refund_policy.summary}</li>
                <li>未执行　全额退款</li>
              </ul>
            </div>
          </div>
        </Panel>
        <Panel title="结算信息" className="checkout-settlement">
          <dl>
            <dt>数量</dt>
            <dd>1</dd>
            <dt>服务费</dt>
            <dd>¥{currency(service.amount_minor)}</dd>
          </dl>
          <div className="checkout-total">
            <b>应付</b>
            <strong>¥{currency(service.amount_minor)}</strong>
          </div>
          <Checkbox
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          >
            我已阅读并同意价格说明和退款规则。
          </Checkbox>
          <Button
            type="primary"
            size="large"
            block
            disabled={!accepted || !available}
            onClick={submit}
          >
            提交订单
          </Button>
          {!available && (
            <Alert type="warning" title="服务当前不可购买" showIcon />
          )}
          <p className="muted">
            {bootstrap.data_mode === "prototype"
              ? "本地开发示例价格与订单"
              : "价格与交付规则以服务端报价为准"}
          </p>
        </Panel>
      </div>
      <Modal
        title="输入文件样例"
        open={sample}
        onCancel={() => setSample(false)}
        footer={<Button onClick={() => setSample(false)}>关闭</Button>}
      >
        <pre>
          姓名,邮箱,地区{"\n"}张三,zhang@example.invalid,北京{"\n"}
          李四,li@example.invalid,上海
        </pre>
      </Modal>
    </div>
  );
}

const paymentPixels = [
  0, 1, 3, 5, 7, 9, 12, 13, 16, 18, 19, 22, 24, 26, 29, 31, 34, 35,
];

function PaymentDeadline({ order }: { order: PreviewOrder }) {
  const [now, setNow] = useState(Date.now);
  const expiresAt = Date.parse(order.paymentExpiresAt || "");
  const isWaiting =
    order.payment === "UNPAID" && order.fulfillment !== "CLOSED";
  useEffect(() => {
    if (!isWaiting || !Number.isFinite(expiresAt)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isWaiting, expiresAt]);
  if (order.payment === "PAID")
    return <div className="payment-countdown">支付已确认</div>;
  if (!isWaiting) return <div className="payment-countdown">订单已关闭</div>;
  if (!Number.isFinite(expiresAt))
    return <div className="payment-countdown">支付期限待载入</div>;
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const remaining = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return (
    <div className="payment-countdown" role="timer" aria-live="off">
      {seconds > 0 ? "支付剩余时间" : "支付期限已到"}
      <strong>{remaining}</strong>
    </div>
  );
}

export function CashierPage() {
  const { orderId } = useParams();
  const { orders, cancelUnpaidOrder } = usePrototype();
  const { bootstrap } = useWorkspace();
  const order = findPreviewOrder(
    orders,
    orderId === "demo" ? "OD202611130003" : orderId,
  );
  const [channel, setChannel] = useState("demo-a");
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  if (!order) return <Empty description="订单不存在或已失效" />;
  const amount = currency(order.amountMinor);
  const refundRule =
    order.contract?.refundRule ||
    order.serviceSnapshot?.refund_policy.summary ||
    "退款规则待载入";
  function cancel() {
    if (!order) return;
    modal.confirm({
      title: "取消订单",
      content: "确认取消本次未支付订单？",
      okText: "确认取消",
      cancelText: "返回",
      onOk: () => {
        cancelUnpaidOrder(order.id);
        navigate("/me/orders");
      },
    });
  }
  return (
    <div className="cashier-page">
      <PageHeading title="收银台" />
      <div className="cashier-grid">
        <div>
          <div className="cashier-info">
            <InfoCircleOutlined />{" "}
            付款确认后开通一次使用权益。如已付款，请等待确认。
          </div>
          <Panel className="cashier-main">
            <div className="cashier-order-strip">
              <span>
                订单编号　<b>{order.id}</b>
              </span>
              <span>
                服务名称　<b>{order.title}</b>
              </span>
              <span>
                下单日期　<b>{order.createdAt}</b>
              </span>
              <span>
                应付金额　<strong>¥{amount}</strong>
              </span>
            </div>
            <div className="payment-content">
              <section className="payment-channel">
                <h2>支付方式</h2>
                <Radio.Group
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                >
                  <Radio value="demo-a">
                    <WalletOutlined /> 示例支付渠道A
                  </Radio>
                </Radio.Group>
              </section>
              <section className="payment-illustration">
                <div
                  className="payment-code"
                  aria-label="支付界面示意，不含真实支付码"
                >
                  {Array.from({ length: 36 }, (_, index) => (
                    <i
                      key={index}
                      className={paymentPixels.includes(index) ? "filled" : ""}
                    />
                  ))}
                </div>
                <b>支付界面示意</b>
                <PaymentDeadline key={order.id} order={order} />
              </section>
              <section className="payment-status">
                <p>支付状态</p>
                <Status tone={order.payment === "PAID" ? "green" : "orange"}>
                  {order.payment === "PAID" ? (
                    <CheckCircleFilled />
                  ) : (
                    <ClockCircleOutlined />
                  )}{" "}
                  {order.payment === "PAID"
                    ? "已支付"
                    : order.fulfillment === "CLOSED"
                      ? "订单已关闭"
                      : "等待支付"}
                </Status>
                <Button
                  type="primary"
                  size="large"
                  onClick={() =>
                    void message.info(
                      order.payment === "PAID"
                        ? "此订单已确认支付"
                        : order.fulfillment === "CLOSED"
                          ? "订单已关闭"
                          : "尚未收到支付确认回执，请等待渠道确认",
                    )
                  }
                >
                  查看支付状态
                </Button>
                <Button
                  size="large"
                  onClick={cancel}
                  disabled={
                    order.fulfillment === "CLOSED" || order.payment === "PAID"
                  }
                >
                  取消订单
                </Button>
              </section>
            </div>
          </Panel>
          <Panel className="cashier-reminder">
            <h3>
              <InfoCircleOutlined /> 重要提示
            </h3>
            <ul>
              <li>
                本订单为一次完整服务，成功支付后获得该脚本的一次使用权益，同次执行的接续操作不额外收费。
              </li>
              <li>门票0元不等于脚本服务免费，脚本服务按本订单所示价格计费。</li>
              <li>
                未达目标的退款规则由发布者选择，购买前已展示并在成交后固定执行。
              </li>
            </ul>
          </Panel>
        </div>
        <aside>
          <Panel title="订单概要">
            <dl>
              <dt>订单编号</dt>
              <dd>{order.id}</dd>
              <dt>服务名称</dt>
              <dd>{order.title}</dd>
              <dt>服务类型</dt>
              <dd>{order.serviceSnapshot?.category || "服务类型待载入"}</dd>
              <dt>下单日期</dt>
              <dd>{order.createdAt}</dd>
              <dt>应付金额</dt>
              <dd className="price-blue">¥{amount}</dd>
            </dl>
          </Panel>
          <Panel title="退款规则">
            <p>本服务未达目标时的退款规则，由发布者选择并在购买前展示。</p>
            <div className="refund-rule-highlight">{refundRule}</div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
