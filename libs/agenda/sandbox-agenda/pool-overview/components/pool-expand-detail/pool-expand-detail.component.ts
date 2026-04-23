import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PoolRowAdapter } from '../../model/pool-row-adapter';
import { ResourceBarComponent } from './resource-bar/resource-bar.component';
import { QueueManagementComponent } from '@crczp/sandbox-agenda/resource-limit';
import { SentinelAuthService } from '@sentinel/auth';

@Component({
    selector: 'crczp-pool-expand-detail',
    templateUrl: './pool-expand-detail.component.html',
    styleUrls: ['./pool-expand-detail.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [
        CommonModule,
        ResourceBarComponent,
        QueueManagementComponent,
    ],
})
export class PoolExpandDetailComponent implements OnInit {
    @Input() data: PoolRowAdapter;

    displayedResources = ['instances', 'vcpu', 'ram', 'port', 'network'];
    resourceColors = ['#3D54AF', '#a91e62', '#0ebfb7', '#e56c1b', '#7f007e'];
    currentUserId: string | undefined;

    private readonly authService = inject(SentinelAuthService);
    private readonly cdr = inject(ChangeDetectorRef);

    ngOnInit(): void {
        this.authService.activeUser$.subscribe((user) => {
            this.currentUserId = (user as any)?.login ?? (user as any)?.sub ?? String((user as any)?.id ?? '');
            this.cdr.markForCheck();
        });
    }
}
