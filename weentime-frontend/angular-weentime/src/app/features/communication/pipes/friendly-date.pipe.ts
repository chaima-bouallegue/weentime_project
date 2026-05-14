import { Pipe, PipeTransform } from '@angular/core';
import { formatDate } from '@angular/common';

@Pipe({
  name: 'friendlyDate',
  standalone: true
})
export class FriendlyDatePipe implements PipeTransform {
  transform(value: string | Date | number | undefined | null): string {
    if (!value) return '';
    
    const date = new Date(value);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // Check if it's today
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return formatDate(date, 'HH:mm', 'fr-FR');
    }
    
    // Check if it's yesterday
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isYesterday) {
      return `Hier ${formatDate(date, 'HH:mm', 'fr-FR')}`;
    }
    
    // Same week (less than 7 days ago)
    if (diffDays < 7) {
      const dayName = formatDate(date, 'EEE', 'fr-FR');
      // Capitalize first letter
      const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      return `${capitalized} ${formatDate(date, 'HH:mm', 'fr-FR')}`;
    }
    
    // Older
    return formatDate(date, 'd MMM HH:mm', 'fr-FR');
  }
}
