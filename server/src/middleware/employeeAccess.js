export function validateEmployeeIdParam(req, res, next) {
  if (!/^[a-fA-F0-9]{24}$/.test(req.params.id || "")) {
    return res.status(400).json({
      success: false,
      message: "Invalid employee ID"
    });
  }
  return next();
}

export function requireEmployeeReadAccess(req, res, next) {
  if (!req.authUser) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  if (req.authUser.role === "admin") return next();

  const ownEmployeeId = req.authUser.employeeId?.toString();
  if (req.authUser.role === "employee" && ownEmployeeId && ownEmployeeId === req.params.id) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "You may only access your own employee record"
  });
}
