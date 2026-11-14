export type ChannelStatus = "UNKNOWN" | "PROCESSING" | "SUCCEEDED";

export interface AdminOrder {
  id: string;
  bookingId?: string;
  buyer: string;
  service: string;
  amountMinor: string;
  paymentId: string;
  fulfillment: "AVAILABLE" | "RUNNING" | "UNMET";
  execution: "NOT_STARTED" | "RUNNING" | "FINISHED";
  goal: "PENDING" | "UNKNOWN" | "UNMET" | "MET";
  entitlement: "AVAILABLE" | "CONSUMED";
  refundId?: string;
  settlement: "UNSETTLED" | "FROZEN";
  version: string;
  date: string;
  contract: {
    pricePlanVersion: number;
    goal: string;
    refundRule: "FULL_IF_UNMET" | "NO_REFUND_IF_UNMET";
    commercePolicyVersion: number;
    feeBasisPoints: number;
    ticketAmountMinor?: string;
  };
}

export interface AdminPayment {
  id: string;
  orderId?: string;
  amountMinor: string;
  status: ChannelStatus;
  channel: string;
  requestMask: string;
}

export interface AdminRefund {
  id: string;
  paymentId: string;
  amountMinor: string;
  status: ChannelStatus;
  requestedAt: string;
  requestMask: string;
  ruleLabel: string;
  evidence: string;
}

export const adminOrderFixtures: AdminOrder[] = [
  {
    id: "TT202611130018",
    buyer: "用户A",
    service: "表格清洗",
    amountMinor: "600",
    paymentId: "PAY0018",
    fulfillment: "AVAILABLE",
    execution: "NOT_STARTED",
    goal: "PENDING",
    entitlement: "AVAILABLE",
    settlement: "UNSETTLED",
    version: "v1.2",
    date: "2026-11-13",
    contract: {
      pricePlanVersion: 3,
      goal: "清洗文件及统计摘要",
      refundRule: "FULL_IF_UNMET",
      commercePolicyVersion: 3,
      feeBasisPoints: 500,
    },
  },
  {
    id: "TT202611130082",
    bookingId: "BK082",
    buyer: "用户B",
    service: "景点预约",
    amountMinor: "800",
    paymentId: "PAY082",
    fulfillment: "RUNNING",
    execution: "RUNNING",
    goal: "UNKNOWN",
    entitlement: "CONSUMED",
    settlement: "FROZEN",
    version: "v1.0",
    date: "2026-11-13",
    contract: {
      pricePlanVersion: 1,
      goal: "指定参观日期及时段的预约核验结果",
      refundRule: "FULL_IF_UNMET",
      commercePolicyVersion: 3,
      feeBasisPoints: 500,
      ticketAmountMinor: "0",
    },
  },
  {
    id: "TT202611130027",
    bookingId: "BK027",
    buyer: "用户C",
    service: "景点预约",
    amountMinor: "800",
    paymentId: "PAY018",
    fulfillment: "UNMET",
    execution: "FINISHED",
    goal: "UNMET",
    entitlement: "CONSUMED",
    refundId: "REF018",
    settlement: "FROZEN",
    version: "v1.0",
    date: "2026-11-13",
    contract: {
      pricePlanVersion: 1,
      goal: "指定参观日期及时段的预约核验结果",
      refundRule: "FULL_IF_UNMET",
      commercePolicyVersion: 3,
      feeBasisPoints: 500,
      ticketAmountMinor: "0",
    },
  },
];

export const adminPaymentFixtures: AdminPayment[] = [
  {
    id: "PAY019",
    amountMinor: "800",
    status: "SUCCEEDED",
    channel: "示例渠道A",
    requestMask: "PAY••019",
  },
  {
    id: "PAY018",
    orderId: "TT202611130027",
    amountMinor: "800",
    status: "SUCCEEDED",
    channel: "示例渠道A",
    requestMask: "PAY••018",
  },
  {
    id: "PAY017",
    amountMinor: "300",
    status: "SUCCEEDED",
    channel: "示例渠道A",
    requestMask: "PAY••017",
  },
  {
    id: "PAY0018",
    orderId: "TT202611130018",
    amountMinor: "600",
    status: "SUCCEEDED",
    channel: "示例渠道A",
    requestMask: "PAY••0018",
  },
  {
    id: "PAY082",
    orderId: "TT202611130082",
    amountMinor: "800",
    status: "SUCCEEDED",
    channel: "示例渠道A",
    requestMask: "PAY••082",
  },
];

export const adminRefundFixtures: AdminRefund[] = [
  {
    id: "REF019",
    requestMask: "RF••019",
    paymentId: "PAY019",
    amountMinor: "800",
    status: "UNKNOWN",
    requestedAt: "13:05",
    ruleLabel: "目标未达成全退服务费",
    evidence: "外部查询已确认目标未达成；退款结果仍待查询。",
  },
  {
    id: "REF018",
    requestMask: "RF••018",
    paymentId: "PAY018",
    amountMinor: "800",
    status: "PROCESSING",
    requestedAt: "14:20",
    ruleLabel: "目标未达成全退服务费",
    evidence: "目标核验已结束，原退款请求等待渠道回执。",
  },
  {
    id: "REF017",
    requestMask: "RF••017",
    paymentId: "PAY017",
    amountMinor: "300",
    status: "SUCCEEDED",
    requestedAt: "13:10",
    ruleLabel: "目标未达成全退服务费",
    evidence: "已保存示例退款到账回执。",
  },
];

export const refundLabels = {
  UNKNOWN: "待核对",
  PROCESSING: "处理中",
  SUCCEEDED: "已到账",
};
export const refundTones = {
  UNKNOWN: "orange",
  PROCESSING: "blue",
  SUCCEEDED: "green",
} as const;
export const paymentLabels = {
  UNKNOWN: "待核对",
  PROCESSING: "支付处理中",
  SUCCEEDED: "已支付",
};

export function refundBalance(
  payment: AdminPayment | undefined,
  refunds: AdminRefund[],
) {
  if (!payment || payment.status !== "SUCCEEDED") return undefined;
  const related = refunds.filter((refund) => refund.paymentId === payment.id);
  const paid = BigInt(payment.amountMinor);
  const returned = related
    .filter((refund) => refund.status === "SUCCEEDED")
    .reduce((sum, refund) => sum + BigInt(refund.amountMinor), 0n);
  const reserved = related
    .filter((refund) => refund.status !== "SUCCEEDED")
    .reduce((sum, refund) => sum + BigInt(refund.amountMinor), 0n);
  const remaining = paid - returned - reserved;
  if (
    paid < 0n || remaining < 0n ||
    related.some((refund) => BigInt(refund.amountMinor) < 0n)
  )
    return undefined;
  return { returned, reserved, remaining };
}

export function orderRefundStatus(refunds: AdminRefund[]) {
  if (refunds.some((refund) => refund.status === "UNKNOWN")) return "UNKNOWN";
  if (refunds.some((refund) => refund.status === "PROCESSING")) return "PROCESSING";
  return refunds.length ? "SUCCEEDED" : undefined;
}
