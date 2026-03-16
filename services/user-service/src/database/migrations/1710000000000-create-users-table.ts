import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1710000000000 implements MigrationInterface {
  name = 'CreateUsersTable1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('buyer', 'seller', 'admin')`
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'pending', 'suspended', 'deleted')`
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying(255) NOT NULL,
        "first_name" character varying(100) NOT NULL,
        "last_name" character varying(100) NOT NULL,
        "phone" character varying(30),
        "role" "public"."users_role_enum" NOT NULL DEFAULT 'buyer',
        "status" "public"."users_status_enum" NOT NULL DEFAULT 'pending',
        "email_verified" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_users_email_unique" ON "users" ("email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_users_email_unique"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
