import dotenv from 'dotenv';
dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  PORT: parseInt(process.env.PORT || '3100'),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5100',
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
