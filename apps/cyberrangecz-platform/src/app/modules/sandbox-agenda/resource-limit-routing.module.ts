import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ValidRouterConfig } from '@crczp/routing-commons';
import { SandboxApiModule } from '@crczp/sandbox-api';
import { ResourceLimitManagerComponent } from '@crczp/sandbox-agenda/resource-limit';

const routes: ValidRouterConfig<'resource-limit'> = [
    {
        path: '',
        component: ResourceLimitManagerComponent,
        data: {
            title: 'Resource Limit Management',
        },
    },
];

/**
 * Routing module for resource limit management
 */
@NgModule({
    imports: [RouterModule.forChild(routes), SandboxApiModule],
    declarations: [],
    exports: [RouterModule],
})
export class ResourceLimitRoutingModule {}
