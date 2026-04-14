export interface Flavor {
  id: string;
  name: string;
  vcpu: number;
  ramMb: number; // kept for internal use, mapped from ram_gb * 1 (display as GB)
}
