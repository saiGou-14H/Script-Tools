import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace } from "./context";
import { useAdminPreview } from "./admin-preview";

export type OperationKind =
  | "NODE_DRAIN"
  | "NODE_CLEANUP"
  | "NODE_RECOVER"
  | "IMAGE_VERIFY"
  | "IMAGE_RETIRE"
  | "RUN_STOP"
  | "RUN_ISOLATE"
  | "RUN_VERIFY"
  | "DELIVERY_RETRY"
  | "DELIVERY_RECONCILE"
  | "BACKUP_CREATE"
  | "RECOVERY_PLAN";
interface OperationPreview {
  id: string;
  resourceId: string;
  kind: OperationKind;
  reason: string;
  createdAt: string;
}
export interface RuntimeNodePreview {
  id: string;
  name: string;
  status: "ONLINE" | "DRAINING" | "DISABLED";
  cores: number;
  memoryGb: number;
  leases: number;
  cleanup: boolean;
}
export interface DeliveryPreview {
  id: string;
  type: "支付" | "运行" | "退款";
  channel: "站内" | "邮件";
  status: "SUCCEEDED" | "FAILED" | "PENDING" | "UNKNOWN";
  receipt: string;
  attempts: number;
}
export interface GrantPreview {
  id: string;
  ownerId: string;
  mask: string;
  label: string;
  capabilities: string[];
  expiresAt?: string;
  revoked?: boolean;
}
export interface PlatformPreview {
  pauseSales: boolean;
  pauseRuns: boolean;
  pauseFunds: boolean;
  requestsPerMinute: number;
  domains: string[];
}
export interface SilencePreview {
  id: string;
  alertId: string;
  reason: string;
  expiresAt: string;
}
export interface AlertRulePreview {
  id: string;
  version: number;
  expression: string;
  severity: string;
  forSeconds: number;
}

export const managementCapabilities = [
  "commerce.manage",
  "catalog.manage",
  "runtime.manage",
  "runtime.observe",
  "access.manage",
  "data.diagnose",
  "user.manage",
  "observability.manage",
];
const operationCapability: Record<OperationKind, string> = {
  NODE_DRAIN: "runtime.manage",
  NODE_CLEANUP: "runtime.manage",
  NODE_RECOVER: "runtime.manage",
  IMAGE_VERIFY: "runtime.manage",
  IMAGE_RETIRE: "runtime.manage",
  RUN_STOP: "runtime.manage",
  RUN_ISOLATE: "runtime.manage",
  RUN_VERIFY: "data.diagnose",
  DELIVERY_RETRY: "observability.manage",
  DELIVERY_RECONCILE: "observability.manage",
  BACKUP_CREATE: "runtime.manage",
  RECOVERY_PLAN: "runtime.manage",
};
const deliveryFixtures: DeliveryPreview[] = [
  {
    id: "D01",
    type: "支付",
    channel: "站内",
    status: "SUCCEEDED",
    receipt: "MSG-****8F2C",
    attempts: 1,
  },
  {
    id: "D02",
    type: "运行",
    channel: "邮件",
    status: "FAILED",
    receipt: "MAIL-****7D91",
    attempts: 2,
  },
  {
    id: "D03",
    type: "退款",
    channel: "站内",
    status: "SUCCEEDED",
    receipt: "MSG-****3A7E",
    attempts: 1,
  },
  {
    id: "D04",
    type: "支付",
    channel: "邮件",
    status: "PENDING",
    receipt: "MAIL-****9E10",
    attempts: 1,
  },
  {
    id: "D05",
    type: "运行",
    channel: "站内",
    status: "UNKNOWN",
    receipt: "MSG-****F64B",
    attempts: 1,
  },
  {
    id: "D06",
    type: "退款",
    channel: "邮件",
    status: "FAILED",
    receipt: "MAIL-****2C3D",
    attempts: 3,
  },
  {
    id: "D07",
    type: "支付",
    channel: "站内",
    status: "SUCCEEDED",
    receipt: "MSG-****1B8A",
    attempts: 1,
  },
  {
    id: "D08",
    type: "运行",
    channel: "邮件",
    status: "FAILED",
    receipt: "MAIL-****6E09",
    attempts: 2,
  },
  {
    id: "D09",
    type: "退款",
    channel: "站内",
    status: "PENDING",
    receipt: "MSG-****0D76",
    attempts: 1,
  },
  {
    id: "D10",
    type: "运行",
    channel: "邮件",
    status: "UNKNOWN",
    receipt: "MAIL-****4A21",
    attempts: 1,
  },
];

