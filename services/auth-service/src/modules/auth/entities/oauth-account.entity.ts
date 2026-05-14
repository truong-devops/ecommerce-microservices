import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity({ name: 'oauth_accounts' })
@Unique('uq_oauth_provider_user', ['provider', 'providerUserId'])
@Unique('uq_oauth_provider_email', ['provider', 'providerEmail'])
export class OauthAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @Column({ type: 'varchar' })
  provider!: string;

  @Column({ name: 'provider_user_id', type: 'varchar' })
  providerUserId!: string;

  @Column({ name: 'provider_email', type: 'varchar' })
  providerEmail!: string;

  @Column({ name: 'provider_email_verified', type: 'boolean', default: false })
  providerEmailVerified!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

