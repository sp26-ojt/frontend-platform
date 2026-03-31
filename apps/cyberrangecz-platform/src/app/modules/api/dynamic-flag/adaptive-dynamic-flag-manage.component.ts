import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    inject,
    OnInit,
    signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdaptiveTrainingDefinitionApi } from '@crczp/training-api';
import { AdaptiveTrainingInstanceApi } from '@crczp/training-api';
import { AdaptiveTask, TrainingPhase } from '@crczp/training-model';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map, switchMap } from 'rxjs/operators';
import { createInfinitePaginationEvent } from '@crczp/api-common';
import { TrainingDefinitionSort, TrainingInstanceSort } from '@crczp/training-api';
import { CommonModule } from '@angular/common';

export interface AdaptiveTaskWithFlag {
    definitionId: number;
    definitionTitle: string;
    phaseId: number;
    phaseTitle: string;
    task: AdaptiveTask;
    hasInstance: boolean;
    saving: boolean;
    error: string | null;
}

@Component({
    selector: 'crczp-adaptive-dynamic-flag-manage',
    templateUrl: './adaptive-dynamic-flag-manage.component.html',
    styleUrls: ['./dynamic-flag-manage.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatTableModule,
        MatSlideToggleModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MatSnackBarModule,
        MatTooltipModule,
    ],
})
export class AdaptiveDynamicFlagManageComponent implements OnInit {
    private readonly definitionApi = inject(AdaptiveTrainingDefinitionApi);
    private readonly instanceApi = inject(AdaptiveTrainingInstanceApi);
    private readonly snackBar = inject(MatSnackBar);
    private readonly fb = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);

    readonly displayedColumns = ['definition', 'phase', 'task', 'enabled', 'interval', 'secret', 'actions'];
    readonly rows = signal<AdaptiveTaskWithFlag[]>([]);
    readonly pageLoading = signal(true);
    readonly pageError = signal<string | null>(null);

    readonly forms: Record<number, ReturnType<typeof this.buildForm>> = {};

    ngOnInit(): void {
        this.loadAll();
    }

    private loadAll(): void {
        const defPagination = createInfinitePaginationEvent<TrainingDefinitionSort>('title', 'asc');
        const instPagination = createInfinitePaginationEvent<TrainingInstanceSort>('title', 'asc');

        this.definitionApi.getAll(defPagination).pipe(
            switchMap((page) => {
                const defs = page.elements;
                if (!defs.length) return of([]);
                return forkJoin(
                    defs.map((def) =>
                        forkJoin({
                            defWithPhases: this.definitionApi.get(def.id, true),
                            instances: this.instanceApi.getAll(instPagination).pipe(
                                map((res) => res.elements.filter((i) => i.trainingDefinition?.id === def.id)),
                                catchError(() => of([])),
                            ),
                        }).pipe(
                            map(({ defWithPhases, instances }) => {
                                const hasInstance = instances.length > 0;
                                const taskRows: AdaptiveTaskWithFlag[] = [];
                                const phases = (defWithPhases.levels ?? []) as TrainingPhase[];
                                for (const phase of phases) {
                                    if (!('tasks' in phase)) continue;
                                    const trainingPhase = phase as TrainingPhase;
                                    for (const task of trainingPhase.tasks ?? []) {
                                        taskRows.push({
                                            definitionId: def.id,
                                            definitionTitle: def.title,
                                            phaseId: phase.id,
                                            phaseTitle: phase.title,
                                            task,
                                            hasInstance,
                                            saving: false,
                                            error: null,
                                        });
                                    }
                                }
                                return taskRows;
                            }),
                            catchError(() => of([] as AdaptiveTaskWithFlag[])),
                        ),
                    ),
                ).pipe(map((groups) => groups.flat()));
            }),
            finalize(() => this.pageLoading.set(false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: (rows) => {
                rows.forEach((row) => {
                    const form = this.buildForm(row.task);
                    if (row.hasInstance) form.disable();
                    this.forms[row.task.id] = form;
                });
                this.rows.set(rows);
            },
            error: () => this.pageError.set('Failed to load adaptive training definitions.'),
        });
    }

    private buildForm(task: AdaptiveTask) {
        const form = this.fb.group({
            dynamicFlagEnabled: [task.dynamicFlagEnabled ?? false],
            dynamicFlagIntervalMinutes: [
                task.dynamicFlagIntervalMinutes ?? null,
                [Validators.min(1), Validators.pattern(/^\d+$/)],
            ],
            dynamicFlagSecret: [task.dynamicFlagSecret ?? ''],
        });

        form.controls.dynamicFlagEnabled.valueChanges.pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((enabled) => {
            if (enabled) {
                form.controls.dynamicFlagIntervalMinutes.enable();
                form.controls.dynamicFlagSecret.enable();
            } else {
                form.controls.dynamicFlagIntervalMinutes.disable();
                form.controls.dynamicFlagSecret.disable();
            }
        });

        if (!task.dynamicFlagEnabled) {
            form.controls.dynamicFlagIntervalMinutes.disable();
            form.controls.dynamicFlagSecret.disable();
        }

        return form;
    }

    save(row: AdaptiveTaskWithFlag): void {
        const form = this.forms[row.task.id];
        if (!form || form.invalid) return;

        const value = form.getRawValue();
        const updatedTask: AdaptiveTask = Object.assign(new AdaptiveTask(), row.task, {
            dynamicFlagEnabled: value.dynamicFlagEnabled ?? false,
            dynamicFlagIntervalMinutes: value.dynamicFlagIntervalMinutes ? Number(value.dynamicFlagIntervalMinutes) : null,
            dynamicFlagSecret: value.dynamicFlagSecret ?? null,
        });

        this.updateRow(row.task.id, { saving: true, error: null });

        this.definitionApi.updateTask(row.definitionId, row.phaseId, updatedTask).pipe(
            finalize(() => this.updateRow(row.task.id, { saving: false })),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: () => {
                this.updateRow(row.task.id, { task: updatedTask });
                this.snackBar.open(`Saved "${row.task.title}"`, 'OK', { duration: 3000 });
            },
            error: () => {
                this.updateRow(row.task.id, { error: 'Save failed' });
                this.snackBar.open(`Failed to save "${row.task.title}"`, 'Dismiss', { duration: 4000 });
            },
        });
    }

    private updateRow(taskId: number, patch: Partial<AdaptiveTaskWithFlag>): void {
        this.rows.update((rows) => rows.map((r) => (r.task.id === taskId ? { ...r, ...patch } : r)));
    }
}
