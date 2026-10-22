import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    unique: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ["admin", "employee"],
    required: true,
    default: "employee"
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Employee",
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    required: true
  },
  mustChangePassword: {
    type: Boolean,
    // Legacy employee records without this field still require the first-login password change.
    default: function defaultMustChangePassword() {
      return this.role === "employee";
    },
    required: true
  },
  tokenVersion: {
    type: Number,
    default: 0,
    min: 0,
    required: true
  },
  passwordResetOtpHash: {
    type: String,
    default: null,
    select: false
  },
  passwordResetExpiresAt: {
    type: Date,
    default: null,
    select: false
  },
  passwordResetAttempts: {
    type: Number,
    default: 0,
    min: 0,
    select: false
  },
  passwordResetRequestedAt: {
    type: Date,
    default: null,
    select: false
  }
}, {
  timestamps: true,
  strict: "throw",
  versionKey: false
});

userSchema.index(
  { employeeId: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: "objectId" } } }
);

userSchema.statics.hashPassword = async function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    email: this.email,
    role: this.role,
    employeeId: this.employeeId ? this.employeeId.toString() : null,
    isActive: this.isActive,
    mustChangePassword: this.mustChangePassword
  };
};

export const User = mongoose.models.User || mongoose.model("User", userSchema);
