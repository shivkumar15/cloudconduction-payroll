/**
 * Local payout testing is available in non-production environments.
 * Production requires an explicit opt-in because all results are synthetic
 * and no bank or payment gateway is contacted.
 */
export function isLocalPayoutTestModeEnabled(environment) {
  return environment.NODE_ENV !== "production" ||
    environment.ENABLE_LOCAL_PAYOUT_TESTS === true;
}
