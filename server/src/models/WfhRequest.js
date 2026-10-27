import mongoose from "mongoose";

function isUtcDateOnly(value) {
  return value instanceof Date
    && !Number.isNaN(value.getTime())
    && value.toISOString().slice(11, 23) === "00:00:00.000";
}

const wfhRequestSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  date: {
    type: Date,
    required: true,
    validate: { validator: isUtcDateOnly, message: "WFH date must be stored at UTC midnight" }
  },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 240 },
  status: { type: String, enum: ["pending", "approved", "rejected"], required: true, default: "pending", index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: "", trim: true, maxlength: 240 }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

wfhRequestSchema.index({ employeeId: 1, date: 1 }, { unique: true });
wfhRequestSchema.index({ status: 1, date: 1, createdAt: -1 });

wfhRequestSchema.methods.toPublicJSON = function toPublicJSON() {
  const employee = this.employeeId && typeof this.employeeId === "object" && this.employeeId._id
    ? this.employeeId
    : null;
  return {
    id: this._id.toString(),
    employeeId: employee ? employee._id.toString() : this.employeeId?.toString(),
    employee: employee ? {
      id: employee._id.toString(),
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department
    } : undefined,
    date: this.date.toISOString().slice(0, 10),
    period: this.date.toISOString().slice(0, 7),
    reason: this.reason,
    status: this.status,
    requestedBy: this.requestedBy?.toString() || null,
    decidedBy: this.decidedBy?.toString() || null,
    decidedAt: this.decidedAt,
    decisionNote: this.decisionNote,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const WfhRequest = mongoose.models.WfhRequest || mongoose.model("WfhRequest", wfhRequestSchema);
