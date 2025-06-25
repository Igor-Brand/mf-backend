const pool = require('../config/database');
const Joi = require('joi');

const enderecoSchema = Joi.object({
    cep: Joi.string().pattern(/^\d{5}-?\d{3}$/).required(),
    logradouro: Joi.string().min(5).max(255).required(),
    numero: Joi.string().max(10).required(),
    complemento: Joi.string().max(255).allow(''),
    bairro: Joi.string().max(255).required(),
    cidade: Joi.string().max(255).required(),
    estado: Joi.string().length(2).required()
});

const solicitacaoSchema = Joi.object({
    endereco_origem: enderecoSchema.required(),
    endereco_destino: enderecoSchema.required(),
    descricao: Joi.string().max(1000),
    data_mudanca: Joi.date().min('now').required(),
    observacoes: Joi.string().max(500)
});

const createSolicitacao = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { error, value } = solicitacaoSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        if (req.user.tipo !== 'cliente') {
            return res.status(403).json({ error: 'Apenas clientes podem criar solicitações' });
        }

        await client.query('BEGIN');

        const { endereco_origem, endereco_destino, descricao, data_mudanca, observacoes } = value;

        // Inserir endereço de origem
        const origemResult = await client.query(
            'INSERT INTO enderecos (usuario_id, cep, logradouro, numero, complemento, bairro, cidade, estado, tipo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
            [req.user.id, endereco_origem.cep, endereco_origem.logradouro, endereco_origem.numero, endereco_origem.complemento, endereco_origem.bairro, endereco_origem.cidade, endereco_origem.estado, 'origem']
        );

        // Inserir endereço de destino
        const destinoResult = await client.query(
            'INSERT INTO enderecos (usuario_id, cep, logradouro, numero, complemento, bairro, cidade, estado, tipo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
            [req.user.id, endereco_destino.cep, endereco_destino.logradouro, endereco_destino.numero, endereco_destino.complemento, endereco_destino.bairro, endereco_destino.cidade, endereco_destino.estado, 'destino']
        );

        // Inserir solicitação
        const solicitacaoResult = await client.query(
            'INSERT INTO solicitacoes (cliente_id, endereco_origem_id, endereco_destino_id, descricao, data_mudanca, observacoes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [req.user.id, origemResult.rows[0].id, destinoResult.rows[0].id, descricao, data_mudanca, observacoes]
        );

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Solicitação criada com sucesso',
            solicitacao: solicitacaoResult.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao criar solicitação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
        client.release();
    }
};

const getSolicitacoes = async (req, res) => {
    try {
        let query, params;

        if (req.user.tipo === 'cliente') {
            // Cliente vê apenas suas solicitações
            query = `
                SELECT s.*, 
                       eo.cep as origem_cep, eo.logradouro as origem_logradouro, eo.numero as origem_numero,
                       eo.complemento as origem_complemento, eo.bairro as origem_bairro, eo.cidade as origem_cidade, eo.estado as origem_estado,
                       ed.cep as destino_cep, ed.logradouro as destino_logradouro, ed.numero as destino_numero,
                       ed.complemento as destino_complemento, ed.bairro as destino_bairro, ed.cidade as destino_cidade, ed.estado as destino_estado
                FROM solicitacoes s
                JOIN enderecos eo ON s.endereco_origem_id = eo.id
                JOIN enderecos ed ON s.endereco_destino_id = ed.id
                WHERE s.cliente_id = $1
                ORDER BY s.created_at DESC
            `;
            params = [req.user.id];
        } else {
            // Empresa vê todas as solicitações pendentes
            query = `
                SELECT s.*, u.nome as cliente_nome, u.telefone as cliente_telefone,
                       eo.cep as origem_cep, eo.logradouro as origem_logradouro, eo.numero as origem_numero,
                       eo.complemento as origem_complemento, eo.bairro as origem_bairro, eo.cidade as origem_cidade, eo.estado as origem_estado,
                       ed.cep as destino_cep, ed.logradouro as destino_logradouro, ed.numero as destino_numero,
                       ed.complemento as destino_complemento, ed.bairro as destino_bairro, ed.cidade as destino_cidade, ed.estado as destino_estado
                FROM solicitacoes s
                JOIN usuarios u ON s.cliente_id = u.id
                JOIN enderecos eo ON s.endereco_origem_id = eo.id
                JOIN enderecos ed ON s.endereco_destino_id = ed.id
                WHERE s.status = 'pendente'
                ORDER BY s.created_at DESC
            `;
            params = [];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar solicitações:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

const getSolicitacaoById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT s.*, u.nome as cliente_nome, u.telefone as cliente_telefone,
                   eo.cep as origem_cep, eo.logradouro as origem_logradouro, eo.numero as origem_numero,
                   eo.complemento as origem_complemento, eo.bairro as origem_bairro, eo.cidade as origem_cidade, eo.estado as origem_estado,
                   ed.cep as destino_cep, ed.logradouro as destino_logradouro, ed.numero as destino_numero,
                   ed.complemento as destino_complemento, ed.bairro as destino_bairro, ed.cidade as destino_cidade, ed.estado as destino_estado
            FROM solicitacoes s
            JOIN usuarios u ON s.cliente_id = u.id
            JOIN enderecos eo ON s.endereco_origem_id = eo.id
            JOIN enderecos ed ON s.endereco_destino_id = ed.id
            WHERE s.id = $1
        `;

        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Solicitação não encontrada' });
        }

        // Verificar se o usuário tem permissão para ver esta solicitação
        const solicitacao = result.rows[0];
        if (req.user.tipo === 'cliente' && solicitacao.cliente_id !== req.user.id) {
            return res.status(403).json({ error: 'Acesso negado' });
        }

        res.json(solicitacao);
    } catch (error) {
        console.error('Erro ao buscar solicitação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

module.exports = { createSolicitacao, getSolicitacoes, getSolicitacaoById };