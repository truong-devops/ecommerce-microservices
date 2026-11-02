import { requestModeratorApi } from './client';
import type { GovernanceActionLog, GovernancePolicy, GovernanceSummary, GovernanceSystemLog, GovernanceTeamMember, PaginatedOutput } from './types';

interface ListInput {
  accessToken: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  action?: string;
}

function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  return requestModeratorApi<T>(`/api/moderator/governance/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
    cache: 'no-store'
  });
}

function query(input: Omit<ListInput, 'accessToken'>): string {
  const params = new URLSearchParams();
  if (input.page) params.set('page', String(input.page));
  if (input.pageSize) params.set('pageSize', String(input.pageSize));
  if (input.search) params.set('search', input.search);
  if (input.status) params.set('status', input.status);
  if (input.action) params.set('action', input.action);
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function getGovernanceSummary(accessToken: string): Promise<GovernanceSummary> {
  return request('summary', accessToken);
}

export function listGovernancePolicies(input: ListInput): Promise<PaginatedOutput<GovernancePolicy>> {
  const { accessToken, ...params } = input;
  return request(`policies${query(params)}`, accessToken);
}

export function createGovernancePolicy(
  accessToken: string,
  payload: Omit<GovernancePolicy, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>
): Promise<GovernancePolicy> {
  return request('policies', accessToken, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateGovernancePolicy(
  accessToken: string,
  policyId: string,
  payload: Partial<Pick<GovernancePolicy, 'title' | 'description' | 'scope' | 'status' | 'content' | 'effectiveAt'>>
): Promise<GovernancePolicy> {
  return request(`policies/${policyId}`, accessToken, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function listGovernanceActionLogs(input: ListInput): Promise<PaginatedOutput<GovernanceActionLog>> {
  const { accessToken, ...params } = input;
  return request(`action-logs${query(params)}`, accessToken);
}

export function listGovernanceSystemLogs(input: ListInput): Promise<PaginatedOutput<GovernanceSystemLog>> {
  const { accessToken, ...params } = input;
  return request(`system-logs${query(params)}`, accessToken);
}

export function listGovernanceTeam(input: ListInput): Promise<PaginatedOutput<GovernanceTeamMember>> {
  const { accessToken, ...params } = input;
  return request(`team${query(params)}`, accessToken);
}

export function updateGovernanceTeamMember(
  accessToken: string,
  memberId: string,
  payload: { role?: 'MODERATOR' | 'ADMIN'; isActive?: boolean }
): Promise<GovernanceTeamMember> {
  return request(`team/${memberId}`, accessToken, { method: 'PATCH', body: JSON.stringify(payload) });
}
