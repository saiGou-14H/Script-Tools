import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Avatar,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Skeleton,
  Table,
  Tabs,
} from "antd";
import {
  InfoCircleOutlined,
  UserOutlined,
  WarningFilled,
} from "@ant-design/icons";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, api, apiPage } from "../api";
import { useWorkspace } from "../context";
import type { AccountProfile, AccountSession, Role } from "../types";
import { PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { Icon } from "../components/Icon";

type SavedProfile = Pick<
  AccountProfile,
  "id" | "display_name" | "revision" | "locale" | "timezone" | "updated_at"
>;
const accountSections = [
  { key: "profile", label: "资料" },
  { key: "security", label: "账号安全" },
  { key: "sessions", label: "会话" },
  { key: "close", label: "账号注销" },
];
export function AccountPage() {
  const { bootstrap, role, setRole, refresh, clearIdentity } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const administrator = role === "ADMIN";
  const consumer = role === "USER";
  const owner = bootstrap.user?.id;
  const queryKey = ["personal", owner, "account"];
  const client = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api<AccountProfile>("/me", { signal }),
  });
  const account = query.data;
  const [params, setParams] = useSearchParams();
  const tab = params.get("section") || "profile";
  const dialog = params.get("dialog");
  const validSection = accountSections.some((section) => section.key === tab);
  const validDialog =
    !dialog || ["sessions", "security", "closure"].includes(dialog);
  const [workspace, setWorkspace] = useState<Role>(role);
  useEffect(() => setWorkspace(role), [role]);
  const [editing, setEditing] = useState(false);
  const [editRevision, setEditRevision] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<Error>();
  const [editNotice, setEditNotice] = useState("");
  const securityOpen = dialog === "security";
  const sessionsOpen = dialog === "sessions";
  const [form] = Form.useForm<{ display_name: string }>();
  const busy = useRef(false);
  const activeOwner = useRef(owner);
  useLayoutEffect(() => {
    activeOwner.current = owner;
    return () => {
      activeOwner.current = undefined;
    };
  }, [owner]);
  const intent = useRef<
    { key: string; signature: string; revision: string } | undefined
  >(undefined);
  const { modal, message } = App.useApp();
  const navigate = useNavigate();
  const profileRef = useRef<HTMLDivElement>(null);
  const securityRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  const sectionRefs = {
    profile: profileRef,
    security: securityRef,
    sessions: sessionsRef,
    close: closeRef,
  };
  useEffect(() => {
    if (!validSection) return;
    sectionRefs[tab as keyof typeof sectionRefs].current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [tab, validSection]);
  function closeDialog() {
    const next = new URLSearchParams(params);
    next.delete("dialog");
    setParams(next);
  }
  function openDialog(value: string) {
    const next = new URLSearchParams(params);
    next.set("dialog", value);
    setParams(next);
  }
  function selectSection(value: string) {
    const next = new URLSearchParams(params);
    if (value === "profile") next.delete("section");
    else next.set("section", value);
    next.delete("dialog");
    if (value === "sessions" || (value === "security" && !consumer))
      next.set("dialog", value);
    if (next.toString() !== params.toString()) setParams(next);
  }
  const sessions = useInfiniteQuery({
    queryKey: ["personal", owner, "account-sessions"],
    enabled: sessionsOpen,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiPage<AccountSession>(
        "/me/sessions?limit=20" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (result) => result.next_cursor || undefined,
  });
  const sessionItems = sessions.data?.pages.flatMap((page) => page.items) || [];
  const publisherEnabled = bootstrap.user?.roles.includes("PUBLISHER");
  const choices = [
    {
      id: "USER" as Role,
      label: "消费者",
      icon: "user",
      description: "购买并使用他人发布的脚本，按次付费执行。",
    },
    {
      id: "PUBLISHER" as Role,
      label: "脚本发布者",
      icon: "code-brackets",
      description: "发布个人脚本并提供使用服务，按次收取费用。",
    },
    ...(administrator
      ? [
          {
            id: "ADMIN" as Role,
            label: "平台管理员",
            icon: "shield",
            description: "",
          },
        ]
      : []),
  ];
  function switchWorkspace() {
    const target = consumer && workspace === role ? "PUBLISHER" : workspace;
    if (target === "PUBLISHER" && !publisherEnabled) {
      navigate("/publisher");
      return;
    }
    if (!bootstrap.user?.roles.includes(target)) return;
    if (target === role) {
      void message.info("请选择要切换的工作区");
      return;
    }
    setRole(target);
    navigate(
      target === "ADMIN"
        ? "/admin"
        : target === "PUBLISHER"
          ? "/publisher"
          : "/me/home",
    );
  }
  async function refreshAccount() {
    const current = await query.refetch();
    if (current.error) throw current.error;
    return current.data!;
  }
  function openEditor() {
    if (!account) return;
    form.resetFields();
    form.setFieldsValue({ display_name: account.display_name });
    setEditRevision(account.revision);
    setEditError(undefined);
    setEditNotice("");
    intent.current = undefined;
    setEditing(true);
  }
  async function saveProfile(values: { display_name: string }) {
    if (busy.current) return;
    const body = { display_name: values.display_name };
    const signature = JSON.stringify(body);
    if (!intent.current || intent.current.signature !== signature)
      intent.current = {
        key: crypto.randomUUID(),
        signature,
        revision: editRevision,
      };
    busy.current = true;
    setSaving(true);
    setEditError(undefined);
    setEditNotice("");
    try {
      const saved = await api<SavedProfile>("/me", {
        method: "PATCH",
        headers: {
          "Idempotency-Key": intent.current.key,
          "If-Match": '"' + intent.current.revision + '"',
        },
        body: JSON.stringify(body),
      });
      if (activeOwner.current !== owner) return;
      client.setQueryData<AccountProfile>(queryKey, (previous) =>
        previous ? { ...previous, ...saved } : previous,
      );
      intent.current = undefined;
      setEditRevision(saved.revision);
      const draftName = form.getFieldValue("display_name");
      const keepDraft =
        typeof draftName === "string" &&
        draftName.trim() !== saved.display_name;
      if (keepDraft) {
        setEditNotice("已保存提交的昵称，当前输入尚未保存。");
      } else {
        setEditing(false);
        form.resetFields();
      }
      void message.success(keepDraft ? "已保存提交的昵称" : "个人资料已保存");
      try {
        await refresh();
      } catch {
        if (activeOwner.current === owner)
          void message.warning(
            "资料已保存，身份信息暂时无法刷新，请重新加载页面",
          );
      }
    } catch (failure) {
      if (activeOwner.current !== owner) return;
      const error =
        failure instanceof Error ? failure : new Error("资料暂时无法保存");
      setEditError(error);
      if (error instanceof ApiError)
        form.setFields(
          error.fieldErrors
            .filter((field) => field.path === "/display_name")
            .map((field) => ({
              name: "display_name",
              errors: [field.message],
            })),
        );
    } finally {
      busy.current = false;
      if (activeOwner.current === owner) setSaving(false);
    }
  }
  async function loadLatest() {
    try {
      const latest = await refreshAccount();
      if (activeOwner.current !== owner) return;
      setEditRevision(latest.revision);
      intent.current = undefined;
      setEditError(undefined);
      setEditNotice(
        "最新昵称为“" + latest.display_name + "”，请核对填写内容后再次保存。",
      );
    } catch (error) {
      if (activeOwner.current === owner) setEditError(error as Error);
    }
  }
  function confirmLogout() {
    modal.confirm({
      title: "退出当前会话",
      content: "确认退出此设备上的登录会话？",
      okText: "退出登录",
      cancelText: "取消",
      onOk: async () => {
        try {
          await api("/auth/logout", { method: "POST" });
          clearIdentity();
          navigate("/auth", { replace: true });
        } catch (error) {
          void message.error((error as Error).message);
          throw error;
        }
      },
    });
  }
  async function afterRevocation() {
    try {
      await client.invalidateQueries({
        queryKey: ["personal", owner, "account-sessions"],
      });
      await refreshAccount();
    } catch {
      if (activeOwner.current === owner)
        void message.warning(
          "会话操作已完成，账户资料暂时无法刷新，请重试加载。",
        );
    }
  }
  function revokeOthers() {
    const key = crypto.randomUUID();
    modal.confirm({
      title: "退出其他会话",
      content: "确认退出当前设备以外的有效登录会话？当前会话继续保留。",
      okText: "确认退出",
      cancelText: "取消",
      onOk: async () => {
        try {
          const result = await api<{ revoked_count: string }>(
            "/me/sessions/others",
            {
              method: "DELETE",
              headers: { "Idempotency-Key": key },
              body: "{}",
            },
          );
          if (activeOwner.current !== owner) return;
          void message.success(
            "已退出其他会话，共" + result.revoked_count + "个",
          );
          await afterRevocation();
        } catch (error) {
          if (activeOwner.current !== owner) return;
          void message.error((error as Error).message);
          throw error;
        }
      },
    });
  }
  function revokeSession(session: AccountSession) {
    if (session.is_current) {
      confirmLogout();
      return;
    }
    const key = crypto.randomUUID();
    modal.confirm({
      title: "退出指定会话",
      content:
        "确认退出“" +
        (session.client_summary || "未登记设备") +
        "”的登录会话？",
      okText: "确认退出",
      cancelText: "取消",
      onOk: async () => {
        try {
          await api("/me/sessions/" + session.id, {
            method: "DELETE",
            headers: {
              "Idempotency-Key": key,
              "If-Match": '"' + session.revision + '"',
            },
            body: "{}",
          });
          if (activeOwner.current !== owner) return;
          void message.success("该会话已退出");
          await afterRevocation();
        } catch (error) {
          if (activeOwner.current !== owner) return;
          void message.error((error as Error).message);
          if (error instanceof ApiError && error.status === 412)
            await sessions.refetch();
          throw error;
        }
      },
    });
  }
  function sessionTime(value: string | null) {
    if (!value) return "—";
    return new Intl.DateTimeFormat(account?.locale || "zh-CN", {
      timeZone: account?.timezone || "Asia/Shanghai",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }
  function closureInfo() {
    openDialog("closure");
  }
  const profileCard = (
    <div ref={profileRef} className="account-profile-section">
      <Panel
        title={administrator ? "个人资料" : "基本资料"}
        extra={
          !consumer ? (
            <Button type="link" onClick={openEditor} disabled={!account}>
              编辑资料
            </Button>
          ) : undefined
        }
      >
        {query.isPending ? (
          <Skeleton active paragraph={{ rows: 1 }} />
        ) : (
          <div className="account-profile-content">
            <Avatar
              className="account-profile-avatar"
              size={consumer ? 70 : administrator ? 58 : 66}
              icon={
                administrator ? <UserOutlined /> : <Icon name="person-solid" />
              }
            />
            <div>
              <p>
                <span>昵称</span>
                <b>
                  {account?.display_name || bootstrap.user?.display_name || "—"}
                </b>
                {consumer && (
                  <Button onClick={openEditor} disabled={!account}>
                    编辑
                  </Button>
                )}
              </p>
              <p>
                <span>邮箱</span>
                <b>{account?.email_mask || "—"}</b>
                {consumer && (
                  <Button
                    onClick={() => void message.info("邮箱变更验证接口待接入")}
                  >
                    修改
                  </Button>
                )}
              </p>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
  const passwordCard = (
    <div ref={securityRef}>
      <Panel title="账号安全">
        <div className="account-password-content">
          <TileIcon name="lock" />
          <div>
            <h2>登录密码</h2>
            <p>用于登录平台的账号密码</p>
          </div>
          <Button onClick={() => navigate("/auth?tab=reset")}>修改密码</Button>
        </div>
      </Panel>
    </div>
  );
  const workspaceChoices = (
    <Radio.Group
      value={workspace}
      onChange={(event) => setWorkspace(event.target.value)}
      aria-label="选择工作区"
    >
      {choices.map((choice) => (
        <Radio key={choice.id} value={choice.id} aria-label={choice.label}>
          <TileIcon name={choice.icon} />
          <span>
            <b>
              {choice.label}
              {administrator && choice.id === role ? " · 当前" : ""}
            </b>
            {consumer ? (
              <small>{choice.description}</small>
            ) : choice.id === "PUBLISHER" ? (
              administrator ? (
                <Status tone={publisherEnabled ? "green" : "gray"}>
                  {publisherEnabled ? "已启用" : "待开通"}
                </Status>
              ) : (
                <small>{publisherEnabled ? "已启用" : "待开通"}</small>
              )
            ) : null}
          </span>
        </Radio>
      ))}
    </Radio.Group>
  );
  const workspaceButton = (
    <Button type="primary" onClick={switchWorkspace}>
      {consumer ? "切换到发布者" : "切换工作区"}
    </Button>
  );
  const workspaceCard = consumer ? (
    <div className="account-workspace">
      <h2>工作区切换</h2>
      <p>
        选择你的使用方式。开启脚本发布能力后，可上传并发布个人脚本，供其他用户按次使用。
      </p>
      <div>
        {workspaceChoices}
        {workspaceButton}
      </div>
    </div>
  ) : (
    <Panel title="工作区" className="account-workspace-compact">
      {!administrator && (
        <>
          <TileIcon name="stack" />
          <span>当前可用的工作区</span>
        </>
      )}
      {workspaceChoices}
      {workspaceButton}
    </Panel>
  );
  const sessionCard = (
    <div ref={sessionsRef}>
      <Panel
        title={administrator ? "当前会话" : consumer ? "会话管理" : "账号会话"}
        className="account-sessions"
      >
        <TileIcon name={administrator ? "windows-solid" : "desktop"} />
        <div>
          <h3>
            {!administrator ? "当前登录设备　" : ""}
            {account?.current_session.client_summary ||
              (query.isPending ? "正在读取设备" : "未登记设备")}{" "}
            {consumer && <Status tone="green">当前会话</Status>}
            {!consumer && "（当前会话）"}
          </h3>
          {consumer ? (
            <p>设备类型　{account?.current_session.client_summary || "—"}</p>
          ) : administrator ? (
            <p>当前正在使用的登录设备</p>
          ) : null}
        </div>
        <Button disabled={!account} onClick={revokeOthers}>
          退出其他会话
        </Button>
      </Panel>
    </div>
  );
  const closureCard = (
    <div ref={closeRef}>
      <Panel
        title="账号注销"
        className="account-close"
        extra={prototype ? <Status>售后与结算为本地示例</Status> : undefined}
      >
        {consumer ? (
          <div className="account-close-warning">
            <WarningFilled />
            <span>
              注销后将停止新业务。
              {prototype ? (
                <>
                  尚有 <b>1笔售后</b> 和 <b>1笔结算</b>{" "}
                  进入受限处理，完成后按保留策略清理。
                </>
              ) : (
                "未结订单、售后和收益将按账户检查结果处理。"
              )}
            </span>
            <Button
              disabled={!account || account.is_last_access_manager}
              onClick={closureInfo}
            >
              申请注销
            </Button>
          </div>
        ) : (
          <div className="account-closure-details">
            <div className="account-closure-counters">
              <span>
                <TileIcon name="support" />
                尚有售后　<b>{prototype ? "1 笔" : "待检查"}</b>
              </span>
              <span>
                <TileIcon
                  name={administrator ? "money" : "database"}
                  color={administrator ? "orange" : "blue"}
                />
                尚有结算　<b>{prototype ? "1 笔" : "待检查"}</b>
              </span>
              {!administrator && (
                <Button
                  type="primary"
                  disabled={!account || account.is_last_access_manager}
                  onClick={closureInfo}
                >
                  申请注销
                </Button>
              )}
            </div>
            {administrator && (
              <p>
                {account?.is_last_access_manager
                  ? "当前账号是最后权限管理员，请先完成权限交接。"
                  : "最后权限管理员须完成权限交接后申请注销。"}
              </p>
            )}
            <p className="account-closure-note">
              <InfoCircleOutlined />
              申请后进入关闭中，停止新购买和新发布，保留售后及结算入口，待未结事项处理完再按保留规则完成注销。
            </p>
            {administrator && (
              <Button
                type="primary"
                disabled={!account || account.is_last_access_manager}
                onClick={closureInfo}
              >
                申请注销
              </Button>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
  return (
    <div className="account-page">
      <PageHeading title="账户设置" />
      <Tabs
        activeKey={validSection ? tab : ""}
        onChange={selectSection}
        onTabClick={(value) => {
          if (value === tab) selectSection(value);
        }}
        items={accountSections}
      />
      {(!validSection || !validDialog) && (
        <Alert
          className="account-load-error"
          type="warning"
          showIcon
          title="账户设置入口不可用"
          action={
            <Button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("section");
                next.delete("dialog");
                setParams(next);
              }}
            >
              返回资料
            </Button>
          }
        />
      )}
      {query.error && (
        <Alert
          className="account-load-error"
          type="error"
          showIcon
          title="账户资料暂时无法加载"
          description={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      {consumer ? (
        <>
          <div className="account-top-cards">
            {profileCard}
            {passwordCard}
          </div>
          {sessionCard}
          {workspaceCard}
        </>
      ) : administrator ? (
        <>
          <div className="account-admin-top">
            {profileCard}
            {workspaceCard}
          </div>
          {sessionCard}
        </>
      ) : (
        <>
          {profileCard}
          {sessionCard}
          {workspaceCard}
        </>
      )}
      {closureCard}
      <Modal
        title="编辑昵称"
        open={editing}
        onCancel={() => {
          if (!saving) {
            form.resetFields();
            setEditing(false);
          }
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        forceRender
      >
        {editError && (
          <Alert
            className="account-edit-feedback"
            type="error"
            showIcon
            title={editError.message}
            action={
              editError instanceof ApiError &&
              [412, 428].includes(editError.status) ? (
                <Button onClick={() => void loadLatest()}>加载最新资料</Button>
              ) : undefined
            }
          />
        )}
        {editNotice && (
          <Alert
            className="account-edit-feedback"
            type="info"
            showIcon
            title={editNotice}
          />
        )}
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void saveProfile(values)}
        >
          <Form.Item
            name="display_name"
            label="昵称"
            rules={[
              { required: true, whitespace: true, message: "请填写昵称" },
              { max: 120 },
            ]}
          >
            <Input maxLength={120} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="账号安全"
        open={securityOpen}
        onCancel={closeDialog}
        footer={<Button onClick={closeDialog}>关闭</Button>}
      >
        <p>登录邮箱　{account?.email_mask || "—"}</p>
        <div className="account-security-actions">
          <Button onClick={() => navigate("/auth?tab=reset")}>修改密码</Button>
          <Button onClick={() => void message.info("邮箱变更验证接口待接入")}>
            修改邮箱
          </Button>
        </div>
      </Modal>
      <Modal
        title="会话管理"
        open={sessionsOpen}
        onCancel={closeDialog}
        width={1000}
        footer={
          <>
            <Button onClick={confirmLogout}>退出当前登录</Button>
            <Button type="primary" onClick={closeDialog}>
              关闭
            </Button>
          </>
        }
      >
        {sessions.error && (
          <Alert
            type="error"
            showIcon
            title="会话暂时无法加载"
            action={
              <Button onClick={() => void sessions.refetch()}>重试</Button>
            }
          />
        )}
        <Table<AccountSession>
          rowKey="id"
          scroll={{ x: 850 }}
          loading={sessions.isPending}
          pagination={false}
          dataSource={sessionItems}
          locale={{ emptyText: <Empty description="暂无有效会话" /> }}
          columns={[
            {
              title: "设备",
              dataIndex: "client_summary",
              render: (value, item) => (
                <>
                  {value || "未登记设备"}{" "}
                  {item.is_current && <Status tone="green">当前会话</Status>}
                </>
              ),
            },
            {
              title: "登录时间",
              dataIndex: "authenticated_at",
              render: sessionTime,
            },
            {
              title: "最近活动",
              dataIndex: "last_seen_at",
              render: sessionTime,
            },
            { title: "有效至", dataIndex: "expires_at", render: sessionTime },
            {
              title: "操作",
              render: (_, item) => (
                <Button onClick={() => revokeSession(item)}>
                  {item.is_current ? "退出当前会话" : "退出此会话"}
                </Button>
              ),
            },
          ]}
        />
        {sessions.hasNextPage && (
          <Button
            className="account-more-sessions"
            loading={sessions.isFetchingNextPage}
            onClick={() => void sessions.fetchNextPage()}
          >
            加载更多
          </Button>
        )}
      </Modal>
      <Modal
        title="账号注销前检查"
        open={dialog === "closure"}
        onCancel={closeDialog}
        footer={
          <Button type="primary" onClick={closeDialog}>
            返回账户设置
          </Button>
        }
      >
        <p>注销将停止新业务，未结售后和结算按原规则继续处理。</p>
        {account?.is_last_access_manager && (
          <p>当前账号是最后权限管理员，请先完成权限交接。</p>
        )}
        <p>注销检查与数据清理接口待接入。</p>
      </Modal>
    </div>
  );
}
