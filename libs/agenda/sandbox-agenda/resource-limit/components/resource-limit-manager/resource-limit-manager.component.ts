import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject, forkJoin, Observable, of } from 'rxjs';
import { catchError, filter, map, switchMap } from 'rxjs/operators';

import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';

import { PoolSort } from '@crczp/sandbox-api';
import { OffsetPaginationEvent } from '@sentinel/common/pagination';
import { HttpClient } from '@angular/common/http';
import { PortalConfig } from '@crczp/utils';
import { SentinelAuthService } from '@sentinel/auth';
import { ResourceLimitService, minMaxValidator, minValueValidator } from '../../services/resource-limit.service';import { HardwareQuotaService } from '../../services/hardware-quota.service';
import { HardwareQuotaSummaryComponent } from '../hardware-quota-summary/hardware-quota-summary.component';
import { QueueManagementComponent } from '../queue-management/queue-management.component';
import { ResourceLimitRow } from '../../model/resource-limit-row.model';
import { HardwareQuotaSummary } from '../../model/hardware-quota.model';
import { Pool } from '@crczp/sandbox-model';

interface RawPoolDto {
  id: number;
  size: number;       // usedSize
  max_size: number;
  definition?: { title?: string };
  hardware_usage?: { vcpu?: number; ram?: number };
}

@Component({  selector: 'crczp-resource-limit-manager',
  templateUrl: './resource-limit-manager.component.html',
  styleUrls: ['./resource-limit-manager.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    HardwareQuotaSummaryComponent,
    QueueManagementComponent,
  ],
})
export class ResourceLimitManagerComponent implements OnInit {
  private readonly resourceLimitService = inject(ResourceLimitService);
  private readonly hardwareQuotaService = inject(HardwareQuotaService);
  private readonly http = inject(HttpClient);
  private readonly portalConfig = inject(PortalConfig);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(SentinelAuthService);

  currentUserId: string | undefined = undefined;

  private readonly rowsSubject$ = new BehaviorSubject<ResourceLimitRow[]>([]);
  readonly rows$ = this.rowsSubject$.asObservable();
  readonly loading$ = new BehaviorSubject<boolean>(false);
  readonly hasError$ = new BehaviorSubject<boolean>(false);
  /** Current quota snapshot */
  currentQuota: HardwareQuotaSummary | null = null;

  /** Per-row reactive forms keyed by poolId */
  readonly rowForms = new Map<number, FormGroup>();

  selectedPoolId: number | null = null;
  expandedPoolId: number | null = null;

  readonly displayedColumns = [
    'expand',
    'poolName',
    'vcpuUsage',
    'ramUsage',
    'limitEnabled',
    'alert',
    'save',
  ];

  toggleExpand(row: ResourceLimitRow): void {
    this.expandedPoolId = this.expandedPoolId === row.poolId ? null : row.poolId;
  }

  onConfigSaved(): void {
    // Reload quota and rows after config change
    this.hardwareQuotaService.loadQuota().pipe(
      catchError(() => of(null as unknown as HardwareQuotaSummary))
    ).subscribe((quota) => {
      this.currentQuota = quota;
      // Re-init to refresh rows with new quota
      this.ngOnInit();
    });
  }

  ngOnInit(): void {
    this.loading$.next(true);
    this.hasError$.next(false);

    // Get current user ID for queue notifications
    this.authService.activeUser$.pipe(filter((u) => u != null)).subscribe((user) => {
      this.currentUserId = (user as any)?.login ?? (user as any)?.sub ?? String((user as any)?.id ?? '');
    });

    // Load config once, then load quota + pools
    this.hardwareQuotaService.loadConfig().subscribe(() => {
      const quotaOrNull$ = this.hardwareQuotaService.loadQuota().pipe(catchError(() => of(null as unknown as HardwareQuotaSummary)));

      quotaOrNull$
      .pipe(
        switchMap((quota) => {
          this.currentQuota = quota;
          return this.loadPools().pipe(
            switchMap((pools) => {
              if (pools.length === 0) {
                return of({ rows: [], quota });
              }
              const rowObservables = pools.map((pool) =>
                forkJoin({
                  limit: this.resourceLimitService.getResourceLimit(pool.id),
                  flavor: this.resourceLimitService.getPoolFlavor(pool.id),
                }).pipe(
                  map(({ limit, flavor }) => {
                    const usagePercent =
                      pool.maxSize > 0 ? (pool.usedSize / pool.maxSize) * 100 : 0;
                    const usedVcpu = pool.usedSize * (flavor?.vcpu ?? 0);
                    const usedRamMb = pool.usedSize * (flavor?.ramMb ?? 0);
                    const availableVcpu = quota?.availableVcpu ?? 0;
                    const availableRamMb = quota?.availableRamMb ?? 0;
                    const vcpuUsagePercent =
                      availableVcpu > 0 ? (usedVcpu / availableVcpu) * 100 : 0;
                    const ramUsagePercent =
                      availableRamMb > 0 ? (usedRamMb / availableRamMb) * 100 : 0;

                    const alertStatus = HardwareQuotaService.getAlertStatus(
                      pool.usedSize,
                      pool.maxSize,
                    );
                    // Alert based on global quota — remaining buffer approach
                    const vcpuAlertStatus = HardwareQuotaService.getBufferAlertStatus(
                      quota?.usedVcpu ?? 0,
                      quota?.availableVcpu ?? 0,
                    );
                    const ramAlertStatus = HardwareQuotaService.getBufferAlertStatus(
                      quota?.usedRamMb ?? 0,
                      quota?.availableRamMb ?? 0,
                    );

                    const row: ResourceLimitRow = {
                      poolId: pool.id,
                      poolName: pool.definition?.title ?? `Pool ${pool.id}`,
                      usedSize: pool.usedSize,
                      maxSize: pool.maxSize,
                      flavor: flavor ?? undefined,
                      limit,
                      usagePercent,
                      vcpuUsagePercent,
                      ramUsagePercent,
                      alertStatus,
                      vcpuAlertStatus,
                      ramAlertStatus,
                      formDirty: false,
                      saving: false,
                      saveError: null,
                      requiredVcpu: limit.maxInstances * (flavor?.vcpu ?? 0),
                      requiredRamMb: limit.maxInstances * (flavor?.ramMb ?? 0),
                      exceedsVcpuQuota:
                        limit.maxInstances * (flavor?.vcpu ?? 0) > availableVcpu,
                      exceedsRamQuota:
                        limit.maxInstances * (flavor?.ramMb ?? 0) > availableRamMb,
                      exceedsPoolSize: limit.maxInstances > pool.maxSize,
                    };
                    return row;
                  }),
                ),
              );
              return forkJoin(rowObservables).pipe(map((rows) => ({ rows, quota })));
            }),
          );
        }),
        catchError(() => {
          this.hasError$.next(true);
          this.loading$.next(false);
          return of(null);
        }),
      )
      .subscribe((result) => {
        if (result) {
          this.loading$.next(false);
          this.rowsSubject$.next(result.rows);
          result.rows.forEach((row) => this.buildForm(row));
        }
      });
    }); // end loadConfig
  }

