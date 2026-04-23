import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit } from '@angular/core';
import { SentinelControlItem, SentinelControlsComponent } from '@sentinel/components/controls';
import { Pool, Resources } from '@crczp/sandbox-model';
import { Row, SentinelRowDirective, SentinelTableComponent, TableLoadEvent } from '@sentinel/components/table';
import { defer, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AsyncPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PoolTable } from '../model/pool-table';
import { PoolOverviewService } from '../services/state/pool-overview.service';
import { PoolService } from '../services/abstract-pool/abstract-sandbox/pool.service';
import { SandboxResourcesService } from '../services/resources/sandbox-resources.service';
import { SandboxResourcesConcreteService } from '../services/resources/sandbox-resources-concrete.service';
import { QuotasComponent } from './quotas/quotas.component';
import { TableStateCellComponent } from '@crczp/components';
import { PaginationStorageService, PollingService, providePaginationStorageService } from '@crczp/utils';
import { PaginationMapper } from '@crczp/api-common';
import { PoolSort } from '@crczp/sandbox-api';
import {
    SandboxAllocationUnitsConcreteService,
    SandboxAllocationUnitsService,
    SandboxInstanceService,
} from '@crczp/sandbox-agenda/pool-detail';
import {
    EditableCommentComponent,
    SandboxDefinitionOverviewConcreteService,
    SandboxDefinitionOverviewService,
} from '@crczp/sandbox-agenda/internal';
import {
    HardwareQuotaService,
    HardwareQuotaSummaryComponent,
    HardwareQuotaSummary,
    ResourceLimitService,
} from '@crczp/sandbox-agenda/resource-limit';

@Component({
    selector: 'crczp-sandbox-pool-overview',
    templateUrl: './pool-overview.component.html',
    styleUrls: ['./pool-overview.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        SentinelControlsComponent,
        SentinelTableComponent,
        EditableCommentComponent,
        QuotasComponent,
        AsyncPipe,
        SentinelRowDirective,
        TableStateCellComponent,
        HardwareQuotaSummaryComponent,
    ],
    providers: [
        PollingService,
        { provide: PoolOverviewService, useClass: PoolOverviewService },
        { provide: SandboxInstanceService, useClass: SandboxInstanceService },
        { provide: SandboxAllocationUnitsService, useClass: SandboxAllocationUnitsConcreteService },
        PoolService,
        { provide: SandboxDefinitionOverviewService, useClass: SandboxDefinitionOverviewConcreteService },
        { provide: SandboxResourcesService, useClass: SandboxResourcesConcreteService },
        providePaginationStorageService(PoolOverviewComponent),
    ],
})
export class PoolOverviewComponent implements OnInit {
    pools$: Observable<PoolTable>;
    hasError$: Observable<boolean>;
    resources$: Observable<Resources>;
    controls: SentinelControlItem[] = [];
    currentQuota: HardwareQuotaSummary | null = null;

    readonly DEFAULT_SORT_COLUMN = 'id';
    readonly DEFAULT_SORT_DIRECTION = 'asc';

    destroyRef = inject(DestroyRef);
    private sandboxResourcesService = inject(SandboxResourcesService);
    private abstractPoolService = inject(PoolService);
    private sandboxInstanceService = inject(SandboxInstanceService);
    private paginationService = inject(PaginationStorageService);
    private readonly hardwareQuotaService = inject(HardwareQuotaService);
    private readonly resourceLimitService = inject(ResourceLimitService);

    private readonly initialPoolPagination = this.paginationService.createPagination<PoolSort>(this.DEFAULT_SORT_COLUMN);

    constructor() {
        this.resources$ = this.sandboxResourcesService.resources$;
    }

    getPoolStateIcon(row: Row<Pool>) {
        const pool = row.element;
        if (pool.lockState === 'locked') return 'lock';
        if (pool.lockState === 'unlocked') return 'lock_open';
        return null;
    }

    ngOnInit(): void {
        this.initTable();
        this.initControls();
        this.initResources();
        this.loadQuota();
    }

    onLoadEvent(loadEvent: TableLoadEvent<PoolSort>): void {
        this.paginationService.savePageSize(loadEvent.pagination.size);
        this.abstractPoolService
            .getAll(PaginationMapper.toOffsetPaginationEvent(loadEvent.pagination))
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    updatePoolComment(pool: Pool, newComment: string) {
        pool.comment = newComment;
        this.abstractPoolService.updateComment(pool).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }

    loadQuota(): void {
        this.hardwareQuotaService.loadConfig().subscribe(() => {
            this.hardwareQuotaService.loadQuota()
                .pipe(catchError(() => of(null as unknown as HardwareQuotaSummary)))
                .subscribe((quota) => (this.currentQuota = quota));
        });
    }

    private initTable() {
        this.pools$ = this.abstractPoolService.pools$.pipe(
            map((resource) => new PoolTable(resource, this.resources$, this.abstractPoolService, this.sandboxInstanceService, this.resourceLimitService)),
        );
        this.hasError$ = this.abstractPoolService.poolsHasError$;
        this.onLoadEvent({ pagination: this.initialPoolPagination });
    }

    private initControls() {
        this.controls = [
            new SentinelControlItem('create', 'Create', 'primary', of(false), defer(() => this.abstractPoolService.create())),
        ];
    }

    private initResources() {
        this.sandboxResourcesService.getResources().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    }
}
