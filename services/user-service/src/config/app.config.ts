import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as Joi from 'joi';
import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AddAddressToUsersTable1710000000001 } from '../database/migrations/1710000000001-add-address-to-users-table';
import { AddProfileFieldsToUsersTable1710000000002 } from '../database/migrations/1710000000002-add-profile-fields-to-users-table';
import { CreateUsersTable1710000000000 } from '../database/migrations/1710000000000-create-users-table';
import { UserEntity } from '../modules/users/entities/user.entity';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'staging', 'production').default('development'),
  SERVICE_NAME: Joi.string().default('user-service'),
  PORT: Joi.number().default(3000),
  DB_TYPE: Joi.string().valid('postgres', 'pg-mem').default('postgres'),
  DB_HOST: Joi.string().when('DB_TYPE', {
    is: 'postgres',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().when('DB_TYPE', {
    is: 'postgres',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_NAME: Joi.string().when('DB_TYPE', {
    is: 'postgres',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_MIGRATIONS_RUN: Joi.boolean().truthy('true').falsy('false').default(true),
  KAFKA_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  KAFKA_CLIENT_ID: Joi.string().default('user-service'),
  KAFKA_BROKERS: Joi.string().allow('').default(''),
  KAFKA_USER_TOPIC: Joi.string().default('user.registered')
});

export async function createPgMemDataSource(options: DataSourceOptions): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    returns: DataType.uuid,
    implementation: () => randomUUID()
  });

  const dataSource = db.adapters.createTypeormDataSource(options);
  return dataSource.initialize();
}

export function createTypeOrmOptions(configService: ConfigService): TypeOrmModuleOptions {
  const dbType = configService.get<string>('DB_TYPE', 'postgres');

  if (dbType === 'pg-mem') {
    return {
      type: 'postgres',
      synchronize: true,
      autoLoadEntities: true,
      entities: [UserEntity]
    };
  }

  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST'),
    port: configService.get<number>('DB_PORT', 5432),
    username: configService.get<string>('DB_USERNAME'),
    password: configService.get<string>('DB_PASSWORD', ''),
    database: configService.get<string>('DB_NAME'),
    ssl: configService.get<boolean>('DB_SSL', false) ? { rejectUnauthorized: false } : false,
    synchronize: false,
    autoLoadEntities: true,
    entities: [UserEntity],
    migrations: [CreateUsersTable1710000000000, AddAddressToUsersTable1710000000001, AddProfileFieldsToUsersTable1710000000002],
    migrationsRun: configService.get<boolean>('DB_MIGRATIONS_RUN', true)
  };
}
