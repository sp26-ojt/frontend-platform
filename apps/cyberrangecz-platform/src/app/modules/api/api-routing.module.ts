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
        loadComponent: () =>
            import('./dynamic-flag/dynamic-flag-manage.component').then(
                (m) => m.DynamicFlagManageComponent,
            ),
        data: {
            breadcrumb: 'Dynamic Flag',
            title: 'Dynamic Flag Management',
        },
    },
];

@NgModule({
    imports: [RouterModule.forChild(routes), TrainingApiModule],
    exports: [RouterModule],
})
export class ApiRoutingModule {}
