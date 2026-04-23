import { Pool, Resources } from '@crczp/sandbox-model';
import {
    Column,
    DeleteAction,
    EditAction,
    ExpandableSentinelTable,
    Row,
    RowAction,
    RowExpand
} from '@sentinel/components/table';
import { defer, Observable, of } from 'rxjs';
import { PoolRowAdapter } from './pool-row-adapter';
import { SandboxInstanceService } from '@crczp/sandbox-agenda/pool-detail';
import { PoolExpandDetailComponent } from '../components/pool-expand-detail/pool-expand-detail.component';
import { Routing } from '@crczp/routing-commons';
import { PoolService } from '../services/abstract-pool/abstract-sandbox/pool.service';
import { PoolSort } from '@crczp/sandbox-api';
import { OffsetPaginatedResource } from '@crczp/api-common';
import { ResourceLimitService } from '@crczp/sandbox-agenda/resource-limit';

/**
 * Helper class transforming paginated resource to class for common table component
 * @dynamic
 */
export class PoolTable extends ExpandableSentinelTable<
    PoolRowAdapter,
    PoolExpandDetailComponent,
    null,
    PoolSort
> {
    constructor(
        data: OffsetPaginatedResource<Pool>,
        resources: Observable<Resources>,
        poolService: PoolService,
        sandboxInstanceService: SandboxInstanceService,
        resourceLimitService: ResourceLimitService,
    ) {
        const rows = data.elements.map((element) =>
            PoolTable.createRow(element, resources, poolService, sandboxInstanceService, resourceLimitService),
        );
        const columns = [
            new Column<PoolSort>('title', 'Title', true, 'id'),
            new Column<PoolSort>('createdByName', 'Created by', true, 'created_by'),
            new Column<PoolSort>('sandboxDefinitionNameAndRevision', 'Sandbox definition (revision)', true, 'definition'),
            new Column<PoolSort>('comment', 'Notes', false),
            new Column<PoolSort>('lockState', 'State', true, 'lock'),
            new Column<PoolSort>('usedAndMaxSize', 'Size', true, 'max_size'),
            new Column<PoolSort>('resourcesUtilization', 'Instances / VCPUs / RAM / ports / network utilization', false),
        ];
        const expand = new RowExpand(PoolExpandDetailComponent, null);
        super(rows, columns, expand);
        this.pagination = data.pagination;
    }

    private static createRow(
        pool: Pool,
        resources: Observable<Resources>,
        poolService: PoolService,
        sandboxInstanceService: SandboxInstanceService,
        resourceLimitService: ResourceLimitService,
    ): Row<PoolRowAdapter> {
        const rowAdapter = pool as PoolRowAdapter;
        rowAdapter.title = `Pool ${rowAdapter.id}`;
        rowAdapter.createdByName = pool.createdBy.fullName;
        rowAdapter.sandboxDefinitionNameAndRevision = `${pool.definition.title} (${pool.definition.rev})`;
        rowAdapter.comment = pool.comment;
        rowAdapter.instancesUtilization = pool.hardwareUsage.instances * 100;
        rowAdapter.vcpuUtilization = pool.hardwareUsage.vcpu * 100;
        rowAdapter.ramUtilization = pool.hardwareUsage.ram * 100;
        rowAdapter.portUtilization = pool.hardwareUsage.port * 100;
        rowAdapter.networkUtilization = pool.hardwareUsage.network * 100;
        rowAdapter.resourcesUtilization =
            `${(pool.hardwareUsage.instances * 100).toFixed(1)}% / ` +
            `${(pool.hardwareUsage.vcpu * 100).toFixed(1)}% / ` +
            `${(pool.hardwareUsage.ram * 100).toFixed(1)}% / ` +
            `${(pool.hardwareUsage.port * 100).toFixed(1)}% / ` +
            `${(pool.hardwareUsage.network * 100).toFixed(1)}%`;
        resources.subscribe((data) => (rowAdapter.resources = data));

        resourceLimitService.getResourceLimit(pool.id).subscribe((limit) => {
            rowAdapter.limitEnabled = limit.limitEnabled;
        });

        const row = new Row(
            rowAdapter,
            this.createActions(pool, poolService, sandboxInstanceService),
        );
        row.addLink('title', Routing.RouteBuilder.pool.poolId(rowAdapter.id).build());
        return row;
    }

    private static createActions(
        pool: Pool,
        abstractPoolService: PoolService,
        sandboxInstanceService: SandboxInstanceService,
    ): RowAction[] {
        const rowAdapter = pool as PoolRowAdapter;
        const limitEnabled = rowAdapter.limitEnabled ?? false;
        return [
            new EditAction('Edit Pool', of(false), defer(() => abstractPoolService.updatePool(pool))),
            new RowAction(
                'allocate_all', 'Allocate All', 'subscriptions', 'primary',
                this.createAllocationTooltip(pool.maxSize, pool.usedSize),
                of(pool.isFull()),
                defer(() => sandboxInstanceService.allocateSpecified(pool.id, pool.maxSize - pool.usedSize)),
            ),
            new RowAction(
                'allocate_one', 'Allocate One', 'exposure_plus_1', 'primary',
                'Allocate one sandbox', of(pool.isFull()),
                defer(() => abstractPoolService.allocate(pool, 1)),
            ),
            new DeleteAction('Delete Pool', of(pool.lockState == 'locked'), defer(() => abstractPoolService.delete(pool))),
            this.createLockAction(pool, abstractPoolService),
            new RowAction(
                limitEnabled ? 'disable_resource_limit' : 'enable_resource_limit',
                limitEnabled ? 'Disable Resource Limit' : 'Enable Resource Limit',
                'data_usage',
                limitEnabled ? 'primary' : 'warn',
                limitEnabled ? 'Resource limit active — click to disable' : 'Resource limit inactive — click to enable',
                of(false),
                defer(() => abstractPoolService.toggleResourceLimit(pool)),
            ),
            new RowAction(
                'download_man_ssh_configs', 'Get management SSH Configs', 'vpn_key', 'primary',
                'Download management SSH config', of(false),
                defer(() => abstractPoolService.getSshAccess(pool.id)),
            ),
        ];
    }

    private static createAllocationTooltip(maxSandboxSize: number, usedSandboxSize: number): string {
        if (maxSandboxSize - usedSandboxSize == 1) {
            return maxSandboxSize == 1 ? 'Allocate sandbox immediately' : 'Allocate the last sandbox';
        }
        return 'Allocate a specific number of sandboxes';
    }

    private static createLockAction(pool: Pool, service: PoolService): RowAction {
        if (pool.isLocked()) {
            return new RowAction('unlock', 'Unlock pool', 'lock_open', 'primary', 'Unlock pool', of(false), defer(() => service.unlock(pool)));
        }
        return new RowAction('lock', 'Lock pool', 'lock', 'primary', 'Lock pool', of(false), defer(() => service.lock(pool)));
    }
}
