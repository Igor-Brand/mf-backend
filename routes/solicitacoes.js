const express = require('express');
const router = express.Router();
const { createSolicitacao, getSolicitacoes, getSolicitacaoById } = require('../controllers/solicitacaoController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.post('/', createSolicitacao);
router.get('/', getSolicitacoes);
router.get('/:id', getSolicitacaoById);

module.exports = router;