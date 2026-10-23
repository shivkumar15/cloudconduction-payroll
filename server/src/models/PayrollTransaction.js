import mongoose from "mongoose";

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

const attemptSchema = new mongoose.Schema({
  attemptNumber: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isSafeInteger
  },
  status: { type: String, enum: ["succeeded", "failed"], required: true },
  message: { type: String, required: true, maxlength: 180 },
  attemptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  attemptedAt: { type: Date, required: true, default: Date.now }
}, { _id: false, strict: "throw" });

const simulationTransactionSchema = new mongoose.Schema({
  payrollRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PayrollRun",
    required: true,
    index: true
  },
  period: {
    type: String,
    required: true,
    match: /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },
  employeeCode: { type: String, required: true, trim: true, maxlength: 20 },
  employeeName: { type: String, required: true, trim: true, maxlength: 162 },
  idempotencyKey: { type: String, required: true, unique: true, maxlength: 160 },
  provider: { type: String, enum: ["simulation"], required: true, default: "simulation" },
  currency: { type: String, enum: ["INR"], required: true, default: "INR" },
  amountPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Transaction amount must be a safe integer amount in paise" }
  },
  status: { type: String, enum: ["succeeded", "failed"], required: true, index: true },
  simulatedReference: { type: String, required: true, maxlength: 80 },
  failureCode: { type: String, default: null, maxlength: 60 },
  attemptCount: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isSafeInteger
  },
  attemptHistory: {
    type: [attemptSchema],
    required: true,
    validate: { validator: (items) => Array.isArray(items) && items.length > 0, message: "At least one simulation attempt is required" }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastAttemptAt: { type: Date, required: true, default: Date.now }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

simulationTransactionSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });
simulationTransactionSchema.index({ period: -1, status: 1, createdAt: -1 });

simulationTransactionSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    payrollRunId: this.payrollRunId.toString(),
    period: this.period,
    employeeId: this.employeeId.toString(),
    employeeCode: this.employeeCode,
    employeeName: this.employeeName,
    provider: this.provider,
    simulatedOnly: true,
    currency: this.currency,
    amountPaise: this.amountPaise,
    status: this.status,
    simulatedReference: this.simulatedReference,
    failureCode: this.failureCode,
    attemptCount: this.attemptCount,
    attemptHistory: this.attemptHistory.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      message: attempt.message,
      attemptedBy: attempt.attemptedBy.toString(),
      attemptedAt: attempt.attemptedAt
    })),
    createdBy: this.createdBy.toString(),
    lastAttemptAt: this.lastAttemptAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const PayrollTransaction = mongoose.models.PayrollTransaction
  || mongoose.model("PayrollTransaction", simulationTransactionSchema);
