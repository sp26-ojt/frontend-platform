export interface QuotaConfig {
  fixedVcpu: number;          // vCPU reserved for infrastructure
  fixedRamGb: number;         // RAM (GB) reserved for infrastructure
  vcpuUsablePercent: number;  // % of vCPU usable for sandboxes (default 90)
  ramUsablePercent: number;   // % of RAM usable for sandboxes (default 90)
  // Optional overrides — if set, these replace the API values
  overrideTotalInstances?: number | null;
  overrideTotalVcpu?: number | null;
  overrideTotalRamGb?: number | null;
}

export const DEFAULT_QUOTA_CONFIG: QuotaConfig = {
  fixedVcpu: 6,
  fixedRamGb: 20,
  vcpuUsablePercent: 90,
  ramUsablePercent: 90,
  overrideTotalInstances: null,
  overrideTotalVcpu: null,
  overrideTotalRamGb: null,
};

export const QUOTA_CONFIG_STORAGE_KEY = 'crczp_quota_config';
