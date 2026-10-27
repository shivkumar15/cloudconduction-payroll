import mongoose from "mongoose";

const payrollInsightUsageSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  dayStart: { type: Date, required: true },
  calls: { type: Number, required: true, min: 1, max: 20, validate: Number.isSafeInteger },
  lastRequestedAt: { type: Date, required: true }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

payrollInsightUsageSchema.index({ adminId: 1, dayStart: 1 }, { unique: true });
payrollInsightUsageSchema.index({ dayStart: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

export const PayrollInsightUsage = mongoose.models.PayrollInsightUsage
  || mongoose.model("PayrollInsightUsage", payrollInsightUsageSchema);
