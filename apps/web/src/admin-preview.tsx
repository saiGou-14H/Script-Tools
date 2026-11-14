import { createContext, useContext, useState, type ReactNode } from "react";
import { useWorkspace } from "./context";

export interface AdminOrder {
  id: string;
  bookingId?: string;
  buyer: string;
  service: string;
  amountMinor: string;
  fulfillment: "AVAILABLE" | "RUNNING" | "UNMET";
  refundId?: string;
  settlement: "UNSETTLED" | "FROZEN";
  version: string;
  date: string;
}
export const adminOrderFixtures: AdminOrder[] = [
  {
    id: "TT202611130018",
    buyer: "用户A",
    service: "表格清洗",
    amountMinor: "600",
    fulfillment: "AVAILABLE",
    settlement: "UNSETTLED",
    version: "v1.2",
    date: "2026-11-13",
  },
  {
    id: "TT202611130082",
    bookingId: "BK082",
    buyer: "用户B",
    service: "景点预约",
    amountMinor: "800",
    fulfillment: "RUNNING",
    settlement: "FROZEN",
    version: "v1.0",
    date: "2026-11-13",
  },
  {
    id: "TT202611130027",
    bookingId: "BK027",
    buyer: "用户C",
    service: "景点预约",
    amountMinor: "800",
    fulfillment: "UNMET",
    refundId: "REF018",
    settlement: "FROZEN",
    version: "v1.0",
    date: "2026-11-13",
  },
];
export interface AdminRefund {
  id: string;
  paymentId: string;
  amountMinor: string;
  status: "UNKNOWN" | "PROCESSING" | "SUCCEEDED";
  requestedAt: string;
}
export const adminRefundFixtures: AdminRefund[] = [
  {
    id: "REF019",
    paymentId: "PAY019",
    amountMinor: "800",
    status: "UNKNOWN",
    requestedAt: "13:05",
  },
  {
    id: "REF018",
    paymentId: "PAY018",
    amountMinor: "800",
    status: "PROCESSING",
    requestedAt: "14:20",
  },
  {
    id: "REF017",
    paymentId: "PAY017",
    amountMinor: "300",
    status: "SUCCEEDED",
    requestedAt: "13:10",
  },
];
export interface AdminAccount {
  id: string;
  name: string;
  mask: string;
  publisher: boolean;
  status: "ACTIVE" | "FROZEN";
  quota: number;
  used: number;
  openOrders: number;
  lastAccessManager?: boolean;
}
export interface AdminService {
  id: string;
  title: string;
  publisher: string;
  version: string;
  deployed: boolean;
  active: boolean;
  revoked: boolean;
  entitlements: number;
}
export interface CommercePolicyPreview {
  version: number;
  currency: "CNY";
  feeBasisPoints: number;
  channelCostBearer: "PLATFORM" | "CONSUMER" | "PUBLISHER";
  settlementDays: number;
  refundDays: number;
  requestKey: string;
}
export interface AdminNote {
  id: string;
  resourceId: string;
  reason: string;
  createdAt: string;
}

const AdminPreviewContext = createContext<{
  enabled: boolean;
  orders: AdminOrder[];
  refunds: AdminRefund[];
  accounts: AdminAccount[];
  services: AdminService[];
  policies: CommercePolicyPreview[];
  notes: AdminNote[];
  updateAccount: (
    id: string,
    change: Partial<Pick<AdminAccount, "quota" | "status">>,
    reason: string,
  ) => void;
  updateService: (
    id: string,
    change: Partial<Pick<AdminService, "active" | "revoked">>,
    reason: string,
  ) => void;
  savePolicy: (policy: Omit<CommercePolicyPreview, "version">) => void;
  recordNote: (resourceId: string, reason: string, requestKey: string) => void;
} | null>(null);

