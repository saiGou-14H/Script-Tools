export interface PreviewEarningsGroup {
  id: string;
  income: string;
  fee: string;
  refund: string;
  pending: string;
  available: string;
  reserved: string;
  paid: string;
  frozen: string;
}

export const earningsLedger: PreviewEarningsGroup[] = [
  {
    id: "L001",
    income: "20000",
    fee: "-1800",
    refund: "0",
    pending: "4700",
    available: "0",
    reserved: "13500",
    paid: "0",
    frozen: "0",
  },
  {
    id: "L002",
    income: "18000",
    fee: "-1600",
    refund: "-8000",
    pending: "1900",
    available: "0",
    reserved: "6500",
    paid: "0",
    frozen: "0",
  },
  {
    id: "L003",
    income: "22000",
    fee: "-2000",
    refund: "0",
    pending: "0",
    available: "20000",
    reserved: "0",
    paid: "0",
    frozen: "0",
  },
  {
    id: "L004",
    income: "8000",
    fee: "-600",
    refund: "0",
    pending: "3400",
    available: "0",
    reserved: "0",
    paid: "4000",
    frozen: "0",
  },
];

export interface PreviewSettlementLine {
  id: string;
  ledgerGroupId: string;
  income: string;
  refund: string;
  fee: string;
}

export const settlementPreview = {
  id: "SET018",
  currency: "CNY",
  payoutId: "P0018",
  accountMask: "****1234",
  amountMinor: "20000",
  lines: [
    {
      id: "TT202611130101",
      ledgerGroupId: "L001",
      income: "15000",
      refund: "0",
      fee: "1500",
    },
    {
      id: "TT202611130102",
      ledgerGroupId: "L002",
      income: "8000",
      refund: "1000",
      fee: "500",
    },
  ] satisfies PreviewSettlementLine[],
};
