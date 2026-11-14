import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Checkbox, Form, Input, Modal } from "antd";
import { ApiError, api } from "../api";
import type { PublisherProfile, PublisherProfileView } from "../types";

export interface PublisherProfileValues {
  public_name: string;
  description: string;
  accepted_terms: boolean;
  contactEmail?: string;
}

export function PublisherProfileEditor({
  profile,
  terms,
  defaultName = "",
  requireConsent = false,
  formId = "publisher-profile-form",
  layout = "vertical",
  children,
  onSaved,
  onReload,
  submitLabel = "保存资料",
  externalSubmit = false,
  descriptionLabel = "服务简介与联系说明",
}: {
  profile: PublisherProfile | null;
  terms: PublisherProfileView["terms"];
  defaultName?: string;
  requireConsent?: boolean;
  formId?: string;
  layout?: "vertical" | "horizontal";
  children?: ReactNode;
  onSaved: (
    profile: PublisherProfile,
    values: PublisherProfileValues,
  ) => void | Promise<void>;
  onReload: () => Promise<void>;
  submitLabel?: string;
  externalSubmit?: boolean;
  descriptionLabel?: string;
}) {
  const [form] = Form.useForm<PublisherProfileValues>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const busy = useRef(false);
  const intent = useRef<
    | {
        key: string;
        signature: string;
        revision?: string;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    form.setFieldsValue({
      public_name: profile?.public_name || defaultName,
      description: profile?.description || "",
    });
    intent.current = undefined;
  }, [profile?.id, profile?.revision]);
  useEffect(() => {
    form.setFieldValue(
      "accepted_terms",
      !requireConsent && profile?.terms_version === terms.version,
    );
  }, [terms.version, profile?.terms_version, requireConsent]);
  async function submit(values: PublisherProfileValues) {
    if (busy.current) return;
    const body = {
      public_name: values.public_name,
      description: values.description,
      accepted_terms_version: terms.version,
    };
    const signature = JSON.stringify(body);
    if (!intent.current || intent.current.signature !== signature)
      intent.current = {
        key: crypto.randomUUID(),
        signature,
        revision: profile?.revision,
      };
    busy.current = true;
    setLoading(true);
    setError(undefined);
    try {
      const saved = await api<PublisherProfile>("/me/publisher-profile", {
        method: "POST",
        headers: {
          "Idempotency-Key": intent.current.key,
          ...(intent.current.revision
            ? { "If-Match": `"${intent.current.revision}"` }
            : {}),
        },
        body: JSON.stringify(body),
      });
      await onSaved(saved, values);
      intent.current = undefined;
    } catch (failure) {
      const problem =
        failure instanceof Error
          ? failure
          : new Error("资料暂时无法保存，请稍后重试");
      setError(problem);
      if (problem instanceof ApiError) {
        const fields: Record<string, keyof PublisherProfileValues> = {
          "/public_name": "public_name",
          "/description": "description",
          "/accepted_terms_version": "accepted_terms",
        };
        form.setFields(
          problem.fieldErrors
            .filter((field) => fields[field.path])
            .map((field) => ({
              name: fields[field.path],
              errors: [field.message],
            })),
        );
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  async function reload() {
    try {
      await onReload();
      setError(undefined);
    } catch (failure) {
      setError(failure as Error);
    }
  }
  return (
    <>
      {error && (
        <Alert
          className="publisher-profile-error"
          type="error"
          title={error.message}
          showIcon
          action={
            error instanceof ApiError && [412, 428].includes(error.status) ? (
              <Button onClick={() => void reload()}>加载最新资料</Button>
            ) : undefined
          }
        />
      )}
      <Form
        id={formId}
        form={form}
        layout={layout}
        labelAlign="left"
        colon={false}
        labelCol={layout === "horizontal" ? { flex: "125px" } : undefined}
        wrapperCol={layout === "horizontal" ? { flex: 1 } : undefined}
        onFinish={(values) => void submit(values)}
      >
        <Form.Item
          name="public_name"
          label="公开昵称"
          rules={[
            { required: true, whitespace: true, message: "请填写公开昵称" },
            { max: 120 },
          ]}
        >
          <Input maxLength={120} showCount />
        </Form.Item>
        <Form.Item
          name="description"
          label={descriptionLabel}
          rules={[
            {
              required: true,
              whitespace: true,
              message: "请填写服务简介与公开联系说明",
            },
            { max: 10000 },
          ]}
        >
          <Input.TextArea maxLength={10000} rows={4} showCount />
        </Form.Item>
        {children}
        <Form.Item
          name="accepted_terms"
          valuePropName="checked"
          rules={[
            {
              validator: (_, value) =>
                value === true
                  ? Promise.resolve()
                  : Promise.reject(new Error("请阅读并同意发布者服务约定")),
            },
          ]}
        >
          <Checkbox>我已阅读并同意发布者服务约定</Checkbox>
        </Form.Item>
        <Button
          className="publisher-terms-link"
          type="link"
          onClick={() => setTermsOpen(true)}
        >
          阅读服务约定 {terms.version}
        </Button>
        {!externalSubmit && (
          <Button
            className="publisher-profile-submit"
            htmlType="submit"
            type="primary"
            loading={loading}
          >
            {submitLabel}
          </Button>
        )}
      </Form>
      <Modal
        title={`发布者服务约定 ${terms.version}`}
        open={termsOpen}
        onCancel={() => setTermsOpen(false)}
        footer={<Button onClick={() => setTermsOpen(false)}>关闭</Button>}
      >
        <div className="publisher-terms-content">
          {terms.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </Modal>
    </>
  );
}
