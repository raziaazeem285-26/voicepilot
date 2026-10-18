// Cost accounting: every price comes from the RateCard table —
// code contains zero price literals (tests excepted).
import { Prisma } from "@prisma/client";
import { prisma } from "../db";

export interface CallCostInput {
  provider: string; // "mock" | "deepgram" | ...
  voiceMinutes: number;
  telephonyMinutes: number;
  transferMinutes?: number;
}

/** Look up the latest rate for (provider, metric). Returns 0 when unconfigured. */
export async function getRate(provider: string, metric: string): Promise<Prisma.Decimal> {
  const row = await prisma.rateCard.findFirst({
    where: { provider, metric },
    orderBy: { effectiveFrom: "desc" },
  });
  return row ? row.unitPriceUsd : new Prisma.Decimal(0);
}

/**
 * Estimate a call's cost from the rate card.
 * call_cost = voice_minutes × rate(provider, voice_min)
 *           + telephony_minutes × rate(twilio, telephony_in_min)
 *           + transfer_minutes × rate(twilio, telephony_out_min)
 * Phone numbers amortize monthly (number_mo ÷ workspace calls) — tracked
 * separately as platform overhead, not per-call.
 */
export async function estimateCallCost(input: CallCostInput): Promise<{
  total: Prisma.Decimal;
  breakdown: { voice: Prisma.Decimal; telephony: Prisma.Decimal; transfer: Prisma.Decimal };
}> {
  const voiceRate = await getRate(input.provider, "voice_min");
  const telephonyRate = await getRate("twilio", "telephony_in_min");
  const transferRate = await getRate("twilio", "telephony_out_min");
  const voice = voiceRate.mul(input.voiceMinutes);
  const telephony = telephonyRate.mul(input.telephonyMinutes);
  const transfer = transferRate.mul(input.transferMinutes ?? 0);
  return { total: voice.add(telephony).add(transfer), breakdown: { voice, telephony, transfer } };
}

/** Convenience: estimate for a mock/simulated call of N minutes. */
export async function estimateMockCallCost(minutes: number): Promise<Prisma.Decimal> {
  const { total } = await estimateCallCost({ provider: "mock", voiceMinutes: minutes, telephonyMinutes: 0 });
  return total;
}
