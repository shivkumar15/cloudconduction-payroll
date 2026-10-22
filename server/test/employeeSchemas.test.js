import test from "node:test";
import assert from "node:assert/strict";
import { Employee } from "../src/models/Employee.js";
import { User } from "../src/models/User.js";
import {
  createEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema
} from "../src/validators/employeeSchemas.js";

const validEmployee = {
  employeeCode: "emp-1001",
  firstName: "Rahul",
  lastName: "Kumar",
  workEmail: "RAHUL@example.com",
  department: "Engineering",
  designation: "Software Engineer",
  salaryStructure: {
    baseSalaryPaise: 2_500_000,
    monthlyAllowancesPaise: 300_000,
    monthlyDeductionsPaise: 200_000
  },
  initialPassword: "a-unique-test-password"
};

test("create employee validates and normalizes unique identifiers", () => {
  const result = createEmployeeSchema.parse(validEmployee);
  assert.equal(result.employeeCode, "EMP-1001");
  assert.equal(result.workEmail, "rahul@example.com");
});

test("create employee rejects unknown fields and too-short initial passwords", () => {
  assert.equal(createEmployeeSchema.safeParse({
    ...validEmployee,
    role: "admin"
  }).success, false);
  assert.equal(createEmployeeSchema.safeParse({
    ...validEmployee,
    initialPassword: "short"
  }).success, false);
});

test("salary deductions cannot exceed gross earnings", () => {
  const result = createEmployeeSchema.safeParse({
    ...validEmployee,
    salaryStructure: {
      baseSalaryPaise: 100,
      monthlyAllowancesPaise: 0,
      monthlyDeductionsPaise: 101
    }
  });
  assert.equal(result.success, false);
});

test("salary components must be safe integer paise amounts", () => {
  const result = createEmployeeSchema.safeParse({
    ...validEmployee,
    salaryStructure: {
      baseSalaryPaise: 100.5,
      monthlyAllowancesPaise: 0,
      monthlyDeductionsPaise: 0
    }
  });
  assert.equal(result.success, false);
});

test("employee update rejects empty bodies, work-email changes, and role injection", () => {
  assert.equal(updateEmployeeSchema.safeParse({}).success, false);
  assert.equal(updateEmployeeSchema.safeParse({ workEmail: "other@example.com" }).success, false);
  assert.equal(updateEmployeeSchema.safeParse({ role: "admin" }).success, false);
  assert.equal(updateEmployeeSchema.safeParse({ department: "Finance" }).success, true);
});

test("employee list query bounds page size and supports filters", () => {
  const result = employeeListQuerySchema.safeParse({
    page: "2",
    pageSize: "25",
    q: "rahul",
    department: "Engineering",
    employmentStatus: "active"
  });
  assert.equal(result.success, true);
  assert.equal(result.data.page, 2);
  assert.equal(result.data.pageSize, 25);

  assert.equal(employeeListQuerySchema.safeParse({ pageSize: "101" }).success, false);
  assert.equal(employeeListQuerySchema.safeParse({ employmentStatus: "deleted" }).success, false);
});


test("employee code and work email have database unique-index definitions", () => {
  assert.equal(Employee.schema.path("employeeCode").options.unique, true);
  assert.equal(Employee.schema.path("workEmail").options.unique, true);
});

 
test("employee login reference uses a unique partial index without colliding on admin nulls", () => {
  const employeeReferenceIndex = User.schema.indexes().find(([keys, options]) =>
    keys.employeeId === 1 && options.unique === true
  );
  assert.ok(employeeReferenceIndex);
  assert.deepEqual(employeeReferenceIndex[1].partialFilterExpression, {
    employeeId: { $type: "objectId" }
  });
});
