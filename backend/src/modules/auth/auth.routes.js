const express = require('express');
const { handleLogin, handleGetMe, handleLogout } = require('./auth.controller');
const { authLimiter } = require('../../core/security/security');

const router = express.Router();

router.post('/login', authLimiter, handleLogin);
router.get('/me', handleGetMe);
router.post('/logout', handleLogout);

module.exports = router;
