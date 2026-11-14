import {
  Alert,
  Button,
  Descriptions,
  Input,
  Modal,
  Select,
  Switch,
  Table,
} from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useAdminMetadata } from "../lib/admin-metadata";
import {
  type DeliveryMetadata,
  type FeatureMetadata,
  type PolicyMetadata,
  type ResourceProfileMetadata,
  deliveryStateLabels,
  deliveryChannelLabels,
} from "../lib/admin-delivery-settings";
import { diagnosticTime } from "../lib/admin-diagnostics";

export function AdminDeliveriesLivePage() {
  const [params, setParams] = useSearchParams();
  const { bootstrap } = useWorkspace();
  const search = new URLSearchParams();
  for (const key of ["q", "status", "channel", "source", "from", "to"]) {
    const value = params.get(key);
    if (value) search.set(key, value);
  }
  const deliveries = useAdminMetadata<DeliveryMetadata>(
    "notification-deliveries",
    search.toString(),
    true,
  );
  const id = params.get("delivery");
  const detail = useQuery({
    queryKey: [
      "admin",
      bootstrap.user?.id,
      bootstrap.user?.security_revision,
      "notification-delivery",
      id,
    ],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api<DeliveryMetadata>(
        `/admin/notification-deliveries/${encodeURIComponent(id!)}`,
        { signal },
      ),
  });
  const selected = detail.data;
  function update(key: string, value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <div className="admin-page admin-deliveries-page delivery-settings-live">
      <PageHeading title="通知投递" />
      <Notice>
        重新投递沿用原逻辑消息与收件人。投递与已读状态分别展示，重投和回执核验服务待接入。
      </Notice>
      <Panel className="admin-delivery-filters">
        <div className="delivery-live-filters">
          <Input.Search
            key={params.get("q") || ""}
            aria-label="投递搜索"
            placeholder="投递编号、事件类型或收件掩码"
            defaultValue={params.get("q") || ""}
            onSearch={(q) => update("q", q.trim())}
          />
          <Select
            aria-label="消息来源筛选"
            allowClear
            placeholder="全部来源"
            value={params.get("source") || undefined}
            options={[
              { value: "EVENT", label: "平台事件" },
              { value: "OUTPUT", label: "脚本产物" },
            ]}
            onChange={(value) => update("source", value)}
          />
          <Select
            aria-label="投递渠道筛选"
            allowClear
            placeholder="全部渠道"
            value={params.get("channel") || undefined}
            options={Object.entries(deliveryChannelLabels).map(
              ([value, label]) => ({ value, label }),
            )}
            onChange={(value) => update("channel", value)}
          />
          <Select
            aria-label="投递状态筛选"
            allowClear
            placeholder="全部状态"
            value={params.get("status") || undefined}
            options={Object.entries(deliveryStateLabels).map(
              ([value, label]) => ({ value, label }),
            )}
            onChange={(value) => update("status", value)}
          />
          <Button
            onClick={() => {
              const next = new URLSearchParams(params);
              for (const key of [
                "q",
                "status",
                "channel",
                "source",
                "from",
                "to",
              ])
                next.delete(key);
              setParams(next);
            }}
          >
            重置
          </Button>
        </div>
        {(params.has("from") || params.has("to")) && (
          <p className="settings-read-scope">
            查询时间 {params.get("from") || "最早"} 至{" "}
            {params.get("to") || "最新"}
          </p>
        )}
      </Panel>
      <Panel className="admin-delivery-table">
        {deliveries.isError && (
          <Alert
            type="error"
            title="投递查询失败"
            action={
              <Button onClick={() => void deliveries.refetch()}>
                重试投递查询
              </Button>
            }
          />
        )}
        <Table
          rowKey="id"
          loading={deliveries.isPending}
          dataSource={
            deliveries.data?.pages.flatMap((page) => page.items) || []
          }
          pagination={false}
          scroll={{ x: 1400 }}
          columns={[
            {
              title: "消息类型",
              width: 235,
              render: (_, row) => (
                <Button type="link" onClick={() => update("delivery", row.id)}>
                  {row.source === "OUTPUT"
                    ? "脚本产物消息"
                    : row.event_type || "平台事件"}
                </Button>
              ),
            },
            {
              title: "渠道",
              width: 130,
              render: (_, row) =>
                deliveryChannelLabels[row.channel] || row.channel,
            },
            {
              title: "状态",
              width: 195,
              render: (_, row) => (
                <Status tone={row.status === "FAILED" ? "red" : "blue"}>
                  {deliveryStateLabels[row.status] || row.status}
                </Status>
              ),
            },
            {
              title: "回执 / 收件人掩码",
              width: 270,
              render: (_, row) => (
                <>
                  {row.receipt_mask || "未记录回执"}
                  <br />
                  {row.masked_target || "渠道关联不可用"}
                </>
              ),
            },
            { title: "次数", dataIndex: "attempt_count", width: 90 },
            {
              title: "已读时间",
              width: 220,
              render: (_, row) => diagnosticTime(row.read_at),
            },
            {
              title: "操作",
              width: 160,
              render: (_, row) => (
                <Button disabled>
                  {row.status === "UNKNOWN" ? "先核验" : "重投待接入"}
                </Button>
              ),
            },
          ]}
        />
        {deliveries.hasNextPage && (
          <Button
            loading={deliveries.isFetchingNextPage}
            onClick={() => void deliveries.fetchNextPage()}
          >
            加载更多投递
          </Button>
        )}
      </Panel>
      <Modal
        title="通知投递元数据"
        open={Boolean(id)}
        onCancel={() => update("delivery")}
        footer={
          <Button onClick={() => update("delivery")}>关闭投递详情</Button>
        }
        width={680}
      >
        {detail.isPending && <p>正在读取投递记录</p>}
        {detail.isError && (
          <Alert
            type="error"
            title="投递详情不可用"
            description={detail.error.message}
            action={
              <Button onClick={() => void detail.refetch()}>
                重试投递详情
              </Button>
            }
          />
        )}
        {selected && (
          <Descriptions
            column={1}
            bordered
            size="small"
            items={[
              { key: "id", label: "投递编号", children: selected.id },
              {
                key: "notification",
                label: "逻辑消息",
                children: selected.notification_id,
              },
              {
                key: "source",
                label: "消息来源",
                children:
                  selected.source === "OUTPUT"
                    ? "脚本产物"
                    : selected.event_type || "平台事件",
              },
              {
                key: "status",
                label: "投递状态",
                children:
                  deliveryStateLabels[selected.status] || selected.status,
              },
              {
                key: "recipient",
                label: "收件人掩码",
                children: selected.masked_target || "关联不可用",
              },
              {
                key: "receipt",
                label: "回执掩码",
                children: selected.receipt_mask || "未记录",
              },
              {
                key: "read",
                label: "已读时间",
                children: diagnosticTime(selected.read_at),
              },
              {
                key: "expiry",
                label: "消息有效期",
                children: (
                  <>
                    {diagnosticTime(selected.notification_expires_at)} ·{" "}
                    {selected.notification_expired ? "已过期" : "有效期内"}
                  </>
                ),
              },
              {
                key: "next",
                label: "下次尝试时间",
                children: diagnosticTime(selected.next_attempt_at),
              },
              {
                key: "dependency",
                label: "附件依赖期限",
                children: diagnosticTime(selected.dependency_deadline),
              },
              {
                key: "binding",
                label: "渠道关联",
                children: selected.binding_state,
              },
              {
                key: "bindingVerified",
                label: "渠道验证时间",
                children: diagnosticTime(selected.binding_verified_at),
              },
              {
                key: "bindingDisabled",
                label: "渠道停用时间",
                children: diagnosticTime(selected.binding_disabled_at),
              },
              {
                key: "outputBinding",
                label: "产物关联",
                children: selected.output_binding_matches ? "一致" : "关联异常",
              },
              {
                key: "count",
                label: "记录尝试次数",
                children: selected.attempt_count,
              },
              {
                key: "latest",
                label: "最近发送尝试",
                children: selected.latest_attempt
                  ? `${selected.latest_attempt.attempt_no} · ${selected.latest_attempt.status}`
                  : "暂无发送尝试",
              },
              {
                key: "risk",
                label: "最近尝试重复风险",
                children: selected.latest_attempt
                  ? selected.latest_attempt.duplicate_risk
                    ? "有标记"
                    : "无标记"
                  : "未记录",
              },
              {
                key: "failure",
                label: "失败码",
                children: selected.failure_code || "未记录",
              },
            ]}
          />
        )}
        <p className="settings-read-scope">
          消息正文与收件地址读取需要对应数据授权
        </p>
      </Modal>
    </div>
  );
}

