import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace } from "./context";
import type { Service } from "./types";
import { serviceAvailable, serviceDate } from "./lib/service-display";
import { notificationFixtures, previewTasks } from "./lib/consumer-preview";

export interface PreviewOrder {
  id: string;
  name: string;
  title: string;
  summary: string;
  icon: string;
  amountMinor: string;
  payment: "PAID" | "UNPAID";
  fulfillment:
    "AVAILABLE" | "RUNNING" | "WAITING_PAYMENT" | "CLOSED" | "COMPLETED";
  createdAt: string;
  serviceId?: string;
  input?: unknown;
  schemaDigest?: string;
}

export interface CredentialRow {
  id: string;
  name: string;
  kind: string;
  mask: string;
  version: number;
  verified: string;
  bindings: number;
  bindingRefs?: { taskId: string; title: string; version: number }[];
  revoked?: boolean;
}

export interface TravelerRow {
  id: string;
  name: string;
  phone: string;
  identity: string;
  identityType?: string;
  version?: number;
  isDefault: boolean;
}

export interface PreviewRefund {
  id: string;
  orderId: string;
  service: string;
  reason: string;
  amountMinor: string;
  status: "REQUESTED" | "PROCESSING" | "SUCCEEDED";
  createdAt: string;
  description?: string;
  ruleSnapshot?: string;
  executionResult?: string;
}

function credentialBindings(taskIds: string[]) {
  return previewTasks
    .filter((task) => taskIds.includes(task.key))
    .map((task) => ({
      taskId: task.key,
      title: task.title,
      version: 1,
    }));
}
const credentialFixtures: CredentialRow[] = [
  {
    id: "email",
    name: "邮箱服务token",
    kind: "接口凭据",
    mask: "••••8A12",
    version: 1,
    verified: "2026-11-13",
    bindings: 2,
    bindingRefs: credentialBindings(["clean", "data"]),
  },
  {
    id: "booking",
    name: "预约渠道账号",
    kind: "平台账号",
    mask: "••••5821",
    version: 1,
    verified: "2026-11-13",
    bindings: 1,
    bindingRefs: credentialBindings(["booking"]),
  },
];
const travelerFixtures: TravelerRow[] = ["张", "李", "王"].map(
  (name, index) => ({
    id: String(index),
    name: `${name}*`,
    phone: "138****5201",
    identity: "3301************1234",
    identityType: "身份证",
    version: 1,
    isDefault: index === 0,
  }),
);
const refundFixtures: PreviewRefund[] = [
  {
    id: "REF018",
    orderId: "TT202611130027",
    service: "景点预约",
    reason: "目标未达",
    amountMinor: "800",
    status: "PROCESSING",
    createdAt: "2026-11-13 14:20",
    ruleSnapshot: "目标未达全退",
    executionResult: "执行已结束 / 目标未达成",
  },
  {
    id: "REF017",
    orderId: "TT202611130025",
    service: "文件处理",
    reason: "未使用",
    amountMinor: "300",
    status: "SUCCEEDED",
    createdAt: "2026-11-13 13:10",
    ruleSnapshot: "未使用服务费全退",
    executionResult: "服务未使用",
  },
];

const initialOrders: PreviewOrder[] = [
  {
    id: "OD202611130001",
    name: "数据清洗工具",
    title: "表格清洗",
    summary: "清洗与整理数据文件",
    icon: "table",
    amountMinor: "600",
    payment: "PAID",
    fulfillment: "AVAILABLE",
    createdAt: "2026-11-13",
  },
  {
    id: "OD202611130002",
    name: "景点预约服务",
    title: "免费景点预约",
    summary: "景点预约与时段锁定",
    icon: "travel",
    amountMinor: "800",
    payment: "PAID",
    fulfillment: "RUNNING",
    createdAt: "2026-11-13",
  },
  {
    id: "OD202611130003",
    name: "文件处理工具",
    title: "文件批量处理",
    summary: "文件解析与格式处理",
    icon: "file",
    amountMinor: "300",
    payment: "UNPAID",
    fulfillment: "WAITING_PAYMENT",
    createdAt: "2026-11-13",
  },
];

interface PrototypeContextValue {
  orders: PreviewOrder[];
  createOrder: (
    service: Service,
    requestKey: string,
    input?: unknown,
  ) => PreviewOrder;
  cancelUnpaidOrder: (id: string) => void;
  readNotificationIds: Set<string>;
  unreadNotificationCount: number | null;
  markNotificationRead: (id: string) => void;
  emailEventKeys: string[];
  saveEmailEventKeys: (keys: string[]) => void;
  notificationEmail: { mask: string; verified: boolean };
  updateNotificationEmail: (mask: string) => void;
  credentials: CredentialRow[];
  setCredentials: React.Dispatch<React.SetStateAction<CredentialRow[]>>;
  travelers: TravelerRow[];
  setTravelers: React.Dispatch<React.SetStateAction<TravelerRow[]>>;
  refunds: PreviewRefund[];
  requestRefund: (
    orderId: string,
    reason: string,
    description?: string,
  ) => PreviewRefund;
}

