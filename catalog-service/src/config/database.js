import { Sequelize } from 'sequelize';
import { config } from './env.js';

const dialectOptions = config.database.ssl
  ? {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  : {};

const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    dialectOptions,
    logging: config.nodeEnv === 'development' ? console.log : false,
    define: {
      timestamps: true,
      underscored: true
    }
  }
);

export default sequelize;
