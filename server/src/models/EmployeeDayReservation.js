import mongoose from "mongoose";

function isUtcDateOnly(value) {
  return value instanceof Date
    && !Number.isNaN(value.getTime())
    && value.toISOString().slice(11, 23) === "00:00:00.000";
}

const employeeDayReservationSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    required: true
  },
  date: {
    type: Date,
    required: true,
    validate: { validator: isUtcDateOnly, message: "Reserved date must be stored at UTC midnight" }
  },
  kind: {
    type: String,
    enum: ["unpaid_leave", "wfh"],
    required: true
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

// A single unique registry prevents a pending/approved unpaid-leave request and a
// pending/approved WFH request from concurrently reserving the same employee date.
employeeDayReservationSchema.index({ employeeId: 1, date: 1 }, { unique: true });
employeeDayReservationSchema.index({ kind: 1, requestId: 1 }, { unique: true });

export const EmployeeDayReservation = mongoose.models.EmployeeDayReservation
  || mongoose.model("EmployeeDayReservation", employeeDayReservationSchema);
