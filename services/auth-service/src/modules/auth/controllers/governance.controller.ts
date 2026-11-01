import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/constants/role.enum';
import { AuthenticatedUserContext } from '../../../common/types/request-context.type';
import {
  CreateGovernancePolicyDto,
  GovernanceListQueryDto,
  RecordGovernanceActionDto,
  UpdateGovernancePolicyDto,
  UpdateGovernanceTeamMemberDto
} from '../dto/governance.dto';
import { GovernanceService } from '../services/governance.service';

@Controller('auth/governance')
@Roles(Role.MODERATOR, Role.ADMIN, Role.SUPER_ADMIN)
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('summary')
  getSummary(): Promise<Record<string, number>> {
    return this.governance.getSummary();
  }

  @Get('policies')
  listPolicies(@Query() query: GovernanceListQueryDto): Promise<Record<string, unknown>> {
    return this.governance.listPolicies(query);
  }

  @Post('policies')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  createPolicy(@CurrentUser() actor: AuthenticatedUserContext, @Body() input: CreateGovernancePolicyDto) {
    return this.governance.createPolicy(actor, input);
  }

  @Patch('policies/:policyId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updatePolicy(@CurrentUser() actor: AuthenticatedUserContext, @Param('policyId') policyId: string, @Body() input: UpdateGovernancePolicyDto) {
    return this.governance.updatePolicy(actor, policyId, input);
  }

  @Get('action-logs')
  listActionLogs(@Query() query: GovernanceListQueryDto): Promise<Record<string, unknown>> {
    return this.governance.listActionLogs(query);
  }

  @Post('action-logs')
  recordAction(@CurrentUser() actor: AuthenticatedUserContext, @Body() input: RecordGovernanceActionDto) {
    return this.governance.recordAction(actor, input);
  }

  @Get('system-logs')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  listSystemLogs(@Query() query: GovernanceListQueryDto): Promise<Record<string, unknown>> {
    return this.governance.listSystemLogs(query);
  }

  @Get('team')
  listTeam(@Query() query: GovernanceListQueryDto): Promise<Record<string, unknown>> {
    return this.governance.listTeam(query);
  }

  @Patch('team/:memberId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  updateTeamMember(
    @CurrentUser() actor: AuthenticatedUserContext,
    @Param('memberId') memberId: string,
    @Body() input: UpdateGovernanceTeamMemberDto
  ) {
    return this.governance.updateTeamMember(actor, memberId, input);
  }
}
