const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const certPath = path.join(__dirname, 'cert', 'isrgrootx1.pem');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'qtda',
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false,
        ca: fs.readFileSync(certPath)
    },
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

async function test() {
    const [rows] = await pool.query('SELECT VERSION() AS version');
    console.log(rows);
}

if (require.main === module) {
    test()
        .then(() => pool.end())
        .catch(err => {
            console.error('❌ Lỗi kết nối TiDB:', err.message);
            process.exit(1);
        });
}

module.exports = pool;
