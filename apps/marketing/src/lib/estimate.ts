export interface PricedPlan {
  name: string;
  base: number;
  included: number;
  overage: number;
}

export interface Estimate {
  plan: string;
  base: number;
  extra: number;
  extraDeliveries: number;
}

export type Cadence = 'day' | 'week' | 'month';

export const PRO: PricedPlan = { name: 'Pro', base: 49, included: 1_000_000, overage: 0.25 };
export const BUSINESS: PricedPlan = { name: 'Business', base: 299, included: 10_000_000, overage: 0.1 };
export const FREE_LIMIT = 100_000;
export const ENTERPRISE_FROM = 30_000_000;

export const CADENCES: { value: Cadence; label: string; perMonth: number }[] = [
  { value: 'day', label: 'a day', perMonth: 30 },
  { value: 'week', label: 'a week', perMonth: 52 / 12 },
  { value: 'month', label: 'a month', perMonth: 1 },
];

function priced(deliveries: number, plan: PricedPlan): Estimate {
  const extraDeliveries = Math.max(0, deliveries - plan.included);
  return {
    plan: plan.name,
    base: plan.base,
    extra: (extraDeliveries / 1000) * plan.overage,
    extraDeliveries,
  };
}

export function estimate(deliveries: number): Estimate | null {
  if (deliveries <= FREE_LIMIT) return { plan: 'Free', base: 0, extra: 0, extraDeliveries: 0 };
  if (deliveries > ENTERPRISE_FROM) return null;
  const pro = priced(deliveries, PRO);
  const business = priced(deliveries, BUSINESS);
  return pro.base + pro.extra <= business.base + business.extra ? pro : business;
}

export function readNumber(value: string): number {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
