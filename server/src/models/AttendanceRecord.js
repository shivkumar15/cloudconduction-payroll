import mongoose from "mongoose";

const attendanceRecordSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
  date: {
    type: Date,
    required: true,
    validate: {
      validator: (value) => value instanceof Date
        && !Number.isNaN(value.getTime())
        && value.toISOString().slice(11, 23) === "00:00:00.000",
      message: "Attendance date must be stored at UTC midnight"
    }
  },
  mode: { type: String, enum: ["wfh"], required: true, default: "wfh" },
  wfhRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "WfhRequest", required: true },
  checkedInAt: { type: Date, required: true },
  checkedOutAt: { type: Date, default: null },
  correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  correctionNote: { type: String, default: "", trim: true, maxlength: 240 },
  correctedAt: { type: Date, default: null }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

attendanceRecordSchema.pre("validate", function validatePunchOrder() {
  if (this.checkedOutAt && (!this.checkedInAt || this.checkedOutAt <= this.checkedInAt)) {
    this.invalidate("checkedOutAt", "Check-out must occur after check-in");
  }
});

attendanceRecordSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceRecordSchema.index({ date: -1, checkedOutAt: 1 });
attendanceRecordSchema.index({ wfhRequestId: 1 });

attendanceRecordSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    employeeId: this.employeeId && typeof this.employeeId === "object" && this.employeeId._id
      ? this.employeeId._id.toString()
      : this.employeeId?.toString(),
    date: this.date.toISOString().slice(0, 10),
    mode: this.mode,
    wfhRequestId: this.wfhRequestId?.toString(),
    checkedInAt: this.checkedInAt,
    checkedOutAt: this.checkedOutAt,
    correctedBy: this.correctedBy?.toString() || null,
    correctionNote: this.correctionNote || "",
    correctedAt: this.correctedAt || null,
    status: this.checkedOutAt ? (this.correctedBy ? "corrected" : "completed") : "checked_in",
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const AttendanceRecord = mongoose.models.AttendanceRecord
  || mongoose.model("AttendanceRecord", attendanceRecordSchema);
