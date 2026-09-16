export function deriveWorkflowSubmissionStatus(input: {
  kind: 'MEMBERSHIP' | 'EVENT';
  approvalRequired?: boolean;
  amountCents: number;
  capacity?: number;
  occupied?: number;
}) {
  if (input.kind === 'MEMBERSHIP') {
    if (input.approvalRequired) return 'PENDING_REVIEW';
    return input.amountCents > 0 ? 'PAYMENT_PENDING' : 'APPROVED';
  }

  const capacity = Number(input.capacity || 0);
  const occupied = Number(input.occupied || 0);
  if (capacity > 0 && occupied >= capacity) return 'WAITLISTED';
  return input.amountCents > 0 ? 'PAYMENT_PENDING' : 'REGISTERED';
}

export function localTrialExpired(input: {
  plan: string;
  status: string;
  trialEndsAt: Date | null;
  now?: number;
}) {
  if (input.plan === 'internal' || input.status !== 'TRIAL' || !input.trialEndsAt) return false;
  return input.trialEndsAt.getTime() <= (input.now ?? Date.now());
}
