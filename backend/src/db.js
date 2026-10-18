import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(`Database is not configured. Missing: ${missing.join(', ')}. Copy backend/.env.example to backend/.env.`);
}

export const dbConfigured = missing.length === 0;
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'invalid-unconfigured-host',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

export async function checkDatabase() {
  if (!dbConfigured) return { healthy: false, error: 'Database credentials are not configured.' };
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: error.code || error.message };
  }
}

