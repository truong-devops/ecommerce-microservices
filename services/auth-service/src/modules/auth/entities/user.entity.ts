import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { SessionEntity } from './session.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { EmailVerificationTokenEntity } from './email-verification-token.entity';
import { PasswordResetTokenEntity } from './password-reset-token.entity';
import { AuditLogEntity } from './audit-log.entity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.CUSTOMER
  })
  role!: Role;

  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  isEmailVerified!: boolean;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'token_version', type: 'integer', default: 0 })
  tokenVersion!: number;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled!: boolean;

  @Column({ name: 'mfa_secret', type: 'varchar', nullable: true })
  mfaSecret!: string | null;

  @OneToMany(() => SessionEntity, (session) => session.user)
  sessions!: SessionEntity[];

  @OneToMany(() => RefreshTokenEntity, (refreshToken) => refreshToken.user)
  refreshTokens!: RefreshTokenEntity[];

  @OneToMany(() => EmailVerificationTokenEntity, (token) => token.user)
  emailVerificationTokens!: EmailVerificationTokenEntity[];

  @OneToMany(() => PasswordResetTokenEntity, (token) => token.user)
  passwordResetTokens!: PasswordResetTokenEntity[];

  @OneToMany(() => AuditLogEntity, (auditLog) => auditLog.user)
  auditLogs!: AuditLogEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
