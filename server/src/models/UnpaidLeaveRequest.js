import mongoose from "mongoose";

function isDateOnlyUtc(value) {
  return value instanceof Date
    && !Number.isNaN(value.getTime())
    && value.toISOString().slice(11, 23) === "00:00:00.000";
}

const unpaidLeaveRequestSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    validate: { validator: isDateOnlyUtc, message: "Leave date must be stored at UTC midnight" }
  },
  requestGroupId: { type: String, default: null, maxlength: 64, index: true },
  rangeStart: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
  rangeEnd: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
  reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 240 },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    required: true,
    default: "pending",
    index: true
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  decidedAt: { type: Date, default: null },
  decisionNote: { type: String, default: "", maxlength: 240, trim: true }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

// One employee can have only one request/leave decision for an exact date in this MVP.
unpaidLeaveRequestSchema.index({ employeeId: 1, date: 1 }, { unique: true });
unpaidLeaveRequestSchema.index({ status: 1, date: 1, createdAt: -1 });

unpaidLeaveRequestSchema.methods.toPublicJSON = function toPublicJSON() {
  const employee = this.employeeId && typeof this.employeeId === "object" && this.employeeId._id
    ? this.employeeId
    : null;
  const employeeId = employee ? employee._id.toString() : this.employeeId?.toString();

  return {
    id: this._id.toString(),
    employeeId,
    employee: employee ? {
      id: employee._id.toString(),
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department
    } : undefined,
    date: this.date.toISOString().slice(0, 10),
    period: this.date.toISOString().slice(0, 7),
    requestGroupId: this.requestGroupId || null,
    rangeStart: this.rangeStart || null,
    rangeEnd: this.rangeEnd || null,
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

export const UnpaidLeaveRequest = mongoose.models.UnpaidLeaveRequest
  || mongoose.model("UnpaidLeaveRequest", unpaidLeaveRequestSchema);
