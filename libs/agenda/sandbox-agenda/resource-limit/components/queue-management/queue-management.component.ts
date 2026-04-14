import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  Input,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { interval } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { QueueService } from '../../services/queue.service';
import { QueueEntry } from '../../model/queue-entry.model';

@Component({
  selector: 'crczp-queue-management',
  templateUrl: './queue-management.component.html',
  styleUrls: ['./queue-management.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
})
export class QueueManagementComponent implements OnInit {
  @Input() poolId!: number;
  /** Current user ID — used to detect user's own entry status changes */
  @Input() currentUserId?: string;
  /** Pool name — used in admin new-entry notification */
  @Input() poolName?: string;

  private readonly queueService = inject(QueueService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly entries$ = new BehaviorSubject<QueueEntry[]>([]);
  readonly loading$ = new BehaviorSubject<boolean>(true);

  /** Track previous entry statuses to detect changes between polls */
  private prevStatusMap = new Map<string, string>();
  /** Track previous entry IDs to detect new entries for admin notification */
  private prevEntryIds = new Set<string>();
  private isFirstPoll = true;

  readonly displayedColumns = ['position', 'userId', 'requestedAt', 'estimatedWait', 'reason', 'actions'];

  reasonTooltip(reason: string): string {
    switch (reason) {
      case 'max_instances': return 'Queued: pool instance limit reached';
      case 'vcpu_quota': return 'Queued: vCPU quota exceeded';
      case 'ram_quota': return 'Queued: RAM quota exceeded';
      case 'instances_quota': return 'Queued: OpenStack instance quota exceeded';
      default: return 'Queued';
    }
  }

  ngOnInit(): void {
    interval(10_000)
      .pipe(
        startWith(0),
        switchMap(() => this.queueService.getQueue(this.poolId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (entries) => {
          if (!this.isFirstPoll) {
            this.detectStatusChanges(entries);
            this.detectNewEntries(entries);
          }
          this.isFirstPoll = false;

          // Update tracking maps
          this.prevStatusMap.clear();
          this.prevEntryIds.clear();
          entries.forEach((e) => {
            this.prevStatusMap.set(e.id, e.status ?? 'pending');
            this.prevEntryIds.add(e.id);
          });

          // Filter out approved/rejected entries from display after notification
          const visibleEntries = entries.filter((e) => e.status === 'pending' || !e.status);
          this.entries$.next(visibleEntries);
          this.loading$.next(false);
        },
        error: () => {
          this.loading$.next(false);
        },
      });
  }

  private detectStatusChanges(entries: QueueEntry[]): void {
    entries.forEach((entry) => {
      const prevStatus = this.prevStatusMap.get(entry.id);
      if (!prevStatus || prevStatus === 'pending') {
        if (entry.status === 'approved') {
          // Notify the affected user (if this is their entry)
          if (this.currentUserId && entry.userId === this.currentUserId) {
            this.snackBar.open('Your request has been approved. Allocation in progress...', 'Close', {
              duration: 6000,
              panelClass: 'snack-success',
            });
          }
        } else if (entry.status === 'rejected') {
          if (this.currentUserId && entry.userId === this.currentUserId) {
            this.snackBar.open('Your request was rejected by admin.', 'Close', {
              duration: 6000,
              panelClass: 'snack-warn',
            });
          }
        }
      }
    });
  }

  private detectNewEntries(entries: QueueEntry[]): void {
    entries
      .filter((e) => !this.prevEntryIds.has(e.id) && (e.status === 'pending' || !e.status))
      .forEach((e) => {
        const poolLabel = this.poolName ?? `Pool ${this.poolId}`;
        this.snackBar.open(
          `New queue request from user ${e.userId} — ${poolLabel}`,
          'Close',
          { duration: 5000 },
        );
      });
  }

  onDelete(entry: QueueEntry): void {
    this.queueService.deleteEntry(this.poolId, entry.id).subscribe({
      next: () => {
        this.refreshQueue();
        this.snackBar.open('Entry removed', 'Close', { duration: 3000 });
      },
      error: () => {
        this.snackBar.open('Failed to remove entry', 'Close', { duration: 3000 });
      },
    });
  }

  onMoveUp(entry: QueueEntry): void {
    this.queueService.updatePosition(this.poolId, entry.id, entry.position - 1).subscribe({
      next: () => this.refreshQueue(),
    });
  }

  onMoveDown(entry: QueueEntry): void {
    this.queueService.updatePosition(this.poolId, entry.id, entry.position + 1).subscribe({
      next: () => this.refreshQueue(),
    });
  }

  onApprove(entry: QueueEntry): void {
    this.queueService.approveEntry(this.poolId, entry.id).subscribe({
      next: () => {
        this.refreshQueue();
        this.snackBar.open('Entry approved — allocation triggered', 'Close', { duration: 3000 });
      },
      error: () => this.snackBar.open('Failed to approve entry', 'Close', { duration: 3000 }),
    });
  }

  onReject(entry: QueueEntry): void {
    this.queueService.rejectEntry(this.poolId, entry.id).subscribe({
      next: () => {
        this.refreshQueue();
        this.snackBar.open('Entry rejected', 'Close', { duration: 3000 });
      },
      error: () => this.snackBar.open('Failed to reject entry', 'Close', { duration: 3000 }),
    });
  }

  private refreshQueue(): void {
    this.queueService.getQueue(this.poolId).subscribe((entries) => {
      const visibleEntries = entries.filter((e) => e.status === 'pending' || !e.status);
      this.entries$.next(visibleEntries);
    });
  }
}
