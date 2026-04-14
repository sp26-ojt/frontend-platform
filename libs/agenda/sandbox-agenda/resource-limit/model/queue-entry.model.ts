export type QueueReason = 'max_instances' | 'vcpu_quota' | 'ram_quota' | 'instances_quota';
export type QueueStatus = 'pending' | 'approved' | 'rejected';

export interface QueueEntry {
  id: string;
  poolId: number;
  userId: string;
  requestedAt: Date;
  position: number;
  estimatedWaitSeconds?: number;
  reason?: QueueReason;
  status?: QueueStatus;
}

export interface QueueEntryDTO {
  id: string;
  pool_id: number;
  user_id: string;
  requested_at: string;
  position: number;
  estimated_wait_seconds?: number;
  reason?: QueueReason;
  status?: QueueStatus;
}
