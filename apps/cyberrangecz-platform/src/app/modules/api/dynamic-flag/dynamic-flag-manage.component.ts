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
import { LinearTrainingDefinitionApi } from '@crczp/training-api';
import { TrainingDefinition } from '@crczp/training-model';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { createInfinitePaginationEvent } from '@crczp/api-common';
import { TrainingDefinitionSort } from '@crczp/training-api';
import { CommonModule } from '@angular/common';

export interface TrainingDefinitionWithFlag {
    definition: TrainingDefinition;
    config: DynamicFlagConfig | null;
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
    private readonly definitionApi = inject(LinearTrainingDefinitionApi);
    private readonly dynamicFlagApi = inject(DynamicFlagApiService);
    private readonly snackBar = inject(MatSnackBar);
    private readonly fb = inject(FormBuilder);
    private readonly destroyRef = inject(DestroyRef);

    readonly displayedColumns = ['title', 'enabled', 'interval', 'secret', 'actions'];
    readonly rows = signal<TrainingDefinitionWithFlag[]>([]);
    readonly pageLoading = signal(true);
    readonly pageError = signal<string | null>(null);

    // per-row edit forms keyed by definition id
    readonly forms: Record<number, ReturnType<typeof this.buildForm>> = {};

    ngOnInit(): void {
        this.loadAll();
    }

    private loadAll(): void {
        const pagination = createInfinitePaginationEvent<TrainingDefinitionSort>('title', 'asc');
        this.definitionApi
            .getAll(pagination)
            .pipe(
                switchMap((page) => {
                    const defs = page.elements;
                    if (!defs.length) return of([]);
                    return forkJoin(
                        defs.map((def) =>
                            this.dynamicFlagApi.getConfig(def.id).pipe(
                                map((config) => ({ definition: def, config, loading: false, saving: false, error: null } as TrainingDefinitionWithFlag)),
                                catchError(() => of({ definition: def, config: null, loading: false, saving: false, error: 'Failed to load' } as TrainingDefinitionWithFlag)),
                            ),
                        ),
                    );
                }),
                finalize(() => this.pageLoading.set(false)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
                next: (rows) => {
                    rows.forEach((row) => {
                        this.forms[row.definition.id] = this.buildForm(row.config);
                    });
                    this.rows.set(rows);
                },
                error: () => this.pageError.set('Failed to load training definitions.'),
            });
    }

    private buildForm(config: DynamicFlagConfig | null) {
        return this.fb.group({
            enableDynamicFlag: [config?.enableDynamicFlag ?? false],
            flagChangeInterval: [
                config?.flagChangeInterval ?? null,
                [Validators.min(1), Validators.pattern(/^\d+$/)],
            ],
            initialSecret: [config?.initialSecret ?? ''],
        });
    }

    save(row: TrainingDefinitionWithFlag): void {
        const form = this.forms[row.definition.id];
        if (!form) return;

        const value = form.getRawValue();
        const config: DynamicFlagConfig = {
            enableDynamicFlag: value.enableDynamicFlag ?? false,
            flagChangeInterval: value.flagChangeInterval ? Number(value.flagChangeInterval) : null,
            initialSecret: value.initialSecret ?? null,
        };

        this.updateRow(row.definition.id, { saving: true, error: null });

        this.dynamicFlagApi
            .updateConfig(row.definition.id, config)
            .pipe(
                finalize(() => this.updateRow(row.definition.id, { saving: false })),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
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
