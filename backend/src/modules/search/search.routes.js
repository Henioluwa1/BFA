const express = require('express');
const SearchController = require('./search.controller');
const { requireAuth } = require('../../core/middleware/authContext');

const router = express.Router();

// Internal global search requires an authenticated session.
// Role-based data filtering (agent isolation, expense/financial visibility,
// property scoping) is applied in SearchService based on req.user context.
router.use(requireAuth);

router.get('/', SearchController.search);

module.exports = router;
