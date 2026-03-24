import 'dotenv/config';
import { DataSource } from 'typeorm';
import { AddAddressToUsersTable1710000000001 } from './migrations/1710000000001-add-address-to-users-table';
import { AddProfileFieldsToUsersTable1710000000002 } from './migrations/1710000000002-add-profile-fields-to-users-table';
import { UserEntity } from '../modules/users/entities/user.entity';
import { CreateUsersTable1710000000000 } from './migrations/1710000000000-create-users-table';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'ecommerce',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  entities: [UserEntity],
  migrations: [CreateUsersTable1710000000000, AddAddressToUsersTable1710000000001, AddProfileFieldsToUsersTable1710000000002]
});

export default dataSource;
