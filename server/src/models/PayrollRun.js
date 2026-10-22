import mongoose from "mongoose";

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

const payrollLineItemSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },
  employeeCode: { type: String, required: true, trim: true, maxlength: 20 },
  employeeName: { type: String, required: true, trim: true, maxlength: 162 },
  department: { type: String, required: true, trim: true, maxlength: 80 },
  designation: { type: String, required: true, trim: true, maxlength: 80 },
  currency: { type: String, enum: ["INR"], required: true, default: "INR" },
  baseSalaryPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Base salary must be a safe integer amount in paise" }
  },
  monthlyAllowancesPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Allowances must be a safe integer amount in paise" }
  },
  grossPayPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Gross pay must be a safe integer amount in paise" }
  },
  monthlyDeductionsPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Deductions must be a safe integer amount in paise" }
  },
  netPayPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Net pay must be a safe integer amount in paise" }
  }
}, { _id: false, strict: "throw" });

const payrollRunSchema = new mongoose.Schema({
  period: {
    type: String,
    required: true,
    unique: true,
    match: /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/
  },
  currency: { type: String, enum: ["INR"], required: true, default: "INR" },
  status: {
    type: String,
    enum: ["draft", "approved", "finalized"],
    required: true,
    default: "draft",
    index: true
  },
  employeeCount: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  totalGrossPayPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Gross total must be a safe integer amount in paise" }
  },
  totalDeductionsPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Deductions total must be a safe integer amount in paise" }
  },
  totalNetPayPaise: {
    type: Number,
    required: true,
    validate: { validator: isNonNegativeSafeInteger, message: "Net total must be a safe integer amount in paise" }
  },
  items: {
    type: [payrollLineItemSchema],
    required: true,
    validate: { validator: (items) => Array.isArray(items) && items.length > 0, message: "Payroll must contain at least one employee" }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  finalizedAt: { type: Date, default: null }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

payrollRunSchema.index({ period: -1, createdAt: -1 });

payrollRunSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    period: this.period,
    currency: this.currency,
    status: this.status,
    employeeCount: this.employeeCount,
    totalGrossPayPaise: this.totalGrossPayPaise,
    totalDeductionsPaise: this.totalDeductionsPaise,
    totalNetPayPaise: this.totalNetPayPaise,
    items: this.items.map((item) => ({
      employeeId: item.employeeId.toString(),
      employeeCode: item.employeeCode,
      employeeName: item.employeeName,
      department: item.department,
      designation: item.designation,
      currency: item.currency,
      baseSalaryPaise: item.baseSalaryPaise,
      monthlyAllowancesPaise: item.monthlyAllowancesPaise,
      grossPayPaise: item.grossPayPaise,
      monthlyDeductionsPaise: item.monthlyDeductionsPaise,
      netPayPaise: item.netPayPaise
    })),
    createdBy: this.createdBy?.toString() || null,
    approvedBy: this.approvedBy?.toString() || null,
    approvedAt: this.approvedAt,
    finalizedBy: this.finalizedBy?.toString() || null,
    finalizedAt: this.finalizedAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const PayrollRun = mongoose.models.PayrollRun || mongoose.model("PayrollRun", payrollRunSchema);
