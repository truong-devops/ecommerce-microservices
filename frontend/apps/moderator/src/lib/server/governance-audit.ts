import { requestUpstream, serviceBaseUrls } from './upstream-client';

interface GovernanceAuditInput {
  action: string;
  resourceType: string;
  resourceId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function recordGovernanceAction(accessToken: string, input: GovernanceAuditInput): Promise<void> {
  try {
    await requestUpstream(`${serviceBaseUrls.auth}/auth/governance/action-logs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  } catch {
    // Moderation must not fail only because the secondary audit write is unavailable.
  }
}
