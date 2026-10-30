import { randomUUID } from "node:crypto";

function isSafeNonNegativePaise(amountPaise) {
  return Number.isSafeInteger(amountPaise) && amountPaise >= 0;
}

/**
 * Local provider adapter used to exercise payout lifecycle behavior.
 * It never makes a network request and never moves money.
 */
export function createLocalPayoutRequest({ amountPaise, currency = "INR", forceFailure = false }) {
  if (!isSafeNonNegativePaise(amountPaise)) {
    throw new RangeError("Payout amount must be a safe non-negative integer amount in paise");
  }
  if (currency !== "INR") {
    throw new RangeError("Only INR payouts are currently supported");
  }

  const reference = "LPT-" + randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase();
  const paymentId = "lpt_" + randomUUID().replaceAll("-", "");

  return {
    provider: "local-test",
    providerReference: reference,
    providerPaymentId: paymentId,
    status: forceFailure ? "failed" : "processing",
    failureCode: forceFailure ? "LOCAL_TEST_DECLINE" : null,
    message: forceFailure
      ? "Local provider test configured this payout to fail; no funds were transferred"
      : "Local provider test accepted the payout request; awaiting a status event. No funds were transferred",
    testOnly: true
  };
}

/**
 * Test provider events only advance a processing payout to a terminal state.
 * This prevents duplicate/replayed events or out-of-order updates from changing
 * already completed payouts.
 */
export function isLocalPayoutStatusTransitionAllowed(currentStatus, nextStatus) {
  return currentStatus === "processing" && ["succeeded", "failed"].includes(nextStatus);
}
