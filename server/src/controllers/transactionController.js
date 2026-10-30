import mongoose from "mongoose";
import { env } from "../config/env.js";
import { PayrollRun } from "../models/PayrollRun.js";
import { PayrollTransaction } from "../models/PayrollTransaction.js";
import {
  buildPaymentIdempotencyKey,
  simulatePayment
} from "../services/paymentSimulationService.js";
import {
  createLocalPayoutRequest,
  isLocalPayoutStatusTransitionAllowed
} from "../services/localPayoutProvider.js";
import {
  simulatePayrollTransactionsSchema,
  transactionIdSchema,
  transactionListQuerySchema,
  localPayoutEventSchema
} from "../validators/transactionSchemas.js";

function respondInvalid(res, message, issues) {
  return res.status(400).json({
    success: false,
    message,
    errors: issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }))
  });
}

function respondTransaction(transaction) {
  return transaction.toPublicJSON();
}

function invalidTransactionId(res, id) {
  const parsed = transactionIdSchema.safeParse(id);
  if (!parsed.success || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ success: false, message: "Invalid transaction ID" });
    return false;
  }
  return true;
}

async function createOrGetTransaction({ run, item, forceFailure, actorId }) {
  const idempotencyKey = buildPaymentIdempotencyKey(run._id, item.employeeId);
  const existing = await PayrollTransaction.findOne({ idempotencyKey });
  if (existing) return existing;

  const now = new Date();
  const outcome = createLocalPayoutRequest({
    amountPaise: item.netPayPaise,
    currency: item.currency,
    forceFailure
  });
  const document = {
    payrollRunId: run._id,
    period: run.period,
    employeeId: item.employeeId,
    employeeCode: item.employeeCode,
    employeeName: item.employeeName,
    idempotencyKey,
    provider: outcome.provider,
    providerReference: outcome.providerReference,
    providerPaymentId: outcome.providerPaymentId,
    providerEvents: [],
    currency: item.currency,
    amountPaise: item.netPayPaise,
    status: outcome.status,
    simulatedReference: outcome.providerReference,
    failureCode: outcome.failureCode,
    attemptCount: 1,
    attemptHistory: [{
      attemptNumber: 1,
      status: outcome.status,
      message: outcome.message,
      attemptedBy: actorId,
      attemptedAt: now
    }],
    createdBy: actorId,
    lastAttemptAt: now
  };

  try {
    return await PayrollTransaction.findOneAndUpdate(
      { idempotencyKey },
      { $setOnInsert: document },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (error?.code === 11000) {
      const racedInsert = await PayrollTransaction.findOne({ idempotencyKey });
      if (racedInsert) return racedInsert;
    }
    throw error;
  }
}

export async function simulatePayrollTransactions(req, res, next) {
  if (env.NODE_ENV === "production") {
    return res.status(503).json({
      success: false,
      code: "LOCAL_PAYOUT_PROVIDER_DISABLED",
      message: "The local payout test provider is disabled in production until a live provider has been configured and verified."
    });
  }

  const parsed = simulatePayrollTransactionsSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return respondInvalid(res, "Invalid simulated payment scenario", parsed.error.issues);
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid payroll run ID" });
  }

  try {
    const run = await PayrollRun.findById(req.params.id);
    if (!run) {
      return res.status(404).json({ success: false, message: "Payroll run not found" });
    }
    if (run.status !== "approved") {
      return res.status(409).json({
        success: false,
        message: "Simulated payments can only be started for an approved payroll run"
      });
    }

    const failureCodes = new Set(parsed.data.failEmployeeCodes);
    const runEmployeeCodes = new Set(run.items.map((item) => item.employeeCode));
    const unknownCodes = Array.from(failureCodes).filter((code) => !runEmployeeCodes.has(code));
    if (unknownCodes.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Failure scenario contains an employee code not in this payroll run"
      });
    }

    const transactions = [];
    for (const item of run.items) {
      const transaction = await createOrGetTransaction({
        run,
        item,
        forceFailure: failureCodes.has(item.employeeCode),
        actorId: req.authUser._id
      });
      transactions.push(transaction);
    }

    const succeeded = transactions.filter((transaction) => transaction.status === "succeeded").length;
    const processing = transactions.filter((transaction) => transaction.status === "processing").length;
    const failed = transactions.filter((transaction) => transaction.status === "failed").length;
    return res.status(200).json({
      success: true,
      message: "Local payout test requests created. Processing records need a separate provider-status test event. No funds were transferred.",
      simulatedOnly: true,
      testOnly: true,
      provider: "local-test",
      summary: {
        count: transactions.length,
        processing,
        succeeded,
        failed
      },
      data: transactions.map(respondTransaction)
    });
  } catch (error) {
    return next(error);
  }
}

