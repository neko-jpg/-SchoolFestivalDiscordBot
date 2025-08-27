import pino from 'pino';

// Determine the logging transport based on the environment
const transport = process.env.NODE_ENV === 'development'
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: transport,
});

export default logger;
