import { useState } from "react";
import { Alert, App, Button, Checkbox, Form, Input, Modal, Switch } from "antd";
import {
  CheckCircleFilled,
  InfoCircleOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { usePrototype } from "../prototype";
import { PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { notificationFixtures } from "../lib/consumer-preview";

export function NotificationsPage() {
  const { bootstrap } = useWorkspace();
  const { readNotificationIds, markNotificationRead, unreadNotificationCount } =
    usePrototype();
  const [params, setParams] = useSearchParams();
  const categories = ["全部", "交易", "运行", "退款", "系统"];
  const requested = params.get("category") || "全部";
  const category = categories.includes(requested) ? requested : "全部";
  const unreadOnly = params.get("read") === "unread";
  const prototype = bootstrap.data_mode === "prototype";
  const all = prototype ? notificationFixtures : [];
  const rows = all.filter(
    (item) =>
      (category === "全部" || item.category === category) &&
      (!unreadOnly || !readNotificationIds.has(item.id)),
  );
  function filter(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <div className="notifications-page">
      <PageHeading
        title="消息中心"
        extra={prototype ? <Status>本地开发示例</Status> : undefined}
      />
      <div className="notification-hero">
        <div>
          <h1>消息中心</h1>
          <p>接收与您订单、运行结果、退款及系统相关的消息通知。</p>
        </div>
        <div className="envelope-art" aria-hidden="true">
          <i />
        </div>
        <span>
          未读 <strong>{unreadNotificationCount ?? "—"}</strong> 条
        </span>
        <Link to="/me/settings/notifications">
          <Button icon={<SettingOutlined />}>通知设置</Button>
        </Link>
      </div>
      {!prototype && (
        <Alert
          className="notification-integration-note"
          type="info"
          showIcon
          title="站内消息接口待接入"
          description="订单、运行与退款通知将在消息服务接入后显示。"
        />
      )}
      <div className="notification-filters">
        <div className="pill-tabs" aria-label="消息分类">
          {categories.map((value) => (
            <Button
              key={value}
              type={category === value ? "primary" : "default"}
              aria-pressed={category === value}
              onClick={() =>
                filter("category", value === "全部" ? null : value)
              }
            >
              {value}
            </Button>
          ))}
        </div>
        <Checkbox
          checked={unreadOnly}
          onChange={(event) =>
            filter("read", event.target.checked ? "unread" : null)
          }
        >
          仅看未读
        </Checkbox>
      </div>
      <Panel className="notification-list">
        {rows.length ? (
          rows.map((item) => (
            <article key={item.id}>
              <i
                className={`notification-unread ${readNotificationIds.has(item.id) ? "is-read" : ""}`}
                aria-label={
                  readNotificationIds.has(item.id) ? "已读消息" : "未读消息"
                }
              />
              <TileIcon name={item.icon} color={item.color} />
              <div>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </div>
              <div className="row-actions">
                <Link to={item.to}>
                  <Button type="primary">{item.action}</Button>
                </Link>
                <Button
                  onClick={() => markNotificationRead(item.id)}
                  disabled={readNotificationIds.has(item.id)}
                >
                  {readNotificationIds.has(item.id) ? "已读" : "标为已读"}
                </Button>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-list">
            {!prototype
              ? "消息列表待接入"
              : unreadOnly
                ? "暂无未读消息"
                : "暂无此类消息"}
          </p>
        )}
      </Panel>
    </div>
  );
}

const emailEvents = [
  {
    key: "payment_confirmed",
    title: "支付确认",
    description: "订单支付成功后发送通知。",
  },
  {
    key: "run_completed",
    title: "运行完成",
    description: "脚本执行完成后发送通知。",
  },
  {
    key: "action_required",
    title: "待补充",
    description: "执行过程中需要你补充信息时发送通知。",
  },
  {
    key: "refund_succeeded",
    title: "退款到账",
    description: "退款处理完成、款项到账后发送通知。",
  },
];
export function NotificationSettingsPage() {
  const { bootstrap } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const {
    emailEventKeys,
    saveEmailEventKeys,
    notificationEmail,
    updateNotificationEmail,
  } = usePrototype();
  const [events, setEvents] = useState(prototype ? emailEventKeys : []);
  const { mask: email, verified } = prototype
    ? notificationEmail
    : { mask: "", verified: false };
  const [editingEmail, setEditingEmail] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  function saveEmail(values: { email: string }) {
    if (!prototype) return;
    const [name, domain] = values.email.trim().split("@");
    updateNotificationEmail(`${name.slice(0, 1)}***@${domain}`);
    setEditingEmail(false);
    form.resetFields();
    void message.info("邮箱已更新，完成验证后可接收邮件通知");
  }
  function toggle(key: string, checked: boolean) {
    if (!prototype) return;
    setEvents((previous) =>
      checked ? [...previous, key] : previous.filter((item) => item !== key),
    );
  }
  return (
    <div className="notification-settings-page">
      <PageHeading
        title="通知设置"
        description="管理服务事件的提醒方式与投递配置，及时接收关键状态更新。"
        extra={prototype ? <Status>本地开发示例</Status> : undefined}
      />
      {!prototype && (
        <Alert
          className="notification-integration-note"
          type="info"
          showIcon
          title="邮件渠道绑定与事件订阅接口待接入"
          description="站内通知随业务事实保留，邮件配置接入后可绑定并验证收件地址。"
        />
      )}
      <Panel className="notification-setting-card">
        <TileIcon name="mail" />
        <div>
          <h2>邮件通知</h2>
          <p>用于接收服务事件的邮件提醒。邮箱需完成验证后才能接收通知。</p>
          <div className="email-binding">
            <span>
              {verified ? "已验证邮箱" : email ? "待验证邮箱" : "通知邮箱"}　
              <b>{email || "尚未绑定"}</b>
            </span>
            <Button
              onClick={() =>
                prototype
                  ? setEditingEmail(true)
                  : void message.info("邮箱绑定与收件地址验证接口待接入")
              }
            >
              {email ? "修改邮箱" : "绑定邮箱"}
            </Button>
            <Button
              disabled={!verified}
              onClick={() =>
                void message.info("邮件渠道尚未配置，本次未发送测试邮件")
              }
            >
              发送测试
            </Button>
          </div>
        </div>
        <Status tone={verified ? "green" : "orange"}>
          {verified ? "✓ 已验证" : email ? "待验证" : "未绑定"}
        </Status>
      </Panel>
      <Panel className="notification-event-settings">
        <TileIcon name="sliders" />
        <section>
          <h2>事件通知开关</h2>
          <p>
            选择需要接收邮件通知的事件。站内通知始终保留，不受下列开关影响。
          </p>
          {emailEvents.map((item) => (
            <div className="notification-event-row" key={item.key}>
              <b>{item.title}</b>
              <span>{item.description}</span>
              <Switch
                aria-label={item.title}
                checked={prototype && events.includes(item.key)}
                disabled={!prototype}
                onChange={(checked) => toggle(item.key, checked)}
              />
            </div>
          ))}
        </section>
      </Panel>
      <Panel className="notification-setting-card in-app-setting">
        <TileIcon name="message" />
        <div>
          <h2>站内通知</h2>
          <p>所有事件的通知将在站内消息中心保留，可随时查看。</p>
        </div>
        <Status>始终保留</Status>
      </Panel>
      <Panel className="notification-setting-card webhook-setting">
        <TileIcon name="link" color="gray" />
        <div>
          <h2>Webhook 回调</h2>
          <p>用于将事件推送到你自己的系统。该功能处于规划中，暂未启用。</p>
        </div>
        <Status tone="gray">后续功能（未启用）</Status>
      </Panel>
      <footer
        className={`notification-save-bar ${verified && prototype ? "has-test-example" : "is-unconfigured"}`}
      >
        <div>
          {verified && prototype ? (
            <CheckCircleFilled />
          ) : (
            <InfoCircleOutlined />
          )}
          <b>{verified && prototype ? "本地示例　投递成功" : "邮件通知配置"}</b>
          <span>
            {verified && prototype
              ? `示例收件地址 ${email}，实际邮件渠道待接入。`
              : prototype
                ? "完成邮箱验证后，可按已保存的事件偏好接收通知。"
                : "邮件绑定、验证与订阅服务接入后，可配置事件提醒。"}
          </span>
        </div>
        <Button
          type="primary"
          size="large"
          disabled={!prototype}
          onClick={() => {
            if (!prototype) return;
            saveEmailEventKeys(events);
            void message.success("本地示例通知偏好已保存");
          }}
        >
          保存设置
        </Button>
      </footer>
      <Modal
        title="修改通知邮箱"
        open={editingEmail}
        onCancel={() => {
          setEditingEmail(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="保存邮箱"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={saveEmail}>
          <Form.Item
            name="email"
            label="通知邮箱"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "请输入有效的邮箱地址" },
            ]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
