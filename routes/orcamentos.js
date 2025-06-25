const express = require('express');
const router = express.Router();
const { createOrcamento, getOrcamentos, updateOrcamentoStatus } = require('../controllers/orcamentoController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.post('/', createOrcamento);
router.get('/', getOrcamentos);
router.patch('/:id/status', updateOrcamentoStatus);

module.exports = router;