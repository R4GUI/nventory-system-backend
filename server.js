const express = require('express');
const cors = require('cors');
const XLSX = require('xlsx');
const { db, initializeDatabase } = require('./db');

const app = express();

app.use(cors({
    origin: '*'
}));

app.use(express.json());

// Inicializar base de datos
initializeDatabase().catch(console.error);

// Obtener todos los productos
app.get('/api/products', (req, res) => {
    db.all('SELECT * FROM products ORDER BY productos, peso', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Agregar nuevo producto
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

// Registrar movimiento
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
                throw new Error('Producto no encontrado');
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

// Obtener historial de movimientos
app.get('/api/movements', (req, res) => {
    db.all('SELECT * FROM movements ORDER BY fecha DESC', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Obtener movimientos por rango de fechas
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

// Exportar productos a Excel
app.get('/api/export', (req, res) => {
    db.all('SELECT * FROM products ORDER BY productos, peso', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        try {
            // Crear nuevo libro de Excel
            const workbook = XLSX.utils.book_new();
            
            // Convertir los datos al formato de hoja de cálculo
            const worksheet = XLSX.utils.json_to_sheet(rows.map(row => ({
                'PRODUCTOS': row.productos,
                'UM': row.um,
                'PESO': row.peso,
                'TIPO': row.tipo,
                'CANTIDAD': row.cantidad,
                'Prec.Unit.': row.precio_unit,
                'VALOR': row.valor,
                'PESO TOTAL': row.peso_total
            })));

            // Agregar la hoja al libro
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');

            // Generar buffer
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            // Configurar headers para la descarga del archivo
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=inventario.xlsx');
            
            // Enviar el archivo
            res.send(excelBuffer);
        } catch (error) {
            console.error('Error al crear archivo Excel:', error);
            res.status(500).json({ error: 'Error al crear archivo Excel' });
        }
    });
});

// Exportar movimientos a Excel
app.get('/api/export/movements', (req, res) => {
    const { start, end } = req.query;
    let query = 'SELECT * FROM movements';
    let params = [];

    if (start && end) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        endDate.setHours(23, 59, 59);
        query += ' WHERE fecha BETWEEN ? AND ?';
        params = [startDate.toISOString(), endDate.toISOString()];
    }

    query += ' ORDER BY fecha DESC';

    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        try {
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(rows.map(row => ({
                'Fecha': row.fecha,
                'Producto': row.producto,
                'Tipo': row.tipo,
                'Cantidad': row.cantidad,
                'Peso': row.peso,
                'UM': row.um
            })));

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');

            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=movimientos.xlsx');
            
            res.send(excelBuffer);
        } catch (error) {
            console.error('Error al crear archivo Excel:', error);
            res.status(500).json({ error: 'Error al crear archivo Excel' });
        }
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});