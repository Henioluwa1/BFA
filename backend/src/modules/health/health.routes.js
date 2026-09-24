const express = require('express');
const HealthController = require('./health.controller');

const router = express.Router();

router.get('/', HealthController.check);
router.get('/ping', HealthController.ping);
router.get('/live', HealthController.live);
router.get('/ready', HealthController.ready);

module.exports = router;
