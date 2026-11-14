import { useRef, useState } from "react";
import { App, Avatar, Button, Form, Input, Modal, Radio, Tabs } from "antd";
import {
  LaptopOutlined,
  LockOutlined,
  UserOutlined,
  WarningFilled,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useWorkspace } from "../context";
import type { Role } from "../types";
import { PageHeading, Panel, Status, TileIcon } from "../components/ui";

export function AccountPage() {
  const { bootstrap, role, setRole, refresh } = useWorkspace();
  const [tab, setTab] = useState("profile");
  const [workspace, setWorkspace] = useState<Role>(
    role === "ADMIN" ? "USER" : role,
  );
  const [displayName, setDisplayName] = useState(
    bootstrap.user?.display_name || "",
  );
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const profile = useRef<HTMLDivElement>(null);
  const security = useRef<HTMLDivElement>(null);
  const sessions = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLDivElement>(null);
  const sectionRefs = { profile, security, sessions, close };

  function switchWorkspace() {
    if (!bootstrap.user?.roles.includes(workspace)) {
      void message.info("发布者能力开通接口尚未接入");
      return;
    }
    setRole(workspace);
    navigate(workspace === "PUBLISHER" ? "/publisher" : "/me/home");
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      await refresh();
      navigate("/auth", { replace: true });
    } catch (error) {
      void message.error((error as Error).message);
    }
  }
  return (
    <div className="account-page">
      <PageHeading title="账户设置" />
      <Tabs
        activeKey={tab}
        onChange={(value) => {
          setTab(value);
          sectionRefs[
            value as keyof typeof sectionRefs
          ].current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
        items={[
          { key: "profile", label: "资料" },
          { key: "security", label: "账号安全" },
          { key: "sessions", label: "会话" },
          { key: "close", label: "账号注销" },
        ]}
      />
      <div className="account-top-cards">
        <div ref={profile}>
          <Panel title="基本资料">
            <Avatar size={70} icon={<UserOutlined />} />
            <div>
              <p>
                昵称　<b>{displayName}</b>{" "}
                <Button
                  onClick={() => {
                    form.setFieldsValue({ displayName });
                    setEditing(true);
                  }}
                >
                  编辑
                </Button>
              </p>
              <p>
                邮箱　
                <b>
                  {bootstrap.data_mode === "prototype"
                    ? "li***@example.com"
                    : "需从账户服务读取"}
                </b>{" "}
                <Button
                  onClick={() => void message.info("邮箱变更验证接口尚未接入")}
                >
                  修改
                </Button>
              </p>
            </div>
          </Panel>
        </div>
        <div ref={security}>
          <Panel title="账号安全">
            <TileIcon name="lock" />
            <div>
              <h2>登录密码</h2>
              <p>用于登录平台的账号密码</p>
            </div>
            <Button
              icon={<LockOutlined />}
              onClick={() => navigate("/auth?tab=reset")}
            >
              修改密码
            </Button>
          </Panel>
        </div>
      </div>
      <div ref={sessions}>
        <Panel title="会话管理" className="account-sessions">
          <TileIcon name="laptop" />
          <div>
            <h3>
              当前登录设备　Windows <Status tone="green">当前会话</Status>
            </h3>
            <p>设备类型　Windows</p>
          </div>
          <Button onClick={() => void message.info("其他会话管理接口尚未接入")}>
            退出其他会话
          </Button>
        </Panel>
      </div>
      <div className="account-workspace">
        <h2>工作区切换</h2>
        <p>
          选择你的使用方式。开启脚本发布能力后，可上传并发布个人脚本，供其他用户按次使用。
        </p>
        <div>
          <Radio.Group
            value={workspace}
            onChange={(event) => setWorkspace(event.target.value)}
          >
            <Radio value="USER">
              <TileIcon name="user" />
              <span>
                <b>消费者</b>
                <small>购买并使用他人发布的脚本，按次付费执行。</small>
              </span>
            </Radio>
            <Radio value="PUBLISHER">
              <TileIcon name="code" />
              <span>
                <b>脚本发布者</b>
                <small>发布个人脚本并提供使用服务，按次收取费用。</small>
              </span>
            </Radio>
          </Radio.Group>
          <Button type="primary" size="large" onClick={switchWorkspace}>
            切换到{workspace === "PUBLISHER" ? "发布者" : "消费者"}
          </Button>
        </div>
      </div>
      <div ref={close}>
        <Panel title="账号注销" className="account-close">
          <div>
            <WarningFilled />
            <span>
              注销后将停止新业务。
              {bootstrap.data_mode === "prototype" ? (
                <>
                  尚有 <b>1笔售后</b> 和 <b>1笔结算</b>{" "}
                  进入受限处理，完成后按保留策略清理。
                </>
              ) : (
                "未结订单、售后和收益将按账户检查结果处理。"
              )}
            </span>
            <Button
              onClick={() =>
                modal.info({
                  title: "账号注销前检查",
                  content: (
                    <>
                      <p>注销将停止新业务，未结售后和结算按原规则继续处理。</p>
                      <p>注销检查与数据清理接口尚未接入。</p>
                    </>
                  ),
                  okText: "返回账户设置",
                })
              }
            >
              申请注销
            </Button>
          </div>
        </Panel>
      </div>
      <div className="account-logout">
        <Button
          onClick={() =>
            modal.confirm({
              title: "退出当前会话",
              content: "确认退出此设备上的登录会话？",
              okText: "退出登录",
              cancelText: "取消",
              onOk: logout,
            })
          }
        >
          退出当前登录
        </Button>
      </div>
      <Modal
        title="编辑昵称"
        forceRender
        open={editing}
        onCancel={() => setEditing(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            if (bootstrap.data_mode !== "prototype") {
              void message.info("资料更新接口尚未接入");
              return;
            }
            setDisplayName(values.displayName);
            setEditing(false);
            void message.success("昵称预览已更新");
          }}
        >
          <Form.Item
            name="displayName"
            label="昵称"
            rules={[{ required: true }, { max: 120 }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