export function AdminPreviewProvider({ children }: { children: ReactNode }) {
  const { bootstrap } = useWorkspace();
  const enabled =
    bootstrap.data_mode === "prototype" &&
    Boolean(bootstrap.user?.roles.includes("ADMIN"));
  const [accounts, setAccounts] = useState<AdminAccount[]>(
    enabled
      ? [
          {
            id: "user-a",
            name: "张**",
            mask: "u****3821",
            publisher: true,
            status: "ACTIVE",
            quota: 1000,
            used: 128,
            openOrders: 3,
          },
          {
            id: "user-b",
            name: "李**",
            mask: "u****9074",
            publisher: false,
            status: "ACTIVE",
            quota: 300,
            used: 82,
            openOrders: 0,
          },
        ]
      : [],
  );
  const [services, setServices] = useState<AdminService[]>(
    enabled
      ? [
          {
            id: "clean",
            title: "清洗",
            publisher: "脚本工坊",
            version: "v1.2",
            deployed: true,
            active: true,
            revoked: false,
            entitlements: 1240,
          },
          {
            id: "files",
            title: "文件工具",
            publisher: "工具小站",
            version: "v0.4",
            deployed: true,
            active: false,
            revoked: false,
            entitlements: 560,
          },
        ]
      : [],
  );
  const [policies, setPolicies] = useState<CommercePolicyPreview[]>(
    enabled
      ? [
          {
            version: 3,
            currency: "CNY",
            feeBasisPoints: 500,
            channelCostBearer: "PLATFORM",
            settlementDays: 7,
            refundDays: 7,
            requestKey: "initial-policy",
          },
        ]
      : [],
  );
  const [notes, setNotes] = useState<AdminNote[]>([]);
  function requirePreview(reason: string, capability?: string) {
    if (!enabled) throw new Error("管理业务接口尚未接入");
    if (capability && !bootstrap.user?.capabilities.includes(capability))
      throw new Error("当前账号无权执行此操作");
    if (!reason.trim()) throw new Error("请填写处理理由");
  }
  function recordNote(resourceId: string, reason: string, requestKey: string) {
    requirePreview(reason);
    setNotes((previous) =>
      previous.some((item) => item.id === requestKey)
        ? previous
        : [
            {
              id: requestKey,
              resourceId,
              reason: reason.trim(),
              createdAt: new Date().toLocaleString("sv-SE"),
            },
            ...previous,
          ],
    );
  }
  function updateAccount(
    id: string,
    change: Partial<Pick<AdminAccount, "quota" | "status">>,
    reason: string,
  ) {
    requirePreview(reason, "user.manage");
    const account = accounts.find((item) => item.id === id);
    if (!account) throw new Error("账号不存在或已失效");
    if (
      change.status === "FROZEN" &&
      (id === bootstrap.user?.id || account.lastAccessManager)
    )
      throw new Error("当前账号或最后有效权限管理员受到保护");
    if (
      change.quota !== undefined &&
      (!Number.isSafeInteger(change.quota) ||
        change.quota < account.used ||
        change.quota > 1000000)
    )
      throw new Error(`配额须为${account.used}至1000000之间的整数`);
    setAccounts((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...change } : item)),
    );
    recordNote(id, reason, crypto.randomUUID());
  }
  function updateService(
    id: string,
    change: Partial<Pick<AdminService, "active" | "revoked">>,
    reason: string,
  ) {
    requirePreview(reason, "catalog.manage");
    const service = services.find((item) => item.id === id);
    if (!service) throw new Error("服务不存在或已失效");
    if (
      change.active &&
      (!service.deployed || service.revoked || change.revoked)
    )
      throw new Error("当前版本未通过可售检查");
    setServices((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              ...change,
              active: change.revoked ? false : (change.active ?? item.active),
            }
          : item,
      ),
    );
    recordNote(id, reason, crypto.randomUUID());
  }
  function savePolicy(policy: Omit<CommercePolicyPreview, "version">) {
    requirePreview("保存规则预览", "commerce.manage");
    if (
      !Number.isInteger(policy.feeBasisPoints) ||
      policy.feeBasisPoints < 0 ||
      policy.feeBasisPoints > 10000
    )
      throw new Error("平台费率须在0%至100%之间");
    if (
      ![policy.settlementDays, policy.refundDays].every(
        (value) => Number.isSafeInteger(value) && value >= 0 && value <= 365,
      )
    )
      throw new Error("等待与处理期限须为0至365天的整数");
    setPolicies((previous) =>
      previous.some((item) => item.requestKey === policy.requestKey)
        ? previous
        : [
            ...previous,
            {
              ...policy,
              version: Math.max(0, ...previous.map((item) => item.version)) + 1,
            },
          ],
    );
  }
  return (
    <AdminPreviewContext.Provider
      value={{
        enabled,
        orders: enabled ? adminOrderFixtures : [],
        refunds: enabled ? adminRefundFixtures : [],
        accounts,
        services,
        policies,
        notes,
        updateAccount,
        updateService,
        savePolicy,
        recordNote,
      }}
    >
      {children}
    </AdminPreviewContext.Provider>
  );
}

export function useAdminPreview() {
  const value = useContext(AdminPreviewContext);
  if (!value) throw new Error("AdminPreviewProvider is required");
  return value;
}
