import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { PortalConfig } from '@crczp/utils';
import { Flavor } from '../model/flavor.model';
import { HardwareQuota, HardwareQuotaSummary } from '../model/hardware-quota.model';
import { DEFAULT_QUOTA_CONFIG, QuotaConfig } from '../model/quota-config.model';

interface SandboxResourcesResponse {
  project_name: string;
  quotas: {
    vcpu: { in_use: number; limit: number };
    ram: { in_use: number; limit: number };
    instances: { in_use: number; limit: number };
  };
}

interface QuotaConfigDTO {
  quota_fixed_infra_vcpu: number;
  quota_fixed_infra_ram_mb: number;
  quota_vcpu_usable_percent: number;
  quota_ram_usable_percent: number;
  total_vcpu?: number;
  total_ram_gb?: number;
  total_instances?: number;
}

@Injectable({ providedIn: 'root' })
export class HardwareQuotaService {
  private readonly http = inject(HttpClient);
  private readonly portalConfig = inject(PortalConfig);

  private get configUrl(): string {
    return `${this.portalConfig.basePaths.sandbox}/quota-config`;
  }

  private readonly configSubject$ = new BehaviorSubject<QuotaConfig>(DEFAULT_QUOTA_CONFIG);
  readonly config$ = this.configSubject$.asObservable();

  /** Load config from API, fallback to default on error */
  loadConfig(): Observable<QuotaConfig> {
    return this.http.get<QuotaConfigDTO>(this.configUrl).pipe(
      map((dto) => this.mapDtoToConfig(dto)),
      tap((cfg) => this.configSubject$.next(cfg)),
      catchError(() => of(DEFAULT_QUOTA_CONFIG)),
    );
  }

  /** Save config to API */
  saveConfig(config: QuotaConfig): Observable<QuotaConfig> {
    const dto = this.mapConfigToDto(config);
    return this.http.put<QuotaConfigDTO>(this.configUrl, dto).pipe(
      map((response) => this.mapDtoToConfig(response)),
      tap((cfg) => this.configSubject$.next(cfg)),
      catchError(() => {
        // Fallback: update local state even if API fails
        this.configSubject$.next(config);
        return of(config);
      }),
    );
  }

  getConfig(): QuotaConfig {
    return this.configSubject$.getValue();
  }

  loadQuota(): Observable<HardwareQuotaSummary> {
    const infoUrl = `${this.portalConfig.basePaths.sandbox}/info`;
    const cfg = this.getConfig();
    return this.http.get<SandboxResourcesResponse>(infoUrl).pipe(
      map((response) => {
        const totalRamGb = cfg.overrideTotalRamGb ?? response.quotas.ram.limit;
        const usedRamGb = response.quotas.ram.in_use;
        const quota: HardwareQuota = {
          totalInstances: cfg.overrideTotalInstances ?? response.quotas.instances.limit,
          usedInstances: response.quotas.instances.in_use,
          totalVcpu: cfg.overrideTotalVcpu ?? response.quotas.vcpu.limit,
          usedVcpu: response.quotas.vcpu.in_use,
          totalRamMb: totalRamGb,
          usedRamMb: usedRamGb,
          fixedVcpu: cfg.fixedVcpu,
          fixedRamMb: cfg.fixedRamGb,
        };
        return HardwareQuotaService.computeAvailable(quota, cfg.vcpuUsablePercent, cfg.ramUsablePercent);
      }),
    );
  }

  private mapDtoToConfig(dto: QuotaConfigDTO): QuotaConfig {
    return {
      fixedVcpu: dto.quota_fixed_infra_vcpu,
      fixedRamGb: dto.quota_fixed_infra_ram_mb / 1024,
      vcpuUsablePercent: dto.quota_vcpu_usable_percent * 100,
      ramUsablePercent: dto.quota_ram_usable_percent * 100,
      // Use totals from config API as authoritative source
      overrideTotalVcpu: dto.total_vcpu ?? null,
      overrideTotalRamGb: dto.total_ram_gb ?? null,
      overrideTotalInstances: dto.total_instances ?? null,
    };
  }

  private mapConfigToDto(cfg: QuotaConfig): QuotaConfigDTO {
    return {
      quota_fixed_infra_vcpu: cfg.fixedVcpu,
      quota_fixed_infra_ram_mb: cfg.fixedRamGb * 1024,  // GB → MB for API
      quota_vcpu_usable_percent: cfg.vcpuUsablePercent / 100,
      quota_ram_usable_percent: cfg.ramUsablePercent / 100,
    };
  }

  static computeAvailable(quota: HardwareQuota, vcpuUsablePercent = 90, ramUsablePercent = 90): HardwareQuotaSummary {
    const vcpuFactor = vcpuUsablePercent / 100;
    const ramFactor = ramUsablePercent / 100;
    const rawVcpu = quota.totalVcpu - quota.fixedVcpu;
    const rawRam = quota.totalRamMb - quota.fixedRamMb;
    return {
      ...quota,
      availableVcpu: Math.max(0, Math.floor(rawVcpu * vcpuFactor) - quota.usedVcpu),
      availableRamMb: Math.max(0, parseFloat((rawRam * ramFactor - quota.usedRamMb).toFixed(1))),
      // Instances: no buffer, backend checks directly against limit
      availableInstances: Math.max(0, quota.totalInstances - quota.usedInstances),
    };
  }

  static computeRequired(maxInstances: number, flavor: Flavor): { vcpu: number; ramMb: number } {
    return {
      vcpu: maxInstances * flavor.vcpu,
      ramMb: maxInstances * flavor.ramMb,
    };
  }

  static getAlertStatus(used: number, available: number): 'warn' | 'error' | null {
    if (available <= 0 || used / available >= 1.0) return 'error';
    if (used / available >= 0.8) return 'warn';
    return null;
  }

  /**
   * Alert based on remaining buffer:
   * x = available / (used + available)  — % of total that is still free
   * x <= 5%  → error
   * 5% < x <= 10% → warn
   * x > 10% → null
   */
  static getBufferAlertStatus(used: number, available: number): 'warn' | 'error' | null {
    const total = used + available;
    if (total <= 0) return null;
    const remainingPercent = available / total;
    if (remainingPercent <= 0.05) return 'error';
    if (remainingPercent <= 0.10) return 'warn';
    return null;
  }}
