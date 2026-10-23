import mongoose from "mongoose";
import { PayrollRun } from "../models/PayrollRun.js";
import { PayrollTransaction } from "../models/PayrollTransaction.js";
import {
  buildPaymentIdempotencyKey,
  simulatePayment
} from "../services/paymentSimulationService.js";
import {
  simulatePayrollTransactionsSchema,
  transactionIdSchema,
  transactionListQuerySchema
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
  const outcome = simulatePayment({
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
    currency: item.currency,
    amountPaise: item.netPayPaise,
    status: outcome.status,
    simulatedReference: outcome.simulatedReference,
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
    const failed = transactions.length - succeeded;
    return res.status(200).json({
      success: true,
      message: "Simulation completed. No money was transferred. Repeating this request does not create duplicate transactions.",
      simulatedOnly: true,
      summary: {
        count: transactions.length,
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
    const outcome = simulatePayment({
      amountPaise: transaction.amountPaise,
      currency: transaction.currency,
      forceFailure: false
    });

    const updated = await PayrollTransaction.findOneAndUpdate(
      {
        _id: transaction._id,
        status: "failed",
        attemptCount: transaction.attemptCount
      },
      {
        $set: {
          status: outcome.status,
          simulatedReference: outcome.simulatedReference,
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
      message: "Simulated retry succeeded. No money was transferred.",
      simulatedOnly: true,
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