const OperationsContext = createContext<{
  enabled: boolean;
  nodes: RuntimeNodePreview[];
  deliveries: DeliveryPreview[];
  operations: OperationPreview[];
  grants: GrantPreview[];
  platform: PlatformPreview;
  silences: SilencePreview[];
  ruleDrafts: AlertRulePreview[];
  retention: {
    hotDays: number;
    totalDays: number;
    outputDays: number;
    version: number;
  };
  requestOperation: (
    kind: OperationKind,
    resourceId: string,
    reason: string,
    requestKey: string,
  ) => void;
  savePlatform: (
    patch: Partial<PlatformPreview>,
    reason: string,
    requestKey: string,
  ) => void;
  saveSilence: (
    alertId: string,
    minutes: number,
    reason: string,
    requestKey: string,
  ) => void;
  endSilence: (id: string) => void;
  saveRule: (
    rule: AlertRulePreview,
    reason: string,
    requestKey: string,
  ) => void;
  saveGrant: (
    id: string,
    capabilities: string[],
    expiresAt: string | undefined,
    reason: string,
  ) => void;
  revokeGrant: (id: string, reason: string) => void;
  saveRetention: (
    values: { hotDays: number; totalDays: number; outputDays: number },
    reason: string,
    requestKey: string,
  ) => void;
} | null>(null);

