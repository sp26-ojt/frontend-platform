import { Flavor } from './flavor.model';
import { ResourceLimit } from './resource-limit.model';

export interface ResourceLimitRow {
  poolId: number;
  poolName: string;
  usedSize: number;
  maxSize: number;
  flavor?: Flavor;
  limit: ResourceLimit;
  usagePercent: number;
  vcpuUsagePercent: number;
  ramUsagePercent: number;
  alertStatus: 'warn' | 'error' | null;
  vcpuAlertStatus: 'warn' | 'error' | null;
  ramAlertStatus: 'warn' | 'error' | null;
  formDirty: boolean;
  saving: boolean;
  saveError: string | null;
  requiredVcpu: number;
  requiredRamMb: number;
  exceedsVcpuQuota: boolean;
  exceedsRamQuota: boolean;
  exceedsPoolSize: boolean;
}
