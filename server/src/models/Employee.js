import mongoose from "mongoose";
import { MAX_SALARY_COMPONENT_PAISE, isValidPaise } from "../utils/money.js";

const salaryStructureSchema = new mongoose.Schema({
  baseSalaryPaise: {
    type: Number,
    required: true,
    min: 0,
    max: MAX_SALARY_COMPONENT_PAISE,
    validate: { validator: isValidPaise, message: "Base salary must be a safe integer amount in paise" }
  },
  monthlyAllowancesPaise: {
    type: Number,
    required: true,
    min: 0,
    max: MAX_SALARY_COMPONENT_PAISE,
    validate: { validator: isValidPaise, message: "Allowances must be a safe integer amount in paise" }
  },
  monthlyDeductionsPaise: {
    type: Number,
    required: true,
    min: 0,
    max: MAX_SALARY_COMPONENT_PAISE,
    validate: { validator: isValidPaise, message: "Deductions must be a safe integer amount in paise" }
  }
}, { _id: false, strict: "throw" });

const employeeSchema = new mongoose.Schema({
  employeeCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 3,
    maxlength: 20,
    unique: true,
    index: true,
    match: /^[A-Z0-9][A-Z0-9-]{2,19}$/
  },
  firstName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
  workEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    unique: true,
    index: true
  },
  department: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  designation: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  currency: { type: String, enum: ["INR"], required: true, default: "INR" },
  salaryStructure: { type: salaryStructureSchema, required: true },
  employmentStatus: {
    type: String,
    enum: ["active", "inactive"],
    required: true,
    default: "active",
    index: true
  }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

employeeSchema.index({ department: 1, employmentStatus: 1, createdAt: -1 });

employeeSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    employeeCode: this.employeeCode,
    firstName: this.firstName,
    lastName: this.lastName,
    workEmail: this.workEmail,
    currency: this.currency,
    department: this.department,
    designation: this.designation,
    salaryStructure: {
      baseSalaryPaise: this.salaryStructure.baseSalaryPaise,
      monthlyAllowancesPaise: this.salaryStructure.monthlyAllowancesPaise,
      monthlyDeductionsPaise: this.salaryStructure.monthlyDeductionsPaise
    },
    employmentStatus: this.employmentStatus,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

export const Employee = mongoose.models.Employee || mongoose.model("Employee", employeeSchema);
