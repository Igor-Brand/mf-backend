const pool = require('../config/database');
const Joi = require('joi');

const orcamentoSchema = Joi.object({
    solicitacao_id: Joi.number().integer().positive().required(),
    valor: Joi.number().positive().required(),
    descricao_servico: Joi.string().max(1000).required(),
    prazo_dias: Joi.number().integer().positive().required(),
    observacoes: Joi.string().max(500)
});

const createOrcamento = async (req, res) => {
    try {
        const { error, value } = orcamentoSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        if (req.user.tipo !== 'empresa') {
            return res.status(403).json({ error: 'Apenas empresas podem criar orçamentos' });
        }

        const { solicitacao_id, valor, descricao_servico, prazo_dias, observacoes } = value;

        // Verificar se a solicitação existe e está pendente
        const solicitacaoResult = await pool.query(
            'SELECT * FROM solicitacoes WHERE id = $1 AND status = $2',
            [solicitacao_id, 'pendente']
        );

        if (solicitacaoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Solicitação não encontrada ou não está mais disponível' });
        }

        // Verificar se a empresa já fez um orçamento para esta solicitação
        const existingOrcamento = await pool.query(
            'SELECT * FROM orcamentos WHERE solicitacao_id = $1 AND empresa_id = $2',
            [solicitacao_id, req.user.id]
        );

        if (existingOrcamento.rows.length > 0) {
            return res.status(400).json({ error: 'Você já enviou um orçamento para esta solicitação' });
        }

        // Criar orçamento
        const result = await pool.query(
            'INSERT INTO orcamentos (solicitacao_id, empresa_id, valor, descricao_servico, prazo_dias, observacoes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [solicitacao_id, req.user.id, valor, descricao_servico, prazo_dias, observacoes]
        );

        res.status(201).json({
            message: 'Orçamento enviado com sucesso',
            orcamento: result.rows[0]
        });
    } catch (error) {
        console.error('Erro ao criar orçamento:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

const getOrcamentos = async (req, res) => {
    try {
        let query, params;

        if (req.user.tipo === 'cliente') {
            // Cliente vê orçamentos das suas solicitações
            query = `
                SELECT o.*, e.nome as empresa_nome, e.telefone as empresa_telefone,
                       s.descricao as solicitacao_descricao
                FROM orcamentos o
                JOIN usuarios e ON o.empresa_id = e.id
                JOIN solicitacoes s ON o.solicitacao_id = s.id
                WHERE s.cliente_id = $1
                ORDER BY o.created_at DESC
            `;
            params = [req.user.id];
        } else {
            // Empresa vê seus próprios orçamentos
            query = `
                SELECT o.*, s.descricao as solicitacao_descricao,
                       c.nome as cliente_nome, c.telefone as cliente_telefone
                FROM orcamentos o
                JOIN solicitacoes s ON o.solicitacao_id = s.id
                JOIN usuarios c ON s.cliente_id = c.id
                WHERE o.empresa_id = $1
                ORDER BY o.created_at DESC
            `;
            params = [req.user.id];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar orçamentos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

const updateOrcamentoStatus = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['aceito', 'rejeitado'].includes(status)) {
            return res.status(400).json({ error: 'Status deve ser "aceito" ou "rejeitado"' });
        }

        if (req.user.tipo !== 'cliente') {
            return res.status(403).json({ error: 'Apenas clientes podem aceitar/rejeitar orçamentos' });
        }

        await client.query('BEGIN');

        // Buscar o orçamento e verificar se pertence ao cliente
        const orcamentoResult = await client.query(`
            SELECT o.*, s.cliente_id
            FROM orcamentos o
            JOIN solicitacoes s ON o.solicitacao_id = s.id
            WHERE o.id = $1 AND s.cliente_id = $2
        `, [id, req.user.id]);

        if (orcamentoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }

        const orcamento = orcamentoResult.rows[0];

        if (orcamento.status !== 'pendente') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Este orçamento já foi processado' });
        }

        // Atualizar status do orçamento
        await client.query(
            'UPDATE orcamentos SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [status, id]
        );

        // Se aceito, atualizar status da solicitação
        if (status === 'aceito') {
            await client.query(
                'UPDATE solicitacoes SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['em_andamento', orcamento.solicitacao_id]
            );

            // Rejeitar outros orçamentos da mesma solicitação
            await client.query(
                'UPDATE orcamentos SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE solicitacao_id = $2 AND id != $3 AND status = $4',
                ['rejeitado', orcamento.solicitacao_id, id, 'pendente']
            );
        }

        await client.query('COMMIT');

        res.json({
            message: `Orçamento ${status} com sucesso`,
            status
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao atualizar orçamento:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        client.release();
    }
};

module.exports = { createOrcamento, getOrcamentos, updateOrcamentoStatus };
