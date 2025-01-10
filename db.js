const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');
const path = require('path');

const db = new sqlite3.Database('./inventory.db', (err) => {
    if (err) {
        console.error('Error conectando a la base de datos', err);
        return;
    }
    console.log('Conectado a la base de datos SQLite');
});

async function initializeDatabase() {
    db.serialize(() => {
        // Crear tablas
        // Tabla de productos
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            productos TEXT NOT NULL,
            um TEXT NOT NULL,
            peso REAL NOT NULL,
            tipo TEXT NOT NULL,
            cantidad REAL DEFAULT 0,
            precio_unit REAL NOT NULL,
            valor REAL,
            peso_total REAL
        )`);

        // Tabla de movimientos
        db.run(`CREATE TABLE IF NOT EXISTS movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto TEXT NOT NULL,
            peso REAL NOT NULL,
            um TEXT NOT NULL,
            tipo TEXT NOT NULL,
            cantidad REAL NOT NULL,
            fecha DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY(producto) REFERENCES products(productos)
        )`);

        // Verificar si hay datos en la tabla products
        db.get('SELECT COUNT(*) as count FROM products', [], (err, row) => {
            if (err || row.count === 0) {
                // Cargar datos del Excel si la tabla está vacía
                const workbook = XLSX.readFile('INVENTARIO 2024 original.xlsx');
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(worksheet);

                const insertStmt = db.prepare(`
                    INSERT INTO products (
                        productos, um, peso, tipo, cantidad, 
                        precio_unit, valor, peso_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                data.forEach(row => {
                    if (row.PRODUCTOS) {
                        insertStmt.run(
                            row.PRODUCTOS,
                            row.UM || '',
                            row.PESO || 0,
                            row.TIPO || '',
                            row.CANTIDAD || 0,
                            row["Prec.Unit."] || 0,
                            row.VALOR || 0,
                            row["PESO TOTAL"] || 0
                        );
                    }
                });

                insertStmt.finalize();
            }
        });
    });
}

module.exports = {
    db,
    initializeDatabase
};