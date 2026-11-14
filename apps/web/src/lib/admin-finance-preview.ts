import {
  earningsLedger,
  settlementPreview,
  type PreviewEarningsGroup,
  type PreviewSettlementSnapshot,
} from "./publisher-finance-preview";

export interface ReconciliationPreview {
  id: string;
  date: string;
  channel: string;
  description: string;
  result: string;
  resolved: boolean;
  kind: "payment" | "refund" | "payout";
}

export const reconciliationRows: ReconciliationPreview[] = [
  {
    id: "PAY021",
    date: "2026-11-13",
    channel: "A",
    description: "订单取消后晚到成功",
    result: "已原路退款",
    resolved: true,
    kind: "payment",
  },
  {
    id: "PAY022",
    date: "2026-11-13",
    channel: "A",
    description: "同一订单第二笔真实收款",
    result: "额外款已退款",
    resolved: true,
    kind: "payment",
  },
  {
    id: "REF019",
    date: "2026-11-13",
    channel: "A",
    description: "渠道结果未知",
    result: "原退款待查询",
    resolved: false,
    kind: "refund",
  },
];

export const settlementOwners = [
  { id: "preview-publisher", mask: "林**", currency: "CNY", ledger: earningsLedger },
];

export const settlementBatches: {
  publisherId: string;
  snapshot: PreviewSettlementSnapshot;
}[] = [
  {
    publisherId: "preview-publisher",
    snapshot: {
      id: "SET017",
      payoutId: "PO017",
      currency: "CNY",
      status: "SUCCEEDED",
      accountMask: "****1234",
      amountMinor: "4000",
      lines: [{
        id: "TT202611130201",
        ledgerGroupId: "L004",
        income: "4400",
        fee: "400",
        refund: "0",
      }],
    },
  },
  { publisherId: "preview-publisher", snapshot: settlementPreview },
];

export function settlementTotals(snapshot: PreviewSettlementSnapshot) {
  const income = snapshot.lines.reduce((sum, line) => sum + BigInt(line.income), 0n);
  const fee = snapshot.lines.reduce((sum, line) => sum + BigInt(line.fee), 0n);
  const refund = snapshot.lines.reduce((sum, line) => sum + BigInt(line.refund), 0n);
  return { income, fee, refund, net: income - fee - refund };
}

export function settlementBalance(ledger: PreviewEarningsGroup[]) {
  return {
    pending: ledger.reduce((sum, group) => sum + BigInt(group.pending) + BigInt(group.reserved), 0n),
    available: ledger.reduce((sum, group) => sum + BigInt(group.available), 0n),
    reserved: ledger.reduce((sum, group) => sum + BigInt(group.reserved), 0n),
    frozen: ledger.reduce((sum, group) => sum + BigInt(group.frozen), 0n),
    eligibleIds: ledger.filter((group) => BigInt(group.available) > 0n).map((group) => group.id),
  };
}

export { payoutLabels, payoutTones } from "./publisher-finance-preview";
