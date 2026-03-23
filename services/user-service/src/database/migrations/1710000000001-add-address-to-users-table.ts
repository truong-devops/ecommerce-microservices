import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAddressToUsersTable1710000000001 implements MigrationInterface {
  name = 'AddAddressToUsersTable1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" ADD COLUMN "address" character varying(255)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "address"');
  }
}