export function AdminPlatformSettingsLivePage() {
  const [params, setParams] = useSearchParams();
  const tab = ["basic", "features", "network", "protection"].includes(
    params.get("tab") || "",
  )
    ? params.get("tab")!
    : "basic";
  const featureQuery = new URLSearchParams();
  if (params.get("feature_q")) featureQuery.set("q", params.get("feature_q")!);
  const features = useAdminMetadata<FeatureMetadata>(
    "features",
    featureQuery.toString(),
    true,
  );
  const network = useAdminMetadata<PolicyMetadata>(
    "network-policies",
    "",
    true,
  );
  const metadataView = params.get("metadata");
  const policies = useAdminMetadata<PolicyMetadata>(
    "runtime-policies",
    "",
    metadataView === "runtime",
  );
  const profiles = useAdminMetadata<ResourceProfileMetadata>(
    "resource-profiles",
    "",
    metadataView === "resources",
  );
  function update(key: string, value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <div className="admin-page admin-platform-settings-page delivery-settings-live">
      <PageHeading
        title="平台设置"
        description="管理平台的基础配置、能力开关、网络策略与销售保护，控制服务对外能力与运行边界。"
      />
      <div className="admin-segment-tabs">
        {[
          ["basic", "基本"],
          ["features", "能力开关"],
          ["network", "网络策略"],
          ["protection", "销售保护"],
        ].map(([key, label]) => (
          <Button
            key={key}
            type={tab === key ? "primary" : "default"}
            onClick={() => {
              update("tab", key);
              document
                .getElementById(`platform-${key}`)
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="admin-platform-grid">
        <div id="platform-basic">
          <Panel>
            <div className="commerce-core-switch">
              <TileIcon name="info" />
              <span>
                <h3>通用按次商业</h3>
                <p>平台核心商业模式，存量履约及历史记录持续保留。</p>
              </span>
              <Status>核心能力</Status>
            </div>
            <h3 className="platform-section-title" id="platform-features">
              服务与通道配置
            </h3>
            <Input.Search
              key={params.get("feature_q") || ""}
              aria-label="功能键搜索"
              placeholder="搜索功能键"
              defaultValue={params.get("feature_q") || ""}
              onSearch={(q) => update("feature_q", q.trim())}
            />
            {features.isError && (
              <Alert
                type="error"
                title="能力配置查询失败"
                action={
                  <Button onClick={() => void features.refetch()}>
                    重试能力查询
                  </Button>
                }
              />
            )}
            <Table
              rowKey="id"
              loading={features.isPending}
              dataSource={
                features.data?.pages.flatMap((page) => page.items) || []
              }
              pagination={false}
              scroll={{ x: 540 }}
              columns={[
                { title: "功能键", dataIndex: "key", width: 230 },
                { title: "阶段", dataIndex: "phase", width: 80 },
                {
                  title: "存储开关",
                  width: 90,
                  render: (_, row) => (
                    <Switch
                      checked={row.enabled}
                      disabled
                      aria-label={`${row.key} 存储开关`}
                    />
                  ),
                },
                {
                  title: "证据记录",
                  width: 140,
                  render: (_, row) => (row.has_evidence ? "有记录" : "未记录"),
                },
              ]}
            />
            {features.hasNextPage && (
              <Button
                loading={features.isFetchingNextPage}
                onClick={() => void features.fetchNextPage()}
              >
                加载更多能力配置
              </Button>
            )}
            <p className="settings-read-scope">
              功能启用记录与部署验收分别核对，修改入口待接入。
            </p>
          </Panel>
        </div>
        <div id="platform-protection">
          <Panel title="销售保护">
            <p>销售、运行和资金保护状态等待保护服务接入。</p>
            {[
              ["order", "暂停新销售"],
              ["play", "暂停新运行"],
              ["database", "暂停资金发送"],
            ].map(([icon, title]) => (
              <article className="platform-protection-row" key={title}>
                <TileIcon name={icon} />
                <span>
                  <h3>{title}</h3>
                  <p>历史成交、核验与账本记录持续保留。</p>
                </span>
                <Status tone="gray">状态待接入</Status>
              </article>
            ))}
          </Panel>
        </div>
        <div id="platform-network">
          <Panel title="网络策略">
            {network.isError && (
              <Alert
                type="error"
                title="网络策略查询失败"
                action={
                  <Button onClick={() => void network.refetch()}>
                    重试网络策略查询
                  </Button>
                }
              />
            )}
            <Table
              rowKey="id"
              loading={network.isPending}
              dataSource={
                network.data?.pages.flatMap((page) => page.items) || []
              }
              pagination={false}
              scroll={{ x: 600 }}
              columns={[
                { title: "策略键", dataIndex: "policy_key", width: 220 },
                { title: "版本", dataIndex: "version", width: 75 },
                {
                  title: "生效时间",
                  width: 210,
                  render: (_, row) => diagnosticTime(row.effective_at),
                },
                {
                  title: "版本状态",
                  width: 110,
                  render: (_, row) =>
                    row.is_current
                      ? "当前生效"
                      : row.is_future
                        ? "待生效"
                        : "历史版本",
                },
              ]}
            />
            {network.hasNextPage && (
              <Button
                loading={network.isFetchingNextPage}
                onClick={() => void network.fetchNextPage()}
              >
                加载更多网络策略
              </Button>
            )}
            <p className="settings-read-scope">
              规则内容、修改预览与出站网关联动待接入。
            </p>
          </Panel>
        </div>
        <Panel title="回调与对账">
          <Link className="platform-history-row" to="/admin/reconciliation">
            <TileIcon name="audit" />
            <span>
              <h3>历史查询回调对账</h3>
              <p>保留历史查询、回调与对账记录，用于问题追溯与数据核对。</p>
            </span>
            <Status tone="green">✓ 保留</Status>
          </Link>
          <div className="settings-metadata-actions">
            <Button onClick={() => update("metadata", "runtime")}>
              查看执行策略版本
            </Button>
            <Button onClick={() => update("metadata", "resources")}>
              查看资源模板版本
            </Button>
          </div>
        </Panel>
      </div>
      <Modal
        className="settings-metadata-modal"
        title={metadataView === "runtime" ? "执行策略版本" : "资源模板版本"}
        open={metadataView === "runtime" || metadataView === "resources"}
        onCancel={() => update("metadata")}
        footer={
          <Button onClick={() => update("metadata")}>关闭策略详情</Button>
        }
        width={760}
      >
        {metadataView === "runtime" ? (
          <>
            {policies.isError && (
              <Alert
                type="error"
                title="执行策略查询失败"
                action={
                  <Button onClick={() => void policies.refetch()}>
                    重试执行策略查询
                  </Button>
                }
              />
            )}
            <Table
              rowKey="id"
              loading={policies.isPending}
              dataSource={
                policies.data?.pages.flatMap((page) => page.items) || []
              }
              pagination={false}
              scroll={{ x: 600 }}
              columns={[
                { title: "版本", dataIndex: "version", width: 100 },
                {
                  title: "生效时间",
                  width: 250,
                  render: (_, row) => diagnosticTime(row.effective_at),
                },
                {
                  title: "版本状态",
                  render: (_, row) =>
                    row.is_current
                      ? "当前生效"
                      : row.is_future
                        ? "待生效"
                        : "历史版本",
                },
              ]}
            />
            {policies.hasNextPage && (
              <Button
                loading={policies.isFetchingNextPage}
                onClick={() => void policies.fetchNextPage()}
              >
                加载更多执行策略
              </Button>
            )}
          </>
        ) : (
          <>
            {profiles.isError && (
              <Alert
                type="error"
                title="资源模板查询失败"
                action={
                  <Button onClick={() => void profiles.refetch()}>
                    重试资源模板查询
                  </Button>
                }
              />
            )}
            <Table
              rowKey="id"
              loading={profiles.isPending}
              dataSource={
                profiles.data?.pages.flatMap((page) => page.items) || []
              }
              pagination={false}
              scroll={{ x: 600 }}
              columns={[
                { title: "名称", dataIndex: "name", width: 250 },
                { title: "版本", dataIndex: "version", width: 100 },
                {
                  title: "退役时间",
                  render: (_, row) => diagnosticTime(row.retired_at),
                },
              ]}
            />
            {profiles.hasNextPage && (
              <Button
                loading={profiles.isFetchingNextPage}
                onClick={() => void profiles.fetchNextPage()}
              >
                加载更多资源模板
              </Button>
            )}
          </>
        )}
        <p className="settings-read-scope">
          策略与资源限制正文查询及维护服务待接入。
        </p>
      </Modal>
    </div>
  );
}
