import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Alert, Button, Checkbox, Form, Input, Modal } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
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
  onBusyChange,
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
  onBusyChange?: (busy: boolean) => void;
}) {
  const [form] = Form.useForm<PublisherProfileValues>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(false);
  const [followingUp, setFollowingUp] = useState(false);
  const [notice, setNotice] = useState("");
  const [continuation, setContinuation] = useState<{
    profile: PublisherProfile;
    values: PublisherProfileValues;
    error?: Error;
  }>();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const termsOpen = params.get("dialog") === "terms";
  function setTermsOpen(open: boolean) {
    const next = new URLSearchParams(params);
    if (open) next.set("dialog", "terms");
    else next.delete("dialog");
    navigate({ search: next.toString(), hash: location.hash });
  }
  const busy = useRef(false);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const revision = useRef(profile?.revision);
  const snapshot = useRef<{
    id?: string;
    revision?: string;
    public_name: string;
    description: string;
  }>(undefined);
  const intent = useRef<
    | {
        key: string;
        signature: string;
        revision?: string;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    const next = {
      id: profile?.id,
      revision: profile?.revision,
      public_name: profile?.public_name || defaultName,
      description: profile?.description || "",
    };
    const previous = snapshot.current;
    if (!previous || previous.id !== next.id) {
      form.resetFields();
      form.setFieldsValue({
        public_name: next.public_name,
        description: next.description,
      });
      intent.current = undefined;
    } else {
      let retained = false;
      for (const field of ["public_name", "description"] as const) {
        if (form.getFieldValue(field) === previous[field])
          form.setFieldValue(field, next[field]);
        else retained = true;
      }
      if (retained && previous.revision !== next.revision)
        setNotice("最新资料已加载，已保留当前编辑内容，请核对后再次保存。");
    }
    revision.current = next.revision;
    snapshot.current = next;
  }, [profile?.id, profile?.revision, defaultName]);
  useEffect(() => {
    form.setFieldValue(
      "accepted_terms",
      !requireConsent && profile?.terms_version === terms.version,
    );
  }, [terms.version, profile?.id, profile?.terms_version, requireConsent]);
  function setBusy(value: boolean) {
    busy.current = value;
    if (mounted.current) {
      setLoading(value);
      onBusyChange?.(value);
    }
  }
  async function finishSaved(
    saved: PublisherProfile,
    values: PublisherProfileValues,
  ) {
    if (mounted.current) setFollowingUp(true);
    try {
      await onSaved(saved, values);
      if (mounted.current) setContinuation(undefined);
    } catch (failure) {
      if (mounted.current)
        setContinuation({
          profile: saved,
          values,
          error:
            failure instanceof Error ? failure : new Error("状态暂时无法刷新"),
        });
    } finally {
      if (mounted.current) setFollowingUp(false);
    }
  }
  async function retryContinuation() {
    if (busy.current || !continuation) return;
    setBusy(true);
    try {
      await finishSaved(continuation.profile, continuation.values);
    } finally {
      setBusy(false);
    }
  }
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
        revision: revision.current,
      };
    setBusy(true);
    setError(undefined);
    setNotice("");
    setContinuation(undefined);
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
      if (!mounted.current) return;
      intent.current = undefined;
      revision.current = saved.revision;
      let retained = false;
      for (const field of ["public_name", "description"] as const) {
        if (form.getFieldValue(field) === values[field])
          form.setFieldValue(field, saved[field]);
        else retained = true;
      }
      snapshot.current = saved;
      if (typeof values.contactEmail === "string") {
        if (form.getFieldValue("contactEmail") === values.contactEmail)
          form.setFieldValue("contactEmail", values.contactEmail.trim());
        else retained = true;
      }
      if (retained && requireConsent) {
        setContinuation({ profile: saved, values });
      } else {
        if (retained) setNotice("已保存提交的资料，当前新增输入尚未保存。");
        await finishSaved(saved, values);
      }
    } catch (failure) {
      if (!mounted.current) return;
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
      setBusy(false);
    }
  }
  async function reload() {
    if (busy.current) return;
    setBusy(true);
    try {
      await onReload();
      if (!mounted.current) return;
      intent.current = undefined;
      setError(undefined);
      setNotice("最新资料已加载，已保留当前编辑内容，请核对后再次保存。");
    } catch (failure) {
      if (mounted.current) setError(failure as Error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {notice && (
        <Alert
          className="publisher-profile-error"
          type="info"
          showIcon
          title={notice}
        />
      )}
      {continuation && (
        <Alert
          className="publisher-profile-error"
          type={continuation.error ? "warning" : "info"}
          showIcon
          title={
            continuation.error
              ? "资料已保存，后续状态暂时无法刷新"
              : "已保存提交的资料，当前新增输入尚未保存。"
          }
          description={continuation.error?.message}
          action={
            <Button loading={loading} onClick={() => void retryContinuation()}>
              {continuation.error ? "重试后续操作" : "使用已保存资料进入"}
            </Button>
          }
        />
      )}
      {error && (
        <Alert
          className="publisher-profile-error"
          type="error"
          title={error.message}
          showIcon
          action={
            error instanceof ApiError &&
            ([412, 428].includes(error.status) ||
              error.fieldErrors.some(
                (field) => field.path === "/accepted_terms_version",
              )) ? (
              <Button onClick={() => void reload()}>加载最新资料</Button>
            ) : undefined
          }
        />
      )}
      <Form
        id={formId}
        form={form}
        layout={layout}
        disabled={requireConsent && followingUp}
        labelAlign="left"
        colon={false}
        requiredMark={
          layout === "horizontal"
            ? (label, info) => (
                <>
                  {label}
                  {info.required && (
                    <span
                      className="publisher-required-mark"
                      aria-hidden="true"
                    >
                      {" "}
                      *
                    </span>
                  )}
                </>
              )
            : true
        }
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
          <Input aria-label="公开昵称" maxLength={120} showCount />
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
          <Input.TextArea
            aria-label={descriptionLabel}
            maxLength={10000}
            rows={4}
            showCount
          />
        </Form.Item>
        {children}
        <Form.Item
          name="accepted_terms"
          hidden={!requireConsent && profile?.terms_version === terms.version}
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
        {!externalSubmit && (
          <Button
            className="publisher-terms-link"
            type="link"
            onClick={() => setTermsOpen(true)}
          >
            阅读服务约定 {terms.version}
          </Button>
        )}
        {!externalSubmit && (
          <Button
            className="publisher-profile-submit"
            aria-label={submitLabel}
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
