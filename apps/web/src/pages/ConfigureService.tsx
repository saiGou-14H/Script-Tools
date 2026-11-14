import { useRef, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { SchemaInput, type SchemaInputHandle } from "../components/SchemaInput";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import { Button, Modal, Radio, DatePicker, Skeleton, Alert, App } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { currency, useServices } from "./Market";
import { serviceDuration, serviceVersion } from "../lib/service-display";
import { useWorkspace } from "../context";
import { SourceUploadWidget } from "../components/SourceUploadWidget";
import { usePrototype } from "../prototype";
import { purchaseFixtures } from "../lib/consumer-preview";
import {
  PageHeading,
  Panel,
  Status,
  TileIcon,
  UsageBanner,
} from "../components/ui";

export function ConfigureServicePage() {
  const { data = [], isPending, error, refetch } = useServices();
  const { bootstrap } = useWorkspace();
  const { orders } = usePrototype();
  const { id } = useParams();
  const isPrototype = bootstrap.data_mode === "prototype";
  const purchase = isPrototype
    ? purchaseFixtures.find(
        (item) => item.id === (id === "demo" ? "clean" : id),
      )
    : undefined;
  const order = orders.find((item) => item.id === purchase?.orderId);
  const service =
    order?.serviceSnapshot ||
    data.find(
      (item) =>
        item.input_schema_digest === purchase?.schemaDigest &&
        item.script_version === purchase?.scriptVersion,
    );
  const [input, setInput] = useState<unknown>({});
  const [schedule, setSchedule] = useState("manual");
  const [runAt, setRunAt] = useState<Dayjs | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [preview, setPreview] = useState(false);
  const form = useRef<SchemaInputHandle>(null);
  const { message } = App.useApp();
  if (!isPrototype)
    return (
      <Alert
        type="info"
        title="权益服务待接入"
        description="已购服务版本、可用次数与授权范围待载入。"
        showIcon
      />
    );
  if (!purchase || !order)
    return <Alert type="warning" title="权益不存在或暂不可用" showIcon />;
  if (
    purchase.status !== "待使用" ||
    order.payment !== "PAID" ||
    order.fulfillment !== "AVAILABLE"
  )
    return (
      <Alert
        type="warning"
        title="本次权益当前不可配置"
        description="请返回已购服务核对使用状态与服务可用性。"
        showIcon
      />
    );
  if (isPending) return <Skeleton active />;
  if (error)
    return (
      <Alert
        type="error"
        title="已购服务版本无法加载"
        description={error.message}
        action={<Button onClick={() => void refetch()}>重试</Button>}
      />
    );
  if (!service)
    return (
      <Alert
        type="warning"
        title="已购服务版本暂未载入"
        description="需要与本单版本和参数Schema一致的服务资料。"
        showIcon
      />
    );
  const version = order.contract?.version || serviceVersion(service);
  const refundRule =
    order.contract?.refundRule || service.refund_policy.summary;
  const duration = serviceDuration(
    order.contract?.maxServiceSeconds || service.max_service_seconds,
  );
  const hasFileUpload =
    service.input_ui_schema?.source_file?.["ui:widget"] === "SourceUpload";
  const uiSchema: UiSchema = {
    ...service.input_ui_schema,
    "ui:submitButtonOptions": { norender: true },
  };
  function validate() {
    const inputValid = form.current?.validateForm();
    let error = "";
    if (schedule === "once") {
      if (!runAt) error = "请选择执行时间";
      else if (!runAt.isAfter(dayjs())) error = "执行时间须晚于当前时间";
      else if (
        order?.contract?.validUntil &&
        runAt.isAfter(dayjs(order.contract.validUntil).endOf("day"))
      )
        error = "执行时间须在本单可启动期限内";
    }
    setScheduleError(error);
    return inputValid && !error;
  }
  return (
    <div className="configure-page">
      <PageHeading
        title="配置与使用服务"
        extra={<Status tone="gray">本地示例</Status>}
      />
      <UsageBanner compact />
      <div className="configure-columns">
        <div>
          <Panel className="selected-service">
            <TileIcon name={service.delivery_policy.icon} />
            <div>
              <h2>
                {service.title} {version}
              </h2>
              <p>{service.description}</p>
            </div>
            <span>
              <Status tone="green">已支付</Status>　可用 1 次
            </span>
          </Panel>
          <Panel title="配置参数">
            <SchemaInput
              ref={form}
              schema={service.input_schema}
              uiSchema={uiSchema}
              formData={input}
              formContext={{
                labelCol: { flex: "166px" },
                wrapperCol: { flex: 1 },
                colon: false,
              }}
              onChange={setInput}
              widgets={{ SourceUpload: SourceUploadWidget }}
              showErrorList={false}
            />
            <div className="configuration-section">
              <label>
                执行计划 <em>*</em>
              </label>
              <Radio.Group
                value={schedule}
                onChange={(event) => {
                  setSchedule(event.target.value);
                  setScheduleError("");
                }}
              >
                <Radio value="manual">立即执行</Radio>
                <Radio value="once">指定时间</Radio>
              </Radio.Group>
              <DatePicker
                showTime
                aria-label="执行时间"
                value={runAt}
                onChange={(value) => {
                  setRunAt(value);
                  setScheduleError("");
                }}
                disabled={schedule === "manual"}
                placeholder="请选择执行时间"
                status={scheduleError ? "error" : undefined}
              />
              {scheduleError && (
                <p className="configuration-error" role="alert">
                  {scheduleError}
                </p>
              )}
            </div>
            <div className="configuration-section authorization-section">
              <h3>访问授权</h3>
              <label>
                授权预览 <em>*</em>
              </label>
              <div className="authorization-scope">
                <LockOutlined />{" "}
                {hasFileUpload ? "仅访问本次上传文件" : "授权范围待服务端核对"}
              </div>
            </div>
          </Panel>
        </div>
        <Panel title="服务摘要" className="service-summary">
          <dl>
            <dt>服务名称</dt>
            <dd>
              {service.title} {version}
            </dd>
            <dt>使用次数</dt>
            <dd>1 次（本单仅一次完整服务）</dd>
            <dt>支付金额</dt>
            <dd className="price-blue">{currency(order.amountMinor)} 元</dd>
            <dt>退款规则</dt>
            <dd>{refundRule}，成交后固定</dd>
            <dt>最长执行时间</dt>
            <dd>{duration}</dd>
          </dl>
          <hr />
          <dl>
            <dt>下单日期</dt>
            <dd>{order.createdAt}</dd>
            <dt>可启动至</dt>
            <dd>{order.contract?.validUntil || "以订单权益期限为准"}</dd>
          </dl>
          <div className="summary-actions">
            <Button
              size="large"
              onClick={() => {
                if (validate()) setPreview(true);
              }}
            >
              预览配置
            </Button>
            <Button
              size="large"
              type="primary"
              onClick={() => {
                if (validate())
                  void message.info("执行模块正在接入，配置已通过前端校验");
              }}
            >
              开始使用
            </Button>
          </div>
        </Panel>
      </div>
      <Modal
        title="执行配置预览"
        open={preview}
        onCancel={() => setPreview(false)}
        footer={
          <Button type="primary" onClick={() => setPreview(false)}>
            返回配置
          </Button>
        }
      >
        <p>服务 {service.title} · 一次完整使用</p>
        <p>执行计划 {schedule === "manual" ? "立即执行" : "指定时间"}</p>
        {schedule === "once" && (
          <p>执行时间 {runAt?.format("YYYY-MM-DD HH:mm:ss")}（本地时区）</p>
        )}
        <p>
          关联权益 {purchase.id} · {order.id}
        </p>
        <p>参数Schema {service.input_schema_digest}</p>
        <pre>{JSON.stringify(input, null, 2)}</pre>
      </Modal>
    </div>
  );
}
