import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export interface TimelineItem {
  id: string;
  title: string;
  description: string;
  date: string;
  /** Optional type used for color-coding the dot (leave, telework, anomaly, ...). */
  type?: string | null;
}

@Component({
  selector: 'ui-smart-timeline',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './smart-timeline.component.html',
  styleUrls: ['./smart-timeline.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmartTimelineComponent {
  @Input() title = 'Activité récente';
  @Input() subtitle = 'Dernières actions RH';
  @Input() emptyMessage = 'Aucune activité récente.';
  @Input() loading = false;
  @Input() maxVisible = 12;

  @Input() set items(value: TimelineItem[] | null | undefined) {
    const raw = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    this._items = raw.filter(item => {
      if (!item || !item.id) return false;
      const key = `${item.id}|${item.title}|${item.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  get items(): TimelineItem[] {
    return this._items;
  }
  private _items: TimelineItem[] = [];

  trackById(_i: number, item: TimelineItem): string {
    return item.id;
  }

  toneFor(type: string | null | undefined): 'leave' | 'telework' | 'authorization' | 'document' | 'anomaly' | 'default' {
    if (!type) return 'default';
    const t = type.toLowerCase();
    if (t.includes('conge') || t.includes('leave')) return 'leave';
    if (t.includes('telework') || t.includes('teletrav')) return 'telework';
    if (t.includes('autoris') || t.includes('authoriz')) return 'authorization';
    if (t.includes('document') || t.includes('attest')) return 'document';
    if (t.includes('anomal')) return 'anomaly';
    return 'default';
  }

  get visibleItems(): TimelineItem[] {
    return this._items.slice(0, this.maxVisible);
  }

  get overflowCount(): number {
    return Math.max(0, this._items.length - this.maxVisible);
  }
}
