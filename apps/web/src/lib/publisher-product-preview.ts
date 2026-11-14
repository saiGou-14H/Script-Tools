import type { RJSFSchema } from "@rjsf/utils";
import type { PublisherPricePlan, PublisherScript } from "../publisher-preview";

export interface ProductReleasePreview {
  scriptId: string;
  scriptVersion: string;
  inputSchema: RJSFSchema;
  pricePlanId: string;
  pricePlanVersion: number;
  amountMinor: string;
  refundRule: PublisherPricePlan["refundRule"];
  maxServiceSeconds: number;
  validityDays: number;
  goal: string;
  verificationHours: number;
}

export function captureProductRelease(
  script: PublisherScript,
  plan: PublisherPricePlan,
): ProductReleasePreview {
  return {
    scriptId: script.id,
    scriptVersion: script.version,
    inputSchema: structuredClone(script.inputSchema),
    pricePlanId: plan.id,
    pricePlanVersion: plan.version,
    amountMinor: plan.amountMinor,
    refundRule: plan.refundRule,
    maxServiceSeconds: plan.maxServiceSeconds,
    validityDays: plan.validityDays,
    goal: plan.goal,
    verificationHours: plan.verificationHours,
  };
}
