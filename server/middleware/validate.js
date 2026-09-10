const AppError = require("../utils/AppError");

function firstValidationMessage(details) {
  const fieldErrors = details?.fieldErrors || {};
  const firstField = Object.entries(fieldErrors).find(([, messages]) => Array.isArray(messages) && messages.length);
  if (firstField) {
    const [field, messages] = firstField;
    const label = field.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
    return `${label}: ${messages[0]}`;
  }
  return details?.formErrors?.find(Boolean) || "Validation failed";
}

const validateBody = (schema) => (req, _res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const details = parsed.error.flatten();
    return next(new AppError(firstValidationMessage(details), 400, details));
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