export async function retrySimulatedTransaction(req, res, next) {
  if (env.NODE_ENV === "production") {
    return res.status(503).json({
      success: false,
      code: "LOCAL_PAYOUT_PROVIDER_DISABLED",
      message: "Local payout-test retries are disabled in production until a live provider has been configured and verified."
    });
  }
  if (!invalidTransactionId(res, req.params.id)) return;

  try {
    const transaction = await PayrollTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }
    if (transaction.status !== "failed") {
      return res.status(409).json({
        success: false,
        message: "Only failed simulated transactions can be retried"
      });
    }

    const run = await PayrollRun.findById(transaction.payrollRunId);
    if (!run || run.status !== "approved") {
      return res.status(409).json({
        success: false,
        message: "Transaction retry is only available while its payroll run is approved"
      });
    }

    const nextAttemptNumber = transaction.attemptCount + 1;
    const now = new Date();
    const outcome = transaction.provider === "local-test"
      ? createLocalPayoutRequest({
        amountPaise: transaction.amountPaise,
        currency: transaction.currency,
        forceFailure: false
      })
      : simulatePayment({
        amountPaise: transaction.amountPaise,
        currency: transaction.currency,
        forceFailure: false
      });
    const providerReference = outcome.providerReference || outcome.simulatedReference;

    const updated = await PayrollTransaction.findOneAndUpdate(
      {
        _id: transaction._id,
        status: "failed",
        attemptCount: transaction.attemptCount
      },
      {
        $set: {
          status: outcome.status,
          provider: outcome.provider,
          providerReference,
          providerPaymentId: outcome.providerPaymentId || transaction.providerPaymentId || null,
          simulatedReference: providerReference,
          failureCode: outcome.failureCode,
          attemptCount: nextAttemptNumber,
          lastAttemptAt: now
        },
        $push: {
          attemptHistory: {
            attemptNumber: nextAttemptNumber,
            status: outcome.status,
            message: "Retry: " + outcome.message,
            attemptedBy: req.authUser._id,
            attemptedAt: now
          }
        }
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Transaction status changed; refresh and retry if it is still failed"
      });
    }

    return res.status(200).json({
      success: true,
      message: transaction.provider === "local-test"
        ? "Local payout retry is processing and awaits a provider-status test event. No funds were transferred."
        : "Simulated retry succeeded. No money was transferred.",
      simulatedOnly: true,
      testOnly: true,
      data: respondTransaction(updated)
    });
  } catch (error) {
    return next(error);
  }
}



/**
 * Applies an authenticated local provider event to test webhook-like lifecycle
 * handling. This route never receives a real Razorpay webhook and is disabled in
 * production; it exists only to test event ordering and idempotency locally.
 */
export async function applyLocalPayoutEvent(req, res, next) {
  if (env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  const parsed = localPayoutEventSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return respondInvalid(res, "Invalid local payout status event", parsed.error.issues);
  }
  if (!invalidTransactionId(res, req.params.id)) return;

  try {
    const transaction = await PayrollTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }
    if (transaction.provider !== "local-test") {
      return res.status(409).json({
        success: false,
        message: "Status events can only be applied to local-provider test payouts"
      });
    }

    const { eventId, status } = parsed.data;
    const existingEvents = transaction.providerEvents || [];
    if (existingEvents.some((event) => event.eventId === eventId)) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        message: "This local provider event was already processed.",
        testOnly: true,
        data: respondTransaction(transaction)
      });
    }

    if (!isLocalPayoutStatusTransitionAllowed(transaction.status, status)) {
      return res.status(409).json({
        success: false,
        message: "A local provider event can only move a processing payout to succeeded or failed."
      });
    }

    const run = await PayrollRun.findById(transaction.payrollRunId);
    if (!run || run.status !== "approved") {
      return res.status(409).json({
        success: false,
        message: "Local provider status events are only accepted while the payroll run is approved."
      });
    }

    const receivedAt = new Date();
    const message = status === "succeeded"
      ? "Local provider test event reported the payout as succeeded. No funds were transferred."
      : "Local provider test event reported the payout as failed. No funds were transferred.";

    const updated = await PayrollTransaction.findOneAndUpdate(
      {
        _id: transaction._id,
        provider: "local-test",
        status: "processing",
        "providerEvents.eventId": { $ne: eventId }
      },
      {
        $set: {
          status,
          failureCode: status === "failed" ? "LOCAL_TEST_PROVIDER_FAILURE" : null
        },
        $push: {
          providerEvents: { eventId, status, receivedAt, message }
        }
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      const latest = await PayrollTransaction.findById(transaction._id);
      if (latest?.providerEvents?.some((event) => event.eventId === eventId)) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: "This local provider event was already processed.",
          testOnly: true,
          data: respondTransaction(latest)
        });
      }
      return res.status(409).json({
        success: false,
        message: "Payout status changed before this event was applied. Refresh the payout table."
      });
    }

    return res.status(200).json({
      success: true,
      duplicate: false,
      message,
      testOnly: true,
      data: respondTransaction(updated)
    });
  } catch (error) {
    return next(error);
  }
}
export async function listTransactions(req, res, next) {
  const parsed = transactionListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return respondInvalid(res, "Invalid transaction filters", parsed.error.issues);
  }

  try {
    const { page, pageSize, period, status } = parsed.data;
    const filter = {};
    if (period) filter.period = period;
    if (status) filter.status = status;

    const [rows, total] = await Promise.all([
      PayrollTransaction.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      PayrollTransaction.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      simulatedOnly: true,
      data: rows.map(respondTransaction),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    return next(error);
  }
}

export async function getTransactionById(req, res, next) {
  if (!invalidTransactionId(res, req.params.id)) return;

  try {
    const transaction = await PayrollTransaction.findById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }
    return res.status(200).json({
      success: true,
      simulatedOnly: true,
      data: respondTransaction(transaction)
    });
  } catch (error) {
    return next(error);
  }
}

export async function getMyTransactions(req, res, next) {
  if (!req.authUser.employeeId) {
    return res.status(404).json({
      success: false,
      message: "No employee profile is linked to this account"
    });
  }

  try {
    const finalizedRuns = await PayrollRun.find({
      status: "finalized",
      "items.employeeId": req.authUser.employeeId
    }).select("_id").lean();
    const runIds = finalizedRuns.map((run) => run._id);
    const transactions = await PayrollTransaction.find({
      payrollRunId: { $in: runIds },
      employeeId: req.authUser.employeeId
    }).sort({ period: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      simulatedOnly: true,
      data: transactions.map(respondTransaction)
    });
  } catch (error) {
    return next(error);
  }
}
