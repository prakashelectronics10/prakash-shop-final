const AppError = require("../utils/AppError");

const validateBody = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return next(new AppError("Validation failed", 400, parsed.error.flatten()));
  }
  req.body = parsed.data;
  return next();
};

const validateQuery = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return next(new AppError("Invalid query parameters", 400, parsed.error.flatten()));
  }
  req.query = parsed.data;
  return next();
};

module.exports = { validateBody, validateQuery };
