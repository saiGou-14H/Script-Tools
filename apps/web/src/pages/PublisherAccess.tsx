import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useWorkspace } from "../context";
import { PublisherProfileEditor } from "../components/PublisherProfileEditor";
import type { PublisherProfileView } from "../types";
import { ConsumerHomePage } from "./ConsumerHome";

export function PublisherAccessPage() {
  const { bootstrap, refresh, setRole } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const entering = useRef(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["personal", bootstrap.user?.id, "publisher-profile"],
    queryFn: () => api<PublisherProfileView>("/me/publisher-profile"),
  });
  async function enter() {
    setError("");
    const current = await refresh();
    if (!current?.user?.roles.includes("PUBLISHER"))
      throw new Error("发布者状态已变化，请重新加载资料");
    setRole("PUBLISHER");
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
    });
  }
  useEffect(() => {
    if (!query.data?.profile?.enabled || entering.current) return;
    entering.current = true;
    void enter().catch((failure) => setError(failure.message));
  }, [query.data?.profile?.enabled]);
  async function reload() {
    const result = await query.refetch();
    if (result.error) throw result.error;
    if (result.data?.profile?.enabled) await enter();
  }
  return (
    <>
      <ConsumerHomePage />
      <Modal
        className="publisher-access-modal"
        title="开通发布者工作区"
        open
        centered
        maskClosable={false}
        width={610}
        footer={null}
        onCancel={() => navigate("/me/home", { replace: true })}
      >
        <p className="publisher-access-description">
          使用当前个人账号发布和管理脚本。请填写对外展示的资料并确认服务约定。
        </p>
        {error && (
          <Alert
            type="error"
            title={error}
            showIcon
            action={
              <Button
                onClick={() =>
                  void reload().catch((failure) => setError(failure.message))
                }
              >
                重新加载
              </Button>
            }
          />
        )}
        {query.isPending ? (
          <Skeleton active />
        ) : query.error ? (
          <Alert
            type="error"
            title="发布者资料暂时无法加载"
            description={query.error.message}
            showIcon
            action={<Button onClick={() => void query.refetch()}>重试</Button>}
          />
        ) : query.data?.profile && !query.data.profile.enabled ? (
          <Alert type="warning" title="发布者工作区当前已停用" showIcon />
        ) : query.data ? (
          <PublisherProfileEditor
            profile={query.data.profile}
            terms={query.data.terms}
            defaultName={bootstrap.user?.display_name}
            requireConsent
            onSaved={async () => {
              await enter();
            }}
            onReload={reload}
            submitLabel="开通并进入工作区"
          />
        ) : null}
        <Button
          className="publisher-access-cancel"
          onClick={() => navigate("/me/home", { replace: true })}
        >
          返回消费者工作区
        </Button>
      </Modal>
    </>
  );
}
