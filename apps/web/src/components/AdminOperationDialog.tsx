import { useId, useRef, type ReactNode } from "react";
import { App, Form, Input, Modal } from "antd";

export function AdminOperationDialog({
  title,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  onConfirm: (reason: string, requestKey: string) => void;
  onClose: () => void;
}) {
  const [form] = Form.useForm();
  const formId = useId();
  const requestKey = useRef(crypto.randomUUID());
  const submitted = useRef(false);
  const { message } = App.useApp();
  return (
    <Modal
      open
      title={title}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="确认操作预览"
      cancelText="返回"
    >
      <Form
        name={`operation-${formId}`}
        form={form}
        layout="vertical"
        onValuesChange={() => {
          requestKey.current = crypto.randomUUID();
        }}
        onFinish={(values) => {
          if (submitted.current) return;
          try {
            onConfirm(values.reason, requestKey.current);
            submitted.current = true;
            onClose();
            void message.success("本地操作预览已保存");
          } catch (error) {
            void message.error(
              error instanceof Error ? error.message : "操作失败",
            );
          }
        }}
      >
        {children}
        <Form.Item
          label="处理理由"
          name="reason"
          rules={[
            { required: true, whitespace: true, message: "请填写处理理由" },
          ]}
        >
          <Input.TextArea rows={3} showCount maxLength={200} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
