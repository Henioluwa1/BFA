const express = require('express');
const SystemController = require('./system.controller');

const router = express.Router();

router.get('/info', SystemController.getInfo);

module.exports = router;
