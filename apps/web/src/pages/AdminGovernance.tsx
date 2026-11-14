import {
  Alert,
  Button,
  Descriptions,
  Empty,
  Input,
  Modal,
  Select,
  Table,
} from "antd";
import { Link, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { Icon } from "../components/Icon";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { useAdminMetadata } from "../lib/admin-metadata";
import { diagnosticTime } from "../lib/admin-diagnostics";
import {
  type GrantMetadata,
  type AuditMetadata,
  type AccessSessionMetadata,
  type BackupMetadata,
  type DrillMetadata,
  type CleanupMetadata,
  type RetentionPolicyMetadata,
  governanceCapabilities,
  grantStateLabels,
} from "../lib/admin-governance";

export function AdminAccessLivePage() {
  const [params, setParams] = useSearchParams();
  const { bootstrap } = useWorkspace();
  const grantSearch = new URLSearchParams();
  const auditSearch = new URLSearchParams();
  for (const key of ["q", "status"]) {
    if (params.get(`grant_${key}`))
      grantSearch.set(key, params.get(`grant_${key}`)!);
  }
  for (const key of [
    "q",
    "status",
    "actor",
    "object",
    "action",
    "from",
    "to",
  ]) {
    if (params.get(`audit_${key}`))
      auditSearch.set(key, params.get(`audit_${key}`)!);
  }
  const grants = useAdminMetadata<GrantMetadata>(
    "role-grants",
    grantSearch.toString(),
    true,
  );
  const audit = useAdminMetadata<AuditMetadata>(
    "audit-events",
    auditSearch.toString(),
    true,
  );
  const selectedId = params.get("grant");
  const selected = useAdminMetadata<GrantMetadata>(
    "role-grants",
    new URLSearchParams({ q: selectedId || "" }).toString(),
    Boolean(selectedId),
  );
  const grant = selected.data?.pages
    .flatMap((page) => page.items)
    .find((row) => row.id === selectedId?.toLowerCase());
  const sessionsOpen = params.get("sessions") === "1";
  const canDiagnose = Boolean(
    bootstrap.user?.capabilities.includes("data.diagnose"),
  );
  const sessions = useAdminMetadata<AccessSessionMetadata>(
    "data-access-sessions",
    "",
    sessionsOpen && canDiagnose,
  );
  function update(key: string, value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <div className="admin-page admin-access-page governance-live">
      <div className="admin-access-banner">
        <PageHeading
          title="权限与操作审计"
          description="管理平台权限与账号授权，提供关键操作的审计记录与可追溯能力，保障平台安全合规运行。"
        />
      </div>
      <Panel title="ADMIN能力矩阵" className="admin-capability-matrix">
        <div>
          {governanceCapabilities.map(([capability, text]) => (
            <article key={capability}>
              <span className="governance-capability-icon" aria-hidden>
                {"</>"}
              </span>
              <span>
                <h3>{capability}</h3>
                <p>{text}</p>
              </span>
            </article>
          ))}
        </div>
      </Panel>
      <div className="admin-access-columns">
        <Panel
          title="账号权限管理"
          extra={
            <Button type="primary" disabled>
              授权管理待接入
            </Button>
          }
        >
          <p>按授权记录查看生效状态，账号可用性与授权到期分别核对。</p>
          <div className="governance-filters">
            <Input.Search
              key={params.get("grant_q") || ""}
              aria-label="授权记录搜索"
              placeholder="授权编号、账号掩码或能力"
              defaultValue={params.get("grant_q") || ""}
              onSearch={(value) => update("grant_q", value.trim())}
            />
            <Select
              aria-label="授权状态筛选"
              allowClear
              placeholder="全部授权状态"
              value={params.get("grant_status") || undefined}
              options={Object.entries(grantStateLabels).map(
                ([value, label]) => ({ value, label }),
              )}
              onChange={(value) => update("grant_status", value)}
            />
          </div>
          {grants.isError && (
            <Alert
              type="error"
              title="授权查询失败"
              action={
                <Button onClick={() => void grants.refetch()}>
                  重试授权查询
                </Button>
              }
            />
          )}
          <Table
            rowKey="id"
            loading={grants.isPending}
            dataSource={grants.data?.pages.flatMap((page) => page.items) || []}
            pagination={false}
            scroll={{ x: 780 }}
            columns={[
              {
                title: "账号（掩码）",
                width: 190,
                render: (_, row) => (
                  <>
                    <Button type="link" onClick={() => update("grant", row.id)}>
                      {row.account_mask}
                    </Button>
                    {row.is_current_user && <Status>当前账号</Status>}
                    {row.is_last_access_manager && (
                      <Status tone="orange">最后权限管理员账号</Status>
                    )}
                  </>
                ),
              },
              {
                title: "已授权能力",
                width: 270,
                render: (_, row) => (
                  <div className="grant-capabilities">
                    {row.capabilities.map((item) => (
                      <code key={item}>{item}</code>
                    ))}
                  </div>
                ),
              },
              {
                title: "状态",
                width: 135,
                render: (_, row) => (
                  <Status tone={row.status === "ACTIVE" ? "green" : "gray"}>
                    {grantStateLabels[row.status] || row.status}
                  </Status>
                ),
              },
              {
                title: "授权到期",
                width: 190,
                render: (_, row) =>
                  row.expires_at ? diagnosticTime(row.expires_at) : "长期有效",
              },
            ]}
          />
          {grants.hasNextPage && (
            <Button
              loading={grants.isFetchingNextPage}
              onClick={() => void grants.fetchNextPage()}
            >
              加载更多授权
            </Button>
          )}
          <Notice>
            本人授权与最后有效权限管理员保护由管理服务执行，授权维护入口待接入。
          </Notice>
        </Panel>
        <Panel
          title="操作审计"
          extra={
            <Button
              type="text"
              disabled={!canDiagnose}
              onClick={() => update("sessions", "1")}
            >
              限时排障会话记录
            </Button>
          }
        >
          <p>查看操作者、对象、结果、修订与关联请求，查询行为追加审计。</p>
          <div className="governance-filters">
            <Input.Search
              key={params.get("audit_q") || ""}
              aria-label="审计事件搜索"
              placeholder="动作、对象类型或请求编号"
              defaultValue={params.get("audit_q") || ""}
              onSearch={(value) => update("audit_q", value.trim())}
            />
            <Select
              aria-label="审计结果筛选"
              allowClear
              placeholder="全部结果"
              value={params.get("audit_status") || undefined}
              options={[
                { value: "SUCCESS", label: "成功" },
                { value: "DENIED", label: "已拒绝" },
                { value: "FAILED", label: "失败" },
              ]}
              onChange={(value) => update("audit_status", value)}
            />
          </div>
          {audit.isError && (
            <Alert
              type="error"
              title="审计查询失败"
              action={
                <Button onClick={() => void audit.refetch()}>
                  重试审计查询
                </Button>
              }
            />
          )}
          <Table
            rowKey="id"
            loading={audit.isPending}
            dataSource={audit.data?.pages.flatMap((page) => page.items) || []}
            pagination={false}
            scroll={{ x: 1050 }}
            columns={[
              {
                title: "操作者 / 时间",
                width: 210,
                render: (_, row) => (
                  <>
                    {row.actor_mask}
                    <br />
                    {diagnosticTime(row.created_at)}
                  </>
                ),
              },
              {
                title: "对象",
                width: 230,
                render: (_, row) => (
                  <>
                    {row.target_type}
                    <br />
                    {row.target_id || "全局"}
                  </>
                ),
              },
              {
                title: "动作 / 请求",
                width: 260,
                render: (_, row) => (
                  <>
                    {row.action}
                    <br />
                    {row.request_id}
                  </>
                ),
              },
              {
                title: "理由 / 修订",
                width: 220,
                render: (_, row) => (
                  <>
                    {row.reason || "未记录理由"}
                    <br />
                    {row.before_revision ?? "—"} → {row.after_revision ?? "—"}
                  </>
                ),
              },
              { title: "结果", dataIndex: "outcome", width: 120 },
            ]}
          />
          {audit.hasNextPage && (
            <Button
              loading={audit.isFetchingNextPage}
              onClick={() => void audit.fetchNextPage()}
            >
              加载更多审计
            </Button>
          )}
        </Panel>
      </div>
      <Notice>权限维护与会话签发继续按账号、范围及修订校验。</Notice>
      <Modal
        title="授权记录详情"
        open={Boolean(selectedId)}
        onCancel={() => update("grant")}
        footer={<Button onClick={() => update("grant")}>关闭授权详情</Button>}
        width={660}
      >
        {selected.isPending && <p>正在读取授权记录</p>}
        {selected.isError && (
          <Alert
            type="error"
            title="授权详情查询失败"
            action={
              <Button onClick={() => void selected.refetch()}>
                重试授权详情
              </Button>
            }
          />
        )}
        {selected.isSuccess && !grant && (
          <Empty description={`授权 ${selectedId} 不可用`} />
        )}
        {grant && (
          <Descriptions
            column={1}
            bordered
            items={[
              { key: "id", label: "授权编号", children: grant.id },
              {
                key: "account",
                label: "账号掩码",
                children: grant.account_mask,
              },
              {
                key: "status",
                label: "授权状态",
                children: grantStateLabels[grant.status] || grant.status,
              },
              {
                key: "accountState",
                label: "账号状态",
                children: grant.account_status,
              },
              {
                key: "capabilities",
                label: "能力",
                children: grant.capabilities.join("、"),
              },
              { key: "reason", label: "授权理由", children: grant.reason },
              { key: "revision", label: "修订", children: grant.revision },
              {
                key: "expiry",
                label: "到期时间",
                children: grant.expires_at
                  ? diagnosticTime(grant.expires_at)
                  : "长期有效",
              },
            ]}
          />
        )}
      </Modal>
      <Modal
        title="本人限时排障会话"
        open={sessionsOpen}
        onCancel={() => update("sessions")}
        footer={
          <Button onClick={() => update("sessions")}>关闭会话记录</Button>
        }
        width={760}
      >
        {!canDiagnose && <Alert type="warning" title="需要data.diagnose能力" />}
        {sessions.isError && (
          <Alert
            type="error"
            title="会话查询失败"
            action={
              <Button onClick={() => void sessions.refetch()}>
                重试会话查询
              </Button>
            }
          />
        )}
        <Table
          rowKey="id"
          loading={canDiagnose && sessions.isPending}
          dataSource={sessions.data?.pages.flatMap((page) => page.items) || []}
          pagination={false}
          scroll={{ x: 680 }}
          columns={[
            {
              title: "会话 / 工单",
              width: 245,
              render: (_, row) => (
                <>
                  {row.id}
                  <br />
                  {row.ticket_ref}
                </>
              ),
            },
            { title: "状态", dataIndex: "status", width: 150 },
            { title: "范围项数", dataIndex: "scope_count", width: 100 },
            {
              title: "到期时间",
              width: 200,
              render: (_, row) => diagnosticTime(row.expires_at),
            },
          ]}
        />
        {sessions.hasNextPage && (
          <Button
            loading={sessions.isFetchingNextPage}
            onClick={() => void sessions.fetchNextPage()}
          >
            加载更多会话
          </Button>
        )}
        <p className="governance-scope">
          会话签发与撤销待接入。<Link to="/admin/runs">前往运行与排障</Link>
        </p>
      </Modal>
    </div>
  );
}

export function AdminRecoveryLivePage() {
  const [params, setParams] = useSearchParams();
  const views = [
    ["policies", "保留策略"],
    ["backups", "备份清单"],
    ["drills", "恢复演练"],
    ["cleanup", "清理回执"],
  ];
  const view = views.some(([key]) => key === params.get("view"))
    ? params.get("view")!
    : "policies";
  const search = new URLSearchParams();
  if (params.get("q")) search.set("q", params.get("q")!);
  if (params.get("status") && (view === "drills" || view === "cleanup"))
    search.set("status", params.get("status")!);
  const backupId = params.get("backup");
  if (view === "drills" && backupId) search.set("backup_id", backupId);
  if (view === "cleanup")
    for (const key of ["request_id", "store"]) {
      if (params.get(key)) search.set(key, params.get(key)!);
    }
  const policies = useAdminMetadata<RetentionPolicyMetadata>(
    "observability/policies",
    search.toString(),
    view === "policies",
  );
  const backups = useAdminMetadata<BackupMetadata>(
    "backups",
    view === "backups" ? search.toString() : "",
    true,
  );
  const drills = useAdminMetadata<DrillMetadata>(
    "recovery-drills",
    search.toString(),
    view === "drills",
  );
  const cleanup = useAdminMetadata<CleanupMetadata>(
    "cleanup-jobs",
    search.toString(),
    view === "cleanup",
  );
  const selected = useAdminMetadata<BackupMetadata>(
    "backups",
    new URLSearchParams({ q: backupId || "" }).toString(),
    Boolean(backupId),
  );
  const backup = selected.data?.pages
    .flatMap((page) => page.items)
    .find((row) => row.id === backupId?.toLowerCase());
  const query =
    view === "policies"
      ? policies
      : view === "backups"
        ? backups
        : view === "drills"
          ? drills
          : cleanup;
  function update(key: string, value?: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  return (
    <div className="admin-page admin-recovery-page governance-live">
      <PageHeading title="备份与清理" />
      <div className="admin-backup-banner">
        <div className="backup-stack">
          <span />
          <span />
          <span />
          <i>
            <Icon name="sync" />
          </i>
        </div>
        <span>
          <h2>备份与清理</h2>
          <p>
            查看备份清单、恢复演练与逐存储清理回执，未结事实按保留规则处理。
          </p>
        </span>
        <Button type="primary" disabled>
          创建备份
        </Button>
        <Button disabled>恢复预检待接入</Button>
      </div>
      <div className="backup-status-row">
        <Status tone="gray">
          {backups.isError
            ? "备份清单读取失败"
            : backups.isPending
              ? "正在读取备份清单"
              : backups.data?.pages[0]?.items.length
                ? "已有备份清单记录"
                : "暂无备份清单"}
        </Status>
        <Status tone="blue">恢复验证按演练记录核对</Status>
      </div>
      <div className="admin-recovery-columns">
        <Panel title="保留、备份与清理记录">
          <div className="governance-tabs">
            {views.map(([key, label]) => (
              <Button
                key={key}
                type={view === key ? "primary" : "default"}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("view", key);
                  next.delete("status");
                  next.delete("q");
                  setParams(next);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="governance-filters">
            <Input.Search
              key={`${view}-${params.get("q") || ""}`}
              aria-label="保留与恢复记录搜索"
              placeholder="记录编号或策略类型"
              defaultValue={params.get("q") || ""}
              onSearch={(value) => update("q", value.trim())}
            />
            {(view === "drills" || view === "cleanup") && (
              <Select
                aria-label="恢复或清理状态筛选"
                allowClear
                placeholder="全部状态"
                value={params.get("status") || undefined}
                options={(view === "drills"
                  ? ["PLANNED", "RUNNING", "PASSED", "FAILED", "CANCELLED"]
                  : ["PENDING", "RUNNING", "DONE", "FAILED"]
                ).map((value) => ({ value }))}
                onChange={(value) => update("status", value)}
              />
            )}
          </div>
          {backupId && view === "drills" && (
            <p className="governance-scope">
              备份筛选 {backupId}
              <Button type="link" onClick={() => update("backup")}>
                清除备份筛选
              </Button>
            </p>
          )}
          {query.isError && (
            <Alert
              type="error"
              title="保留与恢复记录查询失败"
              action={
                <Button onClick={() => void query.refetch()}>
                  重试保留与恢复查询
                </Button>
              }
            />
          )}
          {view === "policies" && (
            <Table
              rowKey="id"
              loading={policies.isPending}
              dataSource={
                policies.data?.pages.flatMap((page) => page.items) || []
              }
              pagination={false}
              scroll={{ x: 680 }}
              columns={[
                { title: "策略类型", dataIndex: "kind", width: 220 },
                { title: "版本", dataIndex: "version", width: 80 },
                {
                  title: "生效时间",
                  width: 210,
                  render: (_, row) => diagnosticTime(row.effective_at),
                },
                {
                  title: "版本状态",
                  width: 130,
                  render: (_, row) =>
                    row.is_current
                      ? "当前生效"
                      : row.is_future
                        ? "待生效"
                        : "历史版本",
                },
              ]}
            />
          )}
          {view === "backups" && (
            <Table
              rowKey="id"
              loading={backups.isPending}
              dataSource={
                backups.data?.pages.flatMap((page) => page.items) || []
              }
              pagination={false}
              scroll={{ x: 700 }}
              columns={[
                {
                  title: "备份编号",
                  width: 180,
                  render: (_, row) => (
                    <Button
                      type="link"
                      onClick={() => update("backup", row.id)}
                    >
                      {row.id.slice(0, 8)}
                    </Button>
                  ),
                },
                {
                  title: "清单完成时间",
                  width: 210,
                  render: (_, row) => diagnosticTime(row.completed_at),
                },
                {
                  title: "到期时间",
                  width: 210,
                  render: (_, row) => diagnosticTime(row.expires_at),
                },
                {
                  title: "有效期",
                  width: 110,
                  render: (_, row) => (row.expired ? "已过期" : "有效期内"),
                },
              ]}
            />
          )}
          {view === "drills" && (
            <Table
              rowKey="id"
              loading={drills.isPending}
              dataSource={
                drills.data?.pages.flatMap((page) => page.items) || []
              }
              pagination={false}
              scroll={{ x: 720 }}
              columns={[
                { title: "演练编号", dataIndex: "id", width: 230 },
                { title: "存储状态", dataIndex: "status", width: 140 },
                {
                  title: "完成时间",
                  width: 210,
                  render: (_, row) => diagnosticTime(row.finished_at),
                },
                {
                  title: "证据记录",
                  width: 130,
                  render: (_, row) => (row.has_evidence ? "有记录" : "未记录"),
                },
              ]}
            />
          )}
          {view === "cleanup" && (
            <Table
              rowKey="id"
              loading={cleanup.isPending}
              dataSource={
                cleanup.data?.pages.flatMap((page) => page.items) || []
              }
              pagination={false}
              scroll={{ x: 850 }}
              columns={[
                {
                  title: "范围 / 存储",
                  width: 170,
                  render: (_, row) => (
                    <>
                      {row.scope_type}
                      <br />
                      {row.store}
                    </>
                  ),
                },
                {
                  title: "清理 / 请求状态",
                  width: 200,
                  render: (_, row) => (
                    <>
                      {row.status}
                      <br />
                      {row.request_status}
                    </>
                  ),
                },
                { title: "尝试次数", dataIndex: "attempt_count", width: 100 },
                {
                  title: "完成时间",
                  width: 210,
                  render: (_, row) => diagnosticTime(row.completed_at),
                },
                { title: "失败码", dataIndex: "failure_code", width: 170 },
              ]}
            />
          )}
          {query.hasNextPage && (
            <Button
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              加载更多保留与恢复记录
            </Button>
          )}
        </Panel>
        <div>
          <Panel title="备份包含范围" className="backup-scope">
            <span className="backup-scope-cylinder" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <span>
              <h3>备份设计包含权益去重及撤权墓碑</h3>
              <p>实际内容与可恢复性通过备份内容核验和独立恢复演练验证。</p>
            </span>
          </Panel>
          <Panel title="恢复演练步骤" className="recovery-steps">
            <Notice>资金、未决预约与恢复证据分别核对。</Notice>
            {[
              ["核对资金", "核对账本金额与状态。"],
              ["核对未决预约", "核对数量与关键状态。"],
              ["执行演练", "按受控作业记录核对验证结果。"],
            ].map(([title, description], index) => (
              <article key={title}>
                <b>{index + 1}</b>
                <span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </span>
              </article>
            ))}
          </Panel>
        </div>
      </div>
      <Modal
        title="备份清单元数据"
        open={Boolean(backupId) && view === "backups"}
        onCancel={() => update("backup")}
        footer={<Button onClick={() => update("backup")}>关闭备份详情</Button>}
        width={650}
      >
        {selected.isPending && <p>正在读取备份清单</p>}
        {selected.isError && (
          <Alert
            type="error"
            title="备份详情查询失败"
            action={
              <Button onClick={() => void selected.refetch()}>
                重试备份详情
              </Button>
            }
          />
        )}
        {selected.isSuccess && !backup && (
          <Empty description={`备份 ${backupId} 不可用`} />
        )}
        {backup && (
          <Descriptions
            bordered
            column={1}
            items={[
              { key: "id", label: "备份编号", children: backup.id },
              { key: "revision", label: "修订", children: backup.revision },
              {
                key: "completed",
                label: "清单完成时间",
                children: diagnosticTime(backup.completed_at),
              },
              {
                key: "expires",
                label: "到期时间",
                children: diagnosticTime(backup.expires_at),
              },
              {
                key: "watermark",
                label: "撤权水位记录",
                children: backup.has_revocation_watermark ? "有记录" : "未记录",
              },
            ]}
          />
        )}
        <p className="governance-scope">
          备份内容校验、恢复预检与演练登记服务待接入。
        </p>
      </Modal>
    </div>
  );
}
