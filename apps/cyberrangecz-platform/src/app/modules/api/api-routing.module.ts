import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ValidRouterConfig } from '@crczp/routing-commons';
import { TrainingApiModule } from '@crczp/training-api';

const routes: ValidRouterConfig<'api'> = [
    {
        path: '',
        redirectTo: 'dynamic-flag',
        pathMatch: 'full',
    },
    {
        path: 'dynamic-flag',
        children: [
            {
                path: '',
                redirectTo: 'linear',
                pathMatch: 'full',
            },
            {
                path: 'adaptive',
                loadComponent: () =>
                    import('./dynamic-flag/adaptive-dynamic-flag-manage.component').then(
                        (m) => m.AdaptiveDynamicFlagManageComponent,
                    ),
                data: {
                    breadcrumb: 'Dynamic Flag - Adaptive',
                    title: 'Dynamic Flag Management (Adaptive)',
                },
            },
            {
                path: 'linear',
                loadComponent: () =>
                    import('./dynamic-flag/dynamic-flag-manage.component').then(
                        (m) => m.DynamicFlagManageComponent,
                    ),
                data: {
                    breadcrumb: 'Dynamic Flag - Linear',
                    title: 'Dynamic Flag Management (Linear)',
                    trainingType: 'linear',
                },
            },
        ],
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes), TrainingApiModule],
    exports: [RouterModule],
})
export class ApiRoutingModule {}