const PrototypeContext = createContext<PrototypeContextValue | null>(null);

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const { bootstrap } = useWorkspace();
  const [orders, setOrders] = useState<PreviewOrder[]>(
    bootstrap.data_mode === "prototype" ? initialOrders : [],
  );
  const [readNotificationIds, setReadNotificationIds] = useState(
    new Set(["refund"]),
  );
  const [emailEventKeys, saveEmailEventKeys] = useState([
    "payment_confirmed",
    "run_completed",
    "action_required",
    "refund_succeeded",
  ]);
  const isPrototype = bootstrap.data_mode === "prototype";
  const [notificationEmail, setNotificationEmail] = useState({
    mask: isPrototype ? "m***@example.com" : "",
    verified: isPrototype,
  });
  const [credentials, setCredentials] = useState(
    isPrototype ? credentialFixtures : [],
  );
  const [travelers, setTravelers] = useState(
    isPrototype ? travelerFixtures : [],
  );
  const [refunds, setRefunds] = useState(isPrototype ? refundFixtures : []);
  const refundsRef = useRef(refunds);

  function requestRefund(orderId: string, reason: string, description = "") {
    if (!isPrototype) throw new Error("退款接口尚未配置");
    const existing = refundsRef.current.find(
      (item) => item.orderId === orderId,
    );
    if (existing) return existing;
    if (orderId !== "TT202611130028")
      throw new Error("订单可退金额需要重新核对");
    if (!["目标未达", "未使用", "其他"].includes(reason))
      throw new Error("请选择有效的退款原因");
    if (description.trim().length > 200) throw new Error("补充说明最多200字");
    const refund: PreviewRefund = {
      id: `PREVIEW-REF-${crypto.randomUUID()}`,
      orderId,
      service: "景点预约",
      reason,
      amountMinor: "800",
      status: "REQUESTED",
      createdAt: new Date().toLocaleString("sv-SE"),
      description: description.trim(),
      ruleSnapshot: "目标未达全退",
      executionResult: "执行已结束 / 目标未达成",
    };
    refundsRef.current = [refund, ...refundsRef.current];
    setRefunds(refundsRef.current);
    return refund;
  }
  function createOrder(service: Service, requestKey: string, input?: unknown) {
    if (bootstrap.data_mode !== "prototype")
      throw new Error("当前环境需要配置交易接口");
    const id = `PREVIEW-${requestKey}`;
    const existing = orders.find((order) => order.id === id);
    if (existing) return existing;
    if (!serviceAvailable(service)) throw new Error("服务当前不可购买");
    const order: PreviewOrder = {
      id,
      name: service.title,
      title: service.title,
      summary: service.description,
      icon: service.delivery_policy.icon,
      amountMinor: service.amount_minor,
      payment: "UNPAID",
      fulfillment: "WAITING_PAYMENT",
      createdAt: serviceDate(new Date().toISOString()),
      serviceId: service.id,
      input: structuredClone(input),
      schemaDigest: service.input_schema_digest,
    };
    setOrders((previous) =>
      previous.some((item) => item.id === id) ? previous : [order, ...previous],
    );
    return order;
  }
  function cancelUnpaidOrder(id: string) {
    setOrders((previous) =>
      previous.map((order) =>
        order.id === id && order.payment === "UNPAID"
          ? { ...order, fulfillment: "CLOSED" }
          : order,
      ),
    );
  }
  return (
    <PrototypeContext.Provider
      value={{
        orders,
        createOrder,
        cancelUnpaidOrder,
        readNotificationIds,
        unreadNotificationCount: isPrototype
          ? notificationFixtures.filter(
              (item) => !readNotificationIds.has(item.id),
            ).length
          : null,
        markNotificationRead: (id) =>
          setReadNotificationIds((previous) => new Set([...previous, id])),
        emailEventKeys,
        saveEmailEventKeys,
        notificationEmail,
        updateNotificationEmail: (mask) =>
          setNotificationEmail({ mask, verified: false }),
        credentials,
        setCredentials,
        travelers,
        setTravelers,
        refunds,
        requestRefund,
      }}
    >
      {children}
    </PrototypeContext.Provider>
  );
}

export function usePrototype() {
  const context = useContext(PrototypeContext);
  if (!context) throw new Error("PrototypeProvider is missing");
  return context;
}

export function findPreviewOrder(orders: PreviewOrder[], id?: string) {
  if (id === "demo" && orders.length)
    return { ...initialOrders[0], id: "TT202611130018" };
  return orders.find((order) => order.id === id);
}
