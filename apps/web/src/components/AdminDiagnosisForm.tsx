import { App, Button, Form, Input, Select } from "antd";
import { useId } from "react";
import { useWorkspace } from "../context";

export function AdminDiagnosisForm({
  resourceId,
  resourceLabel = "对象",
  readOnly = false,
}: {
  resourceId?: string;
  resourceLabel?: string;
  readOnly?: boolean;
}) {
  const { bootstrap } = useWorkspace();
  const formId = useId();
  const { message } = App.useApp();
  return (
    <Form
      name={`diagnosis-${formId}`}
      layout="vertical"
      initialValues={{
        resource: resourceId,
        fields: readOnly ? "run_summary" : undefined,
        minutes: 30,
      }}
      key={resourceId || "custom"}
      onFinish={() => void message.info("排障接口尚未接入，未签发访问会话")}
    >
      <Form.Item
        name="resource"
        label={resourceLabel}
        rules={[
          { required: true, whitespace: true, message: "请填写排障对象" },
        ]}
      >
        <Input readOnly={readOnly} placeholder="请输入对象ID，如 Run082" />
      </Form.Item>
      <Form.Item
        name="reason"
        label="理由"
        rules={[
          { required: true, whitespace: true, message: "请填写排障理由" },
        ]}
      >
        <Input.TextArea
          placeholder="请输入排障理由，说明需要定位的问题（必填）"
          maxLength={200}
          showCount
          rows={3}
        />
      </Form.Item>
      <div className="diagnosis-field-row">
        <Form.Item
          name="fields"
          label="字段范围"
          rules={[{ required: true, message: "请选择字段范围" }]}
        >
          <Select
            placeholder="请选择字段范围"
            options={[
              { value: "run_summary", label: "脱敏运行摘要" },
              { value: "output_metadata", label: "产物元数据" },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="ticket"
          label="工单编号"
          rules={[
            { required: true, whitespace: true, message: "请填写工单编号" },
          ]}
        >
          <Input maxLength={100} />
        </Form.Item>
      </div>
      <Form.Item name="minutes" label="访问有效期" rules={[{ required: true }]}>
        <Select
          options={[
            { value: 30, label: "30 分钟" },
            { value: 60, label: "60 分钟" },
          ]}
        />
      </Form.Item>
      <Button
        type="primary"
        htmlType="submit"
        block
        disabled={!bootstrap.user?.capabilities.includes("data.diagnose")}
      >
        开启限时会话
      </Button>
      <small>需要data.diagnose权限，密钥不可读</small>
    </Form>
  );
}
