export interface ResourceLimit {
  poolId: number;
  limitEnabled: boolean;
  minInstances: number;
  maxInstances: number;
}

export interface ResourceLimitDTO {
  pool_id: number;
  limit_enabled: boolean;
  min_instances: number;
  max_instances: number;
}
