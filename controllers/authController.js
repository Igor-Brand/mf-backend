const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const Joi = require('joi');

const registerSchema = Joi.object({
    nome: Joi.string().min(2).max(255).required(),
    email: Joi.string().email().required(),
    senha: Joi.string().min(6).required(),
    tipo: Joi.string().valid('cliente', 'empresa').required(),
    telefone: Joi.string().max(20)
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    senha: Joi.string().required()
});

const register = async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { nome, email, senha, tipo, telefone } = value;

        // Verificar se usuário já existe
        const existingUser = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Usuário já existe com este email' });
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(senha, 10);

        // Inserir usuário
        const result = await pool.query(
            'INSERT INTO usuarios (nome, email, senha, tipo, telefone) VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, tipo, telefone',
            [nome, email, hashedPassword, tipo, telefone]
        );

        const user = result.rows[0];
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Usuário registrado com sucesso',
            user,
            token
        });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

const login = async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { email, senha } = value;

        // Buscar usuário
        const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const user = result.rows[0];

        // Verificar senha
        const isValidPassword = await bcrypt.compare(senha, user.senha);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Login realizado com sucesso',
            user: {
                id: user.id,
                nome: user.nome,
                email: user.email,
                tipo: user.tipo,
                telefone: user.telefone
            },
            token
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

module.exports = { register, login };