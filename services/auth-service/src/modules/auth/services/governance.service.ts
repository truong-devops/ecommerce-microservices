import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import {
  CreateGovernancePolicyDto,
  GovernanceListQueryDto,
  RecordGovernanceActionDto,
  UpdateGovernancePolicyDto,
  UpdateGovernanceTeamMemberDto
} from '../dto/governance.dto';
import { AuditLogEntity } from '../entities/audit-log.entity';
import { GovernanceActionLogEntity } from '../entities/governance-action-log.entity';
import { GovernancePolicyEntity } from '../entities/governance-policy.entity';
import { UserEntity } from '../entities/user.entity';

const STAFF_ROLES = [Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN];

@Injectable()
export class GovernanceService {
  constructor(
    @InjectRepository(GovernancePolicyEntity)
    private readonly policies: Repository<GovernancePolicyEntity>,
    @InjectRepository(GovernanceActionLogEntity)
    private readonly actionLogs: Repository<GovernanceActionLogEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly systemLogs: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>
  ) {}

  async getSummary(): Promise<Record<string, number>> {
    await this.ensureDefaultPolicies();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalPolicies, publishedPolicies, staffMembers, activeStaffMembers, actionsToday, systemEventsToday] = await Promise.all([
      this.policies.count(),
      this.policies.count({ where: { status: 'PUBLISHED' } }),
      this.users.count({ where: { role: In(STAFF_ROLES) } }),
      this.users.count({ where: { role: In(STAFF_ROLES), isActive: true } }),
      this.actionLogs.count({ where: { createdAt: MoreThanOrEqual(startOfToday) } }),
      this.systemLogs.count({ where: { createdAt: MoreThanOrEqual(startOfToday) } })
    ]);

