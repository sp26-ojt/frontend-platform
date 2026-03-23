import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PortalConfig } from '@crczp/utils';

export interface DynamicFlagConfig {
    enableDynamicFlag: boolean;
    flagChangeInterval: number | null;
    initialSecret: string | null;
}

@Injectable()
export class DynamicFlagApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = inject(PortalConfig).basePaths.linearTraining + '/dynamic-flags';

    getConfig(definitionId: number): Observable<DynamicFlagConfig> {
        return this.http.get<DynamicFlagConfig>(`${this.baseUrl}/${definitionId}`);
    }

    updateConfig(definitionId: number, config: DynamicFlagConfig): Observable<void> {
        return this.http.put<void>(`${this.baseUrl}/${definitionId}`, config);
    }

    getCurrentFlag(definitionId: number): Observable<string> {
        return this.http.get(`${this.baseUrl}/${definitionId}/current-flag`, { responseType: 'text' });
    }
}
