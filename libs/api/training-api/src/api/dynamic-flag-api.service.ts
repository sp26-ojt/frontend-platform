import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PortalConfig } from '@crczp/utils';

export interface DynamicFlagConfig {
    enableDynamicFlag: boolean;
    flagChangeInterval: number | null;
    initialSecret: string | null;
}

interface DynamicFlagConfigDTO {
    enable_dynamic_flag: boolean;
    flag_change_interval: number | null;
    initial_secret: string | null;
}

@Injectable()
export class DynamicFlagApiService {
    private readonly http = inject(HttpClient);
    private readonly config = inject(PortalConfig);

    private baseUrl(): string {
        return this.config.basePaths.linearTraining + '/dynamic-flags';
    }

    getConfig(definitionId: number, trainingType: 'linear' | 'adaptive' = 'linear'): Observable<DynamicFlagConfig> {
        return this.http.get<DynamicFlagConfigDTO>(`${this.baseUrl()}/${definitionId}`).pipe(
            map((dto) => ({
                enableDynamicFlag: dto.enable_dynamic_flag,
                flagChangeInterval: dto.flag_change_interval,
                initialSecret: dto.initial_secret,
            })),
        );
    }

    updateConfig(definitionId: number, config: DynamicFlagConfig, trainingType: 'linear' | 'adaptive' = 'linear'): Observable<void> {
        const dto: DynamicFlagConfigDTO = {
            enable_dynamic_flag: config.enableDynamicFlag,
            flag_change_interval: config.flagChangeInterval,
            initial_secret: config.initialSecret,
        };
        return this.http.put<void>(`${this.baseUrl()}/${definitionId}`, dto);
    }

    getCurrentFlag(definitionId: number, trainingType: 'linear' | 'adaptive' = 'linear'): Observable<string> {
        return this.http.get(`${this.baseUrl()}/${definitionId}/current-flag`, { responseType: 'text' });
    }
}
