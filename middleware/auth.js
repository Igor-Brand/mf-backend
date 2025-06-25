const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Token de acesso requerido' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [decoded.userId]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Token inválido' });
        }

        req.user = result.rows[0];
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.tipo)) {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        next();
    };
};

module.exports = { authMiddleware, requireRole };
