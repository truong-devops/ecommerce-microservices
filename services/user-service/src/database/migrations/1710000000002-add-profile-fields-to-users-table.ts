import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProfileFieldsToUsersTable1710000000002 implements MigrationInterface {
  name = 'AddProfileFieldsToUsersTable1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
        ADD COLUMN "gender" character varying(20) NOT NULL DEFAULT 'unspecified',
        ADD COLUMN "date_of_birth" date,
        ADD COLUMN "avatar_url" character varying(500)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
        DROP COLUMN "avatar_url",
        DROP COLUMN "date_of_birth",
        DROP COLUMN "gender"`
    );
  }
}
