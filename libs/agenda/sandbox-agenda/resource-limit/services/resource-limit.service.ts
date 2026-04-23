import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { ResourceLimit, ResourceLimitDTO } from '../model/resource-limit.model';
import { Flavor } from '../model/flavor.model';
import { PortalConfig } from '@crczp/utils';
import { SKIPPED_ERROR_CODES } from '@crczp/api-common';

export function minMaxValidator(control: AbstractControl): ValidationErrors | null {
  const min = control.get('minInstances')?.value;
  const max = control.get('maxInstances')?.value;
  if (min != null && max != null && min > max) {
    return { minExceedsMax: true };
  }
  return null;
}

export function minValueValidator(min: number): ValidatorFn {
  return (control) =>
    control.value != null && control.value < min
      ? { min: { min, actual: control.value } }
      : null;
}

const RESOURCE_LIMIT_STORAGE_KEY = 'crczp_resource_limits';

@Injectable({ providedIn: 'root' })
export class ResourceLimitService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(PortalConfig).basePaths.sandbox}`;

  private loadLocalLimits(): Record<number, ResourceLimit> {
    try {
      const stored = localStorage.getItem(RESOURCE_LIMIT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  }

  private saveLocalLimit(limit: ResourceLimit): void {
    const all = this.loadLocalLimits();
    all[limit.poolId] = limit;
    localStorage.setItem(RESOURCE_LIMIT_STORAGE_KEY, JSON.stringify(all));
  }

  getLimitEnabledSync(poolId: number): boolean {
    return this.loadLocalLimits()[poolId]?.limitEnabled ?? false;
  }

  getResourceLimit(poolId: number): Observable<ResourceLimit> {
    // Check localStorage first
    const local = this.loadLocalLimits()[poolId];
    if (local) return of(local);

    return this.http
      .get<ResourceLimitDTO>(`${this.baseUrl}/pools/${poolId}/resource-limit`, {
        context: new HttpContext().set(SKIPPED_ERROR_CODES, [404]),
      })
      .pipe(
        map((dto) => this.mapDtoToModel(dto)),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) {
            return of<ResourceLimit>({
              poolId,
              limitEnabled: false,
              minInstances: 1,
              maxInstances: 10,
            });
          }
          throw err;
        }),
      );
  }

  saveResourceLimit(limit: ResourceLimit): Observable<ResourceLimit> {
    // Always save to localStorage for persistence
    this.saveLocalLimit(limit);

    const dto: ResourceLimitDTO = this.mapModelToDto(limit);
    return this.http
      .put<ResourceLimitDTO>(`${this.baseUrl}/pools/${limit.poolId}/resource-limit`, dto, {
        context: new HttpContext().set(SKIPPED_ERROR_CODES, [404, 405, 400]),
      })
      .pipe(
        map((response) => this.mapDtoToModel(response)),
        catchError(() => of(limit)), // fallback to local on error
      );
  }

  toggleResourceLimit(poolId: number): Observable<ResourceLimit> {
    return this.getResourceLimit(poolId).pipe(
      map((current) => ({ ...current, limitEnabled: !current.limitEnabled })),
      switchMap((toggled) => this.saveResourceLimit(toggled)),
    );
  }

  getPoolFlavor(poolId: number): Observable<Flavor | null> {
    return this.http
      .get<{ id: string; name: string; vcpu: number; ram_gb: number }>(
        `${this.baseUrl}/pools/${poolId}/flavor`,
        { context: new HttpContext().set(SKIPPED_ERROR_CODES, [404, 400]) },
      )
      .pipe(
        map((dto) => ({
          id: dto.id,
          name: dto.name,
          vcpu: dto.vcpu,
          ramMb: dto.ram_gb,
        })),
        catchError(() => of(null)),
      );
  }

  private mapDtoToModel(dto: ResourceLimitDTO): ResourceLimit {
    return {
      poolId: dto.pool_id,
      limitEnabled: dto.limit_enabled,
      minInstances: dto.min_instances,
      maxInstances: dto.max_instances,
    };
  }

  private mapModelToDto(model: ResourceLimit): ResourceLimitDTO {
    return {
      pool_id: model.poolId,
      limit_enabled: model.limitEnabled,
      min_instances: model.minInstances,
      max_instances: model.maxInstances,
    };
  }
}
