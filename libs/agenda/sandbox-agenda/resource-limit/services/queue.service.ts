import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PortalConfig } from '@crczp/utils';
import { QueueEntry, QueueEntryDTO } from '../model/queue-entry.model';

@Injectable({ providedIn: 'root' })
export class QueueService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${inject(PortalConfig).basePaths.sandbox}`;

  getQueue(poolId: number): Observable<QueueEntry[]> {
    return this.http
      .get<{ results: QueueEntryDTO[]; total_count?: number; count?: number; page?: number; page_size?: number; page_count?: number }>(
        `${this.baseUrl}/pools/${poolId}/queue`,
      )
      .pipe(map((response) => (response.results ?? []).map((dto) => this.mapDtoToModel(dto))));
  }

  deleteEntry(poolId: number, entryId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/pools/${poolId}/queue/${entryId}`);
  }

  updatePosition(poolId: number, entryId: string, position: number): Observable<QueueEntry> {
    return this.http
      .patch<QueueEntryDTO>(`${this.baseUrl}/pools/${poolId}/queue/${entryId}`, { position })
      .pipe(map((dto) => this.mapDtoToModel(dto)));
  }

  approveEntry(poolId: number, entryId: string): Observable<QueueEntry> {
    return this.http
      .post<QueueEntryDTO>(`${this.baseUrl}/pools/${poolId}/queue/${entryId}/approve`, null)
      .pipe(map((dto) => this.mapDtoToModel(dto)));
  }

  rejectEntry(poolId: number, entryId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/pools/${poolId}/queue/${entryId}/reject`, null);
  }

  private mapDtoToModel(dto: QueueEntryDTO): QueueEntry {
    return {
      id: dto.id,
      poolId: dto.pool_id,
      userId: dto.user_id,
      requestedAt: new Date(dto.requested_at),
      position: dto.position,
      estimatedWaitSeconds: dto.estimated_wait_seconds,
      reason: dto.reason,
      status: dto.status,
    };
  }
}
