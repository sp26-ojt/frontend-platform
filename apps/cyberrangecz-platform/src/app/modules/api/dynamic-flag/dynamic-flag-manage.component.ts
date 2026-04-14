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
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DynamicFlagApiService, DynamicFlagConfig } from '@crczp/training-api';
import { LinearTrainingDefinitionApi, AdaptiveTrainingDefinitionApi } from '@crczp/training-api';
import { LinearTrainingInstanceApi, AdaptiveTrainingInstanceApi } from '@crczp/training-api';
import { TrainingDefinition } from '@crczp/training-model';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { createInfinitePaginationEvent } from '@crczp/api-common';
import { TrainingDefinitionSort, TrainingInstanceSort } from '@crczp/training-api';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

export interface TrainingDefinitionWithFlag {
    definition: TrainingDefinition;
    config: DynamicFlagConfig | null;
    hasInstance: boolean;
    loading: boolean;
    saving: boolean;
    error: string | null;
}

@Component({
    selector: 'crczp-dynamic-flag-manage',
    templateUrl: './dynamic-flag-manage.component.html',
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
        MatCardModule,
        MatProgressSpinnerModule,
        MatSnackBarModule,
        MatTooltipModule,
    ],
})
export class DynamicFlagManageComponent implements OnInit {
    private readonly linearDefinitionApi = inject(LinearTrainingDefinitionApi);
    private readonly adaptiveDefinitionApi = inject(AdaptiveTrainingDefinitionApi);
    private readonly linearInstanceApi = inject(LinearTrainingInstanceApi);
    private readonly adaptiveInstanceApi = inject(AdaptiveTrainingInstanceApi);
    private readonly dynamicFlagApi = inject(DynamicFlagApiService);
    private readonly snackBar = inject(MatSnackBar);
    private readonly fb = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);
    private readonly route = inject(ActivatedRoute);

    readonly displayedColumns = ['title', 'enabled', 'interval', 'secret', 'actions'];
    readonly rows = signal<TrainingDefinitionWithFlag[]>([]);
    readonly pageLoading = signal(true);
    readonly pageError = signal<string | null>(null);

    readonly forms: Record<number, ReturnType<typeof this.buildForm>> = {};

    get trainingType(): 'linear' | 'adaptive' {
        return (this.route.snapshot.data['trainingType'] as 'linear' | 'adaptive') ?? 'linear';
    }

    get filterDefinitionId(): number | null {
        const id = this.route.snapshot.queryParamMap.get('definitionId');
        return id ? Number(id) : null;
    }

    ngOnInit(): void {
        this.loadAll();
    }

    private loadAll(): void {
        const type = this.trainingType;
        const isAdaptive = type === 'adaptive';
        const definitionApi = isAdaptive ? this.adaptiveDefinitionApi : this.linearDefinitionApi;
        const instanceApi = isAdaptive ? this.adaptiveInstanceApi : this.linearInstanceApi;
        const defPagination = createInfinitePaginationEvent<TrainingDefinitionSort>('title', 'asc');
        const instPagination = createInfinitePaginationEvent<TrainingInstanceSort>('title', 'asc');

        definitionApi.getAll(defPagination).pipe(
            switchMap((page) => {
                const defs = page.elements;
                if (!defs.length) return of([]);
                return forkJoin(
                    defs.map((def) =>
                        forkJoin({
                            config: this.dynamicFlagApi.getConfig(def.id, type).pipe(
                                catchError(() => of(null as DynamicFlagConfig | null)),
                            ),
                            instances: instanceApi.getAll(instPagination).pipe(
                                map((res) => res.elements.filter((i) => i.trainingDefinition?.id === def.id)),
                                catchError(() => of([])),
                            ),
                        }).pipe(
                            map(({ config, instances }) => ({
                                definition: def,
                                config,
                                hasInstance: instances.length > 0,
                                loading: false,
                                saving: false,
                                error: null,
                            } as TrainingDefinitionWithFlag)),
                        ),
                    ),
                );
            }),
            finalize(() => this.pageLoading.set(false)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: (rows) => {
                const filterId = this.filterDefinitionId;
                const filtered = filterId ? rows.filter(r => r.definition.id === filterId) : rows;
                filtered.forEach((row) => {
                    const form = this.buildForm(row.config);
                    if (row.hasInstance) {
                        form.disable();
                    }
                    this.forms[row.definition.id] = form;
                });
                this.rows.set(filtered);
            },
            error: () => this.pageError.set('Failed to load training definitions.'),
        });
    }

    private buildForm(config: DynamicFlagConfig | null) {
        const form = this.fb.group({
            enableDynamicFlag: [config?.enableDynamicFlag ?? false],
            flagChangeInterval: [
                config?.flagChangeInterval ?? null,
                [Validators.min(1), Validators.pattern(/^\d+$/)],
            ],
            initialSecret: [config?.initialSecret ?? ''],
        });

        // enable/disable interval & secret based on toggle
        form.controls.enableDynamicFlag.valueChanges.pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((enabled) => {
            if (enabled) {
                form.controls.flagChangeInterval.enable();
                form.controls.initialSecret.enable();
            } else {
                form.controls.flagChangeInterval.disable();
                form.controls.initialSecret.disable();
            }
        });

        // set initial state
        if (!config?.enableDynamicFlag) {
            form.controls.flagChangeInterval.disable();
            form.controls.initialSecret.disable();
        }

        return form;
    }

    save(row: TrainingDefinitionWithFlag): void {
        const form = this.forms[row.definition.id];
        if (!form || form.invalid) return;

        const value = form.getRawValue();
        const config: DynamicFlagConfig = {
            enableDynamicFlag: value.enableDynamicFlag ?? false,
            flagChangeInterval: value.flagChangeInterval ? Number(value.flagChangeInterval) : null,
            initialSecret: value.initialSecret ?? null,
        };

        this.updateRow(row.definition.id, { saving: true, error: null });

        console.log(`[DynamicFlag] saving def=${row.definition.id} type=${this.trainingType}`, config);
        this.dynamicFlagApi.updateConfig(row.definition.id, config, this.trainingType).pipe(
            finalize(() => this.updateRow(row.definition.id, { saving: false })),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe({
            next: () => {
                this.updateRow(row.definition.id, { config });
                this.snackBar.open(`Saved "${row.definition.title}"`, 'OK', { duration: 3000 });
            },
            error: () => {
                this.updateRow(row.definition.id, { error: 'Save failed' });
                this.snackBar.open(`Failed to save "${row.definition.title}"`, 'Dismiss', { duration: 4000 });
            },
        });
    }

    private updateRow(id: number, patch: Partial<TrainingDefinitionWithFlag>): void {
        this.rows.update((rows) => rows.map((r) => (r.definition.id === id ? { ...r, ...patch } : r)));
    }
}
