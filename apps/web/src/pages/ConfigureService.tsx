import { useRef, useState } from "react";
import Form from "@rjsf/antd";
import CoreForm from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import { Button, Modal, Radio, DatePicker, Skeleton, Alert, App } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { currency, useServices } from "./Market";
import { serviceDuration, serviceVersion } from "../lib/service-display";
import { useWorkspace } from "../context";
import { SourceUploadWidget } from "../components/SourceUploadWidget";
import {
  PageHeading,
  Panel,
  Status,
  TileIcon,
  UsageBanner,
} from "../components/ui";

export function ConfigureServicePage() {
  const { data = [], isPending } = useServices();
  const { bootstrap } = useWorkspace();
  const { id } = useParams();
  const service =
    data.find((item) => item.id === id) ||
    (id === "demo" && bootstrap.data_mode === "prototype"
      ? data.find((item) => item.delivery_policy.icon === "table")
      : undefined);
  const [input, setInput] = useState<Record<string, unknown>>({});
  const [schedule, setSchedule] = useState("manual");
  const [preview, setPreview] = useState(false);
  const form = useRef<CoreForm<Record<string, unknown>>>(null);
  const { message } = App.useApp();
  if (isPending) return <Skeleton active />;
  if (!service) return <Alert type="warning" title="请先选择可使用的服务" />;
  const uiSchema: UiSchema = {
    ...service.input_ui_schema,
    "ui:submitButtonOptions": { norender: true },
  };
  function validate() {
    return form.current?.validateForm();
  }
  return (
    <>
      <PageHeading title="配置与使用服务" />
      <UsageBanner compact />
      <div className="configure-columns">
        <div>
          <Panel className="selected-service">
            <TileIcon name={service.delivery_policy.icon} />
            <div>
              <h2>
                {service.title} {serviceVersion(service)}
              </h2>
              <p>{service.description}</p>
            </div>
            <span>
              <Status tone="green">已支付</Status>　可用 1 次
            </span>
          </Panel>
          <Panel title="配置参数">
            <Form
              ref={form}
              schema={service.input_schema as RJSFSchema}
              uiSchema={uiSchema}
              formData={input}
              validator={validator}
              formContext={{
                labelCol: { flex: "160px" },
                wrapperCol: { flex: 1 },
                colon: false,
              }}
              onChange={(event) => setInput(event.formData || {})}
              widgets={{ SourceUpload: SourceUploadWidget }}
              showErrorList={false}
            />
            <div className="configuration-section">
              <label>
                执行计划 <em>*</em>
              </label>
              <Radio.Group
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
              >
                <Radio value="manual">立即执行</Radio>
                <Radio value="once">指定时间</Radio>
              </Radio.Group>
              <DatePicker
                showTime
                disabled={schedule === "manual"}
                placeholder="请选择执行时间"
              />
            </div>
            <div className="configuration-section authorization-section">
              <h3>访问授权</h3>
              <label>
                授权预览 <em>*</em>
              </label>
              <div className="authorization-scope">
                <LockOutlined /> 仅访问本次上传文件
              </div>
            </div>
          </Panel>
        </div>
        <Panel title="服务摘要" className="service-summary">
          <dl>
            <dt>服务名称</dt>
            <dd>
              {service.title} {serviceVersion(service)}
            </dd>
            <dt>使用次数</dt>
            <dd>1 次（本单仅一次完整服务）</dd>
            <dt>支付金额</dt>
            <dd className="price-blue">{currency(service.amount_minor)} 元</dd>
            <dt>退款规则</dt>
            <dd>{service.refund_policy.summary}，成交后固定</dd>
            <dt>最长执行时间</dt>
            <dd>{serviceDuration(service.max_service_seconds)}</dd>
          </dl>
          <hr />
          <dl>
            <dt>下单日期</dt>
            <dd>2026-11-13</dd>
            <dt>可启动至</dt>
            <dd>2026-11-20</dd>
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
        <pre>{JSON.stringify(input, null, 2)}</pre>
      </Modal>
    </>
  );
}
