import pino from 'pino';
import { env } from './env';

// Determine the logging transport based on the environment
const transport = env.NODE_ENV === 'development'
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
  level: env.LOG_LEVEL,
  transport: transport,
});

export default logger;
