import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Form, Input, Modal, Tabs } from "antd";
import {
  CheckOutlined,
  LockOutlined,
  MailOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { api, setCsrfToken } from "../api";
import { useWorkspace } from "../context";
import type { Bootstrap, Role } from "../types";
import { PageHeading, TileIcon } from "../components/ui";
import { Icon } from "../components/Icon";
import { pagePath, roleForPath, roles, type PageId } from "../catalog";

type AuthFlow =
  "login" | "register" | "verify" | "reset-request" | "reset-confirm";
interface ChallengeReceipt {
  challenge_id: string;
  expires_at?: string;
  delivery_status?: string;
  development_token?: string;
}
interface AuthValues {
  email?: string;
  password?: string;
  challenge_id?: string;
  token?: string;
  new_password?: string;
  confirm_password?: string;
  accepted_terms?: boolean;
}
const termsVersion = "V3.0";

export function AuthPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const requestedTab = params.get("tab");
  const [flow, setFlow] = useState<AuthFlow>("login");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receipt, setReceipt] = useState<ChallengeReceipt>();
  const [loading, setLoading] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [demosOpen, setDemosOpen] = useState(false);
  const [form] = Form.useForm<AuthValues>();
  const busy = useRef(false);
  const navigate = useNavigate();
  const { bootstrap, refresh, setRole } = useWorkspace();

  function changeFlow(next: AuthFlow, values: AuthValues = {}) {
    const email = form.getFieldValue("email");
    setFlow(next);
    setError("");
    setNotice("");
    setReceipt(undefined);
    form.resetFields();
    form.setFieldsValue({ email, ...values });
  }
  useEffect(() => {
    changeFlow(
      requestedTab === "register"
        ? "register"
        : requestedTab === "reset"
          ? "reset-request"
          : "login",
    );
    if (
      (location.state as { passwordResetComplete?: boolean } | null)
        ?.passwordResetComplete
    )
      setNotice("密码已重设，旧会话已撤销，请重新登录。");
  }, [requestedTab, location.key]);

  async function establishSession(
    result: Pick<Bootstrap, "user" | "csrf_token">,
  ) {
    if (!result.user || !result.csrf_token)
      throw new Error("登录响应不完整，请重新登录");
    setCsrfToken(result.csrf_token);
    await refresh();
    const desired = (params.get("workspace") || "USER") as Role;
    const selectedRole = result.user.roles.includes(desired) ? desired : "USER";
    const enteringPublisher =
      desired === "PUBLISHER" && !result.user.roles.includes("PUBLISHER");
    setRole(selectedRole);
    const home = enteringPublisher
      ? "/publisher"
      : pagePath(
          roles.find((role) => role.id === selectedRole)!.home as PageId,
        );
    const target = params.get("returnTo") || home;
    let url = new URL(home, window.location.origin);
    try {
      url = new URL(
        target.startsWith("/") && !target.startsWith("//") ? target : home,
        window.location.origin,
      );
    } catch {
      // 无法解析的回跳参数使用当前工作区首页。
    }
    const requiredRole = roleForPath(url.pathname);
    const permitted =
      url.origin === window.location.origin &&
      (requiredRole === "GUEST" ||
        result.user.roles.includes(requiredRole) ||
        (enteringPublisher && requiredRole === "PUBLISHER"));
    navigate(permitted ? `${url.pathname}${url.search}${url.hash}` : home, {
      replace: true,
    });
  }
  async function submit(values: AuthValues) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      if (flow === "login") {
        await establishSession(
          await api<Pick<Bootstrap, "user" | "csrf_token">>("/auth/login", {
            method: "POST",
            body: JSON.stringify({
              email: values.email,
              password: values.password,
            }),
          }),
        );
      } else if (flow === "register" || flow === "reset-request") {
        const registering = flow === "register";
        const nextReceipt = await api<ChallengeReceipt>(
          registering ? "/auth/register" : "/auth/password-reset-requests",
          {
            method: "POST",
            body: JSON.stringify(
              registering
                ? {
                    email: values.email,
                    password: values.password,
                    accepted_terms_version: termsVersion,
                  }
                : { email: values.email },
            ),
          },
        );
        if (!nextReceipt.challenge_id)
          throw new Error("验证请求响应不完整，请稍后重试");
        changeFlow(registering ? "verify" : "reset-confirm", {
          challenge_id: nextReceipt.challenge_id,
        });
        setReceipt(nextReceipt);
        setNotice(
          nextReceipt.development_token
            ? "本地开发验证请求已生成，请使用下方开发令牌完成验证。"
            : "验证请求已受理，请按邮件中的指引继续操作。",
        );
      } else if (flow === "verify") {
        const result = await api<
          Partial<Pick<Bootstrap, "user" | "csrf_token">>
        >("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({
            challenge_id: values.challenge_id,
            token: values.token,
          }),
        });
        if (result.user && result.csrf_token)
          await establishSession({
            user: result.user,
            csrf_token: result.csrf_token,
          });
        else {
          changeFlow("login");
          setNotice("邮箱验证完成，请使用邮箱和密码登录。");
        }
      } else {
        await api("/auth/password-resets", {
          method: "POST",
          body: JSON.stringify({
            challenge_id: values.challenge_id,
            token: values.token,
            new_password: values.new_password,
          }),
        });
        setCsrfToken(null);
        const nextParams = new URLSearchParams(params);
        nextParams.set("tab", "login");
        navigate(
          { pathname: "/auth", search: nextParams.toString() },
          { replace: true, state: { passwordResetComplete: true } },
        );
        await refresh();
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "请求失败，请稍后重试",
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  const proof = flow === "verify" || flow === "reset-confirm";
  return (
    <>
      <PageHeading title="登录与注册" />
      <div className="auth-page">
        <section className="auth-introduction">
          <div className="auth-service-intro">
            <h2>通用脚本服务平台</h2>
            <p>一个账号，既可购买服务，也可发布脚本。</p>
            <p>
              提供脚本的上传、部署与按次付费使用，
              <br />
              覆盖数据/文件工具与景点预约等多种场景。
            </p>
            <div className="auth-service-art" aria-hidden="true">
              <i />
              <i />
              <span className="auth-art-code">&lt;/&gt;</span>
              <b>
                <CheckOutlined />
              </b>
            </div>
            <div className="auth-use-cases">
              <article>
                <TileIcon name="file" />
                <div>
                  <h3>数据 / 文件工具</h3>
                  <p>处理数据、整理文件等通用任务</p>
                </div>
              </article>
              <article>
                <TileIcon name="travel" color="purple" />
                <div>
                  <h3>景点预约</h3>
                  <p>支持景点的预约操作</p>
                </div>
              </article>
            </div>
          </div>
          <div className="auth-service-rules">
            {[
              [
                "rocket",
                "按次付费使用",
                "按每次服务的标价支付，完成一次完整服务，同次接续不额外收费。",
              ],
              [
                "gift",
                "门票与服务费用",
                "景点门票可能为0元，脚本服务费用以页面标价为准。",
              ],
              [
                "shield",
                "未达目标的退款",
                "是否退款、退款条件与规则由发布者选择，购买前公开展示，成交后固定。",
              ],
            ].map(([icon, title, description]) => (
              <article key={title}>
                <h3>
                  <Icon name={icon} />
                  {title}
                </h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={`auth-card ${proof ? "auth-proof-card" : ""}`}>
          <Tabs
            activeKey={
              flow === "register" || flow === "verify" ? "register" : "login"
            }
            onChange={(value) => changeFlow(value as AuthFlow)}
            items={[
              { key: "login", label: "登录", disabled: loading },
              { key: "register", label: "注册", disabled: loading },
            ]}
          />
          {flow === "verify" && <h2 className="auth-flow-heading">验证邮箱</h2>}
          {flow === "reset-request" && (
            <h2 className="auth-flow-heading">找回密码</h2>
          )}
          {flow === "reset-confirm" && (
            <h2 className="auth-flow-heading">重设密码</h2>
          )}
          {error && (
            <Alert
              type="error"
              title={error}
              showIcon
              closable
              onClose={() => setError("")}
            />
          )}
          {notice && <Alert type="info" title={notice} showIcon />}
          {receipt?.development_token && bootstrap.demo_accounts.length > 0 && (
            <div className="auth-development-token">
              <strong>本地开发验证令牌</strong>
              <code>{receipt.development_token}</code>
              <Button
                size="small"
                onClick={() =>
                  form.setFieldValue("token", receipt.development_token)
                }
              >
                填入开发令牌
              </Button>
            </div>
          )}
          <Form
            name="public-auth"
            form={form}
            layout="vertical"
            onFinish={submit}
            requiredMark={false}
            preserve={false}
          >
            {!proof && (
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { required: true, message: "请输入邮箱" },
                  { type: "email", message: "请输入有效的邮箱地址" },
                ]}
              >
                <Input
                  size="large"
                  prefix={<MailOutlined />}
                  placeholder="请输入邮箱"
                  autoComplete="username"
                  maxLength={254}
                />
              </Form.Item>
            )}
            {(flow === "login" || flow === "register") && (
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: "请输入密码" },
                  ...(flow === "register"
                    ? [{ min: 8, message: "密码至少8位" }]
                    : []),
                ]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined />}
                  placeholder="请输入密码"
                  autoComplete={
                    flow === "register" ? "new-password" : "current-password"
                  }
                  maxLength={1024}
                />
              </Form.Item>
            )}
            {proof && (
              <>
                <Form.Item
                  name="challenge_id"
                  initialValue={receipt?.challenge_id}
                  label="验证请求编号"
                  rules={[
                    {
                      required: true,
                      whitespace: true,
                      message: "请输入验证请求编号",
                    },
                  ]}
                >
                  <Input
                    autoComplete="off"
                    placeholder="请输入邮件中的验证请求编号"
                  />
                </Form.Item>
                <Form.Item
                  name="token"
                  label="验证令牌"
                  rules={[
                    {
                      required: true,
                      whitespace: true,
                      message: "请输入验证令牌",
                    },
                  ]}
                >
                  <Input.Password
                    prefix={<SafetyOutlined />}
                    autoComplete="one-time-code"
                    placeholder="请输入邮件中的单次验证令牌"
                    maxLength={512}
                  />
                </Form.Item>
              </>
            )}
            {flow === "reset-confirm" && (
              <>
                <Form.Item
                  name="new_password"
                  label="新密码"
                  rules={[
                    { required: true, message: "请输入新密码" },
                    { min: 8, message: "密码至少8位" },
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    autoComplete="new-password"
                    maxLength={1024}
                  />
                </Form.Item>
                <Form.Item
                  name="confirm_password"
                  label="确认新密码"
                  dependencies={["new_password"]}
                  rules={[
                    { required: true, message: "请再次输入新密码" },
                    ({ getFieldValue }) => ({
                      validator: (_, value) =>
                        !value || value === getFieldValue("new_password")
                          ? Promise.resolve()
                          : Promise.reject(new Error("两次输入的密码不一致")),
                    }),
                  ]}
                >
                  <Input.Password
                    prefix={<LockOutlined />}
                    autoComplete="new-password"
                    maxLength={1024}
                  />
                </Form.Item>
              </>
            )}
            {(flow === "login" || flow === "register") && (
              <div className="auth-consent-row">
                <Form.Item
                  name="accepted_terms"
                  valuePropName="checked"
                  rules={
                    flow === "register"
                      ? [
                          {
                            validator: (_, value) =>
                              value === true
                                ? Promise.resolve()
                                : Promise.reject(
                                    new Error("请先阅读并同意服务条款"),
                                  ),
                          },
                        ]
                      : []
                  }
                >
                  <Checkbox>我已阅读并同意</Checkbox>
                </Form.Item>
                <Button type="link" onClick={() => setTermsOpen(true)}>
                  《服务条款》
                </Button>
              </div>
            )}
            <Button
              className="auth-submit"
              block
              type="primary"
              size="large"
              htmlType="submit"
              loading={loading}
            >
              {
                {
                  login: "登录",
                  register: "注册并验证邮箱",
                  verify: "验证邮箱",
                  "reset-request": "发送验证邮件",
                  "reset-confirm": "重设密码",
                }[flow]
              }
            </Button>
          </Form>
          <div className="auth-secondary-actions">
            {flow === "login" ? (
              <>
                <Button
                  type="link"
                  onClick={() => changeFlow("reset-request")}
                  disabled={loading}
                >
                  忘记密码？
                </Button>
                <Button
                  type="link"
                  onClick={() => changeFlow("verify")}
                  disabled={loading}
                >
                  验证邮箱
                </Button>
              </>
            ) : (
              <Button
                type="link"
                onClick={() => changeFlow("login")}
                disabled={loading}
              >
                返回登录
              </Button>
            )}
            {flow === "reset-request" && (
              <Button
                type="link"
                onClick={() => changeFlow("reset-confirm")}
                disabled={loading}
              >
                已有重设令牌
              </Button>
            )}
          </div>
          {bootstrap.demo_accounts.length > 0 && (
            <div className="auth-demo-entry">
              <Button
                type="link"
                onClick={() => setDemosOpen(true)}
                disabled={loading}
              >
                本地开发示例账号
              </Button>
            </div>
          )}
        </section>
      </div>
      <Modal
        title="服务条款"
        open={termsOpen}
        onCancel={() => setTermsOpen(false)}
        footer={
          <Button type="primary" onClick={() => setTermsOpen(false)}>
            关闭
          </Button>
        }
      >
        <div className="auth-terms">
          <p>版本 {termsVersion}</p>
          <p>
            按次价格、一次服务范围、交付内容、核验时限和退款规则在购买前展示，订单固定成交时的约定。
          </p>
          <p>景点门票与脚本服务费分别展示，同一次服务的必要接续沿用原订单。</p>
          <p>
            使用者需要授权脚本所需的本人数据和操作范围，服务的执行进度、结果、产物与退款记录可在平台查询。
          </p>
          <Link to="/help" onClick={() => setTermsOpen(false)}>
            查看使用帮助
          </Link>
        </div>
      </Modal>
      <Modal
        title="本地开发示例账号"
        open={demosOpen}
        onCancel={() => setDemosOpen(false)}
        footer={null}
      >
        <div className="demo-accounts">
          {bootstrap.demo_accounts.map((account) => (
            <Button
              key={account.role}
              onClick={() => {
                changeFlow("login", {
                  email: account.email,
                  password: "TravelTools2026!",
                });
                setDemosOpen(false);
              }}
            >
              {account.name}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}
