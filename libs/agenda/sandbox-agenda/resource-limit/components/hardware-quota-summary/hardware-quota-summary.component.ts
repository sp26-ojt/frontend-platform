import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HardwareQuotaSummary } from '../../model/hardware-quota.model';
import { HardwareQuotaService } from '../../services/hardware-quota.service';
import { QuotaConfig } from '../../model/quota-config.model';

@Component({
  selector: 'crczp-hardware-quota-summary',
  templateUrl: './hardware-quota-summary.component.html',
  styleUrls: ['./hardware-quota-summary.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatInputModule, MatFormFieldModule, MatTooltipModule],
})
export class HardwareQuotaSummaryComponent implements OnInit {
  @Input() quota: HardwareQuotaSummary | null = null;
  @Output() configSaved = new EventEmitter<void>();

  private readonly quotaService = inject(HardwareQuotaService);
  private readonly cdr = inject(ChangeDetectorRef);

  editMode = false;
  editConfig: QuotaConfig = { fixedVcpu: 6, fixedRamGb: 20, vcpuUsablePercent: 90, ramUsablePercent: 90 };

  editTotalInstances = '';
  editTotalVcpu = '';
  editTotalRamGb = '';

  ngOnInit(): void {
    this.editConfig = { ...this.quotaService.getConfig() };
  }

  openEdit(): void {
    const cfg = this.quotaService.getConfig();
    this.editConfig = { ...cfg };
    this.editTotalInstances = cfg.overrideTotalInstances != null ? String(cfg.overrideTotalInstances) : '';
    this.editTotalVcpu = cfg.overrideTotalVcpu != null ? String(cfg.overrideTotalVcpu) : '';
    this.editTotalRamGb = cfg.overrideTotalRamGb != null ? String(cfg.overrideTotalRamGb) : '';
    this.editMode = true;
    this.cdr.markForCheck();
  }

  saveEdit(): void {
    const config: QuotaConfig = {
      ...this.editConfig,
      overrideTotalInstances: this.editTotalInstances !== '' ? Number(this.editTotalInstances) : null,
      overrideTotalVcpu: this.editTotalVcpu !== '' ? Number(this.editTotalVcpu) : null,
      overrideTotalRamGb: this.editTotalRamGb !== '' ? Number(this.editTotalRamGb) : null,
    };
    this.quotaService.saveConfig(config).subscribe(() => {
      this.editMode = false;
      this.cdr.markForCheck();
      this.configSaved.emit();
    });
  }

  cancelEdit(): void {
    this.editMode = false;
    this.cdr.markForCheck();
  }
}
