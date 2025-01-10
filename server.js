const express = require('express');
const cors = require('cors');
const { db, initializeDatabase } = require('./db');

const app = express();
// Configurar CORS para permitir múltiples orígenes
app.use(cors({
    origin: [
        'https://inventory-system-frontend-edefzwn07-raguis-projects.vercel.app',
        'https://inventory-system-frontend-2vto9tp1t-raguis-projects.vercel.app',
        'https://inventory-system-frontend.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// Inicializar base de datos
initializeDatabase().catch(console.error);

// Get all products
app.get('/api/products', (req, res) => {
    db.all('SELECT * FROM products ORDER BY productos, peso', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Add new product
app.post('/api/products', (req, res) => {
    const { productos, um, peso, tipo, cantidad, precio_unit } = req.body;
    const valor = cantidad * precio_unit;
    const peso_total = cantidad * peso;

    db.run(
        'INSERT INTO products (productos, um, peso, tipo, cantidad, precio_unit, valor, peso_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [productos, um, peso, tipo, cantidad, precio_unit, valor, peso_total],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID });
        }
    );
});

// Register movement
app.post('/api/movements', (req, res) => {
    const { producto, tipo, cantidad, peso, um } = req.body;

    db.serialize(async () => {
        try {
            await db.run('BEGIN TRANSACTION');

            // Registrar movimiento con fecha
            await db.run(
                'INSERT INTO movements (producto, tipo, cantidad, peso, um, fecha) VALUES (?, ?, ?, ?, ?, datetime("now", "localtime"))',
                [producto, tipo, cantidad, peso, um]
            );

            // Obtener datos del producto
            const product = await db.get('SELECT * FROM products WHERE productos = ?', [producto]);

            if (!product) {
                throw new Error('Product not found');
            }

            // Actualizar producto
            const quantityChange = tipo === 'entrada' ? cantidad : -cantidad;
            await db.run(
                'UPDATE products SET cantidad = cantidad + ?, valor = (cantidad + ?) * precio_unit, peso_total = (cantidad + ?) * peso WHERE productos = ?',
                [quantityChange, quantityChange, quantityChange, producto]
            );

            await db.run('COMMIT');
            res.json({ success: true });
        } catch (err) {
            await db.run('ROLLBACK');
            res.status(500).json({ error: err.message });
        }
    });
});

// Get movements history
app.get('/api/movements', (req, res) => {
    db.all('SELECT * FROM movements ORDER BY fecha DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Get movements by date range
app.get('/api/movements/range', (req, res) => {
    const { start, end } = req.query;
    const startDate = new Date(start);
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59);

    db.all(
        'SELECT m.*, p.um FROM movements m LEFT JOIN products p ON m.producto = p.productos WHERE fecha BETWEEN ? AND ? ORDER BY m.fecha DESC',
        [startDate.toISOString(), endDate.toISOString()],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json(rows);
        }
    );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});