    return { totalPolicies, publishedPolicies, staffMembers, activeStaffMembers, actionsToday, systemEventsToday };
  }

  async listPolicies(query: GovernanceListQueryDto): Promise<Record<string, unknown>> {
    await this.ensureDefaultPolicies();
    const { page, pageSize, skip } = normalizePagination(query);
    const where = {
      ...(query.status ? { status: query.status.trim().toUpperCase() } : {}),
      ...(query.search ? { title: ILike(`%${query.search.trim()}%`) } : {})
    };
    const [items, totalItems] = await this.policies.findAndCount({ where, order: { updatedAt: 'DESC' }, skip, take: pageSize });
    return paginated(items, totalItems, page, pageSize);
  }

  async createPolicy(actor: AuthenticatedUserContext, input: CreateGovernancePolicyDto): Promise<GovernancePolicyEntity> {
    const code = normalizeCode(input.code);
    if (await this.policies.findOne({ where: { code } })) {
      throw new ConflictException('Policy code already exists');
    }

    const policy = await this.policies.save(
      this.policies.create({
        code,
        title: input.title.trim(),
        description: input.description.trim(),
        scope: input.scope,
        status: input.status ?? 'DRAFT',
        version: 1,
        content: input.content.trim(),
        effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
        createdBy: actor.userId,
        updatedBy: actor.userId
      })
    );
    await this.writeAction(actor, {
      action: 'POLICY_CREATED',
      resourceType: 'POLICY',
      resourceId: policy.id,
      description: `Tạo chính sách ${policy.code}`,
      metadata: { status: policy.status, version: policy.version }
    });
    return policy;
  }

  async updatePolicy(actor: AuthenticatedUserContext, id: string, input: UpdateGovernancePolicyDto): Promise<GovernancePolicyEntity> {
    const policy = await this.policies.findOne({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');

    const contentChanged = input.content !== undefined && input.content.trim() !== policy.content;
    if (input.title !== undefined) policy.title = input.title.trim();
    if (input.description !== undefined) policy.description = input.description.trim();
    if (input.scope !== undefined) policy.scope = input.scope;
    if (input.status !== undefined) policy.status = input.status;
    if (input.content !== undefined) policy.content = input.content.trim();
    if (input.effectiveAt !== undefined) policy.effectiveAt = input.effectiveAt ? new Date(input.effectiveAt) : null;
    if (contentChanged) policy.version += 1;
    policy.updatedBy = actor.userId;

    const saved = await this.policies.save(policy);
    await this.writeAction(actor, {
      action: 'POLICY_UPDATED',
      resourceType: 'POLICY',
      resourceId: saved.id,
      description: `Cập nhật chính sách ${saved.code}`,
      metadata: { status: saved.status, version: saved.version, contentChanged }
    });
    return saved;
  }

  async listActionLogs(query: GovernanceListQueryDto): Promise<Record<string, unknown>> {
    const { page, pageSize, skip } = normalizePagination(query);
    const where = {
      ...(query.action ? { action: ILike(`%${query.action.trim()}%`) } : {}),
      ...(query.search ? { actorEmail: ILike(`%${query.search.trim()}%`) } : {})
    };
    const [items, totalItems] = await this.actionLogs.findAndCount({ where, order: { createdAt: 'DESC' }, skip, take: pageSize });
    return paginated(items, totalItems, page, pageSize);
  }

  async recordAction(actor: AuthenticatedUserContext, input: RecordGovernanceActionDto): Promise<GovernanceActionLogEntity> {
    return this.writeAction(actor, input);
  }

  async listSystemLogs(query: GovernanceListQueryDto): Promise<Record<string, unknown>> {
    const { page, pageSize, skip } = normalizePagination(query);
    const where = {
      ...(query.action ? { action: ILike(`%${query.action.trim()}%`) } : {})
    };
    const [logs, totalItems] = await this.systemLogs.findAndCount({
      where,
      relations: { user: true },
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize
    });
    const items = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      userEmail: log.user?.email ?? null,
      action: log.action,
      requestId: log.requestId,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: log.metadata,
      createdAt: log.createdAt
    }));
    return paginated(items, totalItems, page, pageSize);
  }

  async listTeam(query: GovernanceListQueryDto): Promise<Record<string, unknown>> {
    const { page, pageSize, skip } = normalizePagination(query);
    const where = {
      role: In(STAFF_ROLES),
      ...(query.search ? { email: ILike(`%${query.search.trim()}%`) } : {})
    };
    const [members, totalItems] = await this.users.findAndCount({ where, order: { createdAt: 'ASC' }, skip, take: pageSize });
    const items = members.map(toTeamMember);
    return paginated(items, totalItems, page, pageSize);
  }

  async updateTeamMember(actor: AuthenticatedUserContext, memberId: string, input: UpdateGovernanceTeamMemberDto): Promise<Record<string, unknown>> {
    if (input.role === undefined && input.isActive === undefined) {
      throw new BadRequestException('At least one field is required');
    }
    const member = await this.users.findOne({ where: { id: memberId } });
    if (!member || !STAFF_ROLES.includes(member.role)) throw new NotFoundException('Team member not found');
    if (member.id === actor.userId) throw new BadRequestException('You cannot change your own access');
    if (member.role === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can manage another super admin');
    }
    if (member.role !== Role.MODERATOR && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can manage administrators');
    }
    if (input.role === Role.ADMIN && actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can grant admin role');
    }

    const previous = { role: member.role, isActive: member.isActive };
    if (input.role !== undefined) member.role = input.role as Role;
    if (input.isActive !== undefined) member.isActive = input.isActive;
    member.tokenVersion += 1;
    const saved = await this.users.save(member);
    await this.writeAction(actor, {
      action: 'TEAM_MEMBER_UPDATED',
      resourceType: 'TEAM_MEMBER',
      resourceId: saved.id,
      description: `Cập nhật quyền truy cập của ${saved.email}`,
      metadata: { previous, current: { role: saved.role, isActive: saved.isActive } }
    });
    return toTeamMember(saved);
  }

  private async writeAction(actor: AuthenticatedUserContext, input: RecordGovernanceActionDto): Promise<GovernanceActionLogEntity> {
    return this.actionLogs.save(
      this.actionLogs.create({
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: input.action.trim().toUpperCase(),
        resourceType: input.resourceType.trim().toUpperCase(),
        resourceId: input.resourceId?.trim() || null,
        description: input.description.trim(),
        metadata: input.metadata ?? null
      })
    );
  }

  private async ensureDefaultPolicies(): Promise<void> {
    if ((await this.policies.count()) > 0) return;
    const defaults = [
      {
        code: 'PRODUCT-LISTING-001',
        title: 'Quy chuẩn đăng bán sản phẩm',
        description: 'Quy định về tên, hình ảnh, phân loại, giá và nội dung mô tả sản phẩm.',
        scope: 'PRODUCT',
        content:
          'Sản phẩm phải có thông tin chính xác, hình ảnh thuộc quyền sử dụng của người bán và không thuộc danh mục hàng hóa bị cấm. Giá, tồn kho và phân loại phải phản ánh đúng hàng hóa được giao.',
        status: 'PUBLISHED'
      },
      {
        code: 'VIDEO-CONTENT-001',
        title: 'Chính sách nội dung Video và Live',
        description: 'Tiêu chuẩn nội dung bán hàng bằng video và phát trực tiếp.',
        scope: 'VIDEO',
        content:
          'Video và phiên live không được chứa nội dung vi phạm pháp luật, gây hiểu nhầm, xâm phạm bản quyền hoặc dẫn người mua giao dịch ngoài nền tảng.',
        status: 'PUBLISHED'
      },
      {
        code: 'CHAT-SAFETY-001',
        title: 'Quy tắc an toàn hội thoại',
        description: 'Quy tắc trao đổi giữa người mua, người bán và đội ngũ hỗ trợ.',
        scope: 'CHAT',
        content: 'Không chia sẻ thông tin thanh toán nhạy cảm, đường dẫn lừa đảo, nội dung quấy rối hoặc yêu cầu chuyển tiền ngoài hệ thống eMall.',
        status: 'PUBLISHED'
      }
    ];
    try {
      await this.policies.save(defaults.map((item) => this.policies.create({ ...item, version: 1, effectiveAt: new Date() })));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
}

function normalizePagination(query: GovernanceListQueryDto): { page: number; pageSize: number; skip: number } {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function paginated(items: unknown[], totalItems: number, page: number, pageSize: number): Record<string, unknown> {
  return { items, pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) } };
}

function normalizeCode(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized.length < 3) throw new BadRequestException('Policy code is invalid');
  return normalized;
}

function toTeamMember(user: UserEntity): Record<string, unknown> {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    mfaEnabled: user.mfaEnabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505');
}