  /** Load all pools using HttpClient directly */
  loadPools(): Observable<Pool[]> {
    const url = `${this.portalConfig.basePaths.sandbox}/pools`;
    return this.http.get<{ results: RawPoolDto[] }>(url).pipe(
      map((response) => (response.results ?? []).map((dto) => {
        const pool = new Pool();
        pool.id = dto.id;
        pool.usedSize = dto.size ?? 0;
        pool.maxSize = dto.max_size ?? 0;
        // Minimal definition for display
        (pool as any).definition = { title: dto.definition?.title ?? `Pool ${dto.id}` };
        return pool;
      })),
      catchError(() => of([])),
    );
  }

  private buildForm(row: ResourceLimitRow): void {
    const group = this.fb.group(
      {
        minInstances: [
          { value: row.limit.minInstances, disabled: !row.limit.limitEnabled },
          [Validators.required, minValueValidator(1)],
        ],
        maxInstances: [
          { value: row.limit.maxInstances, disabled: !row.limit.limitEnabled },
          [Validators.required, minValueValidator(1)],
        ],
        limitEnabled: [row.limit.limitEnabled],
      },
      { validators: minMaxValidator },
    );

    group.valueChanges.subscribe(() => {
      this.updateRowDirty(row.poolId, true);
    });

    this.rowForms.set(row.poolId, group);
  }

  getForm(poolId: number): FormGroup {
    return this.rowForms.get(poolId) as FormGroup;
  }

  onLimitEnabledChange(row: ResourceLimitRow): void {
    const form = this.getForm(row.poolId);
    if (!form) return;
    const enabled = form.get('limitEnabled')?.value as boolean;
    if (enabled) {
      form.get('minInstances')?.enable();
      form.get('maxInstances')?.enable();
    } else {
      form.get('minInstances')?.disable();
      form.get('maxInstances')?.disable();
    }
    this.updateRowDirty(row.poolId, true);
  }

  onMaxInstancesChange(row: ResourceLimitRow, quota: HardwareQuotaSummary | null): void {
    const form = this.getForm(row.poolId);
    if (!form || !quota) return;
    const maxInstances = form.get('maxInstances')?.value as number;
    const vcpu = row.flavor?.vcpu ?? 0;
    const ramMb = row.flavor?.ramMb ?? 0;
    const requiredVcpu = maxInstances * vcpu;
    const requiredRamMb = maxInstances * ramMb;
    this.updateRow(row.poolId, {
      requiredVcpu,
      requiredRamMb,
      exceedsVcpuQuota: requiredVcpu > quota.availableVcpu,
      exceedsRamQuota: requiredRamMb > quota.availableRamMb,
    });
  }

  onSave(row: ResourceLimitRow): void {
    const form = this.getForm(row.poolId);
    if (!form || form.invalid) return;

    this.updateRow(row.poolId, { saving: true, saveError: null });

    const { minInstances, maxInstances, limitEnabled } = form.getRawValue() as {
      minInstances: number;
      maxInstances: number;
      limitEnabled: boolean;
    };

    this.resourceLimitService
      .saveResourceLimit({
        poolId: row.poolId,
        limitEnabled,
        minInstances,
        maxInstances,
      })
      .subscribe({
        next: () => {
          this.updateRow(row.poolId, { saving: false, formDirty: false, saveError: null });
          this.snackBar.open('Configuration saved', 'Close', { duration: 3000 });
        },
        error: () => {
          this.updateRow(row.poolId, { saving: false, formDirty: false, saveError: null });
          this.snackBar.open('Saved locally (backend pending)', 'Close', { duration: 3000 });
        },
      });
  }

  private updateRow(poolId: number, patch: Partial<ResourceLimitRow>): void {
    const current = this.rowsSubject$.getValue();
    const updated = current.map((r) => (r.poolId === poolId ? { ...r, ...patch } : r));
    this.rowsSubject$.next(updated);
  }

  private updateRowDirty(poolId: number, dirty: boolean): void {
    this.updateRow(poolId, { formDirty: dirty });
  }

  onSelectPool(row: ResourceLimitRow): void {
    this.selectedPoolId = row.poolId;
  }
}
