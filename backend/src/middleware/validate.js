const { ValidationError } = require('../utils/apiError');

/**
 * Validation middleware using Zod or custom schema
 * @param {Object} schema - Object containing zod schemas for { body, query, params }
 */
function validate(schema) {
  return (req, res, next) => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = validate;
