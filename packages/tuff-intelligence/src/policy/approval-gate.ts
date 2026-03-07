import type { ApprovalRequest } from '../protocol/decision'

export class ApprovalGate {
  shouldRequestApproval(request: ApprovalRequest): boolean {
    return request.riskLevel === 'high' || request.riskLevel === 'critical'
  }
}
