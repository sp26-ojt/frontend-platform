export interface HardwareQuota {
  totalInstances: number;
  usedInstances: number;
  totalVcpu: number;
  usedVcpu: number;
  totalRamMb: number;
  usedRamMb: number;
  fixedVcpu: number;
  fixedRamMb: number;
}

export interface HardwareQuotaSummary extends HardwareQuota {
  availableVcpu: number;
  availableRamMb: number;
  availableInstances: number;
}