export function AdminOperationsProvider({ children }: { children: ReactNode }) {
  const { bootstrap } = useWorkspace();
  const { enabled, recordNote } = useAdminPreview();
  const nodes: RuntimeNodePreview[] = enabled
    ? [
        {
          id: "docker01",
          name: "docker01",
          status: "ONLINE",
          cores: 8,
          memoryGb: 32,
          leases: 4,
          cleanup: true,
        },
        {
          id: "kvm02",
          name: "kvm02",
          status: "DRAINING",
          cores: 16,
          memoryGb: 64,
          leases: 2,
          cleanup: false,
        },
        {
          id: "tcg03",
          name: "tcg03",
          status: "DISABLED",
          cores: 4,
          memoryGb: 16,
          leases: 0,
          cleanup: true,
        },
      ]
    : [];
  const [operations, setOperations] = useState<OperationPreview[]>([]);
  const [platform, setPlatform] = useState<PlatformPreview>({
    pauseSales: false,
    pauseRuns: false,
    pauseFunds: false,
    requestsPerMinute: 60,
    domains: [],
  });
  const [silences, setSilences] = useState<SilencePreview[]>([]);
  const [ruleDrafts, setRuleDrafts] = useState<AlertRulePreview[]>([]);
  const currentRuleDrafts = useRef(ruleDrafts);
  const savedRuleRequests = useRef(new Set<string>());
  const [retention, setRetention] = useState({
    hotDays: 7,
    totalDays: 30,
    outputDays: 30,
    version: 1,
    requestKey: "initial",
  });
  const [grants, setGrants] = useState<GrantPreview[]>(
    enabled
      ? [
          {
            id: "admin",
            ownerId: bootstrap.user!.id,
            mask: "adm****001",
            label: "管理员",
            capabilities: [
              "commerce.manage",
              "catalog.manage",
              "access.manage",
            ],
          },
          {
            id: "ops",
            ownerId: "ops-217",
            mask: "ops****217",
            label: "运维",
            capabilities: ["runtime.manage", "data.diagnose"],
            expiresAt: "2026-12-31",
          },
          {
            id: "biz",
            ownerId: "biz-308",
            mask: "biz****308",
            label: "业务管理",
            capabilities: ["catalog.manage", "access.manage"],
            expiresAt: "2026-12-31",
          },
          {
            id: "dev",
            ownerId: "dev-745",
            mask: "dev****745",
            label: "开发",
            capabilities: ["runtime.manage", "data.diagnose"],
            expiresAt: "2026-12-31",
          },
        ]
      : [],
  );
  function requirePreview(capability: string, reason: string) {
    if (!enabled) throw new Error("管理业务接口尚未接入");
    if (!bootstrap.user?.capabilities.includes(capability))
      throw new Error("当前账号缺少对应管理能力");
    if (!reason.trim()) throw new Error("请填写处理理由");
  }
  function requestOperation(
    kind: OperationKind,
    resourceId: string,
    reason: string,
    requestKey: string,
  ) {
    requirePreview(operationCapability[kind], reason);
    const node = nodes.find((item) => item.id === resourceId);
    if (
      kind === "NODE_DRAIN" &&
      resourceId !== "resource-pool" &&
      (!node || node.status !== "ONLINE")
    )
      throw new Error("当前节点无法发起排空");
    if (kind === "NODE_CLEANUP" && (!node || node.leases !== 0))
      throw new Error("活动租约归零后才能清理登记环境");
    if (kind === "NODE_RECOVER")
      throw new Error("恢复需要新的节点健康与清理证据");
    const delivery = deliveryFixtures.find((item) => item.id === resourceId);
    if (kind === "DELIVERY_RETRY" && delivery?.status !== "FAILED")
      throw new Error("当前投递需要先查询原回执");
    setOperations((previous) =>
      previous.some(
        (item) =>
          item.id === requestKey ||
          (item.kind === kind && item.resourceId === resourceId),
      )
        ? previous
        : [
            ...previous,
            {
              id: requestKey,
              kind,
              resourceId,
              reason: reason.trim(),
              createdAt: new Date().toLocaleString("sv-SE"),
            },
          ],
    );
    recordNote(resourceId, `${kind} · ${reason.trim()}`, requestKey);
  }
  function savePlatform(
    patch: Partial<PlatformPreview>,
    reason: string,
    requestKey: string,
  ) {
    requirePreview("runtime.manage", reason);
    if (
      patch.requestsPerMinute !== undefined &&
      (!Number.isSafeInteger(patch.requestsPerMinute) ||
        patch.requestsPerMinute < 1)
    )
      throw new Error("限流值须为正整数");
    if (patch.domains) {
      for (const domain of patch.domains) {
        const host = domain.toLowerCase();
        if (
          !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
          host.endsWith(".localhost") ||
          host.endsWith(".local")
        )
          throw new Error("请填写公网域名，使用逐项白名单");
      }
    }
    setPlatform((previous) => ({ ...previous, ...patch }));
    recordNote("PLATFORM", reason, requestKey);
  }
  function saveSilence(
    alertId: string,
    minutes: number,
    reason: string,
    requestKey: string,
  ) {
    requirePreview("observability.manage", reason);
    if (
      !Number.isSafeInteger(minutes) ||
      minutes < 1 ||
      Date.now() + minutes * 60000 > 8640000000000000
    )
      throw new Error("请填写有效的有限静默时间");
    setSilences((previous) =>
      previous.some((item) => item.id === requestKey)
        ? previous
        : [
            ...previous.filter((item) => item.alertId !== alertId),
            {
              id: requestKey,
              alertId,
              reason: reason.trim(),
              expiresAt: new Date(Date.now() + minutes * 60000).toISOString(),
            },
          ],
    );
    recordNote(alertId, `限时静默 ${minutes}分钟 · ${reason}`, requestKey);
  }
  function endSilence(id: string) {
    requirePreview("observability.manage", "结束静默");
    setSilences((previous) => previous.filter((item) => item.id !== id));
    recordNote(id, "结束静默预览", crypto.randomUUID());
  }
  function saveRule(
    rule: AlertRulePreview,
    reason: string,
    requestKey: string,
  ) {
    requirePreview("observability.manage", reason);
    if (savedRuleRequests.current.has(requestKey)) return;
    const currentVersion =
      currentRuleDrafts.current.find((item) => item.id === rule.id)?.version ||
      1;
    if (
      !rule.expression.trim() ||
      !Number.isSafeInteger(rule.forSeconds) ||
      rule.forSeconds < 0 ||
      rule.version !== currentVersion + 1
    )
      throw new Error("请填写表达式和有效持续时间");
    currentRuleDrafts.current = [
      ...currentRuleDrafts.current.filter((item) => item.id !== rule.id),
      rule,
    ];
    savedRuleRequests.current.add(requestKey);
    setRuleDrafts(currentRuleDrafts.current);
    recordNote(rule.id, `规则草稿v${rule.version} · ${reason}`, requestKey);
  }
  function validateGrant(id: string, capabilities: string[]) {
    const grant = grants.find((item) => item.id === id);
    if (!grant || grant.revoked) throw new Error("授权不存在或已失效");
    if (grant.ownerId === bootstrap.user?.id)
      throw new Error("本人授权受到保护，请使用其他有效权限管理员处理");
    if (capabilities.some((item) => !managementCapabilities.includes(item)))
      throw new Error("授权能力不在支持范围内");
    const activeManagers = grants.filter(
      (item) =>
        !item.revoked &&
        item.capabilities.includes("access.manage") &&
        (!item.expiresAt ||
          new Date(`${item.expiresAt}T23:59:59`).getTime() > Date.now()),
    );
    if (
      grant.capabilities.includes("access.manage") &&
      !capabilities.includes("access.manage") &&
      activeManagers.length <= 1
    )
      throw new Error("最后有效权限管理员受到保护");
    return grant;
  }
  function saveGrant(
    id: string,
    capabilities: string[],
    expiresAt: string | undefined,
    reason: string,
  ) {
    requirePreview("access.manage", reason);
    validateGrant(id, capabilities);
    if (!capabilities.length) throw new Error("至少选择一项能力");
    if (expiresAt && new Date(`${expiresAt}T23:59:59`).getTime() <= Date.now())
      throw new Error("授权到期日须晚于当前时间");
    setGrants((previous) =>
      previous.map((item) =>
        item.id === id
          ? { ...item, capabilities: [...new Set(capabilities)], expiresAt }
          : item,
      ),
    );
    recordNote(id, `调整授权预览 · ${reason}`, crypto.randomUUID());
  }
  function revokeGrant(id: string, reason: string) {
    requirePreview("access.manage", reason);
    validateGrant(id, []);
    setGrants((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, revoked: true } : item,
      ),
    );
    recordNote(id, `撤销授权预览 · ${reason}`, crypto.randomUUID());
  }
  function saveRetention(
    values: { hotDays: number; totalDays: number; outputDays: number },
    reason: string,
    requestKey: string,
  ) {
    requirePreview("runtime.manage", reason);
    if (
      ![values.hotDays, values.totalDays, values.outputDays].every(
        (value) => Number.isSafeInteger(value) && value >= 1,
      ) ||
      values.hotDays > values.totalDays
    )
      throw new Error("保留天数须为正整数，热检索天数须在总期限内");
    setRetention((previous) =>
      previous.requestKey === requestKey
        ? previous
        : { ...values, version: previous.version + 1, requestKey },
    );
    recordNote("RETENTION", reason, requestKey);
  }
  return (
    <OperationsContext.Provider
      value={{
        enabled,
        nodes,
        deliveries: enabled ? deliveryFixtures : [],
        operations,
        grants,
        platform,
        silences,
        ruleDrafts,
        retention,
        requestOperation,
        savePlatform,
        saveSilence,
        endSilence,
        saveRule,
        saveGrant,
        revokeGrant,
        saveRetention,
      }}
    >
      {children}
    </OperationsContext.Provider>
  );
}

export function useAdminOperations() {
  const value = useContext(OperationsContext);
  if (!value) throw new Error("AdminOperationsProvider is required");
  return value;
}
