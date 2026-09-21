const express = require('express');
const HealthController = require('./health.controller');

const router = express.Router();

router.get('/', HealthController.check);
router.get('/ping', HealthController.ping);

module.exports = router;
