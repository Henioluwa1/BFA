const express = require('express');
const { handleLogin, handleGetMe, handleLogout } = require('./auth.controller');

const router = express.Router();

router.post('/login', handleLogin);
router.get('/me', handleGetMe);
router.post('/logout', handleLogout);

module.exports = router;
