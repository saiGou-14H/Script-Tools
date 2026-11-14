import { useState } from "react";
import { App, Button, Form, Input, Modal, Switch } from "antd";
import { CheckCircleFilled, SettingOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useWorkspace } from "../context";
import { usePrototype } from "../prototype";
import { PageHeading, Panel, Status, TileIcon } from "../components/ui";

const notificationFixtures = [
  {
    id: "result",
    category: "运行",
    icon: "table",
    color: "blue",
    title: "表格清洗结果已可领取",
    description:
      "您提交的表格清洗任务已经处理完成，结果文件可前往运行记录中领取。",
    action: "查看结果",
    to: "/me/outputs",
  },
  {
    id: "payment",
    category: "交易",
    icon: "payment",
    color: "green",
    title: "订单付款已确认",
    description: "您的订单付款已确认，服务将按订单内容执行。",
    action: "查看订单",
    to: "/me/orders/demo",
  },
  {
    id: "refund",
    category: "退款",
    icon: "wallet",
    color: "orange",
    title: "退款¥8.00渠道处理中",
    description: "您的退款申请已受理，目前正在通过支付渠道处理中，请耐心等待。",
    action: "查看订单",
    to: "/me/refunds/demo",
  },
  {
    id: "booking",
    category: "系统",
    icon: "gift",
    color: "purple",
    title: "预约结果待核验",
    description: "预约请求已提交，结果仍待核验，请查看原预约进度。",
    action: "查看结果",
    to: "/me/pending",
  },
];

export function NotificationsPage() {
  const { bootstrap } = useWorkspace();
  const { readNotificationIds, markNotificationRead } = usePrototype();
  const [category, setCategory] = useState("全部");
  const all = bootstrap.data_mode === "prototype" ? notificationFixtures : [];
  const unread = all.filter((item) => !readNotificationIds.has(item.id)).length;
  const rows = all.filter(
    (item) => category === "全部" || item.category === category,
  );
  return (
    <div className="notifications-page">
      <PageHeading title="消息中心" />
      <div className="notification-hero">
        <div>
          <h1>消息中心</h1>
          <p>接收与您订单、运行结果、退款及系统相关的消息通知。</p>
        </div>
        <div className="envelope-art" aria-hidden="true" />
        <span>
          未读 <strong>{unread}</strong> 条
        </span>
        <Link to="/me/settings/notifications">
          <Button icon={<SettingOutlined />}>通知设置</Button>
        </Link>
      </div>
      <div className="pill-tabs">
        {["全部", "交易", "运行", "退款", "系统"].map((value) => (
          <Button
            key={value}
            type={category === value ? "primary" : "default"}
            onClick={() => setCategory(value)}
          >
            {value}
          </Button>
        ))}
      </div>
      <Panel className="notification-list">
        {rows.length ? (
          rows.map((item) => (
            <article key={item.id}>
              <i
                className={`notification-unread ${readNotificationIds.has(item.id) ? "is-read" : ""}`}
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
          <p className="empty-list">暂无此类消息</p>
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
  const {
    emailEventKeys,
    saveEmailEventKeys,
    notificationEmail,
    updateNotificationEmail,
  } = usePrototype();
  const [events, setEvents] = useState(emailEventKeys);
  const { mask: email, verified } = notificationEmail;
  const [editingEmail, setEditingEmail] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  function saveEmail(values: { email: string }) {
    const [name, domain] = values.email.trim().split("@");
    updateNotificationEmail(`${name.slice(0, 1)}***@${domain}`);
    setEditingEmail(false);
    form.resetFields();
    void message.info("邮箱已更新，完成验证后可接收邮件通知");
  }
  function toggle(key: string, checked: boolean) {
    setEvents((previous) =>
      checked ? [...previous, key] : previous.filter((item) => item !== key),
    );
  }
  return (
    <div className="notification-settings-page">
      <PageHeading
        title="通知设置"
        description="管理服务事件的提醒方式与投递配置，及时接收关键状态更新。"
      />
      <Panel className="notification-setting-card">
        <TileIcon name="bell" />
        <div>
          <h2>邮件通知</h2>
          <p>用于接收服务事件的邮件提醒。邮箱需完成验证后才能接收通知。</p>
          <div className="email-binding">
            <span>
              {verified ? "已验证邮箱" : "待验证邮箱"}　
              <b>{email || "尚未绑定"}</b>
            </span>
            <Button onClick={() => setEditingEmail(true)}>
              {email ? "修改邮箱" : "绑定邮箱"}
            </Button>
            <Button
              onClick={() =>
                void message.info("邮件渠道尚未配置，本次未发送测试邮件")
              }
            >
              发送测试
            </Button>
          </div>
        </div>
        <Status tone={verified ? "green" : "orange"}>
          {verified ? "✓ 已验证" : "待验证"}
        </Status>
      </Panel>
      <Panel className="notification-event-settings">
        <TileIcon name="settings" />
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
                checked={events.includes(item.key)}
                onChange={(checked) => toggle(item.key, checked)}
              />
            </div>
          ))}
        </section>
      </Panel>
      <Panel className="notification-setting-card in-app-setting">
        <TileIcon name="file" />
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
      <footer className="notification-save-bar">
        <div>
          <CheckCircleFilled />
          <b>
            {verified && bootstrap.data_mode === "prototype"
              ? "最近测试　投递成功"
              : "邮件通知配置"}
          </b>
          <span>
            {verified && bootstrap.data_mode === "prototype"
              ? `一封测试邮件已成功发送至 ${email}，请查收。`
              : "完成邮箱验证后，可按已保存的事件偏好接收通知。"}
          </span>
        </div>
        <Button
          type="primary"
          size="large"
          onClick={() => {
            saveEmailEventKeys(events);
            void message.success("通知偏好已保存");
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